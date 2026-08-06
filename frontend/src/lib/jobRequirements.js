// Derive a display-ready Requirements list from a job's structured fields.
// Only populated fields are returned. Shared shape with mobile
// (mobile/src/lib/jobRequirements.ts) so web and mobile stay in sync.

const num = (n) => Number(n).toLocaleString();
const cap = (s) => String(s || '').replace(/^\w/, (c) => c.toUpperCase());

export function jobRequirements(job) {
  if (!job) return [];
  const r = [];
  if (job.reqCertificates?.length)   r.push({ label: 'Licence',        value: job.reqCertificates.join(', ') });
  if (job.reqAuthorities?.length)    r.push({ label: 'Authority',      value: job.reqAuthorities.join(', ') });
  if (job.reqAircraftTypes?.length)  r.push({ label: 'Type rating',    value: job.reqAircraftTypes.join(', ') });
  if (job.reqMinTotalHours != null)        r.push({ label: 'Total time',        value: `${num(job.reqMinTotalHours)} hrs` });
  if (job.reqMinPicHours != null)          r.push({ label: 'PIC time',          value: `${num(job.reqMinPicHours)} hrs` });
  if (job.reqMinMultiEngineHours != null)  r.push({ label: 'Multi-engine',      value: `${num(job.reqMinMultiEngineHours)} hrs` });
  if (job.reqMinTurbineHours != null)      r.push({ label: 'Turbine',           value: `${num(job.reqMinTurbineHours)} hrs` });
  if (job.reqMinInstrumentHours != null)   r.push({ label: 'Instrument',        value: `${num(job.reqMinInstrumentHours)} hrs` });
  if (job.reqMinCrossCountryHours != null) r.push({ label: 'Cross-country',     value: `${num(job.reqMinCrossCountryHours)} hrs` });
  if (job.reqMedicalClass)  r.push({ label: 'Medical',   value: `Class ${String(job.reqMedicalClass).replace(/^class\s*/i, '')}` });
  if (job.reqEnglishLevel != null) r.push({ label: 'English', value: `ICAO Level ${job.reqEnglishLevel}` });
  if (job.reqEducation)     r.push({ label: 'Education', value: cap(job.reqEducation) });
  if (job.reqWorkAuthorization) r.push({ label: 'Work authorisation', value: String(job.reqWorkAuthorization).toUpperCase() });
  return r;
}
