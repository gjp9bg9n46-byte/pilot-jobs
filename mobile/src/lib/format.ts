// Number formatting for display. ALWAYS pass an explicit locale: a bare
// `toLocaleString()` follows the DEVICE locale, which on a phone set to e.g.
// German renders 1500 as "1.500" — read as "1.5" by a pilot scanning hours.
// (Found on a real device: the Jobs list showed "1.500 h".) The product shows
// thousands with a comma everywhere, so the locale is pinned.
export const num = (n: number | string | null | undefined): string => {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString('en-US') : '—';
};

// Hours, the one house format: "1,500 h" — comma thousands, space, lowercase h.
// Never "hrs", never "1.500".
export const hours = (n: number | string | null | undefined): string => `${num(n)} h`;
