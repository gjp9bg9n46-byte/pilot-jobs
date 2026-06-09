import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  MapPin, Building2, FileText, Clock, Target, Plane, Wrench,
  Shield, Search, SlidersHorizontal, AlertTriangle, X,
  CheckCircle, XCircle, Minus, GraduationCap, Globe, Languages,
} from 'lucide-react';
import { jobApi, profileApi, airlineApi } from '../services/api';
import { setJobs } from '../store';
import { LightPage, Card, Input, Button, Badge, Modal } from '../components/primitives';

// Semantic status colors remapped to light-AA shades (meaning preserved):
//   dark #2ECC71 → #166534 (match/ok), #F39C12 → #92400E (partial/warn),
//   #E74C3C/#FF4757 → #991B1B (miss/error). Matches the Badge palette.
const SEM = { green: '#166534', amber: '#92400E', red: '#991B1B' };

// ─── Airline cache — fetched once per session, Map keyed by lowercase name ────
let _airlineCache = null;

async function fetchAirlineMap() {
  if (_airlineCache) return _airlineCache;
  const map = new Map();
  let page = 1, totalPages = 1;
  do {
    const { data } = await airlineApi.list({ limit: 100, page });
    data.items.forEach((a) => map.set(a.name.toLowerCase().trim(), { id: a.id, name: a.name }));
    totalPages = data.totalPages;
    page++;
  } while (page <= totalPages);
  _airlineCache = map;
  return map;
}

// ─── Match-count computation (client-side) ────────────────────────────────────
// NOTE: matching logic is duplicated in the server-side qualifiedOnly filter
// (jobController.js getJobs). Both must stay in sync.
// Long-term: compute server-side and return in the API response.
const EDU_RANK  = { high_school: 1, technical: 2, bachelor: 3, masters: 4, doctorate: 5 };
const EDU_LABEL = { high_school: 'High School', technical: 'Technical / Vocational', bachelor: "Bachelor's Degree", masters: "Master's Degree", doctorate: 'Doctorate' };
const WA_LABEL  = { EU: 'EU Work Authorization', US: 'US Work Authorization', UK: 'UK Work Authorization', required: 'Work Authorization Required' };

// Mirrors server-side parseElpLevel — must use regex, NOT parseInt, because values are "Level 5" strings
function parseElp(str) {
  if (str == null) return null;
  const m = String(str).match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return (n >= 1 && n <= 6) ? n : null;
}

