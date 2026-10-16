'use strict';

// The CV document: built from Profile + Logbook, nothing retyped, nothing
// invented. No DB — the builder takes exactly what GET /cv returns.

const test = require('node:test');
const assert = require('node:assert');
const {
  buildCvDocument, normaliseSections, validateCv, generateSummary,
  visibleLicences, titleCase, maskPhone, maskEmail, DEFAULT_SECTIONS, SECTION_KEYS,
} = require('../cvDocument');

const future = (days) => new Date(Date.now() + days * 86400000).toISOString();
const RAW = (over = {}) => ({
  // derivedTotals is the canonical per-type/flight-count source (the Profile
  // reads the same field) — real logbooks often carry a blank aircraftType and
  // infer the type from the registration, as this pilot's does.
  pilot: { firstName: 'mohamed', lastName: 'alaaeldin', city: 'cairo', country: 'egypt', role: 'FIRST_OFFICER', phone: '+201117898332', email: 'a.pilot@gmail.com',
    derivedTotals: { flightCount: 501, byType: [{ type: 'A320', hours: 1515, note: 'type inferred from registration' }], ...(over.derivedTotals || {}) }, ...(over.pilot || {}) },
  certificates: over.certificates || [
    { type: 'ATPL', issuingAuthority: 'ECAA', expiryDate: future(400) },
    { type: 'CPL', issuingAuthority: 'ECAA', expiryDate: future(300) },
    { type: 'ELP', englishLevel: 'Level 5', expiryDate: future(400) },
  ],
  ratings: over.ratings || [{ aircraftType: 'a320', category: 'Type' }],
  medicals: over.medicals || [{ medicalClass: 'CLASS_1', expiryDate: future(200) }],
  training: over.training || [{ type: 'CRM', completedAt: future(-100) }],
  rtw: over.rtw || [{ country: 'united arab emirates', documentType: 'Residence Permit' }],
  totals: { totalTime: 1515, landingsDay: 300, landingsNight: 201, ...(over.totals || {}) },
  recency: { sectors90: 20 },

  cv: { summary: null, education: [], languages: [], ...(over.cv || {}) },
});

test('a CPL under an ATPL is hidden — only the highest licence is shown', () => {
  const doc = buildCvDocument(RAW());
  const keys = doc.sections.licences.items.map((i) => i.k).join(' ');
  assert.match(keys, /ATPL/);
  assert.doesNotMatch(keys, /CPL/, 'a superseded CPL must not appear on the CV');
  assert.strictEqual(visibleLicences(RAW().certificates).length, 1);
});

test('names and cities are capitalised even when stored lowercase', () => {
  const doc = buildCvDocument(RAW());
  assert.strictEqual(doc.header.name, 'Mohamed Alaaeldin');
  assert.strictEqual(doc.header.base, 'Cairo, Egypt');
  assert.strictEqual(titleCase('a320 captain'), 'A320 Captain');
});

test('contact details are masked everywhere except the PDF', () => {
  const preview = buildCvDocument(RAW(), { audience: 'preview' });
  const share = buildCvDocument(RAW(), { audience: 'share' });
  const pdf = buildCvDocument(RAW(), { audience: 'pdf' });
  for (const d of [preview, share]) {
    assert.ok(d.header.contactMasked);
    assert.match(d.header.phone, /•/);
    assert.match(d.header.email, /•/);
    assert.doesNotMatch(d.header.phone, /1117898332/);
  }
  assert.strictEqual(pdf.header.phone, '+201117898332');
  assert.strictEqual(pdf.header.email, 'a.pilot@gmail.com');
  assert.strictEqual(maskPhone('+201117898332'), '+20 ••• ••• 8332');
  assert.strictEqual(maskEmail('a.pilot@gmail.com'), 'a•••@gmail.com');
});

test('everything on the CV comes from the profile/logbook — hours, type, sectors', () => {
  const doc = buildCvDocument(RAW());
  const stats = doc.sections.experience.stats;
  assert.strictEqual(stats[0].value, '1,515');
  assert.strictEqual(stats[1].label, 'A320 (h)');
  assert.strictEqual(stats[2].value, '501', 'sectors = landings when logged');
  assert.strictEqual(doc.header.headline, 'First Officer · A320 · ATPL');
});

// ── Before you send ────────────────────────────────────────────────────────
test('expired licence is RED and links to the field that fixes it', () => {
  const issues = validateCv(RAW({ certificates: [
    { type: 'ATPL', issuingAuthority: 'ECAA', expiryDate: future(-5) },
    { type: 'ELP', englishLevel: 'Level 5', expiryDate: future(400) },
  ] }));
  const lic = issues.find((i) => /ATPL shows as expired/.test(i.text));
  assert.ok(lic); assert.strictEqual(lic.level, 'red'); assert.strictEqual(lic.fixTo, '/profile#licences');
});

test('an expired English (ICAO) is flagged, like a licence', () => {
  const issues = validateCv(RAW({ certificates: [
    { type: 'ATPL', issuingAuthority: 'ECAA', expiryDate: future(400) },
    { type: 'ELP', englishLevel: 'Level 5', expiryDate: future(-3) },
  ] }));
  const elp = issues.find((i) => /ICAO English shows as expired/.test(i.text));
  assert.ok(elp, 'an expired ELP must be flagged'); assert.strictEqual(elp.level, 'red');
  assert.strictEqual(elp.fixTo, '/profile#english');
});

