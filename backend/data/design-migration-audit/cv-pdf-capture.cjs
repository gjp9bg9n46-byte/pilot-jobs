/* Captures the CV Builder's actual rendered PDF (the iframe blob == the download
 * doc) for byte-diff gating. Usage:
 *   node cv-pdf-capture.cjs <outfile.pdf> [token]   (registers+seeds if no token) */
const puppeteer = require('puppeteer');
const fs = require('fs');
const crypto = require('crypto');
const BASE = 'https://cockpithire.com', API = `${BASE}/api`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PW = 'TestPass123!';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function jf(p, o = {}) { const r = await fetch(API + p, o); let b = null; try { b = await r.json(); } catch {} return { status: r.status, body: b }; }

(async () => {
  const outfile = process.argv[2];
  let token = process.argv[3];
  let email = null;

  if (!token) {
    email = `p13_${Date.now()}@example.com`;
    const reg = await jf('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW, firstName: 'Phase13', lastName: 'Pilot' }) });
    token = reg.body.token;
    const auth = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    // Seed deterministic CV content (frozen templates render from this)
    await jf('/cv', { method: 'PUT', headers: auth, body: JSON.stringify({
      summary: 'Airline transport pilot with 2,400+ hours across A320 and B737 fleets. EU and UK work authorisation.',
      skills: ['CRM', 'A320 Type Rating', 'Multi-crew'],
      education: [{ institution: 'Oxford Aviation', qualification: 'ATPL Integrated', year: '2019' }],
      languages: [{ name: 'English', level: 'Native' }],
      other: [],
      accentColor: '#722f37',
    }) });
    console.error(`Registered ${email}; token=${token}`);
  }

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('authToken', t), token);
    await page.goto(`${BASE}/cv`, { waitUntil: 'networkidle2' });

    // Wait for the preview iframe to have a blob URL
    let src = null;
    for (let i = 0; i < 60; i++) {
      src = await page.evaluate(() => { const f = document.querySelector('iframe[title="CV Preview"]'); return f && f.src && f.src.startsWith('blob:') ? f.src : null; });
      if (src) break;
      await sleep(500);
    }
    if (!src) throw new Error('preview iframe blob never appeared');
    await sleep(1500); // let any regeneration settle

    // Fetch the blob bytes in-page (same-origin blob), return base64
    const cleanUrl = src.replace('#toolbar=0', '');
    const b64 = await page.evaluate(async (url) => {
      const buf = await (await fetch(url)).arrayBuffer();
      const bytes = new Uint8Array(buf); let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    }, cleanUrl);
    const bytes = Buffer.from(b64, 'base64');
    fs.writeFileSync(outfile, bytes);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    console.error(`wrote ${outfile} (${bytes.length} bytes) sha256=${sha}`);
    console.log(JSON.stringify({ outfile, bytes: bytes.length, sha, token, email }));
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
