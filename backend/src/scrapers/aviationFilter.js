'use strict';

// Aviation vs non-aviation classifier. WhatJobs (and other broad aggregators)
// match the keyword "captain", which drags in hospitality ("F&B Captain"),
// maritime ("Port Captain", "Rotational Captain 40m S.Y") and generic ("Team
// Captain", "Job Captain") roles. It keeps a job only when it carries a real
// aviation signal, rejects hospitality/maritime/generic-captain roles, and routes
// ambiguous MILITARY/air-force items to 'review' (a person approves them).
//
// classifyJob(job) → { verdict: 'keep' | 'reject' | 'review', reason }
//
// Precedence matters. "pilot" is ambiguous — a maritime "Port Captain" ad names
// harbour "pilots", and a resort may mention an "airline lounge" — so the order
// is: STRONG aviation signal (type code / licence / first-officer / airline) →
// KEEP; then hospitality/maritime → REJECT (beats a bare "pilot" mention); then
// military → REVIEW; then a WEAK bare-"pilot" signal → KEEP; then generic
// "captain" → REJECT. All matching is word-boundaried (bar≠Barcelona,
// port≠airport/support/transport, ship≠internship/partnership).

// ── STRONG aviation signals (unambiguous ⇒ keep) ────────────────────────────
const RX_AV_STRONG = new RegExp([
  // role-specific pilot + airline terms-of-art
  '\\b(?:first\\s+officers?|1st\\s+officer|second\\s+officer|f\\/o|co[-\\s]?pilots?|co[-\\s]?pilotes?|chief\\s+pilot|check\\s+airman|aircraft\\s+commander|flight\\s+instructor|line\\s+(?:training|check)|direct\\s+entry)\\b',
  // licences / ratings / regulators
  '\\b(?:atpl?|atp|cpl|mpl|ppl|type[-\\s]?rat(?:ing|ed)|instrument\\s+rating|part\\s?1(?:21|35|91)|easa|faa|icao|gcaa|casa|tcca)\\b',
  // airline / aviation operational context
  '\\b(?:airlines?|airways|aviation|flag\\s+carrier|air\\s+carrier|low[-\\s]?cost\\s+carrier|cockpit|flight\\s+deck|flight\\s+crew|flight\\s+operations)\\b',
  // flight experience (needs a flight context word — NOT a bare "40 hours")
  '\\b(?:flight|flying|total|pic|p1|command|multi[-\\s]?engine|turbine|instrument)\\s+(?:time|hours|hrs)\\b', '\\btotal\\s+time\\b',
  // aircraft type codes (airliner + business jet + GA + turboprop)
  '\\b(?:a2[12]0|a3[0-9]0|a220|b7[0-9]7|7[0-9]7|cl[-\\s]?[36][05]0|cl\\s?60[45]|challenger|global\\s*[5-7]\\d00|bd[-\\s]?700|phenom|citation|gulfstream|g[2-7][0-9]0|falcon\\s*[2-9]|learjet|pilatus|pc-?\\d\\d|king\\s+air|dash\\s?8|dhc-?\\d|q400|crj\\d?|erj|e\\d{3}|embraer|atr\\s?\\d|cessna|caravan|hawker|praetor|legacy\\s*\\d{3}|da4[02]|da62|tbm\\s*\\d)\\b',
].join('|'), 'i');

// Airline / operator employer names (the company alone is a strong signal)
const RX_AV_COMPANY = new RegExp([
  '\\b(?:airlines?|airways|aviation|a[eé]ro\\w*|aircraft|netjets|vistajet|flexjet|wheels\\s*up)\\b',
  '\\bjets?\\b',
  '\\b(?:emirates|qatar\\s+airways|etihad|flydubai|ryanair|easyjet|wizz\\s?air|lufthansa|air\\s+canada|turkish\\s+airlines|british\\s+airways|air\\s*vial|solairus|jet\\s+aviation)\\b',
].join('|'), 'i');

// ── Weak aviation signal — a bare "pilot" mention (maritime harbour pilots are
// filtered out before this by RX_REJECT) ────────────────────────────────────
const RX_AV_WEAK = /\b(?:pilots?|aviators?|flying)\b/i;

// ── Military / air-force (ambiguous ⇒ review, never auto-hide) ───────────────
const RX_MILITARY = /\b(?:air\s+force|air\s+defen[cs]e|armed\s+forces|military|navy|naval|army|regiment|squadron|infantry|artillery|battalion|defen[cs]e\s+force)\b/i;

