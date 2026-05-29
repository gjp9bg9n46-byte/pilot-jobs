'use strict';

/**
 * Workday JSON-LD enrichment.
 *
 * Workday job pages include a <script type="application/ld+json"> block with a
 * JobPosting schema object. This module:
 *   1. Fetches the Workday job page.
 *   2. Extracts and parses the JSON-LD.
 *   3. Merges structured data (salary, dates, req fields) into the existing DB row.
 *
 * Conflict rules:
 *   - Salary, postedAt, expiresAt, contractType: Workday wins (PCC never has these).
 *   - description: only set if current is null or under 200 chars.
 *   - req arrays (reqCertificates, reqAuthorities, reqAircraftTypes): union merge.
 *   - req scalars: Workday wins only if PCC didn't extract a value.
 *   - notes: PCC's #NotesRow wins; never overwrite with Workday data.
 *   - lastEnrichedFromWorkdayAt: always set, even when no JSON-LD found.
 */

const axios  = require('axios');
const logger = require('../config/logger');
const { extractRequirements, extractSalary } = require('./normalize');

const WORKDAY_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// Without a browser-style Accept header Workday returns a JSON redirect object instead of HTML.
const WORKDAY_HEADERS = {
  'User-Agent': WORKDAY_UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const PERIOD_MAP = { YEAR: 'year', ANNUAL: 'year', MONTH: 'month', HOUR: 'hour', WEEK: 'week' };

// ─── JSON-LD parser ───────────────────────────────────────────────────────────

/**
 * Extract structured job data from the raw HTML of a Workday job page.
 * Returns null if no JobPosting JSON-LD block is found.
 *
 * @param {string} html
 * @returns {{
 *   salaryMin: number|null, salaryMax: number|null,
 *   salaryCurrency: string|null, salaryPeriod: string|null,
 *   postedAt: Date|null, expiresAt: Date|null,
 *   description: string|null, reqText: string|null,
 *   contractType: string|null, hiringOrg: string|null,
 * }|null}
 */
function extractWorkdayJsonLd(html) {
  if (!html) return null;

  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const raw = JSON.parse(m[1].trim());
      const candidates = Array.isArray(raw) ? raw : [raw];
      const posting = candidates.find((d) => d?.['@type'] === 'JobPosting');
      if (posting) return _parsePosting(posting);
    } catch {
      // malformed block — try next
    }
  }
  return null;
}

function _parsePosting(p) {
  // ── Salary ─────────────────────────────────────────────────────────────────
  let salaryMin = null, salaryMax = null, salaryCurrency = null, salaryPeriod = null;
  const bs = p.baseSalary;
  if (bs) {
    salaryCurrency = bs.currency || null;
    const val = bs.value || bs; // some implementations hoist value fields up
    if (val) {
      const rawMin = val.minValue ?? val.value ?? null;
      const rawMax = val.maxValue ?? val.value ?? null;
      salaryMin = rawMin != null ? Number(rawMin) : null;
      salaryMax = rawMax != null ? Number(rawMax) : null;
      if (isNaN(salaryMin)) salaryMin = null;
      if (isNaN(salaryMax)) salaryMax = null;
      salaryPeriod = PERIOD_MAP[(val.unitText || '').toUpperCase()] || null;
    }
  }

  // ── Dates ──────────────────────────────────────────────────────────────────
  const postedAt  = p.datePosted   ? _safeDate(p.datePosted)   : null;
  const expiresAt = p.validThrough ? _safeDate(p.validThrough) : null;

  // ── Description ────────────────────────────────────────────────────────────
  const description = p.description ? stripHtml(p.description) : null;

  // ── Requirements text — combine qualifications + experienceRequirements + educationRequirements
  const reqParts = [p.qualifications, p.experienceRequirements, p.educationRequirements]
    .filter(Boolean)
    .map((t) => (typeof t === 'object' ? JSON.stringify(t) : String(t)))
    .map(stripHtml)
    .filter(Boolean);
  const reqText = reqParts.join('\n') || description || null;

  // ── Employment type ────────────────────────────────────────────────────────
  const contractType = p.employmentType || null;

  // ── Hiring org ─────────────────────────────────────────────────────────────
  const hiringOrg = p.hiringOrganization?.name || null;

  return { salaryMin, salaryMax, salaryCurrency, salaryPeriod, postedAt, expiresAt, description, reqText, contractType, hiringOrg };
}

