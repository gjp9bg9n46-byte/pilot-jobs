// "Your year in the sky" share card, drawn in an off-screen WebView.
//
// Same approach as the PF/PM card: a canvas CREATED at 1080×1920 or
// 1080×1350, so the phone and its pixel ratio have no vote in what comes out,
// and no react-native-view-shot dependency. The drawing below mirrors
// frontend/src/lib/yearCard.js line for line — a card posted from the app and
// one posted from the web must look the same.
//
// NOTE: everything inside the template literal below uses plain string
// concatenation, never a dollar-brace. This whole document IS a template
// literal, and an interpolation here would be evaluated by TypeScript before
// the browser ever saw it.

type Any = any;

export const STORY = { w: 1080, h: 1920 };
export const FEED = { w: 1080, h: 1350 };

export function yearCardHtml(year: Any, size: { w: number; h: number }): string {
  const data = JSON.stringify({ y: year, w: size.w, h: size.h, story: size.h === STORY.h })
    .replace(/</g, '\\u003c');
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Fraunces:opsz,wght@9..144,600&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet" />
<style>html,body{margin:0;padding:0;background:#fff}canvas{display:none}</style>
</head><body>
<canvas id="c" width="${size.w}" height="${size.h}"></canvas>
<script>
(function () {
  var D = ${data};
  var Y = D.y, W = D.w, H = D.h, STORY = D.story;
  var NAVY = '#003F88', INK = '#0F1B2D', SUB = '#4A5668', FAINT = '#8592A3', LINE = '#E3E8EF';

  function post(m) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(m); }

  function num(n) {
    if (n === null || n === undefined || isNaN(Number(n))) return '\\u2014';
    return Number(n).toLocaleString('en-US');
  }
  function num1(n) {
    if (n === null || n === undefined || isNaN(Number(n))) return '\\u2014';
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  function wrap(x, text, maxW) {
    var words = String(text).split(/\\s+/).filter(Boolean);
    var lines = [], line = '';
    for (var i = 0; i < words.length; i++) {
      var next = line ? line + ' ' + words[i] : words[i];
      if (x.measureText(next).width <= maxW || !line) line = next;
      else { lines.push(line); line = words[i]; }
    }
    if (line) lines.push(line);
    return lines;
  }

  function rows() {
    var all = [];
    all.push(['Hours', num1(Y.hours)]);
    all.push(['Sectors', num(Y.sectors)]);
    if (Y.places) all.push(['Airports \\u00b7 countries', num(Y.places.airportCount) + ' \\u00b7 ' + num(Y.places.countryCount)]);
    if (Y.distance && Y.distance.longest) all.push(['Longest leg', Y.distance.longest.from + '\\u2013' + Y.distance.longest.to]);
    if (Y.favouriteTail) all.push(['Favourite tail', Y.favouriteTail.registration]);
    if (Y.sun && Y.sun.sunrises != null) all.push(['Sunrises', num(Y.sun.sunrises)]);
    if (Y.night && Y.night.percent != null) all.push(['At night', Y.night.percent + '%']);
    return STORY ? all : all.slice(0, 4);
  }

  function draw() {
    var c = document.getElementById('c');
    var x = c.getContext('2d');
    x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H);
    x.fillStyle = NAVY; x.fillRect(0, 0, W, 14);

    var pad = 86, maxW = W - pad * 2;
    var y = STORY ? 190 : 150;

    x.fillStyle = NAVY;
    x.font = '500 34px "JetBrains Mono", monospace';
    x.textAlign = 'left';
    x.fillText(Y.year + ' \\u00b7 YEAR IN THE SKY', pad, y);
    y += STORY ? 110 : 92;

    var headSize = STORY ? 104 : 86;
    x.fillStyle = INK;
    x.font = '600 ' + headSize + 'px Fraunces, Georgia, serif';
    var moon = (Y.distance && Y.distance.moonPhrase) ? Y.distance.moonPhrase : 'A year of flying';
    var head = wrap(x, moon + '.', maxW);
    for (var i = 0; i < head.length; i++) { x.fillText(head[i], pad, y); y += headSize * 1.1; }

    y += STORY ? 26 : 18;
    x.fillStyle = SUB;
    var subSize = STORY ? 40 : 36;
    x.font = '400 ' + subSize + 'px Inter, system-ui, sans-serif';
    var km = Y.distance ? Y.distance.km : null;
    var laps = Y.distance ? Y.distance.earthLaps : null;
    var sub = num(km) + ' km flown \\u2014 ' + num1(laps) + ' times around the Earth.';
    var subL = wrap(x, sub, maxW);
    for (var j = 0; j < subL.length; j++) { x.fillText(subL[j], pad, y); y += subSize * 1.45; }

    var rs = rows();
    var footH = STORY ? 210 : 180;
    var zoneTop = y + (STORY ? 54 : 36);
    var zoneBottom = H - footH;
    var rowH = Math.min(STORY ? 112 : 96, Math.max(68, (zoneBottom - zoneTop) / Math.max(1, rs.length)));
    // Centre the block in its zone, exactly as the web card does.
    var ry = zoneTop + Math.max(0, (zoneBottom - zoneTop - rs.length * rowH) / 2);
    for (var k = 0; k < rs.length; k++) {
      x.fillStyle = FAINT;
      x.font = '400 ' + (STORY ? 32 : 29) + 'px Inter, system-ui, sans-serif';
      x.textAlign = 'left';
      x.fillText(rs[k][0], pad, ry + rowH * 0.42);
      x.fillStyle = INK;
      x.font = '500 ' + (STORY ? 46 : 42) + 'px "JetBrains Mono", monospace';
      x.textAlign = 'right';
      x.fillText(String(rs[k][1]), W - pad, ry + rowH * 0.42);
      x.strokeStyle = LINE; x.lineWidth = 2;
      x.beginPath(); x.moveTo(pad, ry + rowH * 0.72); x.lineTo(W - pad, ry + rowH * 0.72); x.stroke();
      ry += rowH;
    }

    x.textAlign = 'center';
    x.strokeStyle = LINE; x.lineWidth = 2;
    x.beginPath(); x.moveTo(pad, H - footH + (STORY ? 50 : 40)); x.lineTo(W - pad, H - footH + (STORY ? 50 : 40)); x.stroke();
    x.fillStyle = INK;
    x.font = '600 ' + (STORY ? 52 : 48) + 'px Fraunces, Georgia, serif';
    x.fillText('CockpitHire', W / 2, H - footH + (STORY ? 130 : 112));
    x.fillStyle = FAINT;
    x.font = '400 ' + (STORY ? 30 : 28) + 'px Inter, system-ui, sans-serif';
    x.fillText('Pilot jobs you qualify for \\u00b7 cockpithire.com', W / 2, H - footH + (STORY ? 180 : 156));

    post(c.toDataURL('image/png'));
  }

  // Fonts first: measuring before they land lays the card out with a fallback.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { setTimeout(draw, 60); }).catch(function () { draw(); });
  } else { setTimeout(draw, 300); }
})();
</script>
</body></html>`;
}
