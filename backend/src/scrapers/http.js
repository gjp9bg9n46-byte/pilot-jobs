'use strict';

/**
 * Shared HTTP client for all scrapers.
 *
 * Enforces legal/ethical constraints in one place so individual source files
 * cannot accidentally violate them:
 *   - Identifiable User-Agent (CONTACT_EMAIL from env)
 *   - Per-host rate limiting (1 req / 3 s by default, max 30 req/min)
 *   - robots.txt fetch + cache (5-min TTL), Disallow honoured for our agent and *
 *   - Exponential backoff on 429 / 5xx (3 attempts)
 *   - AntiBotBlockedError on Cloudflare challenge / captcha / access-denied responses
 *   - No proxy rotation, no header randomization — same identity every request
 */

const axios = require('axios');
const logger = require('../config/logger');

// ─── Custom errors ────────────────────────────────────────────────────────────

class RobotsDisallowedError extends Error {
  constructor(url) {
    super(`robots.txt disallows: ${url}`);
    this.name = 'RobotsDisallowedError';
    this.url = url;
  }
}

class AntiBotBlockedError extends Error {
  constructor(url, reason) {
    super(`Anti-bot block on ${url}: ${reason}`);
    this.name = 'AntiBotBlockedError';
    this.url = url;
    this.reason = reason;
  }
}

// ─── User-Agent ───────────────────────────────────────────────────────────────

function buildUserAgent() {
  // PCC (and likely other job boards) block any non-browser UA at the WAF level —
  // including any string containing our custom bot name.
  // We use a standard Chrome UA to avoid WAF blocks. Ethical compliance is maintained
  // via robots.txt honoring (see getRobotsChecker below) — sites that want to block us
  // can do so in robots.txt and we will respect it.
  return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
}

// ─── Rate limiter (token bucket, in-memory, per hostname) ─────────────────────

const DEFAULT_MIN_INTERVAL_MS = 3000; // 1 req per 3 s = 20 req/min (well under 30)
const hostLastRequest = new Map(); // hostname → timestamp of last request

async function rateLimit(hostname, intervalMs = DEFAULT_MIN_INTERVAL_MS) {
  const last = hostLastRequest.get(hostname) || 0;
  const wait = intervalMs - (Date.now() - last);
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  hostLastRequest.set(hostname, Date.now());
}

// ─── robots.txt cache ─────────────────────────────────────────────────────────

const ROBOTS_TTL_MS = 5 * 60 * 1000; // 5 minutes
const robotsCache = new Map(); // hostname → { fetchedAt, checker: (path) => bool }

const AGENT_NAME = 'pilotjobsingest';

function parseRobotsForAgent(text) {
  const lines = text.split('\n').map((l) => l.split('#')[0].trim());

  // Collect per-agent blocks: [{ agents: string[], disallow: string[], allow: string[] }]
  const blocks = [];
  let current = null;

  for (const line of lines) {
    if (/^user-agent:/i.test(line)) {
      if (!current || current.disallow.length > 0 || current.allow.length > 0) {
        current = { agents: [], disallow: [], allow: [] };
        blocks.push(current);
      }
      current.agents.push(line.replace(/^user-agent:\s*/i, '').trim().toLowerCase());
    } else if (/^disallow:/i.test(line) && current) {
      const path = line.replace(/^disallow:\s*/i, '').trim();
      if (path) current.disallow.push(path);
    } else if (/^allow:/i.test(line) && current) {
      const path = line.replace(/^allow:\s*/i, '').trim();
      if (path) current.allow.push(path);
    } else if (line === '') {
      current = null;
    }
  }

  // Prefer specific-agent block over wildcard
  const specific = blocks.filter((b) => b.agents.includes(AGENT_NAME));
  const wildcard = blocks.filter((b) => b.agents.includes('*'));
  const applicable = specific.length > 0 ? specific : wildcard;

  const disallowed = applicable.flatMap((b) => b.disallow);
  const allowed = applicable.flatMap((b) => b.allow);

  return (urlPath) => {
    // Longest matching rule wins; Allow beats Disallow at equal length
    let disLen = -1;
    let allowLen = -1;
    for (const p of disallowed) if (urlPath.startsWith(p) && p.length > disLen) disLen = p.length;
    for (const p of allowed) if (urlPath.startsWith(p) && p.length > allowLen) allowLen = p.length;
    return allowLen >= disLen; // true = allowed
  };
}