function _safeDate(val) {
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

// ─── Single-job enricher ──────────────────────────────────────────────────────

/**
 * Fetch a Workday job page and compute the DB update payload.
 * Always returns an object (never throws). Sets `noJsonLd: true` when
 * the page loads but has no JobPosting block.
 *
 * @param {{ id, applyUrl, description, contractType,
 *            reqCertificates, reqAuthorities, reqAircraftTypes,
 *            reqMedicalClass, reqMinTotalHours, reqMinPicHours,
 *            reqMinMultiEngineHours, reqMinTurbineHours, reqMinInstrumentHours,
 *            reqMinCrossCountryHours, reqEducation, reqWorkAuthorization, reqEnglishLevel
 *         }} job
 * @returns {Promise<{ id, updates?, noJsonLd?, reason?, error? }>}
 */
async function enrichOneWorkdayJob(job) {
  let html;
  try {
    const resp = await axios.get(job.applyUrl, {
      headers: WORKDAY_HEADERS,
      timeout: 15000,
      validateStatus: (s) => s < 500,
      responseType: 'arraybuffer',
    });

    if (resp.status !== 200) {
      return { id: job.id, noJsonLd: true, reason: `HTTP ${resp.status}` };
    }
    html = resp.data && resp.data.length > 0 ? Buffer.from(resp.data).toString('utf-8') : null;
    if (!html) return { id: job.id, noJsonLd: true, reason: 'empty body' };
  } catch (err) {
    return { id: job.id, error: err.code || err.message };
  }

  const parsed = extractWorkdayJsonLd(html);
  if (!parsed) {
    logger.info({ id: job.id, url: job.applyUrl, msg: 'Workday page loaded but no JobPosting JSON-LD found' });
    return { id: job.id, noJsonLd: true, reason: 'no JobPosting JSON-LD' };
  }

  // Log if Workday names a different employer
  if (parsed.hiringOrg && parsed.hiringOrg.toLowerCase() !== (job.company || '').toLowerCase()) {
    logger.info({ id: job.id, pccCompany: job.company, workdayOrg: parsed.hiringOrg, msg: 'Workday hiringOrg differs from PCC company — not overwriting' });
  }

  // ── Build update payload ─────────────────────────────────────────────────
  const updates = {
    lastEnrichedFromWorkdayAt: new Date(),
  };

  // Salary — structured JSON-LD wins; fall back to regex extraction from description text
  if (parsed.salaryMin != null)     updates.salaryMin = parsed.salaryMin;
  if (parsed.salaryMax != null)     updates.salaryMax = parsed.salaryMax;
  if (parsed.salaryCurrency)        updates.salaryCurrency = parsed.salaryCurrency;
  if (parsed.salaryPeriod)          updates.salaryPeriod = parsed.salaryPeriod;

  if (updates.salaryMin == null && updates.salaryMax == null) {
    const sal = extractSalary(parsed.description || parsed.reqText);
    if (sal) {
      updates.salaryMin      = sal.salaryMin;
      updates.salaryMax      = sal.salaryMax;
      updates.salaryCurrency = sal.salaryCurrency;
      updates.salaryPeriod   = sal.salaryPeriod;
    }
  }

  // Dates — Workday wins
  if (parsed.postedAt)              updates.postedAt  = parsed.postedAt;
  if (parsed.expiresAt)             updates.expiresAt = parsed.expiresAt;

  // Contract type — Workday wins if we don't have it
  if (parsed.contractType && !job.contractType) updates.contractType = parsed.contractType;

  // Description — only set if current is null or under 200 chars
  if (parsed.description) {
    const curLen = (job.description || '').length;
    if (!job.description || curLen < 200) {
      updates.description = parsed.description;
    }
  }

  // Req fields — run extractRequirements on combined text, then merge
  if (parsed.reqText) {
    const reqs = extractRequirements(parsed.reqText);

    // Arrays: union merge (never remove existing)
    updates.reqCertificates  = [...new Set([...(job.reqCertificates  || []), ...(reqs.reqCertificates  || [])])];
    updates.reqAuthorities   = [...new Set([...(job.reqAuthorities   || []), ...(reqs.reqAuthorities   || [])])];
    updates.reqAircraftTypes = [...new Set([...(job.reqAircraftTypes || []), ...(reqs.reqAircraftTypes || [])])];

    // Scalars: Workday wins only if PCC didn't extract a value
    if (reqs.reqMedicalClass           && !job.reqMedicalClass)           updates.reqMedicalClass           = reqs.reqMedicalClass;
    if (reqs.reqMinTotalHours          && !job.reqMinTotalHours)          updates.reqMinTotalHours          = reqs.reqMinTotalHours;
    if (reqs.reqMinPicHours            && !job.reqMinPicHours)            updates.reqMinPicHours            = reqs.reqMinPicHours;
    if (reqs.reqMinMultiEngineHours    && !job.reqMinMultiEngineHours)    updates.reqMinMultiEngineHours    = reqs.reqMinMultiEngineHours;
    if (reqs.reqMinTurbineHours        && !job.reqMinTurbineHours)        updates.reqMinTurbineHours        = reqs.reqMinTurbineHours;
    if (reqs.reqMinInstrumentHours     && !job.reqMinInstrumentHours)     updates.reqMinInstrumentHours     = reqs.reqMinInstrumentHours;
    if (reqs.reqMinCrossCountryHours   && !job.reqMinCrossCountryHours)   updates.reqMinCrossCountryHours   = reqs.reqMinCrossCountryHours;
    if (reqs.reqEducation              && !job.reqEducation)              updates.reqEducation              = reqs.reqEducation;
    if (reqs.reqWorkAuthorization      && !job.reqWorkAuthorization)      updates.reqWorkAuthorization      = reqs.reqWorkAuthorization;
    if (reqs.reqEnglishLevel           && !job.reqEnglishLevel)           updates.reqEnglishLevel           = reqs.reqEnglishLevel;
    if (reqs.reqWillingToRelocate      && !job.reqWillingToRelocate)      updates.reqWillingToRelocate      = reqs.reqWillingToRelocate;
  }

  return { id: job.id, updates, parsed };
}

// ─── Batch enricher ───────────────────────────────────────────────────────────

/**
 * Enrich an array of jobs in parallel batches of 5.
 * Returns an array parallel to input where each element is the
 * result of enrichOneWorkdayJob (may have updates, noJsonLd, or error).
 *
 * @param {Array} jobs
 * @param {{ onProgress?: (done: number, total: number) => void }} opts
 */
async function enrichWorkdayBatch(jobs, { onProgress } = {}) {
  const BATCH_SIZE = 5;
  const STAGGER_MS = 300;
  const results = [];

  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((job, idx) =>
        new Promise((resolve) => setTimeout(resolve, idx * STAGGER_MS)).then(() => enrichOneWorkdayJob(job)),
      ),
    );
    results.push(...batchResults);
    if (onProgress) onProgress(Math.min(i + BATCH_SIZE, jobs.length), jobs.length);
  }
  return results;
}

module.exports = { extractWorkdayJsonLd, enrichOneWorkdayJob, enrichWorkdayBatch };
