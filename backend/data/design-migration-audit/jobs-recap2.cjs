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
  const email = `recap2_${Date.now()}@example.com`; const password = 'Verify123!pw';
  const reg = await api('/auth/register', { method: 'POST', body: { email, password, firstName: 'Verify', lastName: 'Pilot', phone: '+10000000000', country: 'United States', city: 'Dallas' } });
  const token = reg.json?.token;
  // pick a CAPTAIN role pilot-ish job if available, else first
  const all = await api('/jobs?limit=50'); const jobs = all.json.jobs;
  const job = jobs.find((j) => j.role === 'CAPTAIN' || j.role === 'FIRST_OFFICER') || jobs[0];
  const slugify = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const slug = `${slugify(job.company)}-${slugify(job.role || job.title)}-${job.id}`;
  const titleWord = (job.title || '').split(' ')[0];
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const waitMain = async (p) => { await p.waitForFunction(() => { const h = document.querySelector('h1'); return h && h.textContent.trim().length > 0 && !/Loading job/i.test(document.body.innerText); }, { timeout: 20000 }); await sleep(1200); };
  try {
    const p = await b.newPage(); await p.setViewport({ width: 1280, height: 1600 });
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await p.evaluate((t) => localStorage.setItem('authToken', t), token);
    // (b)
    await p.goto(`${BASE}/jobs/${slug}`, { waitUntil: 'networkidle2' }); await waitMain(p);
    console.log('  (b) h1=', await p.evaluate(() => document.querySelector('h1')?.textContent));
    console.log('  (b) has Your Match=', await p.evaluate(() => /Your Match/i.test(document.body.innerText)), ' matched-text=', await p.evaluate(() => (document.body.innerText.match(/\d+\s*\/\s*\d+ requirements matched/) || [])[0] || 'n/a'));
    await p.screenshot({ path: `${OUT}/jm-b-detail-loggedin.png`, fullPage: true });
    // (a) list — turn OFF qualified to show cards, keep a filter for URL proof
    await p.goto(`${BASE}/jobs?role=CAPTAIN&qualified=0`, { waitUntil: 'networkidle2' });
    await p.waitForFunction(() => !/Loading jobs/i.test(document.body.innerText), { timeout: 20000 }); await sleep(1500);
    console.log('  (a) url=', await p.evaluate(() => location.search), ' count=', await p.evaluate(() => (document.body.innerText.match(/\d+ of \d+ jobs/) || [])[0]));
    await p.screenshot({ path: `${OUT}/jm-a-list-urlsync.png`, fullPage: false });
  } finally {
    await b.close();
    if (token) { const d = await api('/auth/account', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, body: { password } }); console.log('  cleanup=', d.status); }
  }
})().catch((e) => console.error('FATAL', e.message));
