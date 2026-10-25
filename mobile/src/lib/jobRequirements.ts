// Derive a display-ready Requirements list from a job's structured fields.
// Only populated fields returned. Mirror of frontend/src/lib/jobRequirements.js.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { num as fmtNum } from './format';
type Job = Record<string, any>;
export type ReqItem = { label: string; value: string };

const num = (n: number) => fmtNum(n);
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

// ── Job description → blocks ─────────────────────────────────────────────────
// Scraped descriptions arrive as plain text whose only structure is its line
// breaks and its bullets. Rendering that as one string throws both away and
// gives the wall of text. These are the headings airlines actually use; a line
// that is one of them becomes a heading, "-", "*", "·" and "•" start a list,
// and everything else is a paragraph.
const HEADINGS = /^(about (the )?(role|us|the company|the position)|the role|role overview|key responsibilities|responsibilities|duties|what you('| wi)ll do|requirements|essential requirements|essential|minimum requirements|qualifications|experience( required)?|desirable|preferred|nice to have|what we offer|benefits|package|salary( and benefits)?|how to apply|application process|next steps|about you)\s*:?\s*$/i;
const BULLET = /^[-*·•\u2022\u2023\u25E6\u2043]\s+/;
const NUMBERED = /^\d{1,2}[.)]\s+/;

export type DescBlock = { type: 'p'; text: string } | { type: 'h'; text: string } | { type: 'ul'; items: string[] };
export function parseDescriptionBlocks(text: string | null | undefined): DescBlock[] {
  if (!text) return [];
  const plain = /<[a-z][\s\S]*?>/i.test(text)
    ? text.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|li|div|h[1-6])>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<[^>]+>/g, ' ')
    : text;
  const out: DescBlock[] = [];
  let bullets: string[] = [];
  const flush = () => { if (bullets.length) { out.push({ type: 'ul', items: bullets.slice() }); bullets = []; } };
  for (const raw of plain.split('\n')) {
    const line = raw.replace(/[ \t]+/g, ' ').trim();
    if (!line) { flush(); continue; }
    if (BULLET.test(line) || NUMBERED.test(line)) { bullets.push(line.replace(BULLET, '').replace(NUMBERED, '')); continue; }
    flush();
    if (line.length <= 60 && HEADINGS.test(line)) out.push({ type: 'h', text: line.replace(/\s*:\s*$/, '') });
    else out.push({ type: 'p', text: line });
  }
  flush();
  return out;
}
