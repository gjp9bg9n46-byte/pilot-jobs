'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { contextFromPilot, matchJob, jobAircraftCategory, jobInstructorKind } = require('../jobMatch');

const FUTURE = '2999-01-01T00:00:00Z';
const PAST = '2000-01-01T00:00:00Z';

// Build a pilot match-context from a synthetic profile (no DB). Defaults describe a
// current, aeroplane ATPL holder with a valid Class 1 and ELP 5, and a logged role
// split (picTime > 0 → PIC known).
const PILOT = (o = {}) => contextFromPilot({
  certificates: o.certs || [
    { type: 'ATPL', issuingAuthority: 'EASA', category: 'aeroplane' },
    { type: 'ELP', issuingAuthority: 'EASA', englishLevel: '5' },
  ],
  ratings: o.ratings || [{ aircraftType: 'A320', category: 'aeroplane' }],
  medicals: o.medicals || [{ medicalClass: 'CLASS_1', expiryDate: FUTURE }],
  rightToWork: o.rtw || [],
  instructorRatings: o.instructor || [],
  education: o.education ?? 'bachelor',
  role: o.role ?? null,
  willingToRelocate: false,
  country: o.country ?? null,
  nationality: o.nationality ?? null,
}, o.totals || { totalTime: 2000, picTime: 800, sicTime: 0 });

const byKey = (m, k) => m.requirements.find((r) => r.key === k);

// ── Job classifiers ──────────────────────────────────────────────────────────
test('jobAircraftCategory detects helicopter and aeroplane, else null', () => {
  assert.strictEqual(jobAircraftCategory({ title: 'Rotor Wing First Officer', aircraftTypes: [] }), 'helicopter');
  assert.strictEqual(jobAircraftCategory({ title: 'HEMS Pilot', aircraftTypes: ['AW139'] }), 'helicopter');
  assert.strictEqual(jobAircraftCategory({ title: 'First Officer', aircraftTypes: ['A320'] }), 'aeroplane');
  assert.strictEqual(jobAircraftCategory({ title: 'Operations role', aircraftTypes: [] }), null);
});
test('jobInstructorKind uses title/role first; body "examiner" does not relabel an instructor job', () => {
  assert.strictEqual(jobInstructorKind({ title: 'Synthetic Flight Examiner – Boeing' }), 'examiner');
  assert.strictEqual(jobInstructorKind({ title: 'Synthetic Flight Instructor (Ground) Boeing', requirementsText: 'examiner progression available' }), 'instructor');
  assert.strictEqual(jobInstructorKind({ title: 'First Officer A320' }), null);
});

// ── #1 Aircraft category is a GATE, never counted in the % ───────────────────
test('#1 category matches → not a requirement row, % unaffected', () => {
  const job = { title: 'First Officer', reqCertificates: ['ATPL'], reqTypeRatings: ['A320'], aircraftTypes: ['A320'], reqMinTotalHours: 1500, reqMedicalClass: 'CLASS_1', reqEnglishLevel: 4 };
  const m = matchJob(job, PILOT());
  assert.ok(!m.requirements.some((r) => r.key === 'category')); // no category row
  assert.strictEqual(m.category.gate, 'match');
  assert.strictEqual(m.stated, 5); // licence, type, total, medical, english — NOT category
  assert.strictEqual(m.status, 'QUALIFY');
  assert.strictEqual(m.pct, 100);
});

// ── #2 Category mismatch → WRONG_CATEGORY, no % ──────────────────────────────
test('#2 helicopter job for an aeroplane-only pilot → WRONG_CATEGORY, no %', () => {
  const heli = { title: 'Rotor Wing First Officer', reqCertificates: ['ATPL'], aircraftTypes: ['AW139'], reqMinTotalHours: 1000 };
  const m = matchJob(heli, PILOT());
  assert.strictEqual(m.status, 'WRONG_CATEGORY');
  assert.strictEqual(m.pct, null);
  assert.strictEqual(m.category.label, 'Helicopter job');
});
test('#2 aeroplane job for a helicopter-only pilot → WRONG_CATEGORY (reverse)', () => {
  const aero = { title: 'First Officer', reqCertificates: ['CPL'], aircraftTypes: ['A320'], reqMinTotalHours: 500 };
  const heliPilot = PILOT({ certs: [{ type: 'CPL', issuingAuthority: 'EASA', category: 'helicopter' }, { type: 'ELP', englishLevel: '5' }], ratings: [{ aircraftType: 'AW139', category: 'helicopter' }] });
  const m = matchJob(aero, heliPilot);
  assert.strictEqual(m.status, 'WRONG_CATEGORY');
  assert.strictEqual(m.category.label, 'Aeroplane job');
  assert.strictEqual(m.pct, null);
});
test('#2 unknown category → % unchanged + "Add aircraft category" advisory', () => {
  const heli = { title: 'HEMS Pilot', reqCertificates: ['ATPL'], reqMinTotalHours: 1000 };
  const noCat = PILOT({ certs: [{ type: 'ATPL', issuingAuthority: 'EASA' }, { type: 'ELP', englishLevel: '5' }], ratings: [] });
  const m = matchJob(heli, noCat);
  assert.strictEqual(m.category.gate, 'unknown');
  assert.strictEqual(m.category.advisory, 'Add aircraft category');
  assert.notStrictEqual(m.status, 'WRONG_CATEGORY');
  assert.strictEqual(m.pct, 100); // ATPL + total both met; category not counted
});

