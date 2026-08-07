if (typeof File === 'undefined') global.File = class File {};
require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const logger = require('./config/logger');
const errorHandler = require('./middleware/errorHandler');
const { runIngestion } = require('./scrapers/index');
const { runFullMatch } = require('./services/matchingService');
const { recomputeJobDerivedStats, refreshWikiFleet } = require('./services/airlineEnrichmentService');

const app = express();
app.use(helmet());
app.use(cors({
  origin: [
    'https://cockpithire.com',
    'https://www.cockpithire.com',
    /\.vercel\.app$/,
  ],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Landing page
app.use(express.static(path.join(__dirname, '../public')));

// Routes
// API responses are live data — forbid ALL intermediary caching. Without this,
// the Vercel proxy in front of the API could serve stale copies of /jobs to
// clients that request identical URLs (the app), resurrecting deleted
// duplicates and stale counts ("21-jobs flip-flop", Emirates-clones sightings).
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, must-revalidate');
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/flight-logs', require('./routes/flightLogs'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/cv',   require('./routes/cv'));
app.use('/api/airlines', require('./routes/airlines'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/admin',   require('./routes/admin'));
app.use('/api/employers', require('./routes/employers'));

// Logo proxy — the mobile app's native image loader gets 403'd by Wikimedia's
// non-browser-client blocking (browsers pass, apps don't). We fetch the image
// server-side with a policy-compliant UA and cache it, so the app only ever
// talks to our own API. Allowlisted to Wikimedia hosts; long client cache
// (logos are immutable thumbnails).
const LOGO_HOSTS = new Set(['upload.wikimedia.org']);
const logoCache = new Map(); // url -> { buf, type, at }
const LOGO_CACHE_MAX = 600;
app.get('/api/logo', async (req, res) => {
  try {
    const src = String(req.query.src || '');
    let host;
    try { host = new URL(src).hostname; } catch { return res.status(400).json({ error: 'bad src' }); }
    if (!LOGO_HOSTS.has(host)) return res.status(400).json({ error: 'host not allowed' });

    let hit = logoCache.get(src);
    if (!hit) {
      const axios = require('axios');
      const r = await axios.get(src, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: { 'User-Agent': 'CockpitHireLogoProxy/1.0 (https://cockpithire.com; support@cockpithire.com)' },
      });
      hit = { buf: Buffer.from(r.data), type: r.headers['content-type'] || 'image/png', at: Date.now() };
      if (logoCache.size >= LOGO_CACHE_MAX) logoCache.delete(logoCache.keys().next().value);
      logoCache.set(src, hit);
    }
    // ?debug=1 → always-200 JSON report instead of the image (remote diagnosis)
    if (req.query.debug === '1') return res.json({ ok: true, type: hit.type, bytes: hit.buf.length });
    res.set('Cache-Control', 'public, max-age=604800, immutable'); // overrides the API no-store
    res.type(hit.type).send(hit.buf);
  } catch (err) {
    if (req.query.debug === '1') {
      return res.json({ ok: false, status: err.response?.status ?? null, message: err.message, upstreamBody: err.response?.data ? String(err.response.data).slice(0, 200) : null });
    }
    res.status(502).json({ error: 'logo fetch failed', status: err.response?.status ?? null });
  }
});

// Dry-run one configured source from the LIVE server (no DB writes): fetches
// raw jobs and reports counts + samples. This is how new sources/tenants get
// verified before being trusted — the Careerjet debugging lesson, generalised.
app.get('/health/scrape-test', async (req, res) => {
  try {
    const source = String(req.query.source || '').toUpperCase();
    const company = req.query.company ? String(req.query.company).toLowerCase() : null;
    const employers = require('./scrapers/config/employers');
    const emp = employers.find((e) =>
      e.source === source && !e.disabled && (!company || String(e.company).toLowerCase().includes(company)));
    if (!emp) return res.json({ ok: false, reason: 'no matching enabled employer config', source, company });
    const { fetchForEmployer } = require('./scrapers/runner');
    const raw = await fetchForEmployer(emp);
    res.json({
      ok: true, source, employer: emp.company, fetched: raw.length,
      sampleTitles: raw.slice(0, 8).map((j) => j.title),
    });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Launch-gate metric: what fraction of ACTIVE jobs show TRUSTWORTHY requirements
// — the posting's own verbatim block, a solid structured set (≥3 fields), or an
// honest "not listed" fallback. The only "uncovered" state is a THIN synthesis
// (1–2 fields shown as if they were the whole picture). Broken down per source.
// This mirrors the client's Requirements-section display gate exactly.
app.get('/health/requirements-coverage', async (req, res) => {
  try {
    const prisma = require('./config/database');
    const jobs = await prisma.job.findMany({
      where: { status: 'ACTIVE' },
      select: {
        sourcePlatform: true, description: true, descriptionEn: true, requirementsText: true,
        reqCertificates: true, reqAuthorities: true, reqAircraftTypes: true,
        reqMinTotalHours: true, reqMinPicHours: true, reqMinMultiEngineHours: true,
        reqMinTurbineHours: true, reqMinInstrumentHours: true, reqMinCrossCountryHours: true,
        reqMedicalClass: true, reqEducation: true, reqWorkAuthorization: true, reqEnglishLevel: true,
      },
    });

    const AGG = new Set(['ADZUNA', 'CAREERJET', 'JOOBLE', 'AVIATIONJOBSEARCH']);
    const structuredFieldCount = (j) =>
      (j.reqCertificates?.length ? 1 : 0) + (j.reqAuthorities?.length ? 1 : 0) + (j.reqAircraftTypes?.length ? 1 : 0) +
      (j.reqMinTotalHours != null ? 1 : 0) + (j.reqMinPicHours != null ? 1 : 0) + (j.reqMinMultiEngineHours != null ? 1 : 0) +
      (j.reqMinTurbineHours != null ? 1 : 0) + (j.reqMinInstrumentHours != null ? 1 : 0) + (j.reqMinCrossCountryHours != null ? 1 : 0) +
      (j.reqMedicalClass != null ? 1 : 0) + (j.reqEducation != null ? 1 : 0) + (j.reqWorkAuthorization != null ? 1 : 0) +
      (j.reqEnglishLevel != null ? 1 : 0);

    // Replicates the JobDetail Requirements gate (web + mobile).
    const classify = (j) => {
      const verbatim = String(j.requirementsText || '').split('\n').map((l) => l.replace(/^•\s*/, '').trim()).filter(Boolean);
      if (verbatim.length >= 2) return 'verbatim';
      const fields = structuredFieldCount(j);
      if (fields >= 3) return 'structured_strong';
      const rawDesc = j.descriptionEn ?? j.description ?? '';
      const isExcerpt = AGG.has(j.sourcePlatform) && rawDesc.length > 0 && rawDesc.length < 800 && !/[.!?"'”’)\]]$/.test(rawDesc.trim());
      const hasFullDesc = !isExcerpt && rawDesc.length >= 300;
      const showSynth = fields >= 2 || (fields >= 1 && hasFullDesc);
      return showSynth ? 'structured_thin' : 'honest';
    };

    const bucket = { verbatim: 0, structured_strong: 0, honest: 0, structured_thin: 0 };
    const perSource = {};
    for (const j of jobs) {
      const c = classify(j);
      bucket[c]++;
      const src = j.sourcePlatform || '(none)';
      const s = perSource[src] || (perSource[src] = { total: 0, covered: 0, verbatim: 0, structured_strong: 0, honest: 0, structured_thin: 0 });
      s.total++; s[c]++;
      if (c !== 'structured_thin') s.covered++;
    }

    const total = jobs.length;
    const covered = bucket.verbatim + bucket.structured_strong + bucket.honest;
    const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
    const perSourceOut = Object.fromEntries(
      Object.entries(perSource)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([src, s]) => [src, { ...s, coveragePct: pct(s.covered, s.total) }])
    );

    res.json({
      ok: true,
      coveragePct: pct(covered, total),   // ← the launch gate number
      activeJobs: total,
      covered,
      buckets: bucket,
      definition: 'covered = verbatim requirements block OR ≥3 structured fields OR honest "not listed" fallback; uncovered = a thin 1–2-field synthesis',
      perSource: perSourceOut,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Diagnostic: one live Careerjet API call (1 locale, 1 page) reporting the
// raw outcome — lets us see auth/IP errors directly instead of digging
// through logs. Reveals no secrets (key presence only, never the key).
app.get('/health/careerjet-test', async (req, res) => {
  const axios = require('axios');
  const apiKey = process.env.CAREERJET_API_KEY;
  if (!apiKey) return res.json({ ok: false, reason: 'CAREERJET_API_KEY not set' });
  try {
    const { data } = await axios.get('https://search.api.careerjet.net/v4/query', {
      params: {
        locale_code: String(req.query.locale || 'en_AE'),
        keywords: 'pilot', sort: 'date', page: 1, page_size: 5,
        user_ip: '127.0.0.1', user_agent: 'CockpitHireBot/1.0 (+https://cockpithire.com)',
      },
      auth: { username: apiKey, password: '' },
      headers: { Referer: 'https://cockpithire.com' },
      timeout: 15000,
    });
    res.json({
      ok: true,
      type: data?.type,
      hits: data?.hits ?? null,
      sampleTitles: (data?.jobs || []).slice(0, 5).map((j) => j.title),
    });
  } catch (err) {
    res.json({
      ok: false,
      status: err.response?.status ?? null,
      body: typeof err.response?.data === 'object' ? err.response.data : String(err.response?.data || err.message).slice(0, 300),
    });
  }
});

// Reports this server's OUTBOUND (egress) IP — needed once to register the
// backend with IP-restricted partner APIs (e.g. Careerjet). Harmless to leave
// public: it reveals nothing beyond what any server we call already sees.
app.get('/health/egress-ip', async (req, res) => {
  try {
    const axios = require('axios');
    const { data } = await axios.get('https://api.ipify.org?format=json', { timeout: 10000 });
    res.json({ egressIp: data.ip });
  } catch (err) {
    res.status(502).json({ error: 'lookup failed', detail: err.message });
  }
});

app.use(errorHandler);

// Scheduled scraping every N hours
const intervalHours = parseInt(process.env.SCRAPE_INTERVAL_HOURS || '6', 10);
cron.schedule(`0 */${intervalHours} * * *`, async () => {
  try {
    await runIngestion();
  } catch (err) {
    logger.error(`Scheduled scrape failed: ${err.message}`);
  }
  // Post-ingest: fetch full descriptions for freshly-ingested aggregator snippets
  // (once each, robots-respecting, rate-limited). Bounded per cycle.
  try {
    const { enrichAggregatorDescriptions } = require('../scripts/enrich-aggregator-descriptions');
    await enrichAggregatorDescriptions({ limit: 40 });
  } catch (err) {
    logger.error(`Aggregator description enrichment failed: ${err.message}`);
  }
  // LLM structured requirement extraction over the (now full) descriptions —
  // replaces regex junk. Once per job; no-ops without ANTHROPIC_API_KEY.
  try {
    const { extractRequirementsLLM } = require('../scripts/extract-requirements-llm');
    await extractRequirementsLLM({ limit: 25 });
  } catch (err) {
    logger.error(`LLM requirement extraction failed: ${err.message}`);
  }
  // Airline factfiles derive hiring status / pay ranges from the fresh job data.
  try {
    await recomputeJobDerivedStats();
  } catch (err) {
    logger.error(`Airline stats recompute failed: ${err.message}`);
  }
});

// Weekly airline fleet refresh from Wikipedia (Mondays 04:00 UTC) — fleetDetail
// is enrichment-owned and refreshed; community-contributed fields are untouched.
cron.schedule('0 4 * * 1', async () => {
  try {
    await refreshWikiFleet();
  } catch (err) {
    logger.error(`Airline fleet refresh failed: ${err.message}`);
  }
});

// Immediate run on dev startup so fresh data is available without waiting for cron
if (process.env.NODE_ENV !== 'production') {
  setImmediate(() => runIngestion().catch((err) => logger.error(`Dev startup scrape failed: ${err.message}`)));
}

// On every boot (incl. production deploys): purge stored jobs that fail the
// current filter rules or are past their expiry date — stale/invalid listings
// vanish immediately instead of waiting for the next scrape cron.
setImmediate(async () => {
  try {
    const { revalidateActiveJobs, expirePastDue } = require('./scrapers/runner');
    const employerConfigs = require('./scrapers/config/employers');
    await revalidateActiveJobs(employerConfigs);
    await expirePastDue();
    await require('./scrapers/dedup').collapseSameAdAcrossLocations();
    await require('./services/translationService').translateUntranslatedJobs();
  } catch (err) {
    logger.error(`Startup job cleanup failed: ${err.message}`);
  }
});

// Run matching on startup to catch missed matches
cron.schedule('0 2 * * *', async () => {
  try {
    await runFullMatch();
  } catch (err) {
    logger.error(`Scheduled match failed: ${err.message}`);
  }
});

// Nightly apply-link liveness sweep (03:00 UTC): probe every ACTIVE job's
// applyUrl and expire dead links (404/410/parked), retrying transient failures
// up to 3 nights. Off-peak so its rate-limited fetches don't compete with the
// scrape cron. Robots/UA/rate-limit enforced via http.js.
cron.schedule('0 3 * * *', async () => {
  try {
    const { checkActiveJobLiveness } = require('../scripts/check-liveness');
    const r = await checkActiveJobLiveness({});
    logger.info(`Liveness sweep: ${r.expired} expired (${r.dead} dead, ${r.transient} transient) of ${r.considered} checked`);
  } catch (err) {
    logger.error(`Liveness sweep failed: ${err.message}`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => logger.info(`Server running on port ${PORT}`));

module.exports = app;
