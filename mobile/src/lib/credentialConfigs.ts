// Credential add-form configs — mirrored field-for-field from the inline add
// forms in frontend/src/pages/Profile.jsx. Web has ADD + DELETE only (no edit /
// PATCH on any credential), so these are add-only. Option lists, validation, and
// payload shapes match web exactly.

const LICENCE_TYPES: [string, string][] = [
  ['ATPL', 'ATPL — Airline Transport Pilot'], ['CPL', 'CPL — Commercial Pilot'], ['MPL', 'MPL — Multi-crew Pilot'],
  ['PPL', 'PPL — Private Pilot'], ['IR', 'IR — Instrument Rating'], ['ME', 'ME — Multi-Engine Rating'], ['SE', 'SE — Single-Engine Rating'],
];
const AUTHORITIES: [string, string][] = [
  ['EASA', 'EASA — Europe'], ['FAA', 'FAA — United States'], ['CAA', 'UK CAA — United Kingdom'], ['TCCA', 'Transport Canada — TCCA'],
  ['CASA', 'CASA — Australia'], ['JCAB', 'JCAB — Japan'], ['GCAA', 'GCAA — UAE'], ['ANAC', 'ANAC — Brazil'], ['DGCA', 'DGCA — India'],
  ['CAAC', 'CAAC — China'], ['CAA_NZ', 'CAA — New Zealand'], ['CAAS', 'CAAS — Singapore'], ['DGAC', 'DGAC — Mexico'],
  ['FATA', 'Rosaviatsiya — Russia/CIS'], ['ICAO', 'ICAO — International (not a regulatory authority)'], ['Other', 'Other'],
];
const MEDICAL_CLASSES: [string, string][] = [['CLASS_1', 'Class 1 — Airline pilots'], ['CLASS_2', 'Class 2 — Commercial pilots'], ['CLASS_3', 'Class 3 — Private pilots']];
const ENGLISH_LEVELS: [string, string][] = [['Level 4', 'ICAO Level 4 — Operational'], ['Level 5', 'ICAO Level 5 — Extended'], ['Level 6', 'ICAO Level 6 — Expert (no expiry)']];
const RECURRENT_TYPES: [string, string][] = [['CRM', 'CRM'], ['DGR', 'DGR'], ['AVSEC', 'AVSEC'], ['SMS', 'SMS'], ['First Aid', 'First Aid'], ['RVSM', 'RVSM'], ['EFB', 'EFB'], ['Custom', 'Custom']];
const RTW_DOC_TYPES: [string, string][] = [['Passport', 'Passport'], ['Work Visa', 'Work Visa'], ['Residence Permit', 'Residence Permit'], ['Citizen', 'Citizen'], ['Right of Abode', 'Right of Abode']];

export type Form = Record<string, string | boolean>;
export type Field =
  | { kind: 'text' | 'number'; key: string; label: string; placeholder?: string; visibleIf?: (f: Form) => boolean }
  | { kind: 'select'; key: string; label: string; options: [string, string][]; visibleIf?: (f: Form) => boolean }
  | { kind: 'date'; key: string; label: string; required?: boolean; disabledIf?: (f: Form) => boolean; visibleIf?: (f: Form) => boolean }
  | { kind: 'checkbox'; key: string; label: string; visibleIf?: (f: Form) => boolean };

export interface CredentialConfig {
  key: string;
  title: string;
  postPath: string;
  deletePath: (id: string) => string;
  initial: Form;
  fields: Field[];
  validate: (f: Form) => Record<string, string>;
  buildPayload: (f: Form) => Record<string, unknown>;
}

const s = (v: string | boolean) => String(v ?? '').trim();
const iso = (v: string | boolean) => new Date(String(v)).toISOString();

