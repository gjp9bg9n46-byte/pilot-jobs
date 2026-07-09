const puppeteer = require('puppeteer');
const BASE = 'https://cockpithire.com';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(path, opts = {}) {
  const res = await fetch(`${BASE}/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: res.status, json: j };
}
(async () => {
  const email = `diag_${Date.now()}@example.com`; const password = 'Verify123!pw';
  const reg = await api('/auth/register', { method: 'POST', body: { email, password, firstName: 'D', lastName: 'P', phone: '+10000000000', country: 'United States', city: 'Dallas' } });
  const token = reg.json?.token;
  const list = await api('/jobs?limit=1'); const job = list.json.jobs[0];
  const slugify = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const slug = `${slugify(job.company)}-${slugify(job.role || job.title)}-${job.id}`;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const p = await b.newPage(); await p.setViewport({ width: 1280, height: 1000 });
    p.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 200)); });
    p.on('requestfailed', (r) => console.log('  [reqfailed]', r.url().replace(BASE, ''), r.failure()?.errorText));
    p.on('response', (r) => { const u = r.url(); if (u.includes('/api/jobs') || u.includes('/api/profile')) console.log('  [resp]', r.status(), u.replace(BASE, '').slice(0, 70)); });
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await p.evaluate((t) => localStorage.setItem('authToken', t), token);
    console.log('--- token key check:', await p.evaluate(() => ({ authToken: !!localStorage.getItem('authToken') })));
    console.log('=== navigate logged-in detail ===');
    await p.goto(`${BASE}/jobs/${slug}`, { waitUntil: 'networkidle2' });
    for (let i = 0; i < 8; i++) { await sleep(1200); const txt = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 90)); console.log(`  [t+${(i+1)*1.2}s]`, txt); }
  } finally {
    await b.close();
    if (token) { const d = await api('/auth/account', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, body: { password } }); console.log('  cleanup=', d.status); }
  }
})().catch((e) => console.error('FATAL', e.message));