// ── Hospitality + maritime (⇒ reject) ───────────────────────────────────────
const RX_REJECT = new RegExp([
  // hospitality / F&B
  '\\bf\\s?&\\s?b\\b', 'food\\s+(?:and|&)\\s+beverage',
  '\\b(?:restaurants?|dining|in[-\\s]?room\\s+dining|in[-\\s]?villa|villas?|butler|waiters?|waitress|barista|bartender|sommelier|chefs?|culinary|kitchens?|housekeeping|concierge|resorts?|hotels?|hospitality|guest\\s+experience|banquets?|catering|room\\s+service|wait\\s+staff|ma[iî]tre|doorman|clubhouse)\\b',
  '\\bbell\\s?(?:boy|hop|captain)\\b',
  // maritime (incl. maritime "pilot" terms-of-art — harbour/marine/river/docking)
  '\\b(?:yachts?|maritime|sea\\s+captain|vessels?|cruise\\s+ships?|deckhands?|ship\\s+captain|port\\s+captain|nautical|seafarers?|ferry|boatswain|able\\s+seaman|expedition\\s+boat)\\b',
  '\\b(?:marine|harbou?r|maritime|river|docking|canal|bar|sea|ship|berth|mooring)\\s+pilots?\\b',
  '\\bshipping\\s+(?:line|company|b\\.?v)', 'offshore\\s+(?:boat|vessel)',
].join('|'), 'i');

const RX_CAPTAIN = /\bcaptain\b/i;

// "<domain> Officer" grades that are NOT pilots — "Housing First Officer" (council),
// "Loan Officer", "Compliance Officer"… "First/Second Officer" alone is not an
// aviation signal; it needs a second one (type/airline/pilot). If the title is a
// non-aviation officer grade and there's no aircraft type or airline, reject.
const RX_NONAV_OFFICER = /\b(?:housing|loan|lettings|welfare|compliance|customs|immigration|police|prison|probation|revenue|benefits?|planning|security|data\s+protection|information|returning|liaison|parking|enforcement|licen[cs]ing|environmental\s+health|trading\s+standards|admissions|finance|accounts?|payroll|procurement|human\s+resources|marketing|sales|retail|duty|floor|night|front|desk|ward|safeguarding|tenancy|estates?|highways?|transport|waste|community|youth|development|project|programme|program)\s+(?:(?:first|second|chief|senior|principal|duty|support|liaison)\s+)?officers?\b/i;
// Aircraft type codes alone (subset of STRONG) — used to clear the officer guard.
const RX_TYPECODE = /\b(?:a2[12]0|a3[0-9]0|a220|b7[0-9]7|7[0-9]7|cl[-\s]?[36][05]0|cl\s?60[45]|challenger|global\s*[5-7]\d00|bd[-\s]?700|phenom|citation|gulfstream|g[2-7][0-9]0|\bgv\b|falcon|learjet|pilatus|pc-?\d\d|king\s+air|dash\s?8|dhc-?\d|q400|crj\d?|erj|e\d{3}|embraer|atr\s?\d|cessna|caravan|hawker|praetor|legacy\s*\d{3}|da4[02]|da62|tbm)\b/i;

function textOf(job) {
  const title = String(job.title || '');
  const desc = String(job.description || '').slice(0, 2000);
  return { title, text: `${title} ${desc}`, company: String(job.company || '') };
}

/**
 * @param {{title?:string, company?:string, description?:string, sourceType?:string}} job
 * @returns {{verdict:'keep'|'reject'|'review', reason:string}}
 */
function classifyJob(job) {
  const { title, text, company } = textOf(job);
  if (job.sourceType === 'direct_ats' || job.sourceType === 'operator_direct') {
    return { verdict: 'keep', reason: 'airline/operator source' };
  }
  // Non-aviation officer grade (Housing/Loan/Compliance … Officer) with no aircraft
  // type and no airline employer → reject. "First Officer" needs a 2nd signal.
  if (RX_NONAV_OFFICER.test(title) && !RX_TYPECODE.test(text) && !RX_AV_COMPANY.test(company) && !/\b(?:airlines?|airways|aviation|cockpit|flight\s+deck|flying\b)\b/i.test(text)) {
    return { verdict: 'reject', reason: 'non-aviation officer grade, no aviation signal' };
  }
  if (RX_AV_STRONG.test(text) || RX_AV_COMPANY.test(company)) {
    return { verdict: 'keep', reason: 'aviation signal (type/licence/airline/first-officer)' };
  }
  if (RX_REJECT.test(text)) {
    return { verdict: 'reject', reason: 'hospitality/maritime term, no aviation signal' };
  }
  if (RX_AV_WEAK.test(text)) {
    return { verdict: 'keep', reason: 'pilot/flying mention' };
  }
  if (RX_MILITARY.test(text)) {
    return { verdict: 'review', reason: 'military/air-force — ambiguous rank, needs review' };
  }
  if (RX_CAPTAIN.test(title)) {
    return { verdict: 'reject', reason: 'generic "captain", no aviation signal' };
  }
  return { verdict: 'keep', reason: 'no reject signal' };
}

module.exports = { classifyJob, RX_AV_STRONG, RX_AV_COMPANY, RX_AV_WEAK, RX_MILITARY, RX_REJECT, RX_NONAV_OFFICER };
