// ─── Shared job-match logic ───────────────────────────────────────────────────
// Extracted from Jobs.jsx (Commit B). The client-side match-count computation and
// the formatting helpers now live here so Jobs.jsx + JobDetail.jsx can share them.
//
// NOTE: matching logic is duplicated in the server-side qualifiedOnly filter
// (jobController.js getJobs). Both must stay in sync.
// Long-term: compute server-side and return in the API response.

export const EDU_RANK  = { high_school: 1, technical: 2, bachelor: 3, masters: 4, doctorate: 5 };
export const EDU_LABEL = { high_school: 'High School', technical: 'Technical / Vocational', bachelor: "Bachelor's Degree", masters: "Master's Degree", doctorate: 'Doctorate' };
export const WA_LABEL  = { EU: 'EU Work Authorization', US: 'US Work Authorization', UK: 'UK Work Authorization', required: 'Work Authorization Required' };

// Mirrors server-side parseElpLevel — must use regex, NOT parseInt, because values are "Level 5" strings
export function parseElp(str) {
  if (str == null) return null;
  const m = String(str).match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return (n >= 1 && n <= 6) ? n : null;
}

// Pilot RTW country field is free text. Check if an entry matches a required region.
export function rtwMatchesRegion(country, region) {
  const c = country.toLowerCase();
  if (region === 'EU') {
    return /\beu\b|european union|europe/.test(c) ||
      ['germany','france','spain','italy','netherlands','belgium','poland','sweden','denmark',
       'austria','portugal','greece','czech','hungary','romania','bulgaria','croatia','slovakia',
       'slovenia','estonia','latvia','lithuania','luxembourg','malta','cyprus','finland','ireland'].some((k) => c.includes(k));
  }
  if (region === 'US') return /united states|\bu\.?s\.?a?\b/.test(c);
  if (region === 'UK') return /united kingdom|\bu\.?k\.?\b|great britain|england|scotland|wales/.test(c);
  return false;
}

