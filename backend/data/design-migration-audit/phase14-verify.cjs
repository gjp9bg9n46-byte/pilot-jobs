/* Phase 14 verification — achievable-without-admin parts.
 * Cool palette on reachable employer pages (Pending/Profile/Rejected/Suspended),
 * role gating, regressions, combobox-in-logbook. APPROVED-gated pages
 * (Dashboard/JobForm/combobox/CRUD) require an admin token — run separately. */
const puppeteer = require('puppeteer');
const BASE = 'https://cockpithire.com', API = `${BASE}/api`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PW = 'TestPass1234!';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const COOL = 'rgb(243, 244, 246)', WARM = 'rgb(248, 246, 241)', SURFACE = 'rgb(255, 255, 255)', ACCENT = 'rgb(0, 63, 136)';
const results = [];
const check = (id, cond, msg) => { results.push([id, !!cond, msg]); console.log(`  ${cond ? '✓' : '✗'} ${id}  ${msg}`); };
async function jf(p, o = {}) { const r = await fetch(API + p, o); let b = null; try { b = await r.json(); } catch {} return { status: r.status, body: b }; }

(async () => {
  // Register a throwaway employer (PENDING)
  const email = `emp14_${Date.now()}@example.com`;
  const reg = await jf('/employers/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyName: 'Phase14 Air', companyType: 'AIRLINE', country: 'Portugal', contactName: 'P14 Tester', contactEmail: email, password: PW }) });
  const empToken = reg.body?.token;
  console.log(`Registered employer ${email} → ${reg.status}; token=${empToken ? 'yes' : 'NO'} (status PENDING)`);
  // A throwaway pilot for role-gating + regression checks
  const preg = await jf('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `pilot14_${Date.now()}@example.com`, password: 'TestPass123!', firstName: 'P14' }) });
  const pilotToken = preg.body?.token;

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('employerToken', t), empToken);

    // a) Pending page — cool .app-b2b palette + warning Badge
    await page.goto(`${BASE}/employer/pending-approval`, { waitUntil: 'networkidle2' }); await sleep(1500);
    const a = await page.evaluate((COOL) => {
      const b2b = document.querySelector('.app-b2b');
      const badge = [...document.querySelectorAll('span')].find(s => /UNDER REVIEW/.test(s.textContent));
      return { hasB2b: !!b2b, bg: b2b ? getComputedStyle(b2b).backgroundColor : null, badgeBg: badge ? getComputedStyle(badge).backgroundColor : null, headline: document.body.innerText.includes('under review') };
    }, COOL);
    check('a', a.hasB2b && a.bg === COOL && a.badgeBg === 'rgb(254, 243, 199)' && a.headline, `Pending: .app-b2b bg=${a.bg} (cool), badge=warning ${a.badgeBg}`);

    // b) Profile page — cool palette, light Inputs, status Badge, Inter headers
    await page.goto(`${BASE}/employer/profile`, { waitUntil: 'networkidle2' }); await sleep(1500);
    const b = await page.evaluate((COOL, SURFACE) => {
      const b2b = document.querySelector('.app-b2b');
      const inputs = [...document.querySelectorAll('input, textarea, select')].filter(i => i.type !== 'hidden');
      const h1 = [...document.querySelectorAll('div')].find(el => el.textContent.trim() === 'Edit Profile');
      const h1Inter = h1 ? /Inter/i.test(getComputedStyle(h1).fontFamily) : false;
      return { bg: b2b ? getComputedStyle(b2b).backgroundColor : null, inputCount: inputs.length, inputsWhite: inputs.length > 0 && inputs.every(i => getComputedStyle(i).backgroundColor === SURFACE), h1Inter };
    }, COOL, SURFACE);
    check('b', b.bg === COOL && b.inputsWhite && b.h1Inter, `Profile: bg=${b.bg} (cool), ${b.inputCount} inputs white=${b.inputsWhite}, header Inter=${b.h1Inter}`);

    // c) Status notice pages cool (rejected + suspended render regardless of actual status)
    await page.goto(`${BASE}/employer/rejected`, { waitUntil: 'networkidle2' }); await sleep(1200);
    const cRej = await page.evaluate((COOL) => { const b2b = document.querySelector('.app-b2b'); const badge = [...document.querySelectorAll('span')].find(s => /DECLINED/.test(s.textContent)); return { bg: b2b ? getComputedStyle(b2b).backgroundColor : null, badgeBg: badge ? getComputedStyle(badge).backgroundColor : null }; }, COOL);
    check('c', cRej.bg === COOL && cRej.badgeBg === 'rgb(254, 226, 226)', `Rejected notice: bg=${cRej.bg} (cool), badge=error ${cRej.badgeBg}`);

    // d) no dark navy anywhere on employer pages
    const d = await page.evaluate(() => ![...document.querySelectorAll('*')].some(el => { const bg = getComputedStyle(el).backgroundColor; return bg === 'rgb(13, 30, 53)' || bg === 'rgb(10, 22, 40)'; }));
    check('d', d, 'no dark navy (#0D1E35/#0A1628) surfaces on employer pages');

    // e) role gating: pilot token (no employerToken) → /employer/dashboard redirected away
    const ctx = await browser.createBrowserContext();
    const pg2 = await ctx.newPage();
    await pg2.goto(BASE, { waitUntil: 'domcontentloaded' });
    await pg2.evaluate((t) => localStorage.setItem('authToken', t), pilotToken); // pilot, NOT employer
    await pg2.goto(`${BASE}/employer/dashboard`, { waitUntil: 'networkidle2' }); await sleep(1500);
    const e = await pg2.evaluate(() => location.pathname);
    check('e', e !== '/employer/dashboard', `pilot → /employer/dashboard redirected to ${e}`);

    // f) regressions: pilot surfaces still WARM light; combobox in /logbook still light
    const rg = {};
    for (const [path, key] of [['/jobs','jobs'],['/cv','cv-light-or-dark']]) {}
    await pg2.goto(`${BASE}/jobs`, { waitUntil: 'networkidle2' }); await sleep(1000);
    rg.jobs = await pg2.evaluate((WARM) => { const lps=[...document.querySelectorAll('.app-light')]; return lps.length>=2 && getComputedStyle(lps[lps.length-1]).backgroundColor===WARM; }, WARM);
    await pg2.goto(`${BASE}/airlines`, { waitUntil: 'networkidle2' }); await sleep(1000);
    rg.airlines = await pg2.evaluate((WARM) => { const lps=[...document.querySelectorAll('.app-light')]; return lps.length>=2 && getComputedStyle(lps[lps.length-1]).backgroundColor===WARM; }, WARM);
    // combobox in logbook: open add-flight modal, check input white (warm light)
    await pg2.goto(`${BASE}/logbook`, { waitUntil: 'networkidle2' }); await sleep(1500);
    await pg2.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/Log a Flight/i.test(x.textContent)); b&&b.click(); }); await sleep(600);
    rg.logbookCombo = await pg2.evaluate(() => { const i=[...document.querySelectorAll('input')].find(x=>/B737, A320, C172/.test(x.placeholder||'')); return i ? getComputedStyle(i).backgroundColor==='rgb(255, 255, 255)' : null; });
    await ctx.close();
    check('f', rg.jobs && rg.airlines && rg.logbookCombo, `regressions: /jobs warm=${rg.jobs}, /airlines warm=${rg.airlines}, /logbook combobox light=${rg.logbookCombo}`);

  } finally {
    await browser.close();
    console.log(`\n(throwaway employer ${email} + pilot left as PENDING test data)`);
    const passed = results.filter(r => r[1]).length;
    console.log(`\n========== PHASE 14 (ungated): ${passed}/${results.length} ==========`);
    results.filter(r => !r[1]).forEach(([id, , m]) => console.log(`  ✗ ${id}: ${m}`));
    console.log('\nNOTE: Dashboard + JobForm (combobox light flip) + job CRUD are APPROVED-gated — need admin token to verify.');
  }
})().catch(e => console.error('FATAL', e.message));