// ── #3 Status vocabulary ─────────────────────────────────────────────────────
test('#3 QUALIFY when every stated requirement is met', () => {
  assert.strictEqual(matchJob({ reqCertificates: ['ATPL'], reqMinTotalHours: 1500 }, PILOT()).status, 'QUALIFY');
});
test('#3 CHECK — nothing failed but PIC unknown (Westair captain, valid licence)', () => {
  const capt = { title: 'Captain F406', role: 'CAPTAIN', reqCertificates: ['CPL'], reqMinTotalHours: 1000, reqMinPicHours: 1000 };
  const pilot = PILOT({ certs: [{ type: 'CPL', issuingAuthority: 'EASA', category: 'aeroplane' }, { type: 'ELP', englishLevel: '5' }], totals: { totalTime: 1500, picTime: 0, sicTime: 0 } });
  const m = matchJob(capt, pilot);
  assert.strictEqual(m.status, 'CHECK');
  assert.match(m.shortfall, /Can't tell yet: add PIC hours/);
});
test('#3 SHORT — exactly one not met', () => {
  const m = matchJob({ reqCertificates: ['ATPL'], reqMinTotalHours: 5000 }, PILOT());
  assert.strictEqual(m.status, 'SHORT');
});
test('#3 NOT_MET — two or more not met', () => {
  const m = matchJob({ reqCertificates: ['ATPL'], reqMinTotalHours: 5000, reqTypeRatings: ['B777'], aircraftTypes: ['B777'] }, PILOT());
  assert.strictEqual(m.status, 'NOT_MET');
});
test('#3 NO_REQUIREMENTS + no % when the job states nothing', () => {
  const m = matchJob({ title: 'Pilot' }, PILOT());
  assert.strictEqual(m.status, 'NO_REQUIREMENTS');
  assert.strictEqual(m.pct, null);
});

// ── #4 PIC known only when the logbook records the role ──────────────────────
test('#4 PIC unknown when the logbook has no role split (pic+sic = 0)', () => {
  const m = matchJob({ reqMinPicHours: 1000 }, PILOT({ totals: { totalTime: 3000, picTime: 0, sicTime: 0 } }));
  assert.strictEqual(byKey(m, 'picHours').state, 'add');
});
test('#4 PIC is a known 0 (→ not met) when the logbook records role (SIC on file)', () => {
  const m = matchJob({ reqMinPicHours: 1000 }, PILOT({ totals: { totalTime: 3000, picTime: 0, sicTime: 3000 } }));
  assert.strictEqual(byKey(m, 'picHours').state, 'not_met');
});
test('#4 PIC met when logged and sufficient', () => {
  const m = matchJob({ reqMinPicHours: 1000 }, PILOT({ totals: { totalTime: 3000, picTime: 1500, sicTime: 0 } }));
  assert.strictEqual(byKey(m, 'picHours').state, 'met');
});

// ── #5 Expiry — expired item is "not met" with a dated reason ─────────────────
test('#5 expired licence → not met with "expired DD MMM YYYY"', () => {
  const pilot = PILOT({ certs: [{ type: 'ATPL', issuingAuthority: 'EASA', category: 'aeroplane', expiryDate: '2020-09-30T00:00:00Z' }, { type: 'ELP', englishLevel: '5' }] });
  const lic = byKey(matchJob({ reqCertificates: ['ATPL'] }, pilot), 'licence');
  assert.strictEqual(lic.state, 'not_met');
  assert.strictEqual(lic.gap, 'expired 30 Sep 2020');
});
test('#5 a lapsed LOWER licence is irrelevant when the highest held is current', () => {
  // Hierarchy (#2): the ATPL is evaluated; its currency is what matters, not the CPL's.
  const job = { reqCertificates: ['ATPL', 'CPL'] };
  const pilot = PILOT({ certs: [
    { type: 'ATPL', issuingAuthority: 'EASA', category: 'aeroplane' }, // current (no expiry)
    { type: 'CPL', issuingAuthority: 'EASA', category: 'aeroplane', expiryDate: PAST }, // lapsed, lower
    { type: 'ELP', englishLevel: '5' },
  ] });
  const lic = byKey(matchJob(job, pilot), 'licence');
  assert.strictEqual(lic.state, 'met');
  assert.strictEqual(lic.pilotText, 'ATPL');
});
test('#5 expired ELP → English not met (expired) even though the level is high enough', () => {
  const pilot = PILOT({ certs: [{ type: 'ATPL', issuingAuthority: 'EASA', category: 'aeroplane' }, { type: 'ELP', englishLevel: '5', expiryDate: '2020-09-30T00:00:00Z' }] });
  const e = byKey(matchJob({ reqEnglishLevel: 4 }, pilot), 'english');
  assert.strictEqual(e.state, 'not_met');
  assert.strictEqual(e.gap, 'expired 30 Sep 2020');
});
test('#5 expired medical → not met (expired); a current one passes', () => {
  const job = { reqMedicalClass: 'CLASS_1' };
  const expired = byKey(matchJob(job, PILOT({ medicals: [{ medicalClass: 'CLASS_1', expiryDate: '2020-01-01T00:00:00Z' }] })), 'medical');
  assert.strictEqual(expired.state, 'not_met');
  assert.match(expired.gap, /expired 01 Jan 2020/);
  assert.strictEqual(byKey(matchJob(job, PILOT({ medicals: [{ medicalClass: 'CLASS_1', expiryDate: FUTURE }] })), 'medical').state, 'met');
});
test('#5 no medical on file → unknown (Add), not "expired"', () => {
  assert.strictEqual(byKey(matchJob({ reqMedicalClass: 'CLASS_1' }, PILOT({ medicals: [] })), 'medical').state, 'add');
});

// ── Instructor / examiner (unchanged intent, new status names) ───────────────
test('examiner job → not QUALIFY without the privilege; QUALIFY with a TRE', () => {
  const exam = { title: 'Synthetic Flight Examiner (Ground) Boeing', reqCertificates: ['ATPL'], reqMinTotalHours: 1500 };
  const without = matchJob(exam, PILOT());
  assert.strictEqual(byKey(without, 'examiner').state, 'add');
  assert.notStrictEqual(without.status, 'QUALIFY');
  const withTre = matchJob(exam, PILOT({ instructor: [{ kind: 'TRE' }] }));
  assert.strictEqual(byKey(withTre, 'examiner').state, 'met');
  assert.strictEqual(withTre.status, 'QUALIFY');
});
test('a TRI alone does not satisfy an examiner requirement', () => {
  const exam = { title: 'Flight Examiner', reqCertificates: ['ATPL'], reqMinTotalHours: 1000 };
  assert.strictEqual(byKey(matchJob(exam, PILOT({ instructor: [{ kind: 'TRI' }] })), 'examiner').state, 'not_met');
});

// ── #2 Licence hierarchy — a higher licence supersedes a lower one ───────────
test('#2 a current ATPL satisfies a CPL requirement', () => {
  const job = { reqCertificates: ['CPL'] };
  const pilot = PILOT({ certs: [{ type: 'ATPL', issuingAuthority: 'EASA', category: 'aeroplane' }, { type: 'ELP', englishLevel: '5' }] });
  const lic = byKey(matchJob(job, pilot), 'licence');
  assert.strictEqual(lic.state, 'met');
  assert.strictEqual(lic.pilotText, 'ATPL');
});
test('#2 a current CPL satisfies a PPL requirement', () => {
  const job = { reqCertificates: ['PPL'] };
  const pilot = PILOT({ certs: [{ type: 'CPL', issuingAuthority: 'EASA', category: 'aeroplane' }, { type: 'ELP', englishLevel: '5' }] });
  assert.strictEqual(byKey(matchJob(job, pilot), 'licence').state, 'met');
});
test('#2 a CPL does NOT satisfy an ATPL requirement', () => {
  const job = { reqCertificates: ['ATPL'] };
  const pilot = PILOT({ certs: [{ type: 'CPL', issuingAuthority: 'EASA', category: 'aeroplane' }, { type: 'ELP', englishLevel: '5' }] });
  assert.strictEqual(byKey(matchJob(job, pilot), 'licence').state, 'not_met');
});
test('#2 Westair: evaluate the ATPL (expired 30 Sep 2026), not the lower 2025 CPL', () => {
  const job = { title: 'Captain F406', reqCertificates: ['CPL'] };
  const pilot = PILOT({ certs: [
    { type: 'ATPL', issuingAuthority: 'EASA', category: 'aeroplane', expiryDate: '2026-09-30T00:00:00Z' },
    { type: 'CPL', issuingAuthority: 'EASA', category: 'aeroplane', expiryDate: '2025-11-06T00:00:00Z' },
    { type: 'ELP', englishLevel: '5' },
  ] });
  const lic = byKey(matchJob(job, pilot), 'licence');
  assert.strictEqual(lic.state, 'not_met');
  assert.strictEqual(lic.pilotText, 'ATPL');
  assert.strictEqual(lic.gap, 'expired 30 Sep 2026'); // the ATPL's expiry, not the CPL's 2025
});
test('#2 category restricts the hierarchy — a helicopter ATPL does not satisfy an aeroplane CPL', () => {
  const job = { title: 'First Officer', reqCertificates: ['CPL'], aircraftTypes: ['A320'] }; // aeroplane job
  const pilot = PILOT({ certs: [
    { type: 'ATPL', issuingAuthority: 'EASA', category: 'helicopter' },
    { type: 'CPL', issuingAuthority: 'EASA', category: 'aeroplane' },
    { type: 'ELP', englishLevel: '5' },
  ], ratings: [{ aircraftType: 'A320', category: 'aeroplane' }, { aircraftType: 'AW139', category: 'helicopter' }] });
  const lic = byKey(matchJob(job, pilot), 'licence');
  assert.strictEqual(lic.state, 'met'); // satisfied by the aeroplane CPL, not the heli ATPL
  assert.strictEqual(lic.pilotText, 'CPL');
});

// ── % rules ──────────────────────────────────────────────────────────────────
test('% counts only scored requirements; unknown lowers it but shows as Add', () => {
  // stated: licence, type, total, medical, PIC(unknown). 4 met + 1 add = 80%.
  const job = { title: 'First Officer', reqCertificates: ['ATPL'], reqTypeRatings: ['A320'], aircraftTypes: ['A320'], reqMinTotalHours: 1500, reqMedicalClass: 'CLASS_1', reqMinPicHours: 3000 };
  const m = matchJob(job, PILOT({ totals: { totalTime: 2000, picTime: 0, sicTime: 0 } }));
  assert.ok(!m.requirements.some((r) => r.key === 'category'));
  assert.strictEqual(m.stated, 5);
  assert.strictEqual(m.met, 4);
  assert.strictEqual(m.pct, 80);
  assert.strictEqual(m.status, 'CHECK');
  assert.strictEqual(byKey(m, 'picHours').state, 'add');
});
test('100% only when every stated requirement is met', () => {
  const job = { reqCertificates: ['ATPL'], reqMinTotalHours: 1500 };
  assert.strictEqual(matchJob(job, PILOT({ totals: { totalTime: 2000, picTime: 800 } })).pct, 100);
  const half = matchJob(job, PILOT({ totals: { totalTime: 1000, picTime: 800 } }));
  assert.strictEqual(half.pct, 50);
  assert.strictEqual(byKey(half, 'totalHours').state, 'not_met');
});
test('Gulf Air FO A320 — qualifying pilot → QUALIFY 100%', () => {
  const fo = { title: 'First Officer – A320', reqCertificates: ['ATPL'], reqTypeRatings: ['A320'], aircraftTypes: ['A320'], reqMinTotalHours: 1500, reqMedicalClass: 'CLASS_1', reqEnglishLevel: 4 };
  const m = matchJob(fo, PILOT({ totals: { totalTime: 2000, picTime: 500 } }));
  assert.strictEqual(m.status, 'QUALIFY');
  assert.strictEqual(m.pct, 100);
});

// ── Implicit baseline: a valid licence + valid medical are required for EVERY ──
//   pilot job whether or not the ad states them. We add a row ONLY when the pilot's
//   own item is EXPIRED, so a job can never read QUALIFY alongside an expired
//   licence/medical blocker. Valid-but-unstated adds nothing (% stays met ÷ stated).
test('baseline: expired licence adds a not-met row even when the ad states no licence', () => {
  // Ad states only hours — nothing about a licence. Pilot's only licence (ATPL) is expired.
  const job = { title: 'First Officer', reqMinTotalHours: 1000 };
  const expiredPilot = PILOT({ certs: [
    { type: 'ATPL', issuingAuthority: 'EASA', category: 'aeroplane', expiryDate: '2026-09-30T00:00:00Z' },
    { type: 'ELP', issuingAuthority: 'EASA', englishLevel: '5' },
  ] });
  const m = matchJob(job, expiredPilot);
  const lic = byKey(m, 'licence');
  assert.ok(lic, 'baseline licence row added');
  assert.strictEqual(lic.status, 'unmet');
  assert.strictEqual(lic.state, 'not_met');
  assert.strictEqual(lic.gap, 'expired 30 Sep 2026');
  assert.strictEqual(m.status, 'SHORT');                     // was QUALIFY before the baseline
  assert.strictEqual(m.shortfall, 'Licence expired 30 Sep 2026');
  assert.strictEqual(m.stated, 2);                           // total hours + the baseline licence
});
test('baseline: expired medical adds a not-met row even when the ad states no medical', () => {
  const job = { title: 'First Officer', reqMinTotalHours: 1000 };
  const expiredMed = PILOT({ medicals: [{ medicalClass: 'CLASS_1', expiryDate: '2026-08-15T00:00:00Z' }] });
  const m = matchJob(job, expiredMed);
  const med = byKey(m, 'medical');
  assert.ok(med, 'baseline medical row added');
  assert.strictEqual(med.status, 'unmet');
  assert.strictEqual(med.gap, 'expired 15 Aug 2026');
  assert.strictEqual(m.status, 'SHORT');
  assert.strictEqual(m.shortfall, 'Medical expired 15 Aug 2026');
});
test('baseline: a VALID licence + medical that the ad does not state add nothing', () => {
  const job = { title: 'First Officer', reqMinTotalHours: 1000 };
  const m = matchJob(job, PILOT());                          // default pilot: valid ATPL + Class 1
  assert.ok(!byKey(m, 'licence'), 'no baseline licence row when valid + unstated');
  assert.ok(!byKey(m, 'medical'), 'no baseline medical row when valid + unstated');
  assert.strictEqual(m.stated, 1);                           // only the stated total-hours row
  assert.strictEqual(m.status, 'QUALIFY');
  assert.strictEqual(m.pct, 100);
});
test('baseline: a MISSING licence/medical (never recorded) adds nothing — only EXPIRED does', () => {
  const job = { title: 'First Officer', reqMinTotalHours: 1000 };
  const bare = PILOT({ certs: [], medicals: [], ratings: [{ aircraftType: 'A320', category: 'aeroplane' }] });
  const m = matchJob(job, bare);
  assert.ok(!byKey(m, 'licence'), 'no baseline licence row when none on file (missing ≠ expired)');
  assert.ok(!byKey(m, 'medical'), 'no baseline medical row when none on file');
  assert.strictEqual(m.stated, 1);
});
test('baseline: a stated expired medical is not double-counted by the baseline', () => {
  const job = { title: 'First Officer', reqMedicalClass: 'CLASS_1', reqMinTotalHours: 1000 };
  const expiredMed = PILOT({ medicals: [{ medicalClass: 'CLASS_1', expiryDate: '2026-08-15T00:00:00Z' }] });
  const m = matchJob(job, expiredMed);
  assert.strictEqual(m.requirements.filter((r) => r.key === 'medical').length, 1); // exactly one row
  assert.strictEqual(byKey(m, 'medical').gap, 'expired 15 Aug 2026');
});

// ── C#1 Recruitment events are not vacancies → EVENT, excluded from matching ──
test('C#1 recruitment event → EVENT status, no %, no requirement rows', () => {
  const m = matchJob({ title: 'Pilot Recruitment Event in Rome', reqMedicalClass: 'CLASS_1', reqMinTotalHours: 1500 }, PILOT());
  assert.strictEqual(m.status, 'EVENT');
  assert.strictEqual(m.pct, null);
  assert.strictEqual(m.requirements.length, 0);
  assert.strictEqual(m.shortfall, 'Recruitment event');
});
test('C#1 "assessment" only in the body does NOT make a real FO vacancy an event', () => {
  const m = matchJob({ title: 'First Officer A320', requirementsText: 'An assessment day will follow shortlisting.', reqMinTotalHours: 1500 }, PILOT());
  assert.notStrictEqual(m.status, 'EVENT');
});

// ── C#2 Nationality / security-clearance eligibility ─────────────────────────
test('C#2 security clearance in the description → unknown (Add) row, never QUALIFY', () => {
  const job = { title: 'C-130J Simulator Pilot Instructor', description: 'Applicants must hold or be able to obtain a security clearance.', reqMinMultiEngineHours: 1000 };
  const m = matchJob(job, PILOT());
  const cl = byKey(m, 'clearance');
  assert.ok(cl, 'clearance row added');
  assert.strictEqual(cl.status, 'unknown');
  assert.strictEqual(cl.state, 'add');
  assert.notStrictEqual(m.status, 'QUALIFY');
});
test('C#2 nationality: met when the pilot matches, unmet on mismatch, Add when unknown', () => {
  const job = { title: 'First Officer A320 (UAE National)', aircraftTypes: ['A320'], reqMinTotalHours: 1000 };
  assert.strictEqual(byKey(matchJob(job, PILOT({ nationality: 'United Arab Emirates' })), 'nationality').status, 'met');
  assert.strictEqual(byKey(matchJob(job, PILOT({ nationality: 'Egypt' })), 'nationality').status, 'unmet');
  assert.strictEqual(byKey(matchJob(job, PILOT()), 'nationality').status, 'unknown'); // no nationality on file
});
test('C#2 Kenn Borek (no nationality/clearance wording) gets no eligibility rows', () => {
  const job = { title: 'Aviation First Officer', company: 'Kenn Borek Air Ltd.', country: 'Canada', reqMinTotalHours: 750 };
  const m = matchJob(job, PILOT());
  assert.ok(!byKey(m, 'nationality'));
  assert.ok(!byKey(m, 'clearance'));
});

// ── C#1/#2 fixes: campaign ≠ event; work-auth-OR-citizen ≠ nationality bar; ──────
//    "subject to"/medical clearance ≠ defence clearance ────────────────────────
test('C#1 fix — hiring campaigns are NOT events', () => {
  assert.notStrictEqual(matchJob({ title: 'Direct Entry First Officer Recruitment 2026', reqMinTotalHours: 1500 }, PILOT()).status, 'EVENT');
  assert.notStrictEqual(matchJob({ title: 'Cadet Pilot Recruitment', reqMinTotalHours: 1500 }, PILOT()).status, 'EVENT');
  assert.strictEqual(matchJob({ title: 'Pilot Recruitment Day — London', reqMinTotalHours: 1500 }, PILOT()).status, 'EVENT');
  assert.strictEqual(matchJob({ title: 'Careers Fair at Farnborough', reqMinTotalHours: 1500 }, PILOT()).status, 'EVENT');
});
test('C#2 fix — "citizen OR right to work" is work-auth, not a nationality bar', () => {
  const job = { title: 'First Officer', description: 'Must be a Canadian Citizen or have the legal right to work in Canada.', reqMinTotalHours: 1000 };
  assert.ok(!byKey(matchJob(job, PILOT()), 'nationality'));
});
test('C#2 fix — "National Guard" org name is not a nationality requirement', () => {
  const job = { title: 'AIRPLANE PILOT (Title 32)', description: 'Michigan Air National Guard membership is required.', reqMinTotalHours: 1000 };
  assert.ok(!byKey(matchJob(job, PILOT()), 'nationality'));
});
test('C#2 fix — clearance: subject-to / medical / airport do NOT count; held/obtainable does', () => {
  assert.ok(!byKey(matchJob({ title: 'FO', description: 'Employment is subject to security clearance.', reqMinTotalHours: 1000 }, PILOT()), 'clearance'));
  assert.ok(!byKey(matchJob({ title: 'FO', description: 'Able to obtain airport security clearance.', reqMinTotalHours: 1000 }, PILOT()), 'clearance'));
  assert.ok(!byKey(matchJob({ title: 'FO', description: 'Able to obtain and maintain a FAA Class II Medical Clearance.', reqMinTotalHours: 1000 }, PILOT()), 'clearance'));
  assert.ok(byKey(matchJob({ title: 'FO', description: 'Must be eligible to hold an Australian Defence Security Clearance.', reqMinTotalHours: 1000 }, PILOT()), 'clearance'));
});