// Pilot RTW country field is free text. Check if an entry matches a required region.
function rtwMatchesRegion(country, region) {
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

function computeMatchCount(job, profile, totals) {
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

function MatchCountBadge({ matched, total, hideIfEmpty = false }) {
  if (total === 0) {
    if (hideIfEmpty) return null;
    return <Badge variant="neutral">No requirements specified</Badge>;
  }
  const full = matched === total;
  return (
    <Badge variant={full ? 'success' : 'warning'} style={{ fontWeight: 700 }}>
      {matched}/{total} requirements matched
    </Badge>
  );
}

function PlaneSave({ saved, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={saved ? 'var(--accent)' : 'none'} stroke={saved ? 'var(--accent)' : 'var(--text-secondary)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Top-down commercial airplane silhouette */}
      <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 12 2a1.5 1.5 0 0 0-1.5 1.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  );
}

const AUTHORITIES = [
  { value: '',     label: 'All Authorities' },
  { value: 'FAA',  label: 'FAA — USA' },
  { value: 'EASA', label: 'EASA — Europe' },
  { value: 'CAA',  label: 'UK CAA' },
  { value: 'TCCA', label: 'Transport Canada' },
  { value: 'CAAC', label: 'CAAC — China' },
  { value: 'ICAO', label: 'ICAO — International' },
  { value: 'FATA', label: 'Russia / CIS' },
];

// Values are UPPERCASE to match how Job.role is stored (employer-posted jobs use
// 'CAPTAIN'/'FIRST_OFFICER'/'INSTRUCTOR'); jobController.getJobs does an exact match.
const ROLES = [
  { value: '', label: 'Any Role' },
  { value: 'CAPTAIN', label: 'Captain' },
  { value: 'FIRST_OFFICER', label: 'First Officer' },
  { value: 'INSTRUCTOR', label: 'Instructor' },
];

const CONTRACT_TYPES = [
  { value: '', label: 'Any Contract' },
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'acmi', label: 'ACMI' },
];

const POSTED_WITHIN = [
  { value: '', label: 'Any time' },
  { value: '1', label: 'Last 24h' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'relevant', label: 'Most Relevant' },
  { value: 'deadline', label: 'Deadline' },
];

// Match-score tiers → Badge variants (Excellent green / Great blue / Good amber)
function matchLabel(score) {
  if (!score) return null;
  if (score >= 90) return { text: 'Excellent Match', variant: 'success' };
  if (score >= 75) return { text: 'Great Match',     variant: 'info' };
  if (score >= 60) return { text: 'Good Match',      variant: 'warning' };
  return null;
}

function postedAgo(postedAt) {
  if (!postedAt) return null;
  const diff = Date.now() - new Date(postedAt).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Posted today';
  if (days === 1) return 'Posted 1 day ago';
  return `Posted ${days} days ago`;
}

function formatSalary(job, compact = false) {
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

const css = {
  topBar: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  // Toggle-style buttons (Filters, Qualified-only) — Phase-4/6 accent-tinted active pattern
  toggleBtn: (active) => ({
    background: active ? 'rgba(0,63,136,0.06)' : 'var(--surface)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 4, padding: '11px 16px',
    color: active ? 'var(--accent)' : 'var(--text-secondary)',
    fontSize: 14, fontWeight: 500, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 8,
    fontFamily: 'var(--font-body)', position: 'relative', whiteSpace: 'nowrap',
  }),
  filtersBadge: {
    background: 'var(--accent)', color: '#fff', borderRadius: '50%',
    width: 18, height: 18, display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 11, fontWeight: 800,
  },
  count: { color: 'var(--text-secondary)', fontSize: 13, alignSelf: 'center', whiteSpace: 'nowrap' },
  filterGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16,
  },
  filterActions: { display: 'flex', gap: 12, marginTop: 20, justifyContent: 'flex-end' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: 20 },
  card: {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
    padding: '24px 72px 24px 24px', display: 'flex', flexDirection: 'column', gap: 12,
    transition: 'border-color 0.2s, transform 0.15s', cursor: 'pointer',
    position: 'relative',
  },
  cardHover: { borderColor: 'var(--accent)', transform: 'translateY(-2px)' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 },
  airline: { fontSize: 14, color: 'var(--accent)', fontWeight: 600 },
  postedAgo: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 },
  // Understated neutral badge — kept visually consistent so the employer's live
  // preview matches the real card. Only for sourcePlatform EMPLOYER_DIRECT.
  employerBadge: {
    display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start',
    fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)',
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5,
    padding: '3px 8px', letterSpacing: 0.2, whiteSpace: 'nowrap', marginTop: 4,
  },
  authorityBadge: {
    background: 'rgba(0,63,136,0.06)', border: '1px solid var(--border)', borderRadius: 6,
    padding: '4px 10px', fontSize: 11, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap',
  },
  rolePill: {
    fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'rgba(0,63,136,0.08)',
    border: '1px solid rgba(0,63,136,0.25)', borderRadius: 5, padding: '2px 7px',
    letterSpacing: 0.3, whiteSpace: 'nowrap',
  },
  heartBtn: {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)', right: 16,
    background: 'none', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 1, zIndex: 1,
  },
  metaRow: { display: 'flex', gap: 20, flexWrap: 'wrap' },
  meta: { fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 },
  reqs: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  req: {
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px',
    fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500,
  },
  // Salary → warning Badge palette (amber-on-light)
  salary: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 6,
    padding: '4px 10px', fontSize: 11, fontWeight: 700, color: SEM.amber,
  },
  empty: { textAlign: 'center', padding: '80px 0', color: 'var(--text-secondary)' },
  emptyIcon: { marginBottom: 16 },
  emptyTitle: { fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 8 },
  emptyText: { fontSize: 14, lineHeight: 1.6 },
  loading: { textAlign: 'center', padding: '80px 0', color: 'var(--accent)', fontSize: 15 },
};

const REQ_ICON_MAP = {
  Building2: <Building2 size={12} />,
  FileText:  <FileText  size={12} />,
  Clock:     <Clock     size={12} />,
  Target:    <Target    size={12} />,
  Shield:    <Shield    size={12} />,
  Plane:     <Plane     size={12} />,
  Wrench:    <Wrench    size={12} />,
  GraduationCap: <GraduationCap size={12} />,
  Globe:     <Globe     size={12} />,
  Languages: <Languages size={12} />,
  MapPin:    <MapPin    size={12} />,
};