test('missing licence authority is AMBER', () => {
  const issues = validateCv(RAW({ certificates: [
    { type: 'ATPL', issuingAuthority: 'unknown', expiryDate: future(400) },
    { type: 'ELP', englishLevel: 'Level 5', expiryDate: future(400) },
  ] }));
  const a = issues.find((i) => /authority is missing/.test(i.text));
  assert.ok(a); assert.strictEqual(a.level, 'amber');
});

test('empty key sections are flagged', () => {
  const issues = validateCv(RAW({ totals: { totalTime: 0 }, ratings: [], rtw: [] }));
  assert.ok(issues.find((i) => /No flight hours/.test(i.text)));
  assert.ok(issues.find((i) => /No type or class ratings/.test(i.text)));
  assert.ok(issues.find((i) => /No right to work/.test(i.text)));
});

test('a summary that contradicts the profile is caught — wrong licence and wrong hours', () => {
  const issues = validateCv(RAW({ cv: { summary: 'CPL holder with around 200 hours total time.' } }));
  assert.ok(issues.find((i) => /says CPL but your profile holds ATPL/.test(i.text)), 'wrong licence');
  assert.ok(issues.find((i) => /says 200 hours but your logbook shows 1,515/.test(i.text)), 'wrong hours');
  // within 20% is fine
  const ok = validateCv(RAW({ cv: { summary: 'ATPL holder with 1,400 hours total time.' } }));
  assert.ok(!ok.find((i) => /hours but your logbook/.test(i.text)), '1,400 vs 1,515 is inside 20%');
});

// ── Rewrite from my profile ────────────────────────────────────────────────
test('the generated summary states only facts that are on file', () => {
  const s = generateSummary(RAW());
  assert.match(s, /First Officer/);
  assert.match(s, /1,515 hours total time/);
  assert.match(s, /on the A320/);
  assert.match(s, /based in Cairo/);
  assert.match(s, /ATPL holder/);
  assert.match(s, /Class 1 medical/);
  assert.match(s, /ICAO English Level 5/);
  assert.match(s, /Right to work in United Arab Emirates/);
  assert.ok(s.length <= 600);
  // and it must NOT invent anything the profile does not hold
  assert.doesNotMatch(s, /Boeing|B737|Captain|instructor/i);
});

test('the generated summary drops sentences whose facts are missing', () => {
  const s = generateSummary(RAW({ medicals: [], rtw: [], training: [], certificates: [{ type: 'ELP', englishLevel: 'Level 4' }], derivedTotals: { flightCount: 0, byType: [] }, totals: { totalTime: 0 } }));
  assert.doesNotMatch(s, /medical/i);
  assert.doesNotMatch(s, /Right to work/i);
  assert.doesNotMatch(s, /hours/i);
  assert.match(s, /ICAO English Level 4/);
});

// ── Sections ───────────────────────────────────────────────────────────────
test('section order survives a stale stored list — nothing lost or duplicated', () => {
  const out = normaliseSections([{ key: 'training', visible: false }, { key: 'gone', visible: true }, { key: 'training', visible: true }]);
  assert.strictEqual(out.length, SECTION_KEYS.length);
  assert.strictEqual(out[0].key, 'training');
  assert.strictEqual(out[0].visible, false, 'first write wins; the duplicate is dropped');
  assert.strictEqual(new Set(out.map((o) => o.key)).size, SECTION_KEYS.length);
});

test('with no stored order, employment and photo start hidden', () => {
  const out = normaliseSections(null);
  assert.deepStrictEqual(out, DEFAULT_SECTIONS);
  assert.strictEqual(out.find((o) => o.key === 'employment').visible, false);
  assert.strictEqual(out.find((o) => o.key === 'photo').visible, false);
});

test('sectors fall back to the flight count when no landings are logged', () => {
  // real case: 501 flights, zero landings recorded — printing "0 sectors" would
  // read as "has never flown"
  const doc = buildCvDocument(RAW({ totals: { totalTime: 1515, landingsDay: 0, landingsNight: 0 } }));
  assert.strictEqual(doc.sections.experience.stats[2].value, '501');
});

test('a type inferred from the registration says so, rather than implying it was logged', () => {
  const doc = buildCvDocument(RAW());
  assert.match(doc.sections.experience.note, /inferred from aircraft registration/);
});

test('a rating is labelled "{Type} rating" — never asserted as type vs class', () => {
  // this pilot's C172 is stored as Multi-Engine; calling it a class rating on
  // the strength of that field would put a wrong qualification on the CV
  const doc = buildCvDocument(RAW({ ratings: [{ aircraftType: 'CESSNA-172', category: 'Multi-Engine' }] }));
  assert.strictEqual(doc.sections.licences.items.find((i) => /Cessna/i.test(i.k)).k, 'Cessna-172 rating');
  // a short all-caps run is an acronym and must survive; a long one is shouting
  assert.strictEqual(titleCase('IGCSE'), 'IGCSE');
  assert.strictEqual(titleCase('CESSNA-172'), 'Cessna-172');
  assert.strictEqual(titleCase('EGYPTIAN AVIATION ACADEMY'), 'Egyptian Aviation Academy');
});
