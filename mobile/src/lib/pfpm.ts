// PF / PM decision logic — the mobile half of frontend/src/lib/pfpm.js.
// Kept pure and free of any expo import on purpose: the test runs under plain
// node, and the CSPRNG is handed in by the screen (expo-crypto there,
// crypto.getRandomValues on the web).

export const DEFAULT_NAMES = ['Captain', 'First Officer'];
export const MAX_SECTORS = 6;

export type Leg = {
  sector: string;
  pf: 0 | 1;
  pm: 0 | 1;
  pfName: string;
  pmName: string;
};

export type RandomBit = () => number;

// "cai-mxp" / "CAI MXP" / "CAI to MXP" all mean the same sector. Display uses
// an en dash, the typographic convention for a route pair.
export function normaliseSector(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const parts = s.split(/\s*(?:[-–—/]|\bto\b)\s*/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return s.toUpperCase();
  return parts.map((p) => p.toUpperCase()).join('–');
}

/**
 * alternate=false — every leg is its own independent coin.
 * alternate=true  — ONE coin decides leg 1, then the roles swap each leg after
 *                   it. Deliberately predictable after the first leg: that is
 *                   the real-world convention, not a weaker random.
 */
export function decide({
  names, sectors, alternate, randomBit,
}: {
  names: string[]; sectors: string[]; alternate: boolean; randomBit: RandomBit;
}): Leg[] {
  const legs = (sectors && sectors.length ? sectors : ['']).slice(0, MAX_SECTORS);
  const first = (randomBit() & 1) as 0 | 1;
  return legs.map((sector, i) => {
    const pf = (alternate ? (first + i) % 2 : randomBit() & 1) as 0 | 1;
    const pm = (pf === 0 ? 1 : 0) as 0 | 1;
    return { sector, pf, pm, pfName: names[pf], pmName: names[pm] };
  });
}

export function formatLeg(leg: Leg): string {
  const body = `PF ${leg.pfName} · PM ${leg.pmName}`;
  return leg.sector ? `${leg.sector}: ${body}` : body;
}

export function formatAll(legs: Leg[]): string {
  return legs.map(formatLeg).join('\n');
}
