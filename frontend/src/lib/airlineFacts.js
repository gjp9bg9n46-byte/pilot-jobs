// Shared reading of an airline's stored facts: what a fact is, how it reads,
// and what is simply not recorded. Mirrored in mobile/src/lib/airlineFacts.ts.

// interviewStages is a flat array that mixes stage headings with their own
// bullet points ("Stage 2 — Online Video Interview", "* Personal
// introduction", …). Rendered as one row each they ran together; grouped, they
// read as the process they describe.
export function parseStages(stages) {
  const lines = [];
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
  const out = [];
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

const PERIOD = { month: 'monthly', monthly: 'monthly' };

// Pay as it was actually recorded — never converted, never relabelled.
// Pay exactly as it was recorded — the period is never divided, the figure
// never rewritten. A non-USD row additionally carries a dated conversion, so a
// pilot can compare it with the rest without us pretending it was in dollars.
export function readPay(payRanges) {
  const p = payRanges || {};
  const rows = [];
  for (const [key, label] of [['captain', 'Captain'], ['fo', 'First Officer']]) {
    const v = p[key];
    if (!v || (v.min == null && v.max == null)) continue;
    const currency = v.currency === 'EURO' ? 'EUR' : (v.currency || null);
    const period = PERIOD[String(v.period || '').toLowerCase()]
      || (/^(annual|yearly|year|per year)$/i.test(String(v.period || '')) ? 'annual' : (v.period || null));
    const per = period === 'monthly' ? '/ month' : period === 'annual' ? '/ year' : (period ? `/ ${period}` : '');
    const usdMin = toUsdRounded(v.min, currency);
    const usdMax = toUsdRounded(v.max, currency);
    const isUsd = String(currency || '').toUpperCase() === 'USD';
    rows.push({
      key,
      label,
      period,
      currency,
      // What the airline actually pays, in its own currency.
      recorded: `${range(v.min, v.max, currency)}${per ? ` ${per}` : ''}`,
      // The dollar estimate, only where a conversion was needed.
      usd: isUsd || (usdMin == null && usdMax == null)
        ? null
        : `\u2248 ${range(usdMin, usdMax, 'USD')}${per ? ` ${per}` : ''}`,
      convertedAt: isUsd ? null : fxDateLabel(),
      // Kept for the old callers that printed a bare range.
      value: range(v.min, v.max, currency),
    });
  }
  return rows;
}

export function fleetRows(airline) {
  const detail = Array.isArray(airline.fleetDetail) ? airline.fleetDetail : null;
  if (detail && detail.length) {
    return detail
      .filter((f) => f && f.type)
      .map((f) => ({ type: f.type, inService: f.inService ?? null, ordered: f.ordered ?? null }));
  }
  // Fall back to the plain list when nobody has recorded the numbers yet.
  return (airline.fleet || []).map((type) => ({ type, inService: null, ordered: null }));
}

export function aircraftTotal(airline) {
  const detail = Array.isArray(airline.fleetDetail) ? airline.fleetDetail : [];
  const sum = detail.reduce((n, f) => n + (Number(f?.inService) || 0), 0);
  return sum > 0 ? sum : null;
}

const CONTRACT = {
  PERMANENT: 'Permanent, direct', FIXED_TERM: 'Fixed term', AGENCY: 'Through an agency',
  PAY_TO_FLY: 'Pay to fly', MIXED: 'Mixed',
};
export const contractLabel = (c) => CONTRACT[c] || null;

export function upgradeLabel(min, max) {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${min} – ${max} years`;
  return `${min ?? max} years${min == null ? ' or less' : ' or more'}`;
}

// What nobody has recorded yet. Listed once, in place of empty rows.
export function missingFacts(airline) {
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
  return checks.filter(([missing]) => missing).map(([, name]) => name);
}

// Fleet names as a pilot says them: "Airbus A380-800" is an A380, "Boeing
// 777-300ER" a B777. The card has one line for this, so the long stored names
// are shortened and de-duplicated rather than wrapped over three lines.
export function shortFleet(fleet, max = 3) {
  const seen = [];
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

// ── Currency ───────────────────────────────────────────────────────────────
// One fixed, dated rate table, stored here rather than fetched: a pay figure
// that moves on its own would make two pilots reading the same fact file
// disagree, and a live rate cannot be shown with the date it was true. Update
// the table and the date together; the UI always prints the date it used.
export const FX = {
  asOf: '2026-10-18',
  // 1 unit of the currency, in US dollars.
  toUsd: { USD: 1, EUR: 1.08, EURO: 1.08, GBP: 1.26, SGD: 0.74, AED: 0.27, SAR: 0.27, QAR: 0.27, CHF: 1.12, CAD: 0.72, AUD: 0.65 },
};

const SYMBOL = { USD: '$', EUR: '\u20ac', EURO: '\u20ac', GBP: '\u00a3', SGD: 'S$', AED: 'AED ', SAR: 'SAR ', QAR: 'QAR ', CHF: 'CHF ', CAD: 'C$', AUD: 'A$' };

export const fxDateLabel = () => new Date(`${FX.asOf}T00:00:00Z`)
  .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Rounded to the nearest 1,000: a converted figure is an estimate, and
// printing it to the dollar would dress it up as one.
const toUsdRounded = (n, currency) => {
  const rate = FX.toUsd[String(currency || '').toUpperCase()];
  if (!rate || n == null) return null;
  return Math.round((Number(n) * rate) / 1000) * 1000;
};

const money = (n, currency) => `${SYMBOL[String(currency || '').toUpperCase()] || ''}${Number(n).toLocaleString('en-GB')}`;
const range = (min, max, currency) => [min, max].filter((n) => n != null).map((n) => money(n, currency)).join(' – ');
