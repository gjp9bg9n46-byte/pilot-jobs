'use strict';

/**
 * sourceType classification — where a job's apply link actually sends the pilot.
 *
 * Classify, do NOT gate: aggregators are still ingested. sourceType drives
 * dedup canonical ranking (a direct-ATS row should displace its aggregator
 * duplicate) and lets us measure the aggregator share of live jobs.
 *
 *   direct_ats      — a recruiting-platform portal the carrier runs on
 *                     (Workday/Taleo/iCIMS/Greenhouse/Lever/SmartRecruiters/
 *                     Oracle/Avature), incl. verified carrier-branded ATS
 *                     vanity hostnames.
 *   operator_direct — the carrier's / operator's own site or a government
 *                     board — the applicant still reaches the employer directly.
 *   aggregator      — a third-party job board that redirects (Adzuna, Jooble,
 *                     Careerjet, Aviation Job Search).
 *   null            — unknown / unclassifiable.
 */

// Third-party aggregators — checked first (highest-confidence "not clean").
// Anchor with [./] (or start) so a bare host like `jooble.org` — preceded by
// `//` in a URL, no subdomain — still matches, while `notjooble.org` does not.
const AGGREGATOR = [
  /(?:^|[./])adzuna\./i,
  /(?:^|[./])jooble\./i,
  /(?:^|[./])careerjet\./i,
  /(?:^|[./])aviationjobsearch\.com/i,
];

// Recruiting-platform ATS domains + verified carrier-branded ATS vanity hosts.
const DIRECT_ATS = [
  /myworkdayjobs\.com/i,
  /\.taleo\.net/i,
  /\.icims\.com/i,
  /greenhouse\.io/i,          // boards.greenhouse.io + job-boards.greenhouse.io
  /jobs\.lever\.co/i,
  /smartrecruiters\.com/i,
  /oraclecloud\.com/i,
  /\.avature\.net/i,
  // ── verified ATS vanity domains (carrier-branded host fronting an ATS) ──
  /emiratesgroupcareers\.com/i,   // Emirates — Avature-hosted (external.emiratesgroupcareers.com)
];

// Carrier / operator own-site + government boards.
const OPERATOR_DIRECT = [
  /aircairo\.com/i,
  /magellanaviation\.com/i,
  /usajobs\.gov/i,
];

// Fallback by our own source-platform label when the URL host is inconclusive.
const ATS_PLATFORMS = new Set(['LEVER', 'GREENHOUSE', 'WORKDAY', 'WORKDAY_REST', 'TALEO', 'SMARTRECRUITERS', 'ICIMS', 'AVATURE']);
const AGGREGATOR_PLATFORMS = new Set(['ADZUNA', 'JOOBLE', 'CAREERJET', 'AVIATIONJOBSEARCH']);
// PHENOM: the applyUrl we emit is the carrier's OWN Phenom careers page
// (careers.{carrier}.com/…/job/…) — the candidate reaches the operator directly.
const OPERATOR_PLATFORMS = new Set(['MAGELLAN', 'USAJOBS', 'EMPLOYER_DIRECT', 'PILOTCAREERCENTRE', 'PHENOM']);

/**
 * @param {string} applyUrl
 * @param {string} [sourcePlatform]
 * @returns {'direct_ats'|'operator_direct'|'aggregator'|null}
 */
function classifySourceType(applyUrl, sourcePlatform) {
  const u = String(applyUrl || '');
  if (u) {
    if (AGGREGATOR.some((re) => re.test(u))) return 'aggregator';
    if (DIRECT_ATS.some((re) => re.test(u))) return 'direct_ats';
    if (OPERATOR_DIRECT.some((re) => re.test(u))) return 'operator_direct';
  }
  const sp = String(sourcePlatform || '').toUpperCase();
  if (AGGREGATOR_PLATFORMS.has(sp)) return 'aggregator';
  if (ATS_PLATFORMS.has(sp)) return 'direct_ats';
  if (OPERATOR_PLATFORMS.has(sp)) return 'operator_direct';
  return null;
}

// Cleanliness ranking for dedup canonical selection (higher = preferred).
// DEFAULT: operator_direct counts as clean, below direct_ats, above aggregator.
const SOURCE_TYPE_RANK = { direct_ats: 3, operator_direct: 2, aggregator: 1 };
function sourceTypeRank(sourceType) {
  return SOURCE_TYPE_RANK[sourceType] || 0; // null/unknown ranks below aggregator
}

module.exports = { classifySourceType, sourceTypeRank, SOURCE_TYPE_RANK };
