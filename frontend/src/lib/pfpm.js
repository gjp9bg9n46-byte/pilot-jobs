// PF / PM decision logic. Pure, and shared in spirit with mobile/src/lib/pfpm.ts
// (kept as two files because there is no shared package in this repo — if they
// ever disagree, this one is the reference).
//
// The randomness is INJECTED rather than imported, for two reasons: the two
// platforms have different CSPRNGs (crypto.getRandomValues / expo-crypto), and
// a test can hand in a known sequence and assert the outcome.

export const DEFAULT_NAMES = ['Captain', 'First Officer'];
export const MAX_SECTORS = 6;

// A fair coin from the platform CSPRNG. A uniform byte's low bit is uniform,
// so no modulo bias to correct for.
export function cryptoBit() {
  const b = new Uint8Array(1);
  crypto.getRandomValues(b);
  return b[0] & 1;
}

// "cai-mxp" / "CAI MXP" / "CAI to MXP" all mean the same sector. Display uses
// an en dash, which is the typographic convention for a route pair.
export function normaliseSector(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const parts = s.split(/\s*(?:[-–—/]|\bto\b)\s*/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return s.toUpperCase();
  return parts.map((p) => p.toUpperCase()).join('–');
}

/**
 * Decide PF/PM for each sector.
 *
 * alternate=false — every leg is its own independent coin.
 * alternate=true  — ONE coin decides leg 1, then the roles swap each leg
 *                   after it. This is the real-world convention, and it is
 *                   deliberately not "random per leg": the whole point is
 *                   that you can predict leg 2 once leg 1 is known.
 */
export function decide({ names, sectors, alternate, randomBit = cryptoBit }) {
  const legs = (sectors && sectors.length ? sectors : ['']).slice(0, MAX_SECTORS);
  const first = randomBit() & 1;
  return legs.map((sector, i) => {
    const pf = alternate ? (first + i) % 2 : (randomBit() & 1);
    const pm = pf === 0 ? 1 : 0;
    return { sector, pf, pm, pfName: names[pf], pmName: names[pm] };
  });
}

// "CAI–MXP: PF Captain · PM First Officer", or without the sector when the
// pilot never named one.
export function formatLeg(leg) {
  const body = `PF ${leg.pfName} · PM ${leg.pmName}`;
  return leg.sector ? `${leg.sector}: ${body}` : body;
}

export function formatAll(legs) {
  return legs.map(formatLeg).join('\n');
}