export const CREDENTIALS: Record<string, CredentialConfig> = {
  licence: {
    key: 'licence', title: 'Add a licence', postPath: '/profile/certificates', deletePath: (id) => `/profile/certificates/${id}`,
    initial: { type: 'ATPL', authority: 'EASA', authorityOther: '', certificateNumber: '', issueDate: '', expiryDate: '' },
    fields: [
      { kind: 'select', key: 'type', label: 'Licence type', options: LICENCE_TYPES },
      { kind: 'select', key: 'authority', label: 'Issuing authority', options: AUTHORITIES },
      { kind: 'text', key: 'authorityOther', label: 'Authority name', placeholder: 'Enter authority name', visibleIf: (f) => f.authority === 'Other' },
      { kind: 'text', key: 'certificateNumber', label: 'Certificate Number', placeholder: 'Optional' },
      { kind: 'date', key: 'issueDate', label: 'Issue Date' },
      { kind: 'date', key: 'expiryDate', label: 'Expiry Date' },
    ],
    validate: () => ({}),
    buildPayload: (f) => ({
      type: f.type,
      issuingAuthority: f.authority === 'Other' ? (s(f.authorityOther) || 'Other') : f.authority,
      ...(s(f.certificateNumber) && { certificateNumber: f.certificateNumber }),
      ...(f.issueDate && { issueDate: iso(f.issueDate) }),
      ...(f.expiryDate && { expiryDate: iso(f.expiryDate) }),
    }),
  },
  medical: {
    key: 'medical', title: 'Add medical certificate', postPath: '/profile/medicals', deletePath: (id) => `/profile/medicals/${id}`,
    initial: { medicalClass: 'CLASS_1', issuingAuthority: 'EASA', issueDate: '', expiryDate: '' },
    fields: [
      { kind: 'select', key: 'medicalClass', label: 'Medical class', options: MEDICAL_CLASSES },
      { kind: 'select', key: 'issuingAuthority', label: 'Issuing authority', options: AUTHORITIES },
      { kind: 'date', key: 'issueDate', label: 'Issue date', required: true },
      { kind: 'date', key: 'expiryDate', label: 'Expiry date', required: true },
    ],
    validate: (f) => ({ ...(!f.issueDate && { issueDate: 'Required' }), ...(!f.expiryDate && { expiryDate: 'Required' }) }),
    buildPayload: (f) => ({ medicalClass: f.medicalClass, issuingAuthority: f.issuingAuthority, issueDate: iso(f.issueDate), expiryDate: iso(f.expiryDate) }),
  },
  rating: {
    key: 'rating', title: 'Add type rating', postPath: '/profile/ratings', deletePath: (id) => `/profile/ratings/${id}`,
    initial: { aircraftType: '', hoursOnType: '' },
    fields: [
      { kind: 'text', key: 'aircraftType', label: 'Aircraft type', placeholder: 'e.g. A320' },
      { kind: 'number', key: 'hoursOnType', label: 'Hours on Type', placeholder: '0.0' },
    ],
    validate: (f) => ({ ...(!s(f.aircraftType) && { aircraftType: 'Required' }) }),
    buildPayload: (f) => ({ aircraftType: s(f.aircraftType).toUpperCase(), category: 'Multi-Engine', hoursOnType: parseFloat(String(f.hoursOnType)) || 0 }),
  },
  elp: {
    key: 'elp', title: 'Add ELP record', postPath: '/profile/elp', deletePath: (id) => `/profile/elp/${id}`,
    initial: { level: 'Level 4', endorsementNumber: '', issueDate: '', expiryDate: '', noExpiry: false },
    fields: [
      { kind: 'select', key: 'level', label: 'Proficiency Level', options: ENGLISH_LEVELS },
      { kind: 'text', key: 'endorsementNumber', label: 'Endorsement / Certificate #', placeholder: 'Optional' },
      { kind: 'date', key: 'issueDate', label: 'Issue Date' },
      { kind: 'date', key: 'expiryDate', label: 'Expiry Date', disabledIf: (f) => !!f.noExpiry, visibleIf: (f) => f.level !== 'Level 6' },
      { kind: 'checkbox', key: 'noExpiry', label: 'No expiry', visibleIf: (f) => f.level !== 'Level 6' },
    ],
    validate: () => ({}),
    buildPayload: (f) => ({ level: f.level, endorsementNumber: f.endorsementNumber, issueDate: f.issueDate, expiryDate: f.noExpiry ? null : f.expiryDate, noExpiry: !!f.noExpiry }),
  },
  recurrent: {
    key: 'recurrent', title: 'Add recurrent training', postPath: '/profile/recurrent', deletePath: (id) => `/profile/recurrent/${id}`,
    initial: { trainingType: 'CRM', provider: '', completionDate: '', expiryDate: '', remarks: '' },
    fields: [
      { kind: 'select', key: 'trainingType', label: 'Training Type', options: RECURRENT_TYPES },
      { kind: 'text', key: 'provider', label: 'Provider', placeholder: 'Training organisation' },
      { kind: 'date', key: 'completionDate', label: 'Completion Date', required: true },
      { kind: 'date', key: 'expiryDate', label: 'Expiry Date (optional)' },
      { kind: 'text', key: 'remarks', label: 'Remarks', placeholder: 'Optional notes' },
    ],
    validate: (f) => ({ ...(!f.completionDate && { completionDate: 'Required' }) }),
    buildPayload: (f) => ({ trainingType: f.trainingType, provider: f.provider, completionDate: iso(f.completionDate), ...(f.expiryDate && { expiryDate: iso(f.expiryDate) }), ...(s(f.remarks) && { remarks: f.remarks }) }),
  },
  rtw: {
    key: 'rtw', title: 'Add document', postPath: '/profile/rtw', deletePath: (id) => `/profile/rtw/${id}`,
    initial: { country: '', documentType: 'Passport', documentNumber: '', expiryDate: '', noExpiry: false },
    fields: [
      { kind: 'text', key: 'country', label: 'Country', placeholder: 'e.g. United Arab Emirates' },
      { kind: 'select', key: 'documentType', label: 'Document Type', options: RTW_DOC_TYPES },
      { kind: 'text', key: 'documentNumber', label: 'Document Number (optional)', placeholder: 'Optional' },
      { kind: 'date', key: 'expiryDate', label: 'Expiry Date (optional)', disabledIf: (f) => !!f.noExpiry },
      { kind: 'checkbox', key: 'noExpiry', label: 'No expiry' },
    ],
    validate: (f) => ({ ...(!s(f.country) && { country: 'Required' }) }),
    buildPayload: (f) => ({ country: f.country, documentType: f.documentType, ...(s(f.documentNumber) && { documentNumber: f.documentNumber }), noExpiry: !!f.noExpiry, ...(!f.noExpiry && f.expiryDate && { expiryDate: iso(f.expiryDate) }) }),
  },
};
