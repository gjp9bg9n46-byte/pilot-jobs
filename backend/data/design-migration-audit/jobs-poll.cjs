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
  const email = `poll_${Date.now()}@example.com`; const password = 'Verify123!pw';
  const reg = await api('/auth/register', { method: 'POST', body: { email, password, firstName: 'P', lastName: 'P', phone: '+10000000000', country: 'United States', city: 'Dallas' } });
  const token = reg.json?.token;
  const all = await api('/jobs?limit=50'); const job = all.json.jobs.find((j) => j.role) || all.json.jobs[0];
  const slugify = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const slug = `${slugify(job.company)}-${slugify(job.role || job.title)}-${job.id}`;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const p = await b.newPage(); await p.setViewport({ width: 1280, height: 1600 });
    let jobReqCount = 0;
    p.on('response', (r) => { if (new RegExp(`/api/jobs/${job.id}$`).test(r.url())) jobReqCount++; });
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await p.evaluate((t) => localStorage.setItem('authToken', t), token);
    await p.goto(`${BASE}/jobs/${slug}`, { waitUntil: 'domcontentloaded' });
    for (let i = 0; i < 14; i++) {
      const st = await p.evaluate(() => ({ loading: /Loading job/i.test(document.body.innerText), h1: document.querySelector('h1')?.textContent || '' }));
      console.log(`  t+${(i*1).toFixed(0)}s loading=${st.loading} h1="${st.h1}" jobFetches=${jobReqCount}`);
      await sleep(1000);
    }
    await p.screenshot({ path: `${OUT}/jm-b-detail-loggedin.png`, fullPage: true });
    console.log('  final screenshot taken; total jobFetches=', jobReqCount);
  } finally {
    await b.close();
    if (token) { const d = await api('/auth/account', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, body: { password } }); console.log('  cleanup=', d.status); }
  }
})().catch((e) => console.error('FATAL', e.message));
