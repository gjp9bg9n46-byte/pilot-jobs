// Derive a display-ready Requirements list from a job's structured fields.
// Only populated fields returned. Mirror of frontend/src/lib/jobRequirements.js.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Job = Record<string, any>;
export type ReqItem = { label: string; value: string };

const num = (n: number) => Number(n).toLocaleString();
const cap = (s: string) => String(s || '').replace(/^\w/, (c) => c.toUpperCase());

export function jobRequirements(job: Job | null | undefined): ReqItem[] {
  if (!job) return [];
  const r: ReqItem[] = [];
  if (job.reqCertificates?.length)   r.push({ label: 'Licence',     value: job.reqCertificates.join(', ') });
  if (job.reqAuthorities?.length)    r.push({ label: 'Authority',   value: job.reqAuthorities.join(', ') });
  if (job.reqAircraftTypes?.length)  r.push({ label: 'Type rating', value: job.reqAircraftTypes.join(', ') });
  if (job.reqMinTotalHours != null)        r.push({ label: 'Total time',    value: `${num(job.reqMinTotalHours)} hrs` });
  if (job.reqMinPicHours != null)          r.push({ label: 'PIC time',      value: `${num(job.reqMinPicHours)} hrs` });
  if (job.reqMinMultiEngineHours != null)  r.push({ label: 'Multi-engine',  value: `${num(job.reqMinMultiEngineHours)} hrs` });
  if (job.reqMinTurbineHours != null)      r.push({ label: 'Turbine',       value: `${num(job.reqMinTurbineHours)} hrs` });
  if (job.reqMinInstrumentHours != null)   r.push({ label: 'Instrument',    value: `${num(job.reqMinInstrumentHours)} hrs` });
  if (job.reqMinCrossCountryHours != null) r.push({ label: 'Cross-country', value: `${num(job.reqMinCrossCountryHours)} hrs` });
  if (job.reqMedicalClass)  r.push({ label: 'Medical',   value: `Class ${String(job.reqMedicalClass).replace(/^class\s*/i, '')}` });
  if (job.reqEnglishLevel != null) r.push({ label: 'English', value: `ICAO Level ${job.reqEnglishLevel}` });
  if (job.reqEducation)     r.push({ label: 'Education', value: cap(job.reqEducation) });
  if (job.reqWorkAuthorization) r.push({ label: 'Work authorisation', value: String(job.reqWorkAuthorization).toUpperCase() });
  return r;
}

// Parse structured plain-text description into blocks for RN rendering.
export type DescBlock = { type: 'p'; text: string } | { type: 'ul'; items: string[] };
export function parseDescriptionBlocks(text: string | null | undefined): DescBlock[] {
  if (!text) return [];
  // Strip any stray HTML tags (older/HTML rows) before line parsing.
  const plain = /<[a-z][\s\S]*?>/i.test(text) ? text.replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ') : text;
  const out: DescBlock[] = [];
  let bullets: string[] = [];
  const flush = () => { if (bullets.length) { out.push({ type: 'ul', items: bullets.slice() }); bullets = []; } };
  for (const raw of plain.split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^•/.test(line)) bullets.push(line.replace(/^•\s*/, ''));
    else { flush(); out.push({ type: 'p', text: line }); }
  }
  flush();
  return out;
}