function ReqRow({ req }) {
  const icon = REQ_ICON_MAP[req.icon] || <Minus size={12} />;
  const isMatch = req.matched;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
      <div style={{ flexShrink: 0 }}>
        {isMatch
          ? <CheckCircle size={16} color={SEM.green} />
          : <XCircle    size={16} color={SEM.red} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 80, color: 'var(--text-secondary)', fontSize: 12, flexShrink: 0 }}>
        {icon}
        <span>{req.label}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: isMatch ? 'var(--text-primary)' : SEM.red, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
        {req.reqValue}
      </div>
      <div style={{ fontSize: 12, color: isMatch ? SEM.green : 'var(--text-secondary)', textAlign: 'right', minWidth: 0, flexShrink: 1, overflowWrap: 'break-word' }}>
        {req.pilotValue ?? 'Not on profile'}
      </div>
    </div>
  );
}

function JobModal({ job, onClose, pilotProfile, pilotTotals, airlineMap }) {
  const navigate = useNavigate();
  const airlineMatch = job ? airlineMap?.get(job.company?.toLowerCase().trim()) : null;

  const matchCount = job && pilotProfile && pilotTotals
    ? computeMatchCount(job, pilotProfile, pilotTotals)
    : null;

  const missing = matchCount?.requirements.filter((r) => !r.matched) ?? [];
  const hasReqs = matchCount && matchCount.total > 0;

  // Extra non-matched fields shown in info grid (location only — hours are now in requirements)
  const extraFields = job ? [
    job.location && ['Location', job.location, <MapPin size={11} />],
  ].filter(Boolean) : [];

  return (
    <Modal isOpen={!!job} onClose={onClose} size="md" title={job?.title}>
      {job && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: formatSalary(job) ? 6 : (matchCount ? 10 : 20) }}>
            <span style={{ fontSize: 15, color: 'var(--accent)', fontWeight: 600 }}>{job.company}</span>
            {airlineMatch && (
              <button
                onClick={() => { onClose(); navigate(`/airlines/${airlineMatch.id}`); }}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: 'var(--accent)', fontWeight: 600, opacity: 0.8, whiteSpace: 'nowrap', textDecoration: 'underline', textUnderlineOffset: 3 }}
              >
                View factfile →
              </button>
            )}
          </div>
          {job.sourcePlatform === 'EMPLOYER_DIRECT' && (
            <div style={{ ...css.employerBadge, fontSize: 12, padding: '4px 10px', marginTop: 0, marginBottom: 16 }}>Posted directly by employer</div>
          )}
          {formatSalary(job) && (
            <div style={{ marginBottom: matchCount ? 10 : 18 }}>
              <span style={{ ...css.salary, fontSize: 13, padding: '5px 12px' }}>$ {formatSalary(job)}</span>
            </div>
          )}
          {matchCount && (
            <div style={{ marginBottom: 16 }}>
              <MatchCountBadge matched={matchCount.matched} total={matchCount.total} hideIfEmpty={false} />
            </div>
          )}

          {hasReqs ? (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>Requirements</div>
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '0 12px' }}>
                {matchCount.requirements.map((r) => <ReqRow key={r.label} req={r} />)}
              </div>

              {missing.length > 0 && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: SEM.red, fontWeight: 700, marginBottom: 6 }}>WHAT YOU&apos;RE MISSING</div>
                  {missing.map((r) => (
                    <div key={r.label} style={{ fontSize: 12, color: SEM.red, marginBottom: 3 }}>
                      • {r.label}: {r.reqValue}{r.pilotValue ? ` (you have: ${r.pilotValue})` : ''}
                    </div>
                  ))}
                </div>
              )}

              {extraFields.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                  {extraFields.map(([label, val, icon]) => (
                    <div key={label} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>{icon}{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{val}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : matchCount ? (
            <div style={{ marginBottom: 20, padding: '12px 16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              No structured requirements specified for this job.
            </div>
          ) : null}

          {job.description ? (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
                Job Description
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                {job.description}
              </div>
            </div>
          ) : null}

          {job.notes ? (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
                Notes / Benefits
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                {job.notes}
              </div>
            </div>
          ) : null}

          <a
            href={job.applyUrl} target="_blank" rel="noreferrer"
            style={{
              display: 'block', textAlign: 'center',
              background: 'var(--accent)', color: '#fff', padding: '14px', borderRadius: 4,
              fontWeight: 500, fontSize: 16, textDecoration: 'none', fontFamily: 'var(--font-body)',
            }}
          >
            View Full Posting &amp; Apply →
          </a>
        </>
      )}
    </Modal>
  );
}

export default function Jobs() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { list: jobs, total } = useSelector((s) => s.jobs);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [hoverId, setHoverId] = useState(null);

  // Pilot profile for match-count badge and incomplete-profile notice
  const [pilotProfile, setPilotProfile] = useState(null);
  const [pilotTotals, setPilotTotals] = useState(null);

  useEffect(() => {
    Promise.all([profileApi.get(), profileApi.getTotals()])
      .then(([profileRes, totalsRes]) => {
        setPilotProfile(profileRes.data);
        setPilotTotals(totalsRes.data);
      })
      .catch(() => {}); // non-fatal — badge just won't show
  }, []);

  // Airline map — fetched once per session, cached at module level
  const [airlineMap, setAirlineMap] = useState(() => _airlineCache);
  useEffect(() => {
    if (_airlineCache) return; // already cached
    fetchAirlineMap().then(setAirlineMap).catch(() => {}); // non-fatal
  }, []);

  // Filter panel state
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [authority, setAuthority] = useState('');
  const [aircraftType, setAircraftType] = useState('');
  const [role, setRole] = useState('');
  const [contractType, setContractType] = useState('');
  const [postedWithin, setPostedWithin] = useState('');
  const [minSalary, setMinSalary] = useState('');

  // Pending (unapplied) filter state
  const [pendingAuthority, setPendingAuthority] = useState('');
  const [pendingAircraftType, setPendingAircraftType] = useState('');
  const [pendingRole, setPendingRole] = useState('');
  const [pendingContractType, setPendingContractType] = useState('');
  const [pendingPostedWithin, setPendingPostedWithin] = useState('');
  const [pendingMinSalary, setPendingMinSalary] = useState('');

  // Qualified only toggle — defaults on so the initial view shows jobs the pilot qualifies for
  const [qualifiedOnly, setQualifiedOnly] = useState(true);

  // Sort
  const [sort, setSort] = useState('newest');

  // Saved jobs local state: map of id -> bool
  const [savedMap, setSavedMap] = useState({});

  const activeFilterCount = [authority, aircraftType, role, contractType, postedWithin, minSalary].filter(Boolean).length;

  const openFilters = () => {
    setPendingAuthority(authority);
    setPendingAircraftType(aircraftType);
    setPendingRole(role);
    setPendingContractType(contractType);
    setPendingPostedWithin(postedWithin);
    setPendingMinSalary(minSalary);
    setFiltersOpen(true);
  };

  const closeFilters = () => setFiltersOpen(false);

  const applyFilters = () => {
    setAuthority(pendingAuthority);
    setAircraftType(pendingAircraftType);
    setRole(pendingRole);
    setContractType(pendingContractType);
    setPostedWithin(pendingPostedWithin);
    setMinSalary(pendingMinSalary);
    setFiltersOpen(false);
  };

  const clearAll = () => {
    setPendingAuthority('');
    setPendingAircraftType('');
    setPendingRole('');
    setPendingContractType('');
    setPendingPostedWithin('');
    setPendingMinSalary('');
  };

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { limit: 1000 };
      if (authority) params.authority = authority;
      if (aircraftType) params.aircraft = aircraftType;
      if (role) params.role = role;
      if (contractType) params.contractType = contractType;
      if (postedWithin) params.postedWithin = postedWithin;
      if (minSalary) params.salaryMin = minSalary;
      if (qualifiedOnly) params.qualifiedOnly = true;
      if (sort) params.sort = sort;
      const { data } = await jobApi.list(params);
      dispatch(setJobs({ jobs: data.jobs, total: data.total }));
      const initSaved = {};
      (data.jobs || []).forEach((j) => {
        if (j.isSaved !== undefined) initSaved[j.id] = j.isSaved;
      });
      setSavedMap((prev) => ({ ...initSaved, ...prev }));
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, [authority, aircraftType, role, contractType, postedWithin, minSalary, qualifiedOnly, sort]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleSaveToggle = async (e, jobId) => {
    e.stopPropagation();
    const currentlySaved = savedMap[jobId] || false;
    setSavedMap((prev) => ({ ...prev, [jobId]: !currentlySaved }));
    try {
      if (currentlySaved) {
        await jobApi.unsaveJob(jobId);
      } else {
        await jobApi.saveJob(jobId);
      }
    } catch {
      // Revert on error
      setSavedMap((prev) => ({ ...prev, [jobId]: currentlySaved }));
    }
  };

  const filtered = jobs.filter(
    (j) =>
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.company.toLowerCase().includes(search.toLowerCase()) ||
      j.location.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <LightPage style={{ fontFamily: 'var(--font-body)' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 8 }}>Jobs</h1>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 28 }}>Cockpit roles, filtered to your profile.</p>

      {/* Top bar */}
      <div style={css.topBar}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Input
            placeholder="Search by airline, aircraft, or country..."
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          style={css.toggleBtn(filtersOpen || activeFilterCount > 0)}
          onClick={filtersOpen ? closeFilters : openFilters}
        >
          <SlidersHorizontal size={15} /> Filters
          {activeFilterCount > 0 && (
            <span style={css.filtersBadge}>{activeFilterCount}</span>
          )}
        </button>
        <button
          style={css.toggleBtn(qualifiedOnly)}
          onClick={() => setQualifiedOnly((v) => !v)}
        >
          {qualifiedOnly ? '✓ ' : ''}Qualified only
        </button>
        <div>
          <Input as="select" value={sort} onChange={(e) => setSort(e.target.value)} style={{ fontSize: 14 }}>
            {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Input>
        </div>
        <Button variant="secondary" onClick={fetchJobs}>↻ Refresh</Button>
        <span style={css.count}>{filtered.length} of {total} jobs</span>
      </div>

      {/* Filter panel */}
      {filtersOpen && (
        <Card style={{ marginTop: 16, marginBottom: 20 }}>
          <div style={css.filterGrid}>
            <Input as="select" label="Authority" value={pendingAuthority} onChange={(e) => setPendingAuthority(e.target.value)}>
              {AUTHORITIES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </Input>
            <Input label="Aircraft Type" placeholder="e.g. Boeing 737" value={pendingAircraftType} onChange={(e) => setPendingAircraftType(e.target.value)} />
            <Input as="select" label="Role" value={pendingRole} onChange={(e) => setPendingRole(e.target.value)}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Input>
            <Input as="select" label="Contract Type" value={pendingContractType} onChange={(e) => setPendingContractType(e.target.value)}>
              {CONTRACT_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Input>
            <Input as="select" label="Posted Within" value={pendingPostedWithin} onChange={(e) => setPendingPostedWithin(e.target.value)}>
              {POSTED_WITHIN.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Input>
            <Input type="number" label="Min Salary" placeholder="e.g. 80000" value={pendingMinSalary} onChange={(e) => setPendingMinSalary(e.target.value)} />
          </div>
          <div style={css.filterActions}>
            <Button variant="ghost" onClick={clearAll}>Clear All</Button>
            <Button onClick={applyFilters}>Apply Filters</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div style={css.loading}>Loading jobs from around the world...</div>
      ) : error ? (
        <div style={css.empty}>
          <div style={css.emptyIcon}><AlertTriangle size={48} color={SEM.amber} /></div>
          <div style={css.emptyTitle}>Could not load jobs</div>
          <div style={css.emptyText}>{error}</div>
          <div style={{ marginTop: 20 }}>
            <Button onClick={fetchJobs}>Retry</Button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={css.empty}>
          <div style={css.emptyIcon}><Search size={48} color="var(--text-secondary)" /></div>
          <div style={css.emptyTitle}>No jobs found</div>
          <div style={css.emptyText}>Try adjusting your search or filters.<br />New jobs are scraped every 6 hours.</div>
        </div>
      ) : (
        <>
          {/* Profile-incomplete notice — shown when pilot has no hours, no certs, no ratings */}
          {pilotProfile && pilotTotals &&
            (pilotTotals.totalTime ?? 0) === 0 &&
            (pilotProfile.certificates?.length ?? 0) === 0 &&
            (pilotProfile.ratings?.length ?? 0) === 0 && (
            <div style={{ marginBottom: 16, padding: '10px 16px', background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 8, fontSize: 13, color: SEM.green, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={14} color={SEM.green} />
              Complete your profile to improve job matching →{' '}
              <a href="/profile" style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>Go to Profile</a>
            </div>
          )}

          <div style={css.grid}>
            {filtered.map((job) => {
              const match = matchLabel(job.matchScore);
              const isHover = hoverId === job.id;
              const isSaved = savedMap[job.id] !== undefined ? savedMap[job.id] : (job.isSaved || false);
              const ago = postedAgo(job.postedAt);
              const matchCount = pilotProfile && pilotTotals
                ? computeMatchCount(job, pilotProfile, pilotTotals)
                : null;
              const airlineMatch = airlineMap?.get(job.company?.toLowerCase().trim());
              return (
                <div
                  key={job.id}
                  style={{ ...css.card, ...(isHover ? css.cardHover : {}) }}
                  onMouseEnter={() => setHoverId(job.id)}
                  onMouseLeave={() => setHoverId(null)}
                  onClick={() => setSelected(job)}
                >
                  {/* Heart save button */}
                  <button
                    style={css.heartBtn}
                    onClick={(e) => handleSaveToggle(e, job.id)}
                    title={isSaved ? 'Unsave job' : 'Save job'}
                  >
                    <PlaneSave saved={isSaved} size={36} />
                  </button>

                  <div style={css.cardTop}>
                    <div style={css.title}>{job.title}</div>
                    {job.role && (
                      <div style={css.rolePill}>
                        {{ CAPTAIN: 'CAPTAIN', FIRST_OFFICER: 'FIRST OFFICER', INSTRUCTOR: 'INSTRUCTOR', FLIGHT_ENGINEER: 'FLIGHT ENG' }[job.role] || job.role}
                      </div>
                    )}
                    {job.reqAuthorities?.[0] && (
                      <div style={css.authorityBadge}>{job.reqAuthorities[0]}</div>
                    )}
                  </div>

                  <div>
                    <div style={css.airline}>{job.company}</div>
                    {ago && <div style={css.postedAgo}>{ago}</div>}
                    {job.sourcePlatform === 'EMPLOYER_DIRECT' && (
                      <div style={css.employerBadge}>Posted directly by employer</div>
                    )}
                  </div>

                  <div style={css.metaRow}>
                    <span style={css.meta}><MapPin size={11} /> {job.location}</span>
                    {job.reqMinTotalHours && (
                      <span style={css.meta}><Clock size={11} /> {job.reqMinTotalHours.toLocaleString()} hrs min</span>
                    )}
                    {job.reqCertificates?.[0] && (
                      <span style={css.meta}><FileText size={11} /> {job.reqCertificates[0]}</span>
                    )}
                  </div>

                  {job.reqAircraftTypes?.length > 0 && (
                    <div style={css.reqs}>
                      {job.reqAircraftTypes.slice(0, 3).map((a) => (
                        <span key={a} style={css.req}>{a}</span>
                      ))}
                    </div>
                  )}

                  {formatSalary(job, true) && (
                    <div>
                      <span style={css.salary}>$ {formatSalary(job, true)}</span>
                    </div>
                  )}

                  {match && <span style={{ alignSelf: 'flex-start' }}><Badge variant={match.variant} style={{ fontWeight: 700 }}>✓ {match.text}</Badge></span>}
                  {matchCount && <span style={{ alignSelf: 'flex-start' }}><MatchCountBadge matched={matchCount.matched} total={matchCount.total} /></span>}

                  {airlineMatch && (
                    <div
                      onClick={(e) => { e.stopPropagation(); navigate(`/airlines/${airlineMatch.id}`); }}
                      style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer', fontWeight: 600, opacity: 0.85, marginTop: 2 }}
                    >
                      View {airlineMatch.name} factfile →
                    </div>
                  )}

                  <div style={{ marginTop: 'auto' }}>
                    <Button variant="secondary" style={{ width: '100%' }}>View Details →</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <JobModal
        job={selected}
        onClose={() => setSelected(null)}
        pilotProfile={pilotProfile}
        pilotTotals={pilotTotals}
        airlineMap={airlineMap}
      />
    </LightPage>
  );
}