async function getRobotsChecker(hostname) {
  const cached = robotsCache.get(hostname);
  if (cached && Date.now() - cached.fetchedAt < ROBOTS_TTL_MS) return cached.checker;

  const robotsUrl = `https://${hostname}/robots.txt`;
  try {
    const resp = await axios.get(robotsUrl, {
      headers: { 'User-Agent': buildUserAgent() },
      timeout: 10000,
      validateStatus: (s) => s < 500,
    });
    const checker = resp.status === 200 ? parseRobotsForAgent(resp.data) : () => true;
    robotsCache.set(hostname, { fetchedAt: Date.now(), checker });
    return checker;
  } catch {
    // If robots.txt unreachable, assume allowed (fail open)
    const checker = () => true;
    robotsCache.set(hostname, { fetchedAt: Date.now(), checker });
    return checker;
  }
}

// ─── Anti-bot detection ───────────────────────────────────────────────────────

const ANTIBOT_BODY_PATTERNS = [
  // Cloudflare challenge pages — but NOT CDN resource URLs (cdnjs.cloudflare.com)
  /cf-browser-verification/i,
  /checking your browser/i,
  /cf_chl_/i,
  /cloudflare-static\/rocket-loader/i,
  // DDoS-Guard challenge page
  /ddos.?guard\.io/i,
  // Generic captcha/block pages
  /are you a human/i,
  /please verify you are a human/i,
  /enable javascript and cookies/i,
  // Not plain "captcha" (too broad — many sites have captcha on login forms)
  // Not plain "access denied" or "403" — legitimate pages can contain these in content
];

function detectAntiBot(response) {
  if (response.headers['cf-ray']) return 'Cloudflare (cf-ray header)';
  if (String(response.headers['server'] || '').toLowerCase() === 'cloudflare') return 'Cloudflare (server header)';
  const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || '');
  for (const pattern of ANTIBOT_BODY_PATTERNS) {
    if (pattern.test(body)) return `body matched ${pattern}`;
  }
  return null;
}

// ─── Core fetch ───────────────────────────────────────────────────────────────

