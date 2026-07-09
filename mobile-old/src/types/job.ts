export type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  country?: string | null;
  description: string;
  applyUrl: string;
  sourceUrl?: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'FILLED';
  postedAt: string;
  expiresAt?: string | null;

  // Classification
  role?: string | null;
  contractType?: string | null;
  region?: string | null;

  // Salary
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;

  // Requirements
  reqCertificates: string[];
  reqAuthorities: string[];
  reqAircraftTypes: string[];
  reqMedicalClass?: string | null;
  reqMinTotalHours?: number | null;
  reqMinPicHours?: number | null;
  reqMinMultiEngineHours?: number | null;
  reqMinTurbineHours?: number | null;
  reqMinInstrumentHours?: number | null;
  reqWillingToRelocate: boolean;

  createdAt: string;
  updatedAt: string;

  // Enriched by API
  isSaved: boolean;
  isApplied: boolean;
};

export type SortOption = 'newest' | 'oldest' | 'salary_high' | 'salary_low' | 'hours_asc';

export type FilterState = {
  authorities: string[];
  aircraft: string;
  region: string;
  role: string;
  contractType: string;
  maxReqHours: string;
  salaryMin: string;
  postedWithin: string;
};

export const DEFAULT_FILTERS: FilterState = {
  authorities: [],
  aircraft: '',
  region: '',
  role: '',
  contractType: '',
  maxReqHours: '',
  salaryMin: '',
  postedWithin: '',
};

export function activeFilterCount(f: FilterState): number {
  return (
    f.authorities.length +
    (f.aircraft ? 1 : 0) +
    (f.region ? 1 : 0) +
    (f.role ? 1 : 0) +
    (f.contractType ? 1 : 0) +
    (f.maxReqHours ? 1 : 0) +
    (f.salaryMin ? 1 : 0) +
    (f.postedWithin ? 1 : 0)
  );
}

export const SORT_LABELS: Record<SortOption, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  salary_high: 'Salary: High → Low',
  salary_low: 'Salary: Low → High',
  hours_asc: 'Fewest hours req.',
};

export const COMMON_AUTHORITIES = ['EASA', 'FAA', 'GCAA', 'CASA', 'DGCA', 'CAAS', 'TCCA', 'SACAA', 'CAA UK', 'CAAC'];

export const REGIONS = ['Europe', 'Middle East', 'Asia Pacific', 'Americas', 'Africa', 'Global'];

export const ROLES = ['Captain', 'First Officer', 'Cadet', 'Flight Engineer', 'Instructor', 'Examiner', 'Other'];

export const CONTRACT_TYPES: { value: string; label: string }[] = [
  { value: 'PERMANENT', label: 'Permanent' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'SEASONAL', label: 'Seasonal' },
  { value: 'PART_TIME', label: 'Part-time' },
];

export const POSTED_WITHIN: { value: string; label: string }[] = [
  { value: '', label: 'Any time' },
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];
