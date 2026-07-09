// Company types — mirrored from frontend/src/pages/employer/EmployerRegister.jsx
// and the backend EmployerType enum. Order preserved.
export const COMPANY_TYPES: [string, string][] = [
  ['AIRLINE', 'Airline'],
  ['CHARTER', 'Charter'],
  ['CARGO', 'Cargo'],
  ['EMS', 'EMS / Air Ambulance'],
  ['FLIGHT_SCHOOL', 'Flight School'],
  ['CORPORATE', 'Corporate / Business Aviation'],
  ['RECRUITER', 'Recruiter / Agency'],
  ['OTHER', 'Other'],
];

export const COMPANY_TYPE_VALUES = COMPANY_TYPES.map(([v]) => v);

// Label lookup (used by pending-approval summary), mirrored from
// EmployerPendingApproval.jsx COMPANY_TYPE_LABEL.
export const COMPANY_TYPE_LABEL: Record<string, string> = Object.fromEntries(COMPANY_TYPES);

export const DESC_MAX = 5000;
