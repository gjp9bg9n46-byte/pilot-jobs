'use strict';

/**
 * Aviation-role title filter.
 *
 * Most employers posting on Lever/Greenhouse/Workday mix pilot openings with
 * engineering, marketing, and ops roles. We keep only aviation flight-crew roles.
 *
 * Positive patterns — keep if title matches any:
 *   pilot, captain, first officer, 1st officer, flight officer, aviator,
 *   flight instructor, check airman, chief pilot, examiner,
 *   aircraft-type + role combos (e.g. "B737 Captain", "A320 First Officer")
 *
 * Negative patterns — drop even if a positive matched (false-positive guard):
 *   "pilot program", autopilot, auto-pilot, pilot study, pilot deployment,
 *   pilot test, pilot project, pilot scheme, pilot phase, pilot launch
 */

const AVIATION_TITLE_PATTERNS = new RegExp(
  [
    'pilot',
    'captain',
    'first\\s+officer',
    '1st\\s+officer',
    'second\\s+officer',
    '2nd\\s+officer',
    'flight\\s+officer',
    'co[-\\s]?pilot',
    'copilot',
    '\\bfo\\b',         // "FO" standalone (e.g. "B737 FO")
    'aviator',
    'flight\\s+instructor',
    'check\\s+airman',
    'chief\\s+pilot',
    'type\\s+rating\\s+examiner',
    'aircraft\\s+commander',
    'flight\\s+examiner',
    'line\\s+training\\s+captain',
    'training\\s+captain',
    // Aircraft-type prefix + role (catches "B737 Captain", "A320 FO", etc.)
    '(?:b7\\d{2}|a[23]\\d{2}|a220|e\\d{3}|crj|atr|dash\\s*8|dhc|q400|saab)\\s+(?:captain|pilot|first\\s+officer|fo)',
  ].join('|'),
  'i',
);

const FALSE_POSITIVE_PATTERNS = new RegExp(
  [
    'pilot\\s+program',
    'pilot\\s+project',
    'pilot\\s+study',
    'pilot\\s+deployment',
    'pilot\\s+test(?:ing)?',
    'pilot\\s+scheme',
    'pilot\\s+phase',
    'pilot\\s+launch',
    'pilot\\s+initiative',
    'autopilot',
    'auto-pilot',
    // Fixed-wing-only policy (owner directive): no drone/UAS and no rotary-wing roles.
    'drone',                  // any drone role (operator, pilot, technician)
    '\\buas\\b',
    '\\buav\\b',
    '\\bsuas\\b',
    'unmanned',
    'remotely\\s+piloted',
    'remote\\s+pilot',
    'helicopter',
    'rotorcraft',
    'rotary[-\\s]?wing',
    // Maritime false positives (aggregator sources return ship/harbour pilots)
    'harbou?r\\s+pilot',
    'marine\\s+pilot',
    'maritime',
    'yacht',
    '\\bvessel\\b',
    '\\bship\\b',
    '\\btug(?:boat)?\\b',
    'cruise\\s+line',
    'co-founder',             // "Co-Pilot" false-positive guard for startup roles
  ].join('|'),
  'i',
);

/**
 * Returns true if the job title looks like a pilot / flight-crew role.
 *
 * @param {string} title
 * @returns {boolean}
 */
function isAviationRole(title, { excludeOnly = false } = {}) {
  if (!title) return false;
  if (FALSE_POSITIVE_PATTERNS.test(title)) return false;
  // excludeOnly: for sources that are already pilot-only (e.g. USAJobs federal
  // aviation series) — titles like "Air Interdiction Agent" carry no pilot
  // keyword but ARE fixed-wing pilot roles; only the exclusions apply.
  if (excludeOnly) return true;
  return AVIATION_TITLE_PATTERNS.test(title);
}

/**
 * Filter an array of normalized jobs, keeping only aviation roles.
 * Logs counts per source.
 *
 * @param {import('./types').NormalizedJob[]} jobs
 * @param {string} source  label for logging
 * @param {string} employer label for logging
 * @returns {{ kept: import('./types').NormalizedJob[], dropped: number }}
 */
function filterAviationJobs(jobs, source, employer, { excludeOnly = false } = {}) {
  const kept = jobs.filter((j) => isAviationRole(j.title, { excludeOnly }));
  const dropped = jobs.length - kept.length;
  return { kept, dropped };
}

module.exports = { isAviationRole, filterAviationJobs, AVIATION_TITLE_PATTERNS };
