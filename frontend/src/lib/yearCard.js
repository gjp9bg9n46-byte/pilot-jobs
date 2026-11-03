// "Your year in the sky" share cards, drawn on a canvas at a fixed size.
//
// Same approach as the PF/PM card: the canvas is CREATED at 1080×1920 or
// 1080×1350, so the phone, the viewport and the device pixel ratio have no
// vote in what comes out. A screenshot would carry all three.
//
// The Moon line is the headline. It is the one figure on the card nobody
// computes for themselves, and it is why the card gets posted.
//
// No crew names appear here, by construction: the payload has none.

const NAVY = '#003F88';
const INK = '#0F1B2D';
const SUB = '#4A5668';
const FAINT = '#8592A3';
const LINE = '#E3E8EF';
const PAGE = '#FFFFFF';

export const STORY = { w: 1080, h: 1920 };
export const FEED = { w: 1080, h: 1350 };

/** Webfonts must be in before anything is measured, or the layout shifts. */
export async function waitForFonts() {
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all([
      document.fonts?.load('600 100px Fraunces'),
      document.fonts?.load('400 40px Inter'),
      document.fonts?.load('500 40px "JetBrains Mono"'),
    ].filter(Boolean));
  } catch { /* a system serif is a worse card, not a broken one */ }
}

function roundRect(x, px, py, w, h, r) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

/** Wrap to a width, returning the lines. Never breaks mid-word. */
function wrap(x, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (x.measureText(next).width <= maxW || !line) line = next;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

const num = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US') : '—');
const num1 = (n) => (Number.isFinite(Number(n))
  ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—');

/**
 * The rows under the headline. Story gets more room, so it gets more of them.
 * Anything missing is dropped rather than printed as a dash — a share card is
 * not a form.
 */
export function cardRows(y, size) {
  const all = [
    ['Hours', num1(y.hours)],
    ['Sectors', num(y.sectors)],
    ['Airports · countries', `${num(y.places?.airportCount)} · ${num(y.places?.countryCount)}`],
    ['Longest leg', y.distance?.longest ? `${y.distance.longest.from}–${y.distance.longest.to}` : null],
    ['Favourite tail', y.favouriteTail?.registration || null],
    ['Sunrises', y.sun?.sunrises != null ? num(y.sun.sunrises) : null],
    ['At night', y.night?.percent != null ? `${y.night.percent}%` : null],
  ].filter(([, v]) => v != null && v !== '—');
  return size === STORY ? all : all.slice(0, 4);
}

/**
 * Draw the card. `size` is STORY or FEED.
 * Returns the canvas; pass it to cardBlob() for a PNG.
 */
export async function renderYearCard(year, size = STORY) {
  await waitForFonts();
  const { w, h } = size;
  const story = size === STORY;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const x = canvas.getContext('2d');

  x.fillStyle = PAGE; x.fillRect(0, 0, w, h);
  // A navy band at the top, the one piece of brand furniture.
  x.fillStyle = NAVY; x.fillRect(0, 0, w, 14);

  const pad = 86;
  const maxW = w - pad * 2;
  let yPos = story ? 190 : 150;

  // Eyebrow
  x.fillStyle = NAVY;
  x.font = '500 34px "JetBrains Mono", monospace';
  x.textAlign = 'left';
  x.fillText(`${year.year} · YEAR IN THE SKY`, pad, yPos);
  yPos += story ? 110 : 92;

  // ── The headline: the Moon line ──────────────────────────────────────────
  const headSize = story ? 104 : 86;
  x.fillStyle = INK;
  x.font = `600 ${headSize}px Fraunces, Georgia, serif`;
  const headLines = wrap(x, `${year.distance?.moonPhrase || 'A year of flying'}.`, maxW);
  for (const line of headLines) { x.fillText(line, pad, yPos); yPos += headSize * 1.1; }

  // The distance that earns the headline
  yPos += story ? 26 : 18;
  x.fillStyle = SUB;
  x.font = `400 ${story ? 40 : 36}px Inter, system-ui, sans-serif`;
  const sub = `${num(year.distance?.km)} km flown — ${num1(year.distance?.earthLaps)} times around the Earth.`;
  for (const line of wrap(x, sub, maxW)) { x.fillText(line, pad, yPos); yPos += (story ? 40 : 36) * 1.45; }

  // ── The rows ─────────────────────────────────────────────────────────────
  const rows = cardRows(year, size);
  const footH = story ? 210 : 180;
  const zoneTop = yPos + (story ? 54 : 36);
  const zoneBottom = h - footH;
  const rowH = Math.min(story ? 112 : 96, Math.max(68, (zoneBottom - zoneTop) / Math.max(1, rows.length)));
  // Centre the block in its zone. Top-aligned, a short list leaves a dead
  // band above the footer that reads as a mistake in a feed.
  let ry = zoneTop + Math.max(0, (zoneBottom - zoneTop - rows.length * rowH) / 2);
  for (const [k, v] of rows) {
    x.fillStyle = FAINT;
    x.font = `400 ${story ? 32 : 29}px Inter, system-ui, sans-serif`;
    x.textAlign = 'left';
    x.fillText(k, pad, ry + rowH * 0.42);
    x.fillStyle = INK;
    x.font = `500 ${story ? 46 : 42}px "JetBrains Mono", monospace`;
    x.textAlign = 'right';
    x.fillText(String(v), w - pad, ry + rowH * 0.42);
    x.strokeStyle = LINE; x.lineWidth = 2;
    x.beginPath(); x.moveTo(pad, ry + rowH * 0.72); x.lineTo(w - pad, ry + rowH * 0.72); x.stroke();
    ry += rowH;
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  x.textAlign = 'center';
  x.strokeStyle = LINE; x.lineWidth = 2;
  x.beginPath(); x.moveTo(pad, h - footH + (story ? 50 : 40)); x.lineTo(w - pad, h - footH + (story ? 50 : 40)); x.stroke();
  x.fillStyle = INK;
  x.font = `600 ${story ? 52 : 48}px Fraunces, Georgia, serif`;
  x.fillText('CockpitHire', w / 2, h - footH + (story ? 130 : 112));
  x.fillStyle = FAINT;
  x.font = `400 ${story ? 30 : 28}px Inter, system-ui, sans-serif`;
  x.fillText('Pilot jobs you qualify for · cockpithire.com', w / 2, h - footH + (story ? 180 : 156));

  // Keep roundRect referenced: the rows are rules today, boxes if that changes.
  void roundRect;
  return canvas;
}

export function cardBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