export function computeMatchCount(job, profile, totals) {
  const normType = (t) => (t === 'ATP' || t === 'ATPL') ? ['ATP', 'ATPL'] : [t];
  const normAuth = (a) => (['CAA', 'CAA_UK', 'CAA-UK'].includes(a)) ? ['CAA', 'CAA_UK', 'CAA-UK'] : [a];

  const certTypes = [...new Set(
    (profile.certificates || []).filter((c) => c.type !== 'ELP').flatMap((c) => normType(c.type))
  )];
  const certAuthorities = [...new Set(
    (profile.certificates || []).filter((c) => c.type !== 'ELP').flatMap((c) => normAuth(c.issuingAuthority))
  )];
  const ratingTypes = (profile.ratings || []).map((r) => r.aircraftType.toUpperCase());

  const bestMedical = (profile.medicals || []).reduce((best, m) => {
    const rank = { CLASS_1: 3, CLASS_2: 2, CLASS_3: 1 };
    return (rank[m.medicalClass] ?? 0) > (rank[best] ?? 0) ? m.medicalClass : best;
  }, null);
  const qualifiedMedicals = bestMedical === 'CLASS_1' ? ['CLASS_1', 'CLASS_2', 'CLASS_3']
    : bestMedical === 'CLASS_2' ? ['CLASS_2', 'CLASS_3']
    : bestMedical === 'CLASS_3' ? ['CLASS_3'] : [];

  const totalTime = totals?.totalTime ?? 0;
  const picTime   = totals?.picTime   ?? 0;

  const requirements = [];
  const req = (label, reqValue, icon, isMatch, pilotValue = null) =>
    requirements.push({ label, reqValue, icon, matched: isMatch, pilotValue });

  if (job.reqAuthorities?.length) {
    const isMatch = job.reqAuthorities.some((a) => certAuthorities.includes(a));
    const pilotAuth = certAuthorities.find((a) => job.reqAuthorities.includes(a)) ?? null;
    req('Authority', job.reqAuthorities.join(', '), 'Building2', isMatch, pilotAuth);
  }
  if (job.reqCertificates?.length) {
    const isMatch = job.reqCertificates.some((c) => certTypes.includes(c));
    const pilotCert = certTypes.find((c) => job.reqCertificates.includes(c)) ?? null;
    req('Certificate', job.reqCertificates.join(', '), 'FileText', isMatch, pilotCert);
  }
  if (job.reqMinTotalHours != null) {
    req('Total Hours', `${job.reqMinTotalHours.toLocaleString()} hrs min`, 'Clock',
      totalTime >= job.reqMinTotalHours, `${totalTime.toLocaleString()} hrs`);
  }
  if (job.reqMinPicHours != null) {
    req('PIC Hours', `${job.reqMinPicHours.toLocaleString()} hrs min`, 'Target',
      picTime >= job.reqMinPicHours, `${picTime.toLocaleString()} hrs`);
  }
  if (job.reqMedicalClass != null) {
    const isMatch = qualifiedMedicals.includes(job.reqMedicalClass);
    req('Medical Class', job.reqMedicalClass.replace('CLASS_', 'Class '), 'Shield',
      isMatch, bestMedical ? bestMedical.replace('CLASS_', 'Class ') : null);
  }
  if (job.reqAircraftTypes?.length) {
    const isMatch = job.reqAircraftTypes.some((a) => ratingTypes.includes(a.toUpperCase()));
    const pilotType = ratingTypes.find((r) => job.reqAircraftTypes.some((a) => a.toUpperCase() === r)) ?? null;
    req('Aircraft Type', job.reqAircraftTypes.join(', '), 'Plane', isMatch, pilotType);
  }
  if (job.reqEducation) {
    const pilotRank = EDU_RANK[profile.education] ?? 0;
    const reqRank   = EDU_RANK[job.reqEducation]  ?? 0;
    req('Education', EDU_LABEL[job.reqEducation] || job.reqEducation, 'GraduationCap',
      pilotRank >= reqRank, profile.education ? EDU_LABEL[profile.education] : null);
  }
  if (job.reqWorkAuthorization) {
    const rtw = profile.rightToWork || [];
    const isMatch = job.reqWorkAuthorization === 'required'
      ? rtw.length > 0
      : rtw.some((r) => rtwMatchesRegion(r.country, job.reqWorkAuthorization));
    const matchingRtw = rtw.find((r) => rtwMatchesRegion(r.country, job.reqWorkAuthorization));
    req('Work Auth', WA_LABEL[job.reqWorkAuthorization] || job.reqWorkAuthorization, 'Globe', isMatch,
      matchingRtw ? matchingRtw.country : (rtw.length > 0 && job.reqWorkAuthorization === 'required' ? rtw[0].country : null));
  }
  if (job.reqEnglishLevel != null) {
    const elpCerts = (profile.certificates || []).filter((c) => c.type === 'ELP');
    const maxLevel = elpCerts.reduce((m, c) => {
      const lvl = parseElp(c.englishLevel);
      return lvl !== null ? Math.max(m, lvl) : m;
    }, 0);
    req('English Level', `ICAO Level ${job.reqEnglishLevel}`, 'Languages',
      maxLevel >= job.reqEnglishLevel, maxLevel > 0 ? `Level ${maxLevel}` : null);
  }
  if (job.reqMinMultiEngineHours != null) {
    const multi = totals?.multiEngineTime ?? 0;
    req('Multi-Engine', `${job.reqMinMultiEngineHours.toLocaleString()} hrs min`, 'Wrench',
      multi >= job.reqMinMultiEngineHours, `${Math.round(multi).toLocaleString()} hrs`);
  }
  if (job.reqMinTurbineHours != null) {
    const turb = totals?.turbineTime ?? 0;
    req('Turbine Time', `${job.reqMinTurbineHours.toLocaleString()} hrs min`, 'Wrench',
      turb >= job.reqMinTurbineHours, `${Math.round(turb).toLocaleString()} hrs`);
  }
  if (job.reqMinInstrumentHours != null) {
    const inst = totals?.instrumentTime ?? 0;
    req('Instrument', `${job.reqMinInstrumentHours.toLocaleString()} hrs min`, 'Wrench',
      inst >= job.reqMinInstrumentHours, `${Math.round(inst).toLocaleString()} hrs`);
  }
  if (job.reqMinCrossCountryHours != null) {
    const cc = totals?.crossCountryTime ?? 0;
    req('Cross-Country', `${job.reqMinCrossCountryHours.toLocaleString()} hrs min`, 'MapPin',
      cc >= job.reqMinCrossCountryHours, `${Math.round(cc).toLocaleString()} hrs`);
  }
  if (job.reqWillingToRelocate) {
    const willing = profile.willingToRelocate ?? true;
    req('Willing to Relocate', 'Required', 'MapPin', willing, willing ? 'Yes' : 'No');
  }
  if (job.role) {
    const roleLabel = { CAPTAIN: 'Captain', FIRST_OFFICER: 'First Officer', INSTRUCTOR: 'Instructor' }[job.role] || job.role;
    const pilotRole = profile.role;
    const isMatch = pilotRole === job.role;
    const pilotLabel = pilotRole ? ({ CAPTAIN: 'Captain', FIRST_OFFICER: 'First Officer' }[pilotRole] || pilotRole) : null;
    req('Role', roleLabel, 'Plane', isMatch, pilotLabel);
  }

  const matched = requirements.filter((r) => r.matched).length;
  return { matched, total: requirements.length, requirements };
}

