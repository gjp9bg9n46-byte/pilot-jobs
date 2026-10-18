// Shared reading of an airline's stored facts — the app's half of
// frontend/src/lib/airlineFacts.js. Kept small and identical on purpose.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
export type Stage = { title: string; points: string[] };
export type PayRow = { key: string; label: string; value: string; currency: string | null; period: string | null };
export type FleetRow = { type: string; inService: number | null; ordered: number | null };

// and what is simply not recorded. Mirrored in mobile/src/lib/airlineFacts.ts.

// interviewStages is a flat array that mixes stage headings with their own
// bullet points ("Stage 2 — Online Video Interview", "* Personal
// introduction", …). Rendered as one row each they ran together; grouped, they
// read as the process they describe.
export function parseStages(stages?: string[] | null): Stage[] {
  const lines: string[] = [];
  for (const raw of stages || []) {
    const line = String(raw || '').trim();
    if (!line) continue;
    // Some airlines store the whole process as one arrow-separated sentence
    // ("Online application → COMPASS test → HireVue → sim check"). Split it so
    // each stage gets its own numbered row instead of one run-on paragraph.
    if (!/^[*•\-–]/.test(line) && /\s(?:→|->|›|»)\s/.test(line)) {
      line.split(/\s(?:→|->|›|»)\s/).map((p) => p.trim()).filter(Boolean).forEach((p) => lines.push(p));
    } else {
      lines.push(line);
    }
  }
  const out: Stage[] = [];
  for (const line of lines) {
    const bullet = /^[*•\-–]\s*/.test(line);
    const heading = /^stage\s*\d+/i.test(line) || /^\d+[.)]\s/.test(line);
    const text = line.replace(/^[*•\-–]\s*/, '').replace(/^stage\s*\d+\s*[—:-]?\s*/i, '').trim();
    if (!text) continue;
    if (bullet && out.length) out[out.length - 1].points.push(text);
    else if (heading || !out.length || !bullet) out.push({ title: text, points: [] });
  }
  return out;
}

const PERIOD: Record<string, string> = { month: 'monthly', monthly: 'monthly' };

// Pay as it was actually recorded — never converted, never relabelled.
export function readPay(payRanges: Any): PayRow[] {
  const p = payRanges || {};
  const rows: PayRow[] = [];
  for (const [key, label] of [['captain', 'Captain'], ['fo', 'First Officer']]) {
    const v = p[key];
    if (!v || (v.min == null && v.max == null)) continue;
    rows.push({
      key,
      label,
      value: [v.min, v.max].filter((n: number | null) => n != null).map((n: number) => Number(n).toLocaleString('en-GB')).join(' – '),
      currency: v.currency === 'EURO' ? 'EUR' : (v.currency || null),
      period: PERIOD[String(v.period || '').toLowerCase()]
        || (/^(annual|yearly|year|per year)$/i.test(String(v.period || '')) ? 'annual' : (v.period || null)),
    });
  }
  return rows;
}

export function fleetRows(airline: Any): FleetRow[] {
  const detail = Array.isArray(airline.fleetDetail) ? airline.fleetDetail : null;
  if (detail && detail.length) {
    return detail
      .filter((f: Any) => f && f.type)
      .map((f: Any) => ({ type: f.type, inService: f.inService ?? null, ordered: f.ordered ?? null }));
  }
  // Fall back to the plain list when nobody has recorded the numbers yet.
  return (airline.fleet || []).map((type: string) => ({ type, inService: null, ordered: null }));
}

export function aircraftTotal(airline: Any): number | null {
  const detail = Array.isArray(airline.fleetDetail) ? airline.fleetDetail : [];
  const sum = detail.reduce((n: number, f: Any) => n + (Number(f?.inService) || 0), 0);
  return sum > 0 ? sum : null;
}

const CONTRACT: Record<string, string> = {
  PERMANENT: 'Permanent, direct', FIXED_TERM: 'Fixed term', AGENCY: 'Through an agency',
  PAY_TO_FLY: 'Pay to fly', MIXED: 'Mixed',
};
export const contractLabel = (c?: string | null): string | null => (c ? CONTRACT[c] || null : null);

export function upgradeLabel(min?: number | null, max?: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${min} – ${max} years`;
  return `${min ?? max} years${min == null ? ' or less' : ' or more'}`;
}

// What nobody has recorded yet. Listed once, in place of empty rows.
export function missingFacts(airline: Any): string[] {
  const pay = readPay(airline.payRanges);
  const checks = [
    [pay.length === 0, 'pay'],
    [!(airline.bases || []).length, 'bases'],
    [!airline.contractType, 'contract type'],
    [!airline.rosterPattern, 'roster'],
    [airline.upgradeTimeMinYears == null && airline.upgradeTimeMaxYears == null, 'upgrade to Captain'],
    [!(airline.interviewStages || []).length, 'hiring process'],
    [!airline.simType, 'simulator type'],
    [airline.avgResponseDays == null, 'reply time'],
    [!(airline.workAuthRequired || []).length, 'work permit rules'],
    [!fleetRows(airline).length, 'fleet'],
  ];
  return checks.filter(([missing]) => missing).map(([, name]) => name as string);
}

// Fleet names as a pilot says them: "Airbus A380-800" is an A380, "Boeing
// 777-300ER" a B777. The card has one line for this, so the long stored names
// are shortened and de-duplicated rather than wrapped over three lines.
export function shortFleet(fleet?: string[] | null, max = 3): string {
  const seen: string[] = [];
  for (const raw of fleet || []) {
    const t = String(raw || '').trim();
    if (!t) continue;
    const maker = /^airbus/i.test(t) ? 'A' : /^boeing/i.test(t) ? 'B' : null;
    let s = t.replace(/^(airbus|boeing|embraer|bombardier|atr|mcdonnell douglas|de havilland)\s+/i, '');
    const num = s.match(/^([AB])?\s?(\d{3})/i);
    const letter = num && (num[1] || maker);
    if (num && letter) {
      // "Airbus A380-800" → A380, "Boeing 777-300ER" → B777.
      s = `${letter.toUpperCase()}${num[2]}`;
    } else {
      // Everything else keeps its maker and model: "Embraer 190", "Phenom 300".
      s = t.replace(/\s*\(.*\)\s*$/, '').trim();
    }
    if (s && !seen.includes(s)) seen.push(s);
    if (seen.length >= max) break;
  }
  return seen.join(', ');
}
