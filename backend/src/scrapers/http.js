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
  const contact = process.env.CONTACT_EMAIL || 'noreply@example.com';
  return `PilotJobsIngest/1.0 (+contact: ${contact})`;
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
  /cloudflare/i,
  /cf-browser-verification/i,
  /ddos.?guard/i,
  /are you a human/i,
  /please verify you are a human/i,
  /captcha/i,
  /access denied/i,
  /403 forbidden/i,
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

async function fetchJSON(url, { source = 'unknown', rateLimitMs } = {}) {
  const resp = await fetchWithRetry(url, { responseType: 'json' }, source);
  return resp.data;
}

async function fetchHTML(url, { source = 'unknown', rateLimitMs } = {}) {
  const resp = await fetchWithRetry(url, { responseType: 'text' }, source);
  return resp.data;
}

module.exports = { fetchJSON, fetchHTML, RobotsDisallowedError, AntiBotBlockedError };
