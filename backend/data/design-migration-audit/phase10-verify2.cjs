/* Phase 10 re-verify — corrects the 4 harness-assertion bugs (a/n/v/x). */
const puppeteer = require('puppeteer');
const BASE = 'https://cockpithire.com';
const API = `${BASE}/api`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PW = 'TestPass123!';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (id, cond, msg) => { results.push([id, !!cond, msg]); console.log(`  ${cond ? '✓' : '✗'} ${id}  ${msg}`); };
async function jfetch(path, opts = {}) { const r = await fetch(API + path, opts); let b = null; try { b = await r.json(); } catch {} return { status: r.status, body: b }; }
async function waitForCards(page, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const n = await page.evaluate(() => [...document.querySelectorAll('div')].filter(el => [...el.querySelectorAll('button')].some(b => /View Details/.test(b.textContent)) && getComputedStyle(el).cursor === 'pointer').length);
    if (n > 0) return n;
    await sleep(400);
  }
  return 0;
}

(async () => {
  const email = `phase10b_${Date.now()}@example.com`;
  const reg = await jfetch('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW, firstName: 'P10b' }) });
  const token = reg.body.token;
  const auth = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  console.log(`Registered ${email}`);

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('authToken', t), token);
    await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle2' });
    await sleep(2000);

    // a) bleed: LightPage left edge == its (padded) scroll-parent left edge (neg margin cancels padding)
    const a = await page.evaluate(() => {
      const lps = [...document.querySelectorAll('.app-light')];
      const lp = lps[lps.length - 1];
      const parent = lp.parentElement;
      const lpRect = lp.getBoundingClientRect(), pRect = parent.getBoundingClientRect();
      const pPadLeft = parseFloat(getComputedStyle(parent).paddingLeft);
      return { bg: getComputedStyle(lp).backgroundColor, lpLeft: lpRect.left, pLeft: pRect.left, pPadLeft, delta: Math.abs(lpRect.left - pRect.left) };
    });
    check('a', a.bg === 'rgb(248, 246, 241)' && a.delta < 2,
      `LightPage bg=${a.bg}; left=${a.lpLeft} vs parent left=${a.pLeft} (pad ${a.pPadLeft}) → bleed delta=${a.delta.toFixed(1)}px`);

    // turn off qualified-only
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Qualified only/i.test(x.textContent)); b && b.click(); });
    const cardCount1 = await waitForCards(page);
    console.log(`    (cards after qualified-off: ${cardCount1})`);

    // n) card hover via REAL mouse move (React simulates onMouseEnter from mouseover)
    const box = await page.evaluate(() => {
      const card = [...document.querySelectorAll('div')].find(el => [...el.querySelectorAll('button')].some(b => /View Details/.test(b.textContent)) && getComputedStyle(el).cursor === 'pointer');
      if (!card) return null;
      const r = card.getBoundingClientRect();
      card.setAttribute('data-hovertest', '1');
      return { x: r.x + r.width / 2, y: r.y + 30 };
    });
    await page.mouse.move(box.x, box.y);
    await sleep(250);
    const n = await page.evaluate(() => {
      const card = document.querySelector('[data-hovertest="1"]');
      return { border: getComputedStyle(card).borderColor, transform: getComputedStyle(card).transform };
    });
    check('n', n.border === 'rgb(0, 63, 136)', `card hover border=${n.border} (accent), transform=${n.transform}`);

    // x) mobile sheet — diagnostics + corrected assertion
    await page.setViewport({ width: 390, height: 780 });
    await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle2' }); await sleep(2200);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Qualified only/i.test(x.textContent)); b && b.click(); });
    await waitForCards(page);
    const opened = await page.evaluate(() => {
      const card = [...document.querySelectorAll('div')].find(el => [...el.querySelectorAll('button')].some(b => /View Details/.test(b.textContent)) && getComputedStyle(el).cursor === 'pointer');
      if (card) { card.click(); return true; } return false;
    });
    await sleep(700);
    const x = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      if (!dlg) return { noDialog: true, innerWidth: window.innerWidth };
      const cs = getComputedStyle(dlg); const r = dlg.getBoundingClientRect();
      const backdrop = dlg.parentElement;
      const apply = [...dlg.querySelectorAll('a')].some(a => /Apply/.test(a.textContent));
      return { innerWidth: window.innerWidth, maxWidth: cs.maxWidth, radiusTop: cs.borderTopLeftRadius, radiusBottom: cs.borderBottomLeftRadius, width: Math.round(r.width), align: getComputedStyle(backdrop).alignItems, apply };
    });
    check('x', !x.noDialog && x.apply && x.radiusTop === '14px' && x.radiusBottom === '0px' && x.align === 'flex-end' && x.width >= x.innerWidth - 2,
      `mobile sheet @${x.innerWidth}px: opened=${opened}, maxW=${x.maxWidth}, radius ${x.radiusTop}/${x.radiusBottom}, width=${x.width}, align=${x.align}, apply=${x.apply}`);

    // v) regressions — real targets: /cv dark, /logbook light; employer: assert it does NOT render the Jobs page
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${BASE}/logbook`, { waitUntil: 'networkidle2' }); await sleep(1500);
    const lb = await page.evaluate(() => { const lps = [...document.querySelectorAll('.app-light')]; return { n: lps.length, bg: getComputedStyle(lps[lps.length-1]).backgroundColor, isLogbook: document.body.innerText.includes('Hours flown, sectors logged') }; });
    await page.goto(`${BASE}/cv`, { waitUntil: 'networkidle2' }); await sleep(1500);
    const cv = await page.evaluate(() => { const lps = [...document.querySelectorAll('.app-light')]; const inner = lps[lps.length-1]; return { n: lps.length, innermostIsShell: inner === lps[0], hasJobs: document.body.innerText.includes('Cockpit roles, filtered') }; });
    await page.goto(`${BASE}/employer/jobs/new`, { waitUntil: 'networkidle2' }); await sleep(1500);
    const emp = await page.evaluate(() => ({ url: location.pathname, hasJobsPage: document.body.innerText.includes('Cockpit roles, filtered to your profile.'), title: (document.querySelector('h1')||{}).textContent }));
    check('v', lb.n === 2 && lb.bg === 'rgb(248, 246, 241)' && lb.isLogbook && cv.n === 1 && !cv.hasJobs && !emp.hasJobsPage,
      `/logbook light(n=${lb.n},logbook=${lb.isLogbook}); /cv dark(n=${cv.n},noJobs=${!cv.hasJobs}); /employer→${emp.url} noJobsLeak=${!emp.hasJobsPage} (h1="${emp.title}")`);

  } finally { await browser.close(); }

  const del = await jfetch('/auth/account', { method: 'DELETE', headers: auth, body: JSON.stringify({ password: PW }) });
  console.log(`\nCleanup: delete account → ${del.status}`);
  const passed = results.filter(r => r[1]).length;
  console.log(`\n========== RE-VERIFY: ${passed}/${results.length} ==========`);
  results.filter(r => !r[1]).forEach(([id, , m]) => console.log(`  ✗ ${id}: ${m}`));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
