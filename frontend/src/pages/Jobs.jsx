import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, useParams, Link } from 'react-router-dom';
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
import JobCard from '../components/jobs/JobCard';
import JobDetailPanel from '../components/jobs/JobDetailPanel';
import HoursPopover from '../components/jobs/HoursPopover';
import { roleLabel } from '../lib/jobDisplay';
import '../components/jobs/jobsRedesign.css';

const extractUuid = (slugId) => slugId?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)?.[0] ?? null;

// Region tabs (redesign) — All last. No "Other" tab; untabbed countries show under All.
const REGION_TABS = ['Middle East', 'Europe', 'North America', 'Asia-Pacific', 'All'];
// Group order + labels for the redesigned list.
const FIT_GROUPS = [
  { key: 'qualify', label: '✓ You qualify', cls: 'q', hint: 'best match first' },
  { key: 'incomplete', label: 'Complete your profile to check', cls: '', hint: '' },
  { key: 'oneShort', label: 'One requirement short', cls: '', hint: "shows what's missing" },
  { key: 'few', label: 'Few requirements stated', cls: '', hint: '' },
  { key: 'other', label: 'Everything else', cls: '', hint: '' },
];

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
  // Desktop redesign: single-column list + persistent filter sidebar.
  // Mobile keeps css.grid (renders 1-col anyway) and the Filters button flow.
  list: { display: 'grid', gridTemplateColumns: '1fr', gap: 14 },
  listWrap: { display: 'flex', gap: 24, alignItems: 'flex-start' },
  sidebar: {
    width: 248, flexShrink: 0, background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: 12, padding: 20,
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  sidebarHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  sidebarTitle: {
    fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
    color: 'var(--text-secondary)',
  },
  sidebarClear: {
    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
    fontSize: 12, fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-body)',
  },
  sidebarCheck: {
    display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
    color: 'var(--text-primary)', cursor: 'pointer',
  },
  main: { flex: 1, minWidth: 0 },
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
  ongoingBadge: { fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginTop: 2, opacity: 0.9 },
  ongoingDivider: {
    gridColumn: '1 / -1', marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--border)',
    fontSize: 13, fontWeight: 700, letterSpacing: 0.3, color: 'var(--text-secondary)', textTransform: 'uppercase',
  },
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
  directBadge: {
    fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: 'var(--accent)',
    background: 'rgba(0,63,136,0.08)', border: '1px solid rgba(0,63,136,0.25)', borderRadius: 5,
    padding: '2px 7px', whiteSpace: 'nowrap',
  },
  viaBadge: {
    fontSize: 10, fontWeight: 600, letterSpacing: 0.2, color: 'var(--text-secondary)',
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5,
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
  const { slugId } = useParams(); // set when the route is /jobs/:slugId (split-view selection)
  const isMobile = useIsMobile();
  const isDesktop = !useIsMobile(1024); // ≥1024px = split view (list + detail)
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
  // Milestone hours window — deep-link only (from the Logbook "next milestone"
  // jobs hook: /jobs?hoursMin=&hoursMax=). No visible control; seeded from the URL
  // and passed through so "+N jobs → See them" returns exactly the N the dashboard
  // counted (same ACTIVE + reqMinTotalHours in (hoursMin, hoursMax]).
  const [hoursMin] = useState(() => searchParams.get('hoursMin') || '');
  const [hoursMax] = useState(() => searchParams.get('hoursMax') || '');
  // Hours filter (redesign popover): "up to X hours" — maxReqHours includes jobs with
  // no stated hours requirement (they always show). Separate from the milestone deep-link.
  const [maxReqHours, setMaxReqHours] = useState(() => searchParams.get('maxReqHours') || '');
  const [hoursOpen, setHoursOpen] = useState(false);
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
  const isPhone = useIsMobile(768); // <768 → horizontal filter strip + bottom sheets
  // Region tab (redesign) + the aggregate response fields (counts, groups, banner).
  const [region, setRegion] = useState(() => searchParams.get('region') || '');
  const [meta, setMeta] = useState(null); // { regionCounts, fitGroupCounts, profileNudge, emptyProfile, qualifyCount, facetCounts, defaultRegion }

  // Pending (unapplied) filter state
  const [pendingAuthority, setPendingAuthority] = useState('');
  const [pendingAircraftType, setPendingAircraftType] = useState('');
  const [pendingRole, setPendingRole] = useState('');
  const [pendingContractType, setPendingContractType] = useState('');
  const [pendingPostedWithin, setPendingPostedWithin] = useState('');
  const [pendingMinSalary, setPendingMinSalary] = useState('');
  const [pendingVisaOnly, setPendingVisaOnly] = useState(false);
  const [pendingNtrOnly, setPendingNtrOnly] = useState(false);

  // Qualified only toggle — defaults OFF; the initial view shows ALL jobs with no
  // filters applied. Only ?qualified=1 in the URL turns it on. Logged-out has no
  // profile to qualify against, so it's forced off and the toggle is hidden.
  const [qualifiedOnly, setQualifiedOnly] = useState(() => token ? searchParams.get('qualified') === '1' : false);

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

  // Desktop sidebar applies filters live (no pending/apply step) — this clears
  // the APPLIED state directly. Mobile keeps clearAll (pending) above.
  const clearAllApplied = () => {
    setAuthority('');
    setAircraftType('');
    setRole('');
    setContractType('');
    setPostedWithin('');
    setMinSalary('');
    setVisaOnly(false);
    setNtrOnly(false);
  };

  // Debounce the two free-text sidebar fields so live filtering doesn't
  // refetch on every keystroke. Selects/checkboxes stay immediate.
  const [debAircraftType, setDebAircraftType] = useState(aircraftType);
  const [debMinSalary, setDebMinSalary] = useState(minSalary);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebAircraftType(aircraftType);
      setDebMinSalary(minSalary);
    }, 400);
    return () => clearTimeout(t);
  }, [aircraftType, minSalary]);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { limit: 1000 };
      if (authority) params.authority = authority;
      if (debAircraftType) params.aircraft = debAircraftType;
      if (role) params.role = role;
      if (contractType) params.contractType = contractType;
      if (postedWithin) params.postedWithin = postedWithin;
      if (debMinSalary) params.salaryMin = debMinSalary;
      if (visaOnly) params.visa = 'true';
      if (ntrOnly) params.typeRating = 'ntr';
      if (qualifiedOnly) params.qualifiedOnly = true;
      if (hoursMin) params.hoursMin = hoursMin;
      if (hoursMax) params.hoursMax = hoursMax;
      if (maxReqHours) params.maxReqHours = maxReqHours;
      if (region) params.region = region;
      if (sort) params.sort = sort;
      const { data } = await jobApi.list(params);
      dispatch(setJobs({ jobs: data.jobs, total: data.total }));
      setMeta({
        regionCounts: data.regionCounts || null,
        fitGroupCounts: data.fitGroupCounts || null,
        profileNudge: data.profileNudge || null,
        emptyProfile: !!data.emptyProfile,
        qualifyCount: data.qualifyCount ?? null,
        facetCounts: data.facetCounts || null,
        defaultRegion: data.defaultRegion || null,
        pilotHours: data.pilotHours ?? null,
        total: data.total,
      });
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
  }, [authority, debAircraftType, role, contractType, postedWithin, debMinSalary, visaOnly, ntrOnly, qualifiedOnly, sort, hoursMin, hoursMax, maxReqHours, region]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Default the region tab to the pilot's OWN region (from profile country) once,
  // when no region is already in the URL. The pilot can still pick "All regions".
  const defaultRegionApplied = useRef(false);
  useEffect(() => {
    if (!defaultRegionApplied.current && meta?.defaultRegion && !searchParams.get('region') && !region) {
      defaultRegionApplied.current = true;
      setRegion(meta.defaultRegion);
    }
  }, [meta, region, searchParams]);

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
    if (qualifiedOnly) next.qualified = '1';
    if (hoursMin) next.hoursMin = hoursMin;
    if (hoursMax) next.hoursMax = hoursMax;
    if (maxReqHours) next.maxReqHours = maxReqHours;
    if (region) next.region = region;
    setSearchParams(next, { replace: true });
  }, [search, authority, aircraftType, role, contractType, postedWithin, minSalary, visaOnly, ntrOnly, sort, qualifiedOnly, hoursMin, hoursMax, maxReqHours, region, setSearchParams]);

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

  // One ordering, used for both the list (within each group) and the default
  // selection: FRESH first (posted ≤30 days and not evergreen), then direct-apply
  // first within each freshness tier, then newest. A fresh posting is never topped
  // by an ongoing/evergreen one — even a direct one.
  const THIRTY_DAYS = 30 * 86400000;
  const isFresh = (j) => !j.evergreen && j.postedAt && (Date.now() - new Date(j.postedAt).getTime()) <= THIRTY_DAYS;
  const orderRank = (j) => [
    isFresh(j) ? 0 : 1,                                       // fresh first
    (j.sourceType && j.sourceType !== 'aggregator') ? 0 : 1, // direct first within tier
    -(new Date(j.postedAt || 0).getTime()),                  // newest first
  ];
  const orderedJobs = [...filtered].sort((a, b) => {
    const ra = orderRank(a), rb = orderRank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return 0;
  });

  // Group the filtered jobs by fit group (server already ordered them best-first).
  const grouped = FIT_GROUPS
    .map((g) => ({ ...g, jobs: orderedJobs.filter((j) => j.match && j.match.fitGroup === g.key) }))
    .filter((g) => g.jobs.length > 0);
  const showGroups = !!token && !meta?.emptyProfile && orderedJobs.some((j) => j.match);
  const nudge = meta?.profileNudge;
  const rc = meta?.regionCounts;
  const facet = meta?.facetCounts || {};
  const openJob = (job) => navigate(`/jobs/${slugFor(job)}`);
  const facetOpts = (obj) => Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k]) => k);
  // Current filters (excluding hours) for the histogram endpoint.
  const hoursParams = { ...(search ? { q: search } : {}), ...(region ? { region } : {}), ...(role ? { role } : {}), ...(authority ? { authority } : {}), ...(aircraftType ? { aircraft: aircraftType } : {}), ...(visaOnly ? { visa: 'true' } : {}), ...(qualifiedOnly ? { qualifiedOnly: true } : {}) };
  const hoursLabel = maxReqHours ? `Hours: up to ${Number(maxReqHours).toLocaleString()}` : 'Hours';

  // Split view (≥1024): the URL /jobs/:slug selects a job in the right pane; the
  // first job is selected by default. <1024 opens the job as a full page.
  const urlJobId = extractUuid(slugId);
  // Default selection = the FIRST card actually shown (top of the first group —
  // "You qualify" when present), NOT orderedJobs[0]. The fresh/evergreen reordering
  // can make orderedJobs[0] a lower-group job (e.g. a fresh oneShort with a blocker),
  // which must never be the default in the detail pane.
  const firstShownId = showGroups ? (grouped[0]?.jobs?.[0]?.id ?? null) : (orderedJobs[0]?.id ?? null);
  const selectedId = urlJobId || (isDesktop ? firstShownId : null);

  // Phone / iPad-portrait: a slug in the URL means "show this job's page".
  if (!isDesktop && urlJobId) {
    return (
      <LightPage style={{ fontFamily: 'var(--font-body)' }}>
        <div className="jobs-rd"><JobDetailPanel jobId={urlJobId} mobile onBack={() => navigate('/jobs')} /></div>
      </LightPage>
    );
  }

  return (
    <LightPage style={{ fontFamily: 'var(--font-body)' }}>
      <div className="jobs-rd">
        <div className="rd-head">
          <h1>Jobs</h1>
          <div className="rd-sub">
            {(meta?.regionCounts?.All ?? meta?.total ?? total ?? 0).toLocaleString()} cockpit jobs worldwide
            {token && meta?.qualifyCount != null && <> · <b>{meta.qualifyCount} you qualify for</b></>}
          </div>
        </div>

        {rc && (
          <div className="regions" role="tablist" aria-label="Region">
            {REGION_TABS.map((r) => {
              const count = r === 'All' ? rc.All : rc[r];
              const active = r === 'All' ? !region : region === r;
              return (
                <button key={r} className={active ? 'on' : ''} role="tab" aria-selected={active}
                  onClick={() => setRegion(r === 'All' ? '' : r)}>
                  {r === 'All' ? 'All regions' : r}<small>{count ?? 0}</small>
                </button>
              );
            })}
          </div>
        )}

        {isPhone ? (
          <div className="mfbar">
            <div className="fsearch"><Search size={14} color="var(--text-secondary)" />
              <input placeholder="Search jobs…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search jobs" />
            </div>
            <div className="hscroll">
              <button type="button" className={`fbtn${maxReqHours ? ' act' : ''}`} onClick={() => setHoursOpen(true)}>{hoursLabel} ▾</button>
              <button type="button" className={`fbtn${(aircraftType || role || authority || contractType || postedWithin || minSalary || ntrOnly) ? ' act' : ''}`} onClick={() => setFiltersSheetOpen(true)}>⚙ Filters</button>
              <button type="button" className={`fbtn tog${visaOnly ? ' on act' : ''}`} onClick={() => setVisaOnly((v) => !v)} aria-pressed={visaOnly}><span className="sw" />Visa</button>
              <div className="fsort" style={{ marginLeft: 'auto' }}>Sort:
                <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">{SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
              </div>
            </div>
          </div>
        ) : (
          <div className="fbar">
            <div className="fsearch"><Search size={14} color="var(--text-secondary)" />
              <input placeholder="Search jobs…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search jobs" />
            </div>
            <div className="fwrap">
              <button type="button" className={`fbtn${maxReqHours ? ' act' : ''}`} onClick={() => setHoursOpen((v) => !v)} aria-expanded={hoursOpen}>{hoursLabel} ▾</button>
              {hoursOpen && (
                <HoursPopover params={hoursParams} pilotHours={meta?.pilotHours || 0} value={maxReqHours} onApply={(v) => setMaxReqHours(v)} onClose={() => setHoursOpen(false)} />
              )}
            </div>
            <select className="fbtn" value={aircraftType} onChange={(e) => setAircraftType(e.target.value)} aria-label="Aircraft">
              <option value="">Aircraft</option>
              {facetOpts(facet.aircraft).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select className="fbtn" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
              <option value="">Role</option>
              {facetOpts(facet.role).map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
            <select className="fbtn" value={authority} onChange={(e) => setAuthority(e.target.value)} aria-label="Licence authority">
              <option value="">Licence</option>
              {facetOpts(facet.authority).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <button type="button" className={`fbtn tog${visaOnly ? ' on act' : ''}`} onClick={() => setVisaOnly((v) => !v)} aria-pressed={visaOnly}>
              <span className="sw" />Visa sponsored
            </button>
            <div className="fsort">Sort:
              <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
                {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
        )}

        {(region || aircraftType || role || authority || visaOnly || search || maxReqHours) && (
          <div className="applied">
            {region && <button className="ach" onClick={() => setRegion('')}>{region} ×</button>}
            {maxReqHours && <button className="ach" onClick={() => setMaxReqHours('')}>Up to {Number(maxReqHours).toLocaleString()} h ×</button>}
            {aircraftType && <button className="ach" onClick={() => setAircraftType('')}>{aircraftType} ×</button>}
            {role && <button className="ach" onClick={() => setRole('')}>{roleLabel(role)} ×</button>}
            {authority && <button className="ach" onClick={() => setAuthority('')}>{authority} ×</button>}
            {visaOnly && <button className="ach" onClick={() => setVisaOnly(false)}>Visa sponsored ×</button>}
            <a href="#" onClick={(e) => { e.preventDefault(); clearAllApplied(); setRegion(''); setMaxReqHours(''); }}>Clear all</a>
            <button className="alert-btn" type="button" title="Save this search as an alert (next slice)">🔔 Create alert from this search</button>
          </div>
        )}

        {meta?.emptyProfile && (
          <div className="eprof">
            <div><b>Complete your profile to see which jobs you qualify for.</b> Add your <Link to="/profile">licence</Link> and your <Link to="/logbook">hours</Link> and we'll check every job against them.</div>
          </div>
        )}

        <div className={isDesktop ? 'split' : undefined}>
          <div>
            {loading && orderedJobs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--accent)' }}>Loading jobs…</div>
            ) : error ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>{error}</div>
            ) : orderedJobs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>No jobs match these filters.</div>
            ) : showGroups ? (
              grouped.map((g) => (
                <React.Fragment key={g.key}>
                  <div className={`group ${g.cls}`}>
                    <span>{g.label} · {g.jobs.length}</span>
                    <small>{g.key === 'incomplete' && nudge ? `add ${nudge.fields.map((f) => f.field).slice(0, 2).join(', ')}` : g.hint}</small>
                  </div>
                  {g.jobs.map((job) => <JobCard key={job.id} job={job} selected={isDesktop && job.id === selectedId} onClick={() => openJob(job)} />)}
                </React.Fragment>
              ))
            ) : (
              <div>{orderedJobs.map((job) => <JobCard key={job.id} job={job} selected={isDesktop && job.id === selectedId} onClick={() => openJob(job)} />)}</div>
            )}
          </div>
          {isDesktop && orderedJobs.length > 0 && (
            <div className="rd-detail-pane"><JobDetailPanel jobId={selectedId} /></div>
          )}
        </div>

        {/* Mobile bottom sheets */}
        {isPhone && hoursOpen && (
          <div className="sheet-backdrop" onClick={() => setHoursOpen(false)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-grip" />
              <HoursPopover params={hoursParams} pilotHours={meta?.pilotHours || 0} value={maxReqHours} onApply={(v) => setMaxReqHours(v)} onClose={() => setHoursOpen(false)} />
            </div>
          </div>
        )}
        {isPhone && filtersSheetOpen && (
          <div className="sheet-backdrop" onClick={() => setFiltersSheetOpen(false)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-grip" />
              <h3>Filters</h3>
              <div className="sheet-field"><label>Aircraft</label>
                <select value={aircraftType} onChange={(e) => setAircraftType(e.target.value)}><option value="">Any aircraft</option>{facetOpts(facet.aircraft).map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
              <div className="sheet-field"><label>Role</label>
                <select value={role} onChange={(e) => setRole(e.target.value)}><option value="">Any role</option>{facetOpts(facet.role).map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select></div>
              <div className="sheet-field"><label>Licence authority</label>
                <select value={authority} onChange={(e) => setAuthority(e.target.value)}><option value="">Any authority</option>{facetOpts(facet.authority).map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
              <div className="sheet-field"><label>Contract</label>
                <select value={contractType} onChange={(e) => setContractType(e.target.value)}>{CONTRACT_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
              <div className="sheet-field"><label>Posted within</label>
                <select value={postedWithin} onChange={(e) => setPostedWithin(e.target.value)}>{POSTED_WITHIN.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
              <div className="sheet-field"><label>Min salary (per year)</label>
                <input type="number" value={minSalary} onChange={(e) => setMinSalary(e.target.value)} placeholder="Any" /></div>
              <div className="sheet-toggle"><span>Visa sponsored</span>
                <button className={`fbtn tog${visaOnly ? ' on act' : ''}`} onClick={() => setVisaOnly((v) => !v)} aria-pressed={visaOnly}><span className="sw" /></button></div>
              <div className="sheet-toggle"><span>No type rating required</span>
                <button className={`fbtn tog${ntrOnly ? ' on act' : ''}`} onClick={() => setNtrOnly((v) => !v)} aria-pressed={ntrOnly}><span className="sw" /></button></div>
              <div className="sheet-actions">
                <button className="clear" onClick={() => { clearAllApplied(); setRegion(''); setMaxReqHours(''); }}>Clear</button>
                <button className="apply" onClick={() => setFiltersSheetOpen(false)}>Show {(meta?.total ?? total ?? 0).toLocaleString()} jobs</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </LightPage>
  );
}
