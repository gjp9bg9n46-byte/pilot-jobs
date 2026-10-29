// ── What a rating's type says about its category ─────────────────────────────
// The create form used to hard-code "Multi-Engine" for every rating, so a
// Cessna 172 was filed as multi-engine. The type usually answers the question
// on its own; where it does not, the pilot is asked rather than guessed at.
//
// A CLASS rating (SEP/MEP/SET/MET) also carries the surface it is flown from —
// "SEP (land)" and "SEP (sea)" are different ratings.

const SINGLE_RE = /^(sep\b|set\b|c[- ]?1[5-8]\d|cessna[- ]?1[5-8]\d|c[- ]?20[68]|caravan|pa-?(28|32|46)\b|warrior|archer|arrow|saratoga|malibu|da-?40|sr[- ]?2[02]|cirrus|tb-?\d{2}|rv-?\d|p2008|tecnam|diamond[- ]?da-?40|piper[- ]?(warrior|archer|arrow)|pc-?12|tbm|grob|katana|citabria|cub)/i;
const MULTI_RE = /^(mep\b|met\b|pa-?(31|34|44)\b|seneca|seminole|duchess|be-?(55|58|76|9\d|20\d)|king[- ]?air|da-?4[26]|da-?62|c[- ]?3\d\d|baron|navajo|dhc|atr|crj|erj|emb|e1[79]\d|a2\d\d|a3[0-9]\d|b7[0-9]\d|md-?\d\d|rj\d\d|q400|saab|fokker|global|challenger|falcon|gulfstream|learjet|citation|hawker|legacy|praetor|phenom)/i;

const CLASS_RE = /^(sep|mep|set|met)\b/i;
export const SURFACES = ['land', 'sea'];

/** 'Single-Engine' | 'Multi-Engine' | null when the type does not say. */
export function impliedCategory(type) {
  const t = String(type || '').trim();
  if (!t) return null;
  if (SINGLE_RE.test(t)) return 'Single-Engine';
  if (MULTI_RE.test(t)) return 'Multi-Engine';
  return null;
}

/** SEP / MEP / SET / MET are class ratings; A320 and the rest are type ratings. */
export function isClassRating(type) {
  return CLASS_RE.test(String(type || '').trim());
}

/** 'land' | 'sea' | null, read from a type like "SEP (sea)". */
export function surfaceOf(type) {
  const m = /\((land|sea)\)/i.exec(String(type || ''));
  return m ? m[1].toLowerCase() : null;
}

/** "SEP" + 'sea' → "SEP (sea)". A type rating is returned untouched. */
export function withSurface(type, surface) {
  const t = String(type || '').trim();
  if (!isClassRating(t) || !SURFACES.includes(surface)) return t;
  return `${t.replace(/\s*\((land|sea)\)\s*$/i, '').trim()} (${surface})`;
}

export const CATEGORIES = ['Single-Engine', 'Multi-Engine'];

/** Store the type uppercased, but keep the surface readable: "SEP (land)". */
export function normalizeType(type) {
  return String(type || '').trim().toUpperCase().replace(/\((LAND|SEA)\)/g, (_m, s) => `(${s.toLowerCase()})`);
}
