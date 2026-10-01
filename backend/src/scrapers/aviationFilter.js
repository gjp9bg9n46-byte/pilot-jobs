'use strict';

// Aviation vs non-aviation classifier. WhatJobs (and other broad aggregators)
// match the keyword "captain", which drags in hospitality ("F&B Captain"),
// maritime ("Port Captain", "Rotational Captain 40m S.Y") and generic ("Team
// Captain", "Job Captain") roles. This keeps a job only when it carries a real
// aviation signal, rejects hospitality/maritime/generic-captain roles, and routes
// ambiguous MILITARY/air-force items to 'review' (a person approves them) rather
// than auto-hiding — a military "Captain" may well be a pilot.
//
// classifyJob(job) → { verdict: 'keep' | 'reject' | 'review', reason }
// All term matching is word-boundaried, so "bar"≠Barcelona, "port"≠airport/
// support/transport, "ship"≠internship/partnership.

// ── Aviation signals (any one ⇒ keep) ───────────────────────────────────────
const RX_AV_TEXT = new RegExp([
  // pilot roles
  '\\b(?:pilots?|first\\s+officers?|1st\\s+officer|second\\s+officer|f\\/o|co[-\\s]?pilots?|co[-\\s]?pilotes?|cadets?|aviators?|aircrew|flight\\s+crew|flight\\s+deck|cockpit|flight\\s+instructor|check\\s+airman|chief\\s+pilot|aircraft\\s+commander|line\\s+(?:training|check))\\b',
  // licences / ratings / regs
  '\\b(?:atpl?|atp|cpl|mpl|ppl|type[-\\s]?rat(?:ing|ed)|instrument\\s+rating|part\\s?1(?:21|35|91)|easa|faa|icao|gcaa|casa|tcca)\\b',
  // flight hours
  '\\b\\d[\\d,.]*\\s*(?:flight\\s+|flying\\s+|total\\s+)?(?:hours|hrs)\\b',
  // aircraft type codes (airliner + business jet + GA + turboprop)
  '\\b(?:a2[12]0|a3[0-9]0|a220|b7[0-9]7|7[0-9]7|cl[-\\s]?3[05]0|challenger|global\\s*[5-7]\\d00|phenom|citation|gulfstream|g[2-7][0-9]0|falcon\\s*[2-9]|learjet|pilatus|pc-?\\d\\d|king\\s+air|dash\\s?8|dhc-?\\d|q400|crj\\d?|erj|embraer|atr\\s?\\d|cessna|caravan|hawker|praetor|legacy\\s*\\d{3}|da4[02]|da62|tbm\\s*\\d)\\b',
].join('|'), 'i');

// Airline / operator employer names (the company alone is an aviation signal)
const RX_AV_COMPANY = new RegExp([
  '\\b(?:airlines?|airways|aviation|a[eé]ro\\w*|aircraft|netjets|vistajet|flexjet|wheels\\s*up)\\b',
  '\\bjets?\\b', // Jet Aviation, NetJets, VistaJet, flyExclusive Jets
  '\\b(?:emirates|qatar\\s+airways|etihad|flydubai|ryanair|easyjet|wizz\\s?air|lufthansa|air\\s+canada|turkish\\s+airlines|british\\s+airways|air\\s*vial|solairus|jet\\s+aviation)\\b',
].join('|'), 'i');

// ── Military / air-force (ambiguous ⇒ review, never auto-hide) ───────────────
const RX_MILITARY = /\b(?:air\s+force|air\s+defen[cs]e|armed\s+forces|military|navy|naval|army|regiment|squadron|infantry|artillery|battalion|defen[cs]e\s+force)\b/i;

// ── Hospitality + maritime (⇒ reject) ───────────────────────────────────────
const RX_REJECT = new RegExp([
  // hospitality / F&B
  '\\bf\\s?&\\s?b\\b', 'food\\s+(?:and|&)\\s+beverage',
  '\\b(?:restaurants?|dining|in[-\\s]?room\\s+dining|in[-\\s]?villa|villas?|butler|waiters?|waitress|barista|bartender|sommelier|chefs?|culinary|kitchens?|housekeeping|concierge|resorts?|hotels?|hospitality|guest\\s+experience|banquets?|catering|room\\s+service|wait\\s+staff|ma[iî]tre|doorman|clubhouse)\\b',
  '\\bbell\\s?(?:boy|hop|captain)\\b',
  // maritime
  '\\b(?:yachts?|maritime|sea\\s+captain|vessels?|cruise\\s+ships?|deckhands?|ship\\s+captain|port\\s+captain|nautical|seafarers?|ferry|boatswain|able\\s+seaman|expedition\\s+boat)\\b',
  '\\bshipping\\s+(?:line|company|b\\.?v)', 'offshore\\s+(?:boat|vessel)',
].join('|'), 'i');

const RX_CAPTAIN = /\bcaptain\b/i;

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
  // Jobs from an airline/operator career site (direct ATS) are aviation by
  // provenance — never filter them on keywords.
  if (job.sourceType === 'direct_ats' || job.sourceType === 'operator_direct') {
    return { verdict: 'keep', reason: 'airline/operator source' };
  }
  if (RX_AV_TEXT.test(text) || RX_AV_COMPANY.test(company)) {
    return { verdict: 'keep', reason: 'aviation signal' };
  }
  if (RX_MILITARY.test(text)) {
    return { verdict: 'review', reason: 'military/air-force — ambiguous rank, needs review' };
  }
  if (RX_REJECT.test(text)) {
    return { verdict: 'reject', reason: 'hospitality/maritime term, no aviation signal' };
  }
  if (RX_CAPTAIN.test(title)) {
    return { verdict: 'reject', reason: 'generic "captain", no aviation signal' };
  }
  return { verdict: 'keep', reason: 'no reject signal' };
}

module.exports = { classifyJob, RX_AV_TEXT, RX_AV_COMPANY, RX_MILITARY, RX_REJECT };
