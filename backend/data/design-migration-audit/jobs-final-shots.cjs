const puppeteer = require('puppeteer');
const BASE = 'https://cockpithire.com';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = '/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
async function api(path, opts = {}) {
  const res = await fetch(`${BASE}/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: res.status, json: j };
}
const waitContent = async (p) => { await p.waitForFunction(() => { const h = document.querySelector('h1'); return h && !/Loading job|Loading jobs/i.test(document.body.innerText); }, { timeout: 20000 }); await sleep(1500); };
(async () => {
  const email = `shots_${Date.now()}@example.com`; const password = 'Verify123!pw';
  const reg = await api('/auth/register', { method: 'POST', body: { email, password, firstName: 'Verify', lastName: 'Pilot', phone: '+10000000000', country: 'United States', city: 'Dallas' } });
  const token = reg.json?.token;
  const all = await api('/jobs?limit=50'); const job = all.json.jobs.find((j) => j.role) || all.json.jobs[0];
  const slugify = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const slug = `${slugify(job.company)}-${slugify(job.role || job.title)}-${job.id}`;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    // logged-out detail (c) — tall viewport, no fullPage
    const pc = await b.newPage(); await pc.setViewport({ width: 1280, height: 2200 });
    await pc.goto(`${BASE}/jobs/${slug}`, { waitUntil: 'networkidle2' }); await waitContent(pc);
    await pc.screenshot({ path: `${OUT}/jm-c-detail-loggedout.png` });
    console.log('  (c) signin-panel=', await pc.evaluate(() => /Sign in to see your match/i.test(document.body.innerText)));

    // mobile detail (d) 390px tall
    const pd = await b.newPage(); await pd.setViewport({ width: 390, height: 2600, isMobile: true });
    await pd.goto(`${BASE}/jobs/${slug}`, { waitUntil: 'networkidle2' }); await waitContent(pd);
    await pd.screenshot({ path: `${OUT}/jm-d-detail-mobile390.png` });
    console.log('  (d) noHScroll=', await pd.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2));

    // logged-in pages
    const p = await b.newPage(); await p.setViewport({ width: 1280, height: 2200 });
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await p.evaluate((t) => localStorage.setItem('authToken', t), token);

    // (b) logged-in detail
    await p.goto(`${BASE}/jobs/${slug}`, { waitUntil: 'networkidle2' }); await waitContent(p);
    await p.screenshot({ path: `${OUT}/jm-b-detail-loggedin.png` });
    console.log('  (b) YourMatch=', await p.evaluate(() => /Your Match/i.test(document.body.innerText)), (await p.evaluate(() => (document.body.innerText.match(/\d+\/\d+ requirements matched/) || [])[0] || '')));

    // (a) list logged-in, qualified OFF so cards show, with sort param to prove URL-state
    await p.goto(`${BASE}/jobs?qualified=0&sort=salary_high`, { waitUntil: 'networkidle2' });
    await p.waitForFunction(() => !/Loading jobs/i.test(document.body.innerText), { timeout: 20000 }); await sleep(1500);
    await p.screenshot({ path: `${OUT}/jm-a-list-urlsync.png` });
    console.log('  (a) url=', await p.evaluate(() => location.search), await p.evaluate(() => (document.body.innerText.match(/\d+ of \d+ jobs/) || [])[0]));

    // (e) alerts regression
    await p.goto(`${BASE}/alerts`, { waitUntil: 'networkidle2' }); await sleep(2500);
    await p.screenshot({ path: `${OUT}/jm-e-alerts.png` });
    console.log('  (e) alerts ok=', await p.evaluate(() => !/Could not load/i.test(document.body.innerText)));
  } finally {
    await b.close();
    if (token) { const d = await api('/auth/account', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, body: { password } }); console.log('  cleanup=', d.status); }
  }
})().catch((e) => console.error('FATAL', e.message));
