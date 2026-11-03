// The share card. Always 1080×1350 (Instagram portrait), whatever drew it —
// the canvas is created at that size, so the device, the viewport and the
// device-pixel-ratio have no say in it.
//
// Drawn on a canvas rather than screenshotted, because a screenshot of the
// page would inherit the phone's width and the browser's font rendering.

export const CARD_W = 1080;
export const CARD_H = 1350;

const NAVY = '#0B1F3A';
const ACCENT = '#003F88';
const INK = '#0F1B2D';
const MUTED = '#4A5668';
const LINE = '#E3E8EF';
const BG = '#F5F7FA';

// Fraunces/Inter come from the Google Fonts link in index.html. If they have
// not finished loading the canvas would silently fall back to a system face,
// so wait for them and name explicit fallbacks either way.
export async function waitForFonts() {
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    if (document.fonts?.load) {
      await Promise.all([
        document.fonts.load('600 64px Fraunces'),
        document.fonts.load('700 38px Inter'),
        document.fonts.load('500 30px "JetBrains Mono"'),
      ]);
    }
  } catch { /* a fallback face is better than no card */ }
}

export async function renderCard(legs, { alternate = false } = {}) {
  await waitForFonts();
  const c = document.createElement('canvas');
  c.width = CARD_W;
  c.height = CARD_H;
  const x = c.getContext('2d');

  x.fillStyle = BG;
  x.fillRect(0, 0, CARD_W, CARD_H);

  // A single navy rule at the top — the only ornament on the card.
  x.fillStyle = ACCENT;
  x.fillRect(0, 0, CARD_W, 10);

  x.textBaseline = 'alphabetic';

  // Heading
  x.fillStyle = INK;
  x.font = '600 76px Fraunces, Georgia, serif';
  x.textAlign = 'center';
  x.fillText('Who’s flying today?', CARD_W / 2, 190);

  x.fillStyle = MUTED;
  x.font = '400 32px Inter, system-ui, sans-serif';
  x.fillText(alternate ? 'Decided by the dial · alternating legs' : 'Decided by the dial', CARD_W / 2, 248);

  // Legs.
  //
  // The box height is derived from what goes IN it, not guessed: the first
  // version used a fixed row height and the PM line fell out of the bottom.
  // Two layouts, picked by how many legs there are, and each one's height is
  // the height its lines actually need:
  //   roomy   (1–3 legs) — sector / PF / PM on three lines
  //   compact (4–6 legs) — sector / "PF … · PM …" on two
  // Six compact rows still fit the zone, so nothing ever overruns the footer.
  const n = legs.length;
  const roomy = n <= 3;
  const boxH = roomy ? 168 : 118;
  const gap = 18;
  const zoneTop = 300;
  const zoneBottom = CARD_H - 190;
  const block = n * boxH + (n - 1) * gap;
  const top = zoneTop + Math.max(0, (zoneBottom - zoneTop - block) / 2);
  const boxPad = 56;
  const innerW = CARD_W - boxPad * 2 - 76;

  legs.forEach((leg, i) => {
    const y = top + i * (boxH + gap);
    x.fillStyle = '#FFFFFF';
    roundRect(x, boxPad, y, CARD_W - boxPad * 2, boxH, 14);
    x.fill();
    x.strokeStyle = LINE;
    x.lineWidth = 2;
    x.stroke();

    x.textAlign = 'left';
    const lx = boxPad + 38;

    if (roomy) {
      let ly = y + (leg.sector ? 50 : 72);
      if (leg.sector) {
        x.fillStyle = NAVY;
        x.font = '500 32px "JetBrains Mono", ui-monospace, monospace';
        x.fillText(leg.sector, lx, ly);
        ly += 48;
      }
      x.fillStyle = ACCENT;
      x.font = '700 38px Inter, system-ui, sans-serif';
      x.fillText('PF ', lx, ly);
      const pfW = x.measureText('PF ').width;
      x.fillStyle = INK;
      x.fillText(fit(x, leg.pfName, innerW - pfW), lx + pfW, ly);

      ly += 44;
      x.fillStyle = MUTED;
      x.font = '500 30px Inter, system-ui, sans-serif';
      x.fillText(`PM ${fit(x, leg.pmName, innerW - 70)}`, lx, ly);
      return;
    }

    let ly = y + (leg.sector ? 46 : 68);
    if (leg.sector) {
      x.fillStyle = NAVY;
      x.font = '500 27px "JetBrains Mono", ui-monospace, monospace';
      x.fillText(leg.sector, lx, ly);
      ly += 40;
    }
    x.fillStyle = ACCENT;
    x.font = '700 30px Inter, system-ui, sans-serif';
    x.fillText('PF ', lx, ly);
    let cx = lx + x.measureText('PF ').width;
    x.fillStyle = INK;
    const pfName = fit(x, leg.pfName, innerW * 0.45);
    x.fillText(pfName, cx, ly);
    cx += x.measureText(pfName).width;
    x.fillStyle = MUTED;
    x.font = '500 28px Inter, system-ui, sans-serif';
    x.fillText(`  ·  PM ${fit(x, leg.pmName, innerW * 0.4)}`, cx, ly);
  });

  // Footer — small branding, no logo file needed (the wordmark IS the brand).
  x.textAlign = 'center';
  x.fillStyle = INK;
  x.font = '600 44px Fraunces, Georgia, serif';
  x.fillText('CockpitHire', CARD_W / 2, CARD_H - 112);
  x.fillStyle = MUTED;
  x.font = '400 28px Inter, system-ui, sans-serif';
  x.fillText('Pilot jobs you qualify for · cockpithire.com', CARD_W / 2, CARD_H - 64);

  return c;
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

// Long names are shortened to fit the card rather than running off it.
function fit(x, text, maxW) {
  let t = String(text || '');
  if (x.measureText(t).width <= maxW) return t;
  while (t.length > 1 && x.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

export function cardBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
