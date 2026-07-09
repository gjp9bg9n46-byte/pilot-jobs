// Shared helpers + palette for the HTML CV templates (Track B-3b).
//
// The web renders the CV with @react-pdf/renderer (can't run in RN), so we port
// the two templates to inline-CSS HTML strings. expo-print turns the HTML into a
// real vector A4 PDF; a WebView renders the same HTML for the on-screen preview.
// Sizes use `pt` to match the react-pdf point coordinates 1:1 on an A4 page
// (595.28 × 841.89 pt). Fonts are Helvetica/Arial to match the templates'
// `fontFamily: 'Helvetica'` (NOT the serif the brief suggested — parity wins).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CvData = Record<string, any>;

// Palette base colours — copied from frontend/src/components/cv/Template*.jsx `C`.
export const C = {
  navy: '#0D1E35', navyLight: '#1B2B4B', cyan: '#00B4D8', cyanDim: '#007A96',
  white: '#FFFFFF', offWhite: '#F4F8FB', textDark: '#1A2535', textMid: '#3A5070',
  textLight: '#6A88A0', border: '#D8E8F0', green: '#2ECC71', amber: '#F39C12',
};

// Accent presets → light/dark variants (from accentPalette.js). The accent hex
// replaces navy for the sidebar/header/section-titles/values.
export const ACCENT_MAP: Record<string, { light: string; dark: string }> = {
  '#0D1E35': { light: '#1B2B4B', dark: '#07101E' },
  '#2c2c2c': { light: '#484848', dark: '#1a1a1a' },
  '#722f37': { light: '#8d3a44', dark: '#4d1f24' },
  '#1f3d2b': { light: '#2d5a3d', dark: '#122214' },
  '#3a5068': { light: '#4d6a85', dark: '#253344' },
  '#1C2451': { light: '#2E3D6F', dark: '#121735' },
  '#0A3D40': { light: '#195154', dark: '#062728' },
  '#4A3200': { light: '#634600', dark: '#1E1300' },
  '#3A1F38': { light: '#4E2E4C', dark: '#170C16' },
  '#2D1B69': { light: '#412A82', dark: '#130C2C' },
};
export const DEFAULT_ACCENT = '#0D1E35';

// HTML-escape every piece of user/profile data before interpolation.
export function esc(v: unknown): string {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const fmt = (n?: number) => (n ? Math.round(n).toLocaleString() : '0');
export const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '';
export const fullName = (p: CvData) => `${p?.firstName ?? ''} ${p?.lastName ?? ''}`.trim();
export const initials = (p: CvData) => `${p?.firstName?.[0] ?? ''}${p?.lastName?.[0] ?? ''}`.toUpperCase();

export function topCert(certs: CvData[]): CvData | null {
  for (const t of ['ATPL', 'MPL', 'CPL', 'PPL']) {
    const c = certs.find((x) => x.type === t);
    if (c) return c;
  }
  return null;
}

// English ELP cert (profile) prepended to cv.languages, matching both templates.
export function buildLanguages(languages: CvData[], elpCert?: CvData): CvData[] {
  const out = [...(languages ?? [])];
  if (elpCert && !out.some((l) => l.language?.toLowerCase() === 'english')) {
    out.unshift({ language: 'English', level: `ICAO Level ${elpCert.englishLevel || '6'}` });
  }
  return out;
}

// Two-column paired hours rows — identical logic/labels to the react-pdf templates.
// `long` uses the fuller labels from TemplateFinal; `short` the compact Approach ones.
export function buildHoursPairs(totals: CvData, long = false): [string, string, string | null, string | null][] {
  const hasActualSim = (totals.instrumentActualTime ?? 0) > 0 || (totals.instrumentSimTime ?? 0) > 0;
  const L = long
    ? { instr: 'Instrument', cross: 'Cross-Cty' }
    : { instr: 'Instr', cross: 'Cross' };
  const rows: [string, string, string | null, string | null][] = [
    ['Total', fmt(totals.totalTime) + 'h', 'PIC', fmt(totals.picTime) + 'h'],
    ['SIC', fmt(totals.sicTime) + 'h', 'Night', fmt(totals.nightTime) + 'h'],
    hasActualSim
      ? ['IFR Act', fmt(totals.instrumentActualTime) + 'h', 'IFR Sim', fmt(totals.instrumentSimTime) + 'h']
      : [L.instr, fmt(totals.instrumentTime) + 'h', 'Multi', fmt(totals.multiEngineTime) + 'h'],
    hasActualSim
      ? ['Multi', fmt(totals.multiEngineTime) + 'h', 'Turbine', fmt(totals.turbineTime) + 'h']
      : [long ? 'Turbine' : 'Turb', fmt(totals.turbineTime) + 'h', L.cross, fmt(totals.crossCountryTime) + 'h'],
    hasActualSim
      ? [L.cross, fmt(totals.crossCountryTime) + 'h', 'Jet', fmt(totals.jetTime) + 'h']
      : ['Jet', fmt(totals.jetTime) + 'h', null, null],
  ];
  return rows.filter(([, lv, , rv]) => lv !== '0h' || (rv != null && rv !== '0h'));
}

// Full A4 HTML document shell shared by both templates.
export function htmlDoc(css: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=595, initial-scale=1, maximum-scale=3">
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
@page{size:A4;margin:0;}
html,body{font-family:Helvetica,Arial,sans-serif;color:${C.textDark};background:${C.white};}
.page{width:595pt;min-height:841pt;position:relative;}
${css}
</style></head><body><div class="page">${body}</div></body></html>`;
}
