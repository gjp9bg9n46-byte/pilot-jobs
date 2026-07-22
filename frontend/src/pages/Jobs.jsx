import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  MapPin, Building2, FileText, Clock, Target, Plane, Wrench,
  Shield, Search, SlidersHorizontal, AlertTriangle,
  CheckCircle, XCircle, Minus, GraduationCap, Globe, Languages, Info,
} from 'lucide-react';
import { jobApi, profileApi } from '../services/api';
import { setJobs } from '../store';
import { LightPage, Card, Input, Button, Badge } from '../components/primitives';
import AirlineLogo from '../components/AirlineLogo';
import MatchScore from '../components/MatchScore';
import { matchStyle } from '../lib/jobMatch';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  computeMatchCount, matchLabel, postedAgo, formatSalary,
} from '../lib/jobMatch';
import { fetchAirlineMap, resolveAirline } from '../lib/airlineLookup';

// Semantic status colors remapped to light-AA shades (meaning preserved):
//   dark #2ECC71 → #166534 (match/ok), #F39C12 → #92400E (partial/warn),
//   #E74C3C/#FF4757 → #991B1B (miss/error). Matches the Badge palette.
const SEM = { green: '#166534', amber: '#92400E', red: '#991B1B' };

// Country → flag emoji (names as they appear in our job data). Unknown
// countries simply show no flag — never a wrong one.
const COUNTRY_ISO = {
  'united states': 'US', usa: 'US', 'united kingdom': 'GB', uk: 'GB', france: 'FR',
  germany: 'DE', italy: 'IT', spain: 'ES', netherlands: 'NL', poland: 'PL',
  austria: 'AT', switzerland: 'CH', schweiz: 'CH', canada: 'CA', australia: 'AU',
  'new zealand': 'NZ', 'south africa': 'ZA', uae: 'AE', 'united arab emirates': 'AE',
  qatar: 'QA', 'saudi arabia': 'SA', kuwait: 'KW', oman: 'OM', bahrain: 'BH',
  egypt: 'EG', morocco: 'MA', tunisia: 'TN', algeria: 'DZ', libya: 'LY',
  ireland: 'IE', belgium: 'BE', portugal: 'PT', greece: 'GR', turkey: 'TR',
  norway: 'NO', sweden: 'SE', denmark: 'DK', finland: 'FI', iceland: 'IS',
  singapore: 'SG', 'hong kong': 'HK', malaysia: 'MY', india: 'IN', japan: 'JP',
  china: 'CN', mexico: 'MX', brazil: 'BR', iraq: 'IQ', yemen: 'YE', jordan: 'JO',
  lebanon: 'LB', israel: 'IL', hungary: 'HU', 'czech republic': 'CZ', latvia: 'LV',
  lithuania: 'LT', estonia: 'EE', bulgaria: 'BG', romania: 'RO', croatia: 'HR',
  luxembourg: 'LU', malta: 'MT', mauritania: 'MR',
};
function countryFlag(country) {
  const iso = COUNTRY_ISO[String(country || '').trim().toLowerCase()];
  if (!iso) return null;
  return String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

// slugify → kebab-case, NFKD-strip diacritics. Used to build the SEO-friendly
// /jobs/:slugId path (the full UUID is appended last by slugFor).
function slugify(str) {
  return String(str || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// slugId = company-role-<uuid>. JobDetail extracts the trailing UUID via regex
// (job IDs are UUIDs and contain hyphens, so a split('-').pop() would be wrong).
function slugFor(job) {
  return `${slugify(job.company)}-${slugify(job.role || job.title)}-${job.id}`;
}

export function MatchCountBadge({ matched, total, hideIfEmpty = false }) {
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
      {/* Bookmark "saved" marker */}
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
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
  // Clamped to 2 lines — aggregator titles can run very long and would
  // otherwise wreck the card grid's rhythm. Full title lives on the detail page.
  title: {
    fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
    overflow: 'hidden', wordBreak: 'break-word',
  },
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
  // Spec sheet (desktop) — the PilotsGlobal-style "can I apply?" glance:
  // label/value pairs in a quiet bordered strip. Rendered only when the job
  // states at least two of the fields, so it never looks half-empty.
  specSheet: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 18px',
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '10px 14px',
  },
  specItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, minWidth: 0 },
  specLabel: { fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' },
  specVal: { fontSize: 12, color: 'var(--text-primary)', fontWeight: 700, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  visaBadge: {
    fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: '#166534',
    background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 5,
    padding: '2px 7px', whiteSpace: 'nowrap',
  },
  ntrBadge: {
    fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: SEM.amber,
    background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 5,
    padding: '2px 7px', whiteSpace: 'nowrap',
  },
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

export function ReqRow({ req }) {
  const icon = REQ_ICON_MAP[req.icon] || <Minus size={12} />;
  const isMatch = req.matched;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 6, background: isMatch ? 'transparent' : '#FEF2F2', flexWrap: 'wrap' }}>
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

export default function Jobs() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const { list: jobs, total } = useSelector((s) => s.jobs);
  const token = useSelector((s) => s.auth.token); // logged-out: public list, no match/qualified
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // URL-state seeded on mount (read once — params snapshot taken eagerly so the
  // back-from-detail restore lands before the first fetch). 'qualified' defaults
  // ON; ?qualified=0 turns it off. 'sort' defaults 'newest'.
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [hoverId, setHoverId] = useState(null);

  // Pilot profile for match-count badge and incomplete-profile notice
  const [pilotProfile, setPilotProfile] = useState(null);
  const [pilotTotals, setPilotTotals] = useState(null);

  useEffect(() => {
    if (!token) return; // logged-out has no profile — skip (endpoints are auth-gated)
    Promise.all([profileApi.get(), profileApi.getTotals()])
      .then(([profileRes, totalsRes]) => {
        setPilotProfile(profileRes.data);
        setPilotTotals(totalsRes.data);
      })
      .catch(() => {}); // non-fatal — badge just won't show
  }, [token]);

  // Airline map — fetched once per session, cached at module level
  const [airlineMap, setAirlineMap] = useState(null);
  useEffect(() => {
    fetchAirlineMap().then(setAirlineMap).catch(() => {}); // cached after first call; non-fatal
  }, []);

  // Filter panel state — seeded from the URL on mount
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [authority, setAuthority] = useState(() => searchParams.get('authority') || '');
  const [aircraftType, setAircraftType] = useState(() => searchParams.get('aircraft') || '');
  const [role, setRole] = useState(() => searchParams.get('role') || '');
  const [contractType, setContractType] = useState(() => searchParams.get('contractType') || '');
  const [postedWithin, setPostedWithin] = useState(() => searchParams.get('postedWithin') || '');
  const [minSalary, setMinSalary] = useState(() => searchParams.get('salaryMin') || '');
  const [visaOnly, setVisaOnly] = useState(() => searchParams.get('visa') === '1');
  const [ntrOnly, setNtrOnly] = useState(() => searchParams.get('ntr') === '1');

  // Pending (unapplied) filter state
  const [pendingAuthority, setPendingAuthority] = useState('');
  const [pendingAircraftType, setPendingAircraftType] = useState('');
  const [pendingRole, setPendingRole] = useState('');
  const [pendingContractType, setPendingContractType] = useState('');
  const [pendingPostedWithin, setPendingPostedWithin] = useState('');
  const [pendingMinSalary, setPendingMinSalary] = useState('');
  const [pendingVisaOnly, setPendingVisaOnly] = useState(false);
  const [pendingNtrOnly, setPendingNtrOnly] = useState(false);

  // Qualified only toggle — defaults on so the initial view shows jobs the pilot
  // qualifies for. ?qualified=0 in the URL turns it off. Logged-out has no profile
  // to qualify against, so it's forced off and the toggle is hidden.
  const [qualifiedOnly, setQualifiedOnly] = useState(() => token ? searchParams.get('qualified') !== '0' : false);

  // Sort
  const [sort, setSort] = useState(() => searchParams.get('sort') || 'newest');

  // Saved jobs local state: map of id -> bool
  const [savedMap, setSavedMap] = useState({});

  const activeFilterCount = [authority, aircraftType, role, contractType, postedWithin, minSalary, visaOnly, ntrOnly].filter(Boolean).length;

  const openFilters = () => {
    setPendingAuthority(authority);
    setPendingAircraftType(aircraftType);
    setPendingRole(role);
    setPendingContractType(contractType);
    setPendingPostedWithin(postedWithin);
    setPendingMinSalary(minSalary);
    setPendingVisaOnly(visaOnly);
    setPendingNtrOnly(ntrOnly);
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
    setVisaOnly(pendingVisaOnly);
    setNtrOnly(pendingNtrOnly);
    setFiltersOpen(false);
  };

  const clearAll = () => {
    setPendingAuthority('');
    setPendingAircraftType('');
    setPendingRole('');
    setPendingContractType('');
    setPendingPostedWithin('');
    setPendingMinSalary('');
    setPendingVisaOnly(false);
    setPendingNtrOnly(false);
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
      if (visaOnly) params.visa = 'true';
      if (ntrOnly) params.typeRating = 'ntr';
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
  }, [authority, aircraftType, role, contractType, postedWithin, minSalary, visaOnly, ntrOnly, qualifiedOnly, sort]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // URL-state sync — keep the address bar in step with the active filters/search/
  // sort so a /jobs view is shareable and browser-back from a job detail restores
  // it. Params at their default value are OMITTED (clean URLs). replace:true so we
  // don't pollute history with every keystroke.
  useEffect(() => {
    const next = {};
    if (search) next.q = search;
    if (authority) next.authority = authority;
    if (aircraftType) next.aircraft = aircraftType;
    if (role) next.role = role;
    if (contractType) next.contractType = contractType;
    if (postedWithin) next.postedWithin = postedWithin;
    if (minSalary) next.salaryMin = minSalary;
    if (visaOnly) next.visa = '1';
    if (ntrOnly) next.ntr = '1';
    if (sort !== 'newest') next.sort = sort;
    if (!qualifiedOnly) next.qualified = '0';
    setSearchParams(next, { replace: true });
  }, [search, authority, aircraftType, role, contractType, postedWithin, minSalary, visaOnly, ntrOnly, sort, qualifiedOnly, setSearchParams]);

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

  const minSalaryNum = Number(minSalary) || 0;
  const filtered = jobs.filter((j) => {
    const matchesSearch =
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.company.toLowerCase().includes(search.toLowerCase()) ||
      j.location.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    // Min-salary: the server lets jobs with no listed salary pass the salaryMin
    // filter, which makes the control feel broken (#2 quality sweep). When a min
    // is set, hide jobs that have no salary to filter against.
    if (minSalaryNum > 0 && j.salaryMin == null) return false;
    return true;
  });

  return (
    <LightPage style={{ fontFamily: 'var(--font-body)' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 8 }}>Jobs</h1>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 28 }}>
        {token ? 'Cockpit roles, filtered to your profile.' : 'Cockpit roles from airlines worldwide.'}
      </p>

      {/* Top bar */}
      {isMobile ? (
        /* ─── Mobile (top-down): Row 1 status (counter + compact refresh) ·
               Row 2 search + filters · Row 3 qualified chip + sort dropdown. ─── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {/* Row 1: secondary status — counter (left) + compact refresh (right) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 0' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{filtered.length} of {total} jobs</span>
            <button
              onClick={fetchJobs}
              aria-label="Refresh jobs"
              title="Refresh jobs"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-body)', padding: 4 }}
            >
              ↻ Refresh
            </button>
          </div>
          {/* Row 2: search + filters */}
          <Input
            placeholder="Search by title, airline, or location..."
            aria-label="Search jobs"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
          <button
            style={{ ...css.toggleBtn(filtersOpen || activeFilterCount > 0), justifyContent: 'center' }}
            onClick={filtersOpen ? closeFilters : openFilters}
          >
            <SlidersHorizontal size={15} /> Filters
            {activeFilterCount > 0 && (
              <span style={css.filtersBadge}>{activeFilterCount}</span>
            )}
          </button>
          {/* Row 3: qualified-only chip + sort */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            {token && (
              <button
                style={{ ...css.toggleBtn(qualifiedOnly), flex: 1, justifyContent: 'center' }}
                onClick={() => setQualifiedOnly((v) => !v)}
              >
                {qualifiedOnly ? '✓ ' : ''}Qualified only
              </button>
            )}
            <div style={{ flex: 1 }}>
              <Input as="select" aria-label="Sort jobs" value={sort} onChange={(e) => setSort(e.target.value)} style={{ fontSize: 14 }}>
                {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Input>
            </div>
          </div>
        </div>
      ) : (
        <div style={css.topBar}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Input
              placeholder="Search by title, airline, or location..."
              aria-label="Search jobs"
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
          {token && (
            <button
              style={css.toggleBtn(qualifiedOnly)}
              onClick={() => setQualifiedOnly((v) => !v)}
            >
              {qualifiedOnly ? '✓ ' : ''}Qualified only
            </button>
          )}
          <div>
            <Input as="select" aria-label="Sort jobs" value={sort} onChange={(e) => setSort(e.target.value)} style={{ fontSize: 14 }}>
              {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Input>
          </div>
          <Button variant="secondary" onClick={fetchJobs}>↻ Refresh</Button>
          <span style={css.count}>{filtered.length} of {total} jobs</span>
        </div>
      )}

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
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer', paddingTop: 22 }}>
              <input type="checkbox" checked={pendingVisaOnly} onChange={(e) => setPendingVisaOnly(e.target.checked)} />
              Visa sponsorship offered
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer', paddingTop: 22 }}>
              <input type="checkbox" checked={pendingNtrOnly} onChange={(e) => setPendingNtrOnly(e.target.checked)} />
              No type rating required
            </label>
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
          <div style={css.emptyText}>Try adjusting your search or filters.<br />New jobs added daily.</div>
        </div>
      ) : (
        <>
          {/* Logged-out: invite sign-in to unlock match scores against each role */}
          {!token && (
            <div style={{ marginBottom: 16, padding: '10px 16px', background: '#DBEAFE', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 13, color: '#1E40AF', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Info size={14} color="#1E40AF" />
              Sign in to see how you match each role →{' '}
              <a href="/login" style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>Sign in</a>
            </div>
          )}

          {/* Profile-incomplete notice — shown when pilot has no hours, no certs, no ratings */}
          {pilotProfile && pilotTotals &&
            (pilotTotals.totalTime ?? 0) === 0 &&
            (pilotProfile.certificates?.length ?? 0) === 0 &&
            (pilotProfile.ratings?.length ?? 0) === 0 && (
            <div style={{ marginBottom: 16, padding: '10px 16px', background: '#DBEAFE', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 13, color: '#1E40AF', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Info size={14} color="#1E40AF" />
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
              const airlineMatch = resolveAirline(airlineMap, job.company);
              // Spec sheet rows — only fields the job actually states; the
              // block renders only with ≥2 rows so it never looks half-empty.
              const specRows = [
                job.reqMinTotalHours ? ['Total time', `${job.reqMinTotalHours.toLocaleString()} hrs`] : null,
                job.reqMinPicHours ? ['PIC time', `${job.reqMinPicHours.toLocaleString()} hrs`] : null,
                job.reqCertificates?.length ? ['Licence', job.reqCertificates.slice(0, 2).join(' / ')] : null,
                job.reqAuthorities?.length ? ['Authority', job.reqAuthorities.slice(0, 2).join(' / ')] : null,
              ].filter(Boolean);
              const specSheet = specRows.length >= 2 ? specRows : null;
              return (
                <div
                  key={job.id}
                  className="ch-card"
                  style={{ ...css.card, ...(isMobile ? { padding: '14px 96px 14px 14px' } : {}), ...(isHover ? css.cardHover : {}) }}
                  onMouseEnter={() => setHoverId(job.id)}
                  onMouseLeave={() => setHoverId(null)}
                  onClick={() => navigate(`/jobs/${slugFor(job)}`)}
                >
                  {/* Heart save button */}
                  <button
                    style={{ ...css.heartBtn, ...(isMobile ? { top: 10, transform: 'none' } : {}) }}
                    onClick={(e) => { e.stopPropagation(); if (!token) { navigate('/login'); return; } handleSaveToggle(e, job.id); }}
                    title={token ? (isSaved ? 'Unsave job' : 'Save job') : 'Sign in to save'}
                    aria-label={token ? (isSaved ? 'Unsave job' : 'Save job') : 'Sign in to save'}
                    aria-pressed={isSaved}
                  >
                    <PlaneSave saved={isSaved} size={isMobile ? 24 : 36} />
                  </button>

                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    {/* Brand mark — logo (or initials fallback) at the left of the title area */}
                    <AirlineLogo
                      hideIfMissing
                      logoUrl={airlineMatch?.logoUrl}
                      iataCode={airlineMatch?.iataCode}
                      name={job.company}
                      box={isMobile ? 36 : 44}
                      maxW={isMobile ? 52 : 64}
                      font={12}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
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
                    </div>
                  </div>

                  {(job.visaSponsorship || job.typeRatingStatus === 'NTR') && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {job.visaSponsorship && <span style={css.visaBadge}>VISA SPONSORSHIP</span>}
                      {job.typeRatingStatus === 'NTR' && <span style={css.ntrBadge}>NO TYPE RATING REQUIRED</span>}
                    </div>
                  )}

                  <div style={css.metaRow}>
                    <span style={css.meta}>
                      <MapPin size={11} />
                      {countryFlag(job.country) && <span aria-hidden="true">{countryFlag(job.country)}</span>}
                      {job.location}
                    </span>
                    {(isMobile || !specSheet) && job.reqMinTotalHours && (
                      <span style={css.meta}><Clock size={11} /> {job.reqMinTotalHours.toLocaleString()} hrs min</span>
                    )}
                    {(isMobile || !specSheet) && job.reqCertificates?.[0] && (
                      <span style={css.meta}><FileText size={11} /> {job.reqCertificates[0]}</span>
                    )}
                  </div>

                  {!isMobile && specSheet && (
                    <div style={css.specSheet}>
                      {specSheet.map(([label, value]) => (
                        <div key={label} style={css.specItem}>
                          <span style={css.specLabel}>{label}</span>
                          <span style={css.specVal} title={value}>{value}</span>
                        </div>
                      ))}
                    </div>
                  )}

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
                  {matchCount && !isMobile && <span style={{ alignSelf: 'flex-start' }}><MatchCountBadge matched={matchCount.matched} total={matchCount.total} /></span>}
                  {isMobile && matchCount && matchCount.total > 0 && (() => {
                    const pct = Math.round((matchCount.matched / matchCount.total) * 100);
                    const ms = matchStyle(pct);
                    return (
                      <div style={{ position: 'absolute', right: 12, top: 44, textAlign: 'right', minWidth: 64 }}>
                        <MatchScore score={pct} label={ms.label} size="sm" />
                      </div>
                    );
                  })()}

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
    </LightPage>
  );
}
