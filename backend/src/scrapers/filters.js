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
    'uncrewed',
    'remotely\\s+piloted',
    'remote\\s+pilot',
    '\\brpic\\b',
    'multicopter', 'multirotor', 'quadcopter',
    'helicopter',
    'rotorcraft',
    'rotary[-\\s]?wing',
    '\\bheli\\b', '\\bhelo\\b',
    // Helicopter in other ingested languages
    'hubschrauber',            // German
    'h[ée]licopt[èe]re',       // French
    'helic[óo]ptero',          // Spanish/Portuguese
    'elicotter',               // Italian (elicottero/i)
    's[mś]igłow',              // Polish (śmigłowiec)
    // Rotary-wing aircraft models — job titles often name the type instead of
    // the word "helicopter" (e.g. "AH-64D Instructor Pilot")
    '\\bah[-\\s]?64', '\\buh[-\\s]?60', '\\bch[-\\s]?47', '\\bhh[-\\s]?60', '\\bmh[-\\s]?60', '\\boh[-\\s]?58',
    'black\\s?hawk', 'apache', 'chinook', 'kiowa', '\\bhuey\\b', 'seahawk', 'lakota',
    'osprey', '\\bv[-\\s]?22\\b', 'tiltrotor',
    '\\baw\\s?1[0-9]{2}\\b',                        // AW109/119/139/169/189
    '\\bec\\s?1[0-9]{2}\\b',                        // EC120–EC155
    '\\bas\\s?3[0-9]{2}\\b',                        // AS350/355/365
    '\\bh1[2-7][05]\\b',                            // H120/125/130/135/145/155/160/175
    '\\bs[-\\s]?92\\b', '\\bs[-\\s]?76\\b', '\\bs[-\\s]?61\\b', '\\bs[-\\s]?64\\b', 'skycrane', 'sea\\s?king',
    '\\br(?:22|44|66)\\b',                          // Robinson
    '\\bmd\\s?5[03]0\\b',
    'bell\\s?(?:2[01][0-9]|4[01][0-9]|505|525|429)\\b',
    '\\bmi[-\\s]?(?:8|17|24|26)\\b',
    // Non-pilot aviation roles (owner directive: pilots only)
    'air\\s+traffic',
    '\\batc\\b',
    'dispatcher',
    'flight\\s+attendant',
    'cabin\\s+crew',
    'loadmaster',
    'flight\\s+engineer\\s+instructor',
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

