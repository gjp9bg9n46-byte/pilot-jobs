/* Phase 10 re-verify 3 — x (correct JobModal dialog selection) + v (employer redirect is expected). */
const puppeteer = require('puppeteer');
const BASE = 'https://cockpithire.com';
const API = `${BASE}/api`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PW = 'TestPass123!';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (id, cond, msg) => { results.push([id, !!cond, msg]); console.log(`  ${cond ? '✓' : '✗'} ${id}  ${msg}`); };
async function jfetch(path, opts = {}) { const r = await fetch(API + path, opts); let b = null; try { b = await r.json(); } catch {} return { status: r.status, body: b }; }
async function waitForCards(page, ms = 9000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const n = await page.evaluate(() => [...document.querySelectorAll('div')].filter(el => [...el.querySelectorAll('button')].some(b => /View Details/.test(b.textContent)) && getComputedStyle(el).cursor === 'pointer').length); if (n > 0) return n; await sleep(400); } return 0; }

(async () => {
  const email = `phase10c_${Date.now()}@example.com`;
  const reg = await jfetch('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW, firstName: 'P10c' }) });
  const token = reg.body.token;
  const auth = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  console.log(`Registered ${email}`);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();

    // x) JobModal at size=md on mobile → full-bleed bottom sheet (select dialog WITH the Apply link)
    await page.setViewport({ width: 390, height: 780 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('authToken', t), token);
    await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle2' }); await sleep(2000);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Qualified only/i.test(x.textContent)); b && b.click(); });
    await waitForCards(page);
    await page.evaluate(() => { const card = [...document.querySelectorAll('div')].find(el => [...el.querySelectorAll('button')].some(b => /View Details/.test(b.textContent)) && getComputedStyle(el).cursor === 'pointer'); card && card.click(); });
    await sleep(700);
    const x = await page.evaluate(() => {
      const dlg = [...document.querySelectorAll('[role="dialog"]')].find(d => [...d.querySelectorAll('a')].some(a => /Apply/.test(a.textContent)));
      if (!dlg) return { found: false, dialogs: document.querySelectorAll('[role="dialog"]').length };
      const cs = getComputedStyle(dlg); const r = dlg.getBoundingClientRect();
      return { found: true, innerWidth: window.innerWidth, maxWidth: cs.maxWidth, radiusTop: cs.borderTopLeftRadius, radiusBottom: cs.borderBottomLeftRadius, width: Math.round(r.width), align: getComputedStyle(dlg.parentElement).alignItems };
    });
    check('x', x.found && x.radiusTop === '14px' && x.radiusBottom === '0px' && x.align === 'flex-end' && x.width >= x.innerWidth - 2,
      `JobModal mobile sheet @${x.innerWidth}px: maxW=${x.maxWidth}, radius ${x.radiusTop}/${x.radiusBottom}, width=${x.width}, align=${x.align}`);

    // v) regressions — /cv dark, /logbook light, employer route redirects pilot away (no employer-form exposure)
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${BASE}/logbook`, { waitUntil: 'networkidle2' }); await sleep(1500);
    const lb = await page.evaluate(() => { const lps = [...document.querySelectorAll('.app-light')]; return { n: lps.length, bg: getComputedStyle(lps[lps.length-1]).backgroundColor, ok: document.body.innerText.includes('Hours flown, sectors logged') }; });
    await page.goto(`${BASE}/cv`, { waitUntil: 'networkidle2' }); await sleep(1500);
    const cv = await page.evaluate(() => ({ n: document.querySelectorAll('.app-light').length, hasJobsLeak: document.body.innerText.includes('Cockpit roles, filtered') }));
    await page.goto(`${BASE}/employer/jobs/new`, { waitUntil: 'networkidle2' }); await sleep(1500);
    const emp = await page.evaluate(() => ({ url: location.pathname, redirectedAway: location.pathname !== '/employer/jobs/new' }));
    check('v', lb.n === 2 && lb.bg === 'rgb(248, 246, 241)' && lb.ok && cv.n === 1 && !cv.hasJobsLeak && emp.redirectedAway,
      `/logbook light(n=${lb.n}); /cv dark(n=${cv.n},noLeak=${!cv.hasJobsLeak}); /employer/jobs/new → ${emp.url} (pilot redirected away=${emp.redirectedAway}; employer form not exposed)`);

  } finally { await browser.close(); }
  const del = await jfetch('/auth/account', { method: 'DELETE', headers: auth, body: JSON.stringify({ password: PW }) });
  console.log(`\nCleanup: delete account → ${del.status}`);
  const passed = results.filter(r => r[1]).length;
  console.log(`\n========== RE-VERIFY 3: ${passed}/${results.length} ==========`);
  results.filter(r => !r[1]).forEach(([id, , m]) => console.log(`  ✗ ${id}: ${m}`));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
