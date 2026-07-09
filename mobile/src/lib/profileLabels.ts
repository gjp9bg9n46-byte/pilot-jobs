// Label maps + date/expiry helpers mirrored from frontend/src/pages/Profile.jsx.
export const LICENCE_LABEL: Record<string, string> = {
  ATPL: 'ATPL — Airline Transport Pilot', CPL: 'CPL — Commercial Pilot', MPL: 'MPL — Multi-crew Pilot',
  PPL: 'PPL — Private Pilot', IR: 'IR — Instrument Rating', ME: 'ME — Multi-Engine Rating',
  SE: 'SE — Single-Engine Rating', ATP: 'ATPL — Airline Transport Pilot',
};
export const AUTHORITY_LABEL: Record<string, string> = {
  EASA: 'EASA — Europe', FAA: 'FAA — United States', CAA: 'UK CAA — United Kingdom',
  TCCA: 'Transport Canada — TCCA', CASA: 'CASA — Australia', JCAB: 'JCAB — Japan', GCAA: 'GCAA — UAE',
  ANAC: 'ANAC — Brazil', DGCA: 'DGCA — India', CAAC: 'CAAC — China', CAA_NZ: 'CAA — New Zealand',
  CAAS: 'CAAS — Singapore', DGAC: 'DGAC — Mexico', FATA: 'Rosaviatsiya — Russia/CIS',
  ICAO: 'ICAO — International (not a regulatory authority)', Other: 'Other',
};
export const MEDICAL_LABEL: Record<string, string> = {
  CLASS_1: 'Class 1 — Airline pilots', CLASS_2: 'Class 2 — Commercial pilots', CLASS_3: 'Class 3 — Private pilots',
};
export const EDUCATION_LABEL: Record<string, string> = {
  high_school: 'High School / GED', technical: 'Technical / Vocational', bachelor: "Bachelor's Degree",
  masters: "Master's Degree", doctorate: 'Doctorate',
};
export const ROLE_LABEL: Record<string, string> = { FIRST_OFFICER: 'First Officer', CAPTAIN: 'Captain' };

// Application status → label + color (pill).
export const APP_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  APPLIED: { label: 'Applied', color: '#1E40AF', bg: '#EFF6FF' },
  VIEWED: { label: 'Viewed', color: '#92400E', bg: '#FEF3C7' },
  SHORTLISTED: { label: 'Shortlisted', color: '#166534', bg: '#DCFCE7' },
  REJECTED: { label: 'Not selected', color: '#991B1B', bg: '#FEE2E2' },
  WITHDRAWN: { label: 'Withdrawn', color: '#5A5F66', bg: '#F1F1F1' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// "Applied 3 days ago" style relative label.
export function appliedAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Applied today';
  if (days === 1) return 'Applied 1 day ago';
  return `Applied ${days} days ago`;
}
