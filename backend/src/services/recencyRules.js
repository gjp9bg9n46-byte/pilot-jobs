'use strict';

// ── Passenger-carrying recency, per licensing authority ───────────────────────
// ONE table. A rule that is not in it is NOT MAPPED, and an unmapped authority
// (or a missing one) shows the 90-day landing total against 3 and the night
// count as plain information — never "needed", never amber. Guessing a night
// requirement onto a pilot it does not apply to is worse than saying nothing.
//
// The base rule everywhere mapped so far: 3 take-offs and landings in the
// preceding 90 days to carry passengers. Authorities differ on the NIGHT leg:
//   nightApplies   a night leg is required to carry passengers at night
//   nightRequired  how many of the landings must be at night (EASA/UK: one of
//                  the three; FAA: three, and to a full stop)
//   irExempt       a valid instrument rating removes that night requirement
const RULES = {
  EASA: {
    label: 'EASA', base: 3, nightApplies: true, nightRequired: 1, irExempt: true,
    ref: 'EASA Part-FCL FCL.060(b)',
  },
  UK_CAA: {
    label: 'UK CAA', base: 3, nightApplies: true, nightRequired: 1, irExempt: true,
    ref: 'UK (retained) Part-FCL FCL.060(b)',
  },
  FAA: {
    label: 'FAA', base: 3, nightApplies: true, nightRequired: 3, irExempt: false,
    ref: '14 CFR 61.57(a) and (b)',
    // The FAA night leg counts full-stop landings only, and CockpitHire does not
    // record whether a landing was to a full stop — so the night figure is a
    // ceiling, not a verdict. Said out loud rather than quietly assumed.
    // Said to the pilot, not about us: what the rule asks for, and what our
    // number can and cannot tell them about it. The old wording ("CockpitHire
    // does not record full-stop landings…") described our database.
    nightCaveat: 'The FAA night rule counts full-stop landings. Your logbook records landings, not whether they were to a full stop, so treat the night figure as a maximum.',
  },
};

// Authorities we deliberately have NOT mapped. Listed (not silently dropped) so
// the gap is visible, and so a pilot on one of them gets the total-only display
// instead of a rule we are not sure of.
const NOT_MAPPED = {
  ECAA: 'Egypt (ECAA) — ECAR Part 61 is FAA-derived, but the night-recency wording and whether an instrument rating exempts it are unverified.',
  GCAA: 'UAE (GCAA) — CAR-FCL is JAR-derived and probably mirrors FCL.060, but the IR exemption wording is unverified.',
};

// What the pilot reads. The note above is for us; this is for them, and it
// says what we do rather than what we lack.
const AUTHORITY_NAME = { ECAA: 'Egypt (ECAA)', GCAA: 'the UAE (GCAA)' };
const unmappedNote = (key) => (key
  ? `Night currency rules for ${AUTHORITY_NAME[key] || key.replace('_', ' ')} aren't set up yet, so we show your total landings only.`
  : 'Your licence authority is not set, so we show your total landings only.');

// Free-text authority → table key. Everything else is unmapped.
function normalizeAuthority(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s || s === 'unknown' || s === 'icao' || s === 'other') return null;
  if (/\b(easa|eu|european)\b/.test(s)) return 'EASA';
  if (/\b(uk|british)\b/.test(s) || /uk\s*caa|caa\s*uk/.test(s)) return 'UK_CAA';
  if (/\b(faa|usa|us)\b/.test(s) || /united states/.test(s)) return 'FAA';
  if (/\becaa\b|egypt|ecar/.test(s)) return 'ECAA';
  if (/\bgcaa\b|uae|emirates/.test(s)) return 'GCAA';
  return null;
}

// The pilot's governing authority = the authority on their highest licence
// (a higher licence supersedes the lower ones, as on the readiness page).
const LICENCE_RANK = ['ATPL', 'ATP', 'MPL', 'CPL', 'PPL'];
function authorityFromCertificates(certs = []) {
  const licences = (certs || []).filter((c) => LICENCE_RANK.includes(String(c.type)));
  if (!licences.length) return { key: null, raw: null };
  const best = [...licences].sort((a, b) => LICENCE_RANK.indexOf(String(a.type)) - LICENCE_RANK.indexOf(String(b.type)))[0];
  return { key: normalizeAuthority(best.issuingAuthority), raw: best.issuingAuthority || null };
}

// An ATPL or MPL carries instrument privileges; otherwise look for a current IR.
function holdsInstrumentRating(certs = [], now = new Date()) {
  for (const c of certs || []) {
    const t = String(c.type);
    if (t === 'ATPL' || t === 'ATP' || t === 'MPL') return true;
    if (t === 'IR' && (!c.expiryDate || new Date(c.expiryDate) >= now)) return true;
  }
  return false;
}

// The resolved rule for one pilot. `nightApplies` is the only thing the UI may
// use to say a night landing is NEEDED.
function recencyRuleFor(certs = [], now = new Date()) {
  const { key, raw } = authorityFromCertificates(certs, now);
  const hasIr = holdsInstrumentRating(certs, now);
  const rule = key ? RULES[key] : null;
  if (!rule) {
    return {
      authority: key, authorityLabel: key ? (NOT_MAPPED[key] ? key.replace('_', ' ') : key) : null,
      authorityRaw: raw, mapped: false, base: 3, nightApplies: false, nightRequired: null, hasIr,
      nightNote: unmappedNote(key),
      ref: null, note: NOT_MAPPED[key] || null,
    };
  }
  const exempt = rule.irExempt && hasIr;
  return {
    authority: key, authorityLabel: rule.label, authorityRaw: raw, mapped: true,
    base: rule.base, hasIr,
    nightApplies: rule.nightApplies && !exempt,
    nightRequired: rule.nightApplies && !exempt ? rule.nightRequired : null,
    nightNote: exempt
      ? `You hold instrument privileges, so ${rule.label} does not require a night landing (${rule.ref}). The night count is information only.`
      : (rule.nightApplies
        ? [
          `${rule.label} requires ${rule.nightRequired === 1 ? 'one of the three' : `${rule.nightRequired} of them`} to be at night to carry passengers at night (${rule.ref}).`,
          rule.nightCaveat,
        ].filter(Boolean).join(' ')
        : null),
    ref: rule.ref,
    note: rule.note || null,
  };
}

module.exports = { RULES, NOT_MAPPED, normalizeAuthority, authorityFromCertificates, holdsInstrumentRating, recencyRuleFor };