// ─── Match-score tiers ─────────────────────────────────────────────────────────

// Tier thresholds (shared so consumers can derive labels/colors consistently).
export const MATCH_TIERS = { excellent: 90, great: 75, good: 60 };

// Match-score tiers → Badge variants (Excellent green / Great blue / Good amber).
// Returns null below the "Good" threshold (used by the Jobs card badge).
export function matchLabel(score) {
  if (!score) return null;
  if (score >= MATCH_TIERS.excellent) return { text: 'Excellent Match', variant: 'success' };
  if (score >= MATCH_TIERS.great)     return { text: 'Great Match',     variant: 'info' };
  if (score >= MATCH_TIERS.good)      return { text: 'Good Match',      variant: 'warning' };
  return null;
}

// Match tier → label + semantic color (Phase-8 light-AA palette). The score is a
// pure typographic lockup (no ring/fill/border) — only color + label used. Unlike
// matchLabel, this always returns a tier ("Partial Match" floor) for the lockup.
export function matchStyle(score) {
  if (score >= MATCH_TIERS.excellent) return { label: 'Excellent Match', color: '#166534' };
  if (score >= MATCH_TIERS.great)     return { label: 'Great Match',     color: '#1E40AF' };
  if (score >= MATCH_TIERS.good)      return { label: 'Good Match',      color: '#92400E' };
  return                                     { label: 'Partial Match',   color: '#374151' };
}

// ─── Formatting helpers ────────────────────────────────────────────────────────

export function postedAgo(postedAt) {
  if (!postedAt) return null;
  const diff = Date.now() - new Date(postedAt).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Posted today';
  if (days === 1) return 'Posted 1 day ago';
  return `Posted ${days} days ago`;
}

export function formatSalary(job, compact = false) {
  const { salaryMin, salaryMax, salaryCurrency, salaryPeriod } = job;
  if (salaryMin == null && salaryMax == null) return null;
  const currency = salaryCurrency || '';
  const period = salaryPeriod ? ` / ${salaryPeriod}` : '';
  if (compact) {
    const fmt = (n) => n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n));
    if (salaryMin != null && salaryMax != null && salaryMin !== salaryMax)
      return `${currency} ${fmt(salaryMin)}–${fmt(salaryMax)}${period}`.trim();
    return `${currency} ${fmt(salaryMin ?? salaryMax)}${period}`.trim();
  }
  const fmt = (n) => n.toLocaleString();
  if (salaryMin != null && salaryMax != null && salaryMin !== salaryMax)
    return `${currency} ${fmt(salaryMin)} – ${fmt(salaryMax)}${period}`.trim();
  return `${currency} ${fmt(salaryMin ?? salaryMax)}${period}`.trim();
}
