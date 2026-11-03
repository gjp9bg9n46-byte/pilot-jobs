// The share card for mobile — always 1080×1350 (Instagram portrait).
//
// Drawn on a canvas inside an off-screen WebView rather than screenshotted
// from the screen, for one reason: a screenshot inherits the phone's width and
// pixel ratio, so an SE and a Pro Max would produce different images. A canvas
// created at 1080×1350 produces the same file on every device.
//
// This mirrors frontend/src/lib/pfpmCard.js. The two are deliberately the same
// drawing, so a card shared from the app and one shared from the web look
// identical in a feed.
import type { Leg } from './pfpm';

export const CARD_W = 1080;
export const CARD_H = 1350;

export function cardHtml(legs: Leg[], alternate: boolean): string {
  const data = JSON.stringify({ legs, alternate }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Fraunces:opsz,wght@9..144,600&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet" />
<style>html,body{margin:0;padding:0;background:#fff}canvas{display:none}</style>
</head><body>
<canvas id="c" width="${CARD_W}" height="${CARD_H}"></canvas>
<script>
(function () {
  var D = ${data};
  var W = ${CARD_W}, H = ${CARD_H};
  var NAVY = '#0B1F3A', ACCENT = '#003F88', INK = '#0F1B2D', MUTED = '#4A5668', LINE = '#E3E8EF', BG = '#F5F7FA';

  function post(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
  }
  function roundRect(x, px, py, w, h, r) {
    x.beginPath(); x.moveTo(px + r, py);
    x.arcTo(px + w, py, px + w, py + h, r);
    x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r);
    x.arcTo(px, py, px + w, py, r);
    x.closePath();
  }
  function fit(x, text, maxW) {
    var t = String(text || '');
    if (x.measureText(t).width <= maxW) return t;
    while (t.length > 1 && x.measureText(t + '\\u2026').width > maxW) t = t.slice(0, -1);
    return t + '\\u2026';
  }

  function draw() {
    try {
      var c = document.getElementById('c');
      var x = c.getContext('2d');
      x.fillStyle = BG; x.fillRect(0, 0, W, H);
      x.fillStyle = ACCENT; x.fillRect(0, 0, W, 10);
      x.textBaseline = 'alphabetic';

      x.fillStyle = INK;
      x.font = '600 76px Fraunces, Georgia, serif';
      x.textAlign = 'center';
      x.fillText('Who\\u2019s flying today?', W / 2, 190);

      x.fillStyle = MUTED;
      x.font = '400 32px Inter, system-ui, sans-serif';
      x.fillText(D.alternate ? 'Decided by the dial \\u00b7 alternating legs' : 'Decided by the dial', W / 2, 248);

      // Layout mirrors frontend/src/lib/pfpmCard.js exactly — the two cards
      // must be the same drawing. The box height comes from the lines that go
      // in it: roomy (1-3 legs) is three lines, compact (4-6) is two, and six
      // compact rows still clear the footer.
      // NOTE: plain concatenation, no template literals — this whole file is
      // itself inside a template literal, and a dollar-brace here would be
      // interpolated by TypeScript before it ever reached the browser.
      var n = D.legs.length;
      var roomy = n <= 3;
      var boxH = roomy ? 168 : 118;
      var gap = 18, pad = 56;
      var zoneTop = 300, zoneBottom = H - 190;
      var block = n * boxH + (n - 1) * gap;
      var top = zoneTop + Math.max(0, (zoneBottom - zoneTop - block) / 2);
      var innerW = W - pad * 2 - 76;

      D.legs.forEach(function (leg, i) {
        var y = top + i * (boxH + gap);
        x.fillStyle = '#FFFFFF';
        roundRect(x, pad, y, W - pad * 2, boxH, 14);
        x.fill(); x.strokeStyle = LINE; x.lineWidth = 2; x.stroke();

        x.textAlign = 'left';
        var lx = pad + 38, ly;

        if (roomy) {
          ly = y + (leg.sector ? 50 : 72);
          if (leg.sector) {
            x.fillStyle = NAVY;
            x.font = '500 32px "JetBrains Mono", ui-monospace, monospace';
            x.fillText(leg.sector, lx, ly);
            ly += 48;
          }
          x.fillStyle = ACCENT;
          x.font = '700 38px Inter, system-ui, sans-serif';
          x.fillText('PF ', lx, ly);
          var pfW = x.measureText('PF ').width;
          x.fillStyle = INK;
          x.fillText(fit(x, leg.pfName, innerW - pfW), lx + pfW, ly);

          ly += 44;
          x.fillStyle = MUTED;
          x.font = '500 30px Inter, system-ui, sans-serif';
          x.fillText('PM ' + fit(x, leg.pmName, innerW - 70), lx, ly);
          return;
        }

        ly = y + (leg.sector ? 46 : 68);
        if (leg.sector) {
          x.fillStyle = NAVY;
          x.font = '500 27px "JetBrains Mono", ui-monospace, monospace';
          x.fillText(leg.sector, lx, ly);
          ly += 40;
        }
        x.fillStyle = ACCENT;
        x.font = '700 30px Inter, system-ui, sans-serif';
        x.fillText('PF ', lx, ly);
        var cx = lx + x.measureText('PF ').width;
        x.fillStyle = INK;
        var pfName = fit(x, leg.pfName, innerW * 0.45);
        x.fillText(pfName, cx, ly);
        cx += x.measureText(pfName).width;
        x.fillStyle = MUTED;
        x.font = '500 28px Inter, system-ui, sans-serif';
        x.fillText('  \u00b7  PM ' + fit(x, leg.pmName, innerW * 0.4), cx, ly);
      });

      x.textAlign = 'center';
      x.fillStyle = INK;
      x.font = '600 44px Fraunces, Georgia, serif';
      x.fillText('CockpitHire', W / 2, H - 112);
      x.fillStyle = MUTED;
      x.font = '400 28px Inter, system-ui, sans-serif';
      x.fillText('Pilot jobs you qualify for \\u00b7 cockpithire.com', W / 2, H - 64);

      post(c.toDataURL('image/png'));
    } catch (e) {
      post('ERROR:' + (e && e.message ? e.message : 'draw failed'));
    }
  }

  // Without the webfonts the card would silently fall back to a system face,
  // so wait for them — but never hang: a plain-font card beats no card.
  var done = false;
  function once() { if (!done) { done = true; draw(); } }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(once).catch(once);
  }
  setTimeout(once, 2500);
}());
</script>
</body></html>`;
}