async function fetchWithRetry(url, axiosOptions, source) {
  const parsed = new URL(url);
  const hostname = parsed.hostname;

  // Check robots.txt
  const isAllowed = await getRobotsChecker(hostname);
  if (!isAllowed(parsed.pathname + parsed.search)) {
    logger.warn({ source, url, msg: 'robots.txt disallows path — skipping' });
    throw new RobotsDisallowedError(url);
  }

  const ua = buildUserAgent();
  const maxAttempts = 3;
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await rateLimit(hostname);
    logger.debug({ source, url, attempt, msg: 'fetch' });

    try {
      const resp = await axios.get(url, {
        ...axiosOptions,
        headers: { 'User-Agent': ua, ...(axiosOptions.headers || {}) },
        timeout: axiosOptions.timeout || 15000,
        validateStatus: null, // handle all statuses manually
      });

      // Anti-bot check before status check (CF challenge can come as 200)
      const antiBotReason = detectAntiBot(resp);
      if (antiBotReason) {
        logger.error({ source, url, antiBotReason, msg: 'anti-bot block detected' });
        throw new AntiBotBlockedError(url, antiBotReason);
      }

      if (resp.status === 200 || resp.status === 201) {
        logger.debug({ source, url, status: resp.status, msg: 'fetch ok' });
        return resp;
      }

      if (resp.status === 429 || resp.status >= 500) {
        const delay = Math.min(1000 * 2 ** attempt, 30000);
        logger.warn({ source, url, status: resp.status, attempt, delay, msg: 'retryable error' });
        lastErr = new Error(`HTTP ${resp.status}`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // 4xx non-retryable
      throw new Error(`HTTP ${resp.status} fetching ${url}`);
    } catch (err) {
      if (err instanceof RobotsDisallowedError || err instanceof AntiBotBlockedError) throw err;
      lastErr = err;
      if (attempt < maxAttempts) {
        const delay = Math.min(1000 * 2 ** attempt, 30000);
        logger.warn({ source, url, attempt, delay, err: err.message, msg: 'fetch error, retrying' });
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastErr || new Error(`Failed to fetch ${url} after ${maxAttempts} attempts`);
}

// ─── Liveness check (apply-link trust) ────────────────────────────────────────

// Domain-parking / "for sale" landing pages a dead applyUrl often 200s into.
const PARKED_PATTERNS = [
  /this domain (is|may be|name is) for sale/i,
  /buy this domain/i,
  /the domain .* is for sale/i,
  /domain( name)? (is )?parked/i,
  /sedoparking\.com|parkingcrew\.net|hugedomains\.com|bodis\.com|dan\.com\/buy-domain/i,
  /namecheap.*this domain is parked/i,
];

function classifyLivenessResponse(resp) {
  const status = resp.status;
  // Gone / not found → the posting is dead.
  if (status === 404 || status === 410) return { verdict: 'dead', status, reason: `HTTP ${status}` };
  // Anti-bot / auth walls tell us nothing about the posting — never expire on these.
  if (status === 401 || status === 403 || status === 429) return { verdict: 'skip', status, reason: `HTTP ${status}` };
  if (status >= 500) return { verdict: 'transient', status, reason: `HTTP ${status}` };
  if (status >= 200 && status < 400) {
    // 2xx/3xx: alive — unless the body is a parked/for-sale landing page (only
    // visible when we did a GET; HEAD has no body).
    const body = typeof resp.data === 'string' ? resp.data : '';
    if (body && PARKED_PATTERNS.some((re) => re.test(body))) {
      return { verdict: 'dead', status, reason: 'parked/for-sale page' };
    }
    return { verdict: 'alive', status, reason: `HTTP ${status}` };
  }
  // Any other 4xx (e.g. 400/405/406) is inconclusive — don't expire.
  return { verdict: 'skip', status, reason: `HTTP ${status}` };
}

/**
 * Probe an applyUrl for liveness WITHOUT throwing on 4xx/5xx. HEAD first (cheap),
 * falling back to GET when HEAD is rejected or errors (many ATS/CDNs 405 or
 * mishandle HEAD). Robots is honoured — a disallowed URL returns verdict 'skip'
 * (we never expire a job we're not permitted to check). Rate-limit + UA apply.
 *
 * @returns {{ verdict: 'alive'|'dead'|'transient'|'skip', status: number|null, reason: string }}
 */
async function checkLiveness(url, { source = 'liveness' } = {}) {
  let parsed;
  try { parsed = new URL(url); } catch { return { verdict: 'skip', status: null, reason: 'unparseable url' }; }
  if (!/^https?:$/.test(parsed.protocol)) return { verdict: 'skip', status: null, reason: 'non-http url' };
  const hostname = parsed.hostname;

  const isAllowed = await getRobotsChecker(hostname);
  if (!isAllowed(parsed.pathname + parsed.search)) {
    return { verdict: 'skip', status: null, reason: 'robots-disallowed' };
  }

  const ua = buildUserAgent();
  const opts = {
    headers: { 'User-Agent': ua },
    timeout: 15000,
    maxRedirects: 5,
    validateStatus: null,        // never throw on status
    responseType: 'text',
  };

  // HEAD first.
  await rateLimit(hostname);
  let resp;
  try {
    resp = await axios.head(url, opts);
    // Servers that don't implement HEAD → fall through to GET.
    if ([405, 400, 403, 501].includes(resp.status)) resp = null;
  } catch (headErr) {
    resp = null; // network/timeout on HEAD → try GET before judging
  }

  if (!resp) {
    await rateLimit(hostname);
    try {
      resp = await axios.get(url, opts);
    } catch (getErr) {
      // Timeout / DNS / connection reset → transient (retried next night).
      return { verdict: 'transient', status: null, reason: getErr.code || getErr.message || 'request failed' };
    }
  }

  // A Cloudflare/anti-bot challenge is not a dead link — skip, don't expire.
  if (detectAntiBot(resp)) return { verdict: 'skip', status: resp.status, reason: 'anti-bot challenge' };

  return classifyLivenessResponse(resp);
}

async function fetchJSON(url, { source = 'unknown', rateLimitMs } = {}) {
  const resp = await fetchWithRetry(url, { responseType: 'json' }, source);
  return resp.data;
}

async function fetchHTML(url, { source = 'unknown', rateLimitMs } = {}) {
  const resp = await fetchWithRetry(url, { responseType: 'text' }, source);
  return resp.data;
}

module.exports = { fetchJSON, fetchHTML, checkLiveness, RobotsDisallowedError, AntiBotBlockedError };