// ─── Aviation context (for general-purpose aggregators) ──────────────────────
// In French/Spanish/Italian business jargon "pilote / piloto / pilota" means
// "project lead / operator" ("Pilote de travaux" = construction manager,
// "Pilote de ligne de production" = production-line operator). Title matching
// alone therefore floods the board with non-aviation roles from Adzuna/Jooble.
// For those sources we additionally require the title+description to contain
// at least one genuinely aeronautical term (any language we ingest).
const AVIATION_CONTEXT_PATTERNS = new RegExp(
  [
    // English
    'aircraft', 'airline', 'airport', 'aviation', 'aeronautic', 'avionics',
    '\\bflight\\b', 'flying', 'cockpit', 'flight\\s+deck', 'type\\s+rating',
    'flight\\s+hours', 'aerial\\s+(?:survey|application|firefight)',
    // Licences / authorities
    '\\batpl?\\b', '\\bcpl\\b', '\\bppl\\b', '\\beasa\\b', '\\bfaa\\b', '\\bicao\\b',
    '\\bcaa\\b', 'part\\s*(?:121|135|91)\\b', 'medical\\s+class', 'class\\s*1\\s+medical',
    // Manufacturers / types
    'boeing', 'airbus', 'cessna', 'embraer', 'bombardier', 'gulfstream', 'dassault',
    'pilatus', 'beechcraft', 'king\\s+air', '\\ba[23][0-9]{2}\\b', '\\bb7[0-9]{2}\\b',
    '\\batr\\b', '\\bcrj\\b', 'simulator', 'simulateur',
    // French
    'a[ée]rien', 'a[ée]ronef', 'a[ée]ronautique', 'a[ée]roport', 'compagnie\\s+a[ée]rienne',
    '\\bavion\\b', 'heures\\s+de\\s+vol', 'licence\\s+de\\s+pilote', 'pilote\\s+de\\s+ligne\\s+a[ée]rienne',
    // Spanish / Italian / Portuguese
    'aerol[ií]nea', 'aeron[aá]utic', 'aeronave', 'a[ée]reo', 'horas\\s+de\\s+vuelo',
    'licencia\\s+de\\s+piloto', '\\bvuelo\\b', '\\bvolo\\b', 'compagnia\\s+aerea',
    // German / Dutch
    'luftfahrt', 'fluggesellschaft', 'flugzeug', 'flugstunden', '\\bpiloot\\b', 'luchtvaart',
    // Arabic-region English job boards often use these
    'first\\s+officer', 'captain', 'air\\s+operator',
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

// French: "pilote" is standard business jargon for any coordinator/lead role
// ("Pilote de travaux" = construction manager, "Pilote qualité" = QA lead) —
// and those postings often mention "aéronautique" because the CLIENT is an
// aerospace firm, so the context check alone can't catch them. A French
// 'pilote' title is therefore only kept when the title itself names a flying
// role. (Doesn't affect 'piloto/pilota/pilot' — other languages don't use the
// word this way nearly as much, and the context check still applies to all.)
const FRENCH_PILOT_TITLE = new RegExp(
  [
    'copilote',
    // "pilote de ligne" = airline pilot — but NOT "ligne de production/fabrication…"
    "pilote\\s+de\\s+ligne(?!\\s+(?:de\\s+)?(?:prod|conditionnement|fabrication|montage|assemblage|usinage|emballage))",
    "pilote\\s+d['’]a(?:vion|[ée]ronef)",
    'pilote\\s+avion',
    'pilote\\s+cargo',
    'pilote\\s+instructeur',
    'instructeur\\s+pilote',
    'pilote\\s+professionnel',
    'pilote\\s+priv[ée]',
    "pilote\\s+de\\s+l['’]aviation",
    'pilote\\s+(?:a[23]\\d{2}|b7\\d{2}|atr|crj|e\\d{3}|dash|q400)',
  ].join('|'),
  'i',
);

/**
 * Full job check: title filter + (optionally) aviation-context requirement on
 * title+description. Use requireContext for general-purpose aggregators
 * (Adzuna, Jooble) where "pilote/piloto" is common non-aviation jargon.
 *
 * @param {{title: string, description?: string}} job
 * @returns {boolean}
 */
// Drone/UAS signals in the BODY text (title-level negatives already exist).
// Applied to general aggregators only: a "Flight Test Pilot" ad whose text is
// about multicopters/Part 107 is a drone job wearing a manned-pilot title.
const DRONE_CONTEXT_PATTERNS = /multicopter|multirotor|quadcopter|uncrewed|unmanned|\bdrones?\b|\buas\b|\buav\b|remote(?:ly)?\s+piloted|\bbvlos\b|part\s*107|\brpas\b|\brpic\b/i;

function isAviationJob(job, { excludeOnly = false, requireContext = false } = {}) {
  const title = String(job.title || '');
  if (!isAviationRole(title, { excludeOnly })) return false;
  if (!requireContext) return true;
  if (/\bpilote(s)?\b/i.test(title) && !FRENCH_PILOT_TITLE.test(title)) return false;
  // Rotary-wing employer names ("Helicopter Jobs", "XYZ Rotor Services") — the
  // title may not mention the aircraft, but the company gives it away.
  if (/helicopter|rotorcraft|rotary|\bheli\b|\brotor\b/i.test(String(job.company || ''))) return false;
  const text = `${title} ${job.description || ''}`;
  if (DRONE_CONTEXT_PATTERNS.test(text)) return false;
  return AVIATION_CONTEXT_PATTERNS.test(text);
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
function filterAviationJobs(jobs, source, employer, { excludeOnly = false, requireContext = false } = {}) {
  const kept = jobs.filter((j) => isAviationJob(j, { excludeOnly, requireContext }));
  const dropped = jobs.length - kept.length;
  return { kept, dropped };
}

module.exports = { isAviationRole, isAviationJob, filterAviationJobs, AVIATION_TITLE_PATTERNS };
