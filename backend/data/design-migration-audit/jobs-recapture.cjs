const puppeteer = require('puppeteer');
const BASE = 'https://cockpithire.com';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = '/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: res.status, json: j };
}

(async () => {
  const email = `recap_${Date.now()}@example.com`; const password = 'Verify123!pw';
  const reg = await api('/auth/register', { method: 'POST', body: { email, password, firstName: 'Verify', lastName: 'Pilot', phone: '+10000000000', country: 'United States', city: 'Dallas' } });
  const token = reg.json?.token;
  const list = await api('/jobs?limit=1'); const job = list.json.jobs[0];
  const slugify = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const slug = `${slugify(job.company)}-${slugify(job.role || job.title)}-${job.id}`;

  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const p = await b.newPage(); await p.setViewport({ width: 1280, height: 1500 });
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await p.evaluate((t) => localStorage.setItem('authToken', t), token);

    // (b) logged-in detail — wait until "Your Match" and loading gone
    await p.goto(`${BASE}/jobs/${slug}`, { waitUntil: 'networkidle2' });
    await p.waitForFunction(() => /Your Match/i.test(document.body.innerText) && !/Loading job/i.test(document.body.innerText), { timeout: 15000 });
    await sleep(800);
    await p.screenshot({ path: `${OUT}/jm-b-detail-loggedin.png`, fullPage: true });
    console.log('  recaptured (b)');

    // (a) list with URL filters — wait for cards
    await p.goto(`${BASE}/jobs?role=CAPTAIN&sort=salary_high`, { waitUntil: 'networkidle2' });
    await p.waitForFunction(() => !/Loading jobs/i.test(document.body.innerText), { timeout: 15000 });
    await sleep(1000);
    await p.screenshot({ path: `${OUT}/jm-a-list-urlsync.png`, fullPage: true });
    console.log('  recaptured (a) url=', await p.evaluate(() => location.search));

    // (e) alerts
    await p.goto(`${BASE}/alerts`, { waitUntil: 'networkidle2' }); await sleep(2500);
    await p.screenshot({ path: `${OUT}/jm-e-alerts.png`, fullPage: true });
    console.log('  recaptured (e)');
  } finally {
    await b.close();
    if (token) { const d = await api('/auth/account', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, body: { password } }); console.log('  cleanup=', d.status); }
  }
})().catch((e) => console.error('FATAL', e.message));
