/* Phase 12.1 verification — AirlineContribute (o–r). */
const puppeteer = require('puppeteer');
const BASE = 'https://cockpithire.com', API = `${BASE}/api`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PW = 'TestPass123!';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const SURFACE = 'rgb(255, 255, 255)', ERRBG = 'rgb(254, 226, 226)';
const results = [];
const check = (id, cond, msg) => { results.push([id, !!cond, msg]); console.log(`  ${cond ? '✓' : '✗'} ${id}  ${msg}`); };
const backlog = [];
async function jf(p, o = {}) { const r = await fetch(API + p, o); let b = null; try { b = await r.json(); } catch {} return { status: r.status, body: b }; }

(async () => {
  const email = `p121_${Date.now()}@example.com`;
  const reg = await jf('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW, firstName: 'P121' }) });
  const token = reg.body.token;
  const auth = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  const list = await jf('/airlines?limit=1', { headers: auth });
  const air = list.body?.items?.[0];
  const mineBefore = await jf(`/airlines/${air.id}/contributions/mine`, { headers: auth });
  console.log(`Registered ${email}; airline="${air?.name}" id=${air?.id}; mine before=${(mineBefore.body || []).length}`);

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('authToken', t), token);
    await page.goto(`${BASE}/airlines/${air.id}/contribute`, { waitUntil: 'networkidle2' });
    await sleep(2000);

    // o) form renders light: LightPage bg, Fraunces title, inputs white, sections surface
    const o = await page.evaluate((SURFACE) => {
      const lps = [...document.querySelectorAll('.app-light')]; const lp = lps[lps.length - 1];
      const title = [...document.querySelectorAll('div')].find(el => /Suggest an edit/.test(el.textContent) && /Fraunces/i.test(getComputedStyle(el).fontFamily));
      const inputs = [...document.querySelectorAll('input, textarea, select')];
      const inputsLight = inputs.length > 0 && inputs.every(i => getComputedStyle(i).backgroundColor === SURFACE);
      const section = [...document.querySelectorAll('div')].find(el => el.textContent.trim().startsWith('OPERATIONS') && getComputedStyle(el).backgroundColor === SURFACE) || [...document.querySelectorAll('div')].find(el => getComputedStyle(el).backgroundColor === SURFACE && el.querySelector('input,textarea,select'));
      return { lpLight: getComputedStyle(lp).backgroundColor === 'rgb(248, 246, 241)', title: !!title, inputsLight, inputCount: inputs.length, sectionLight: !!section };
    }, SURFACE);
    check('o', o.lpLight && o.title && o.inputsLight && o.sectionLight, `LightPage=${o.lpLight}, Fraunces title=${o.title}, ${o.inputCount} inputs light=${o.inputsLight}, section surface=${o.sectionLight}`);

    // p) no-change submit → error-palette toast "No changes detected"
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Submit contribution/.test(x.textContent)); b && b.click(); });
    await sleep(600);
    const p = await page.evaluate((ERRBG) => {
      const toast = [...document.querySelectorAll('div')].find(el => /No changes detected/.test(el.textContent) && getComputedStyle(el).position === 'fixed');
      return toast ? { shown: true, bg: getComputedStyle(toast).backgroundColor, color: getComputedStyle(toast).color } : { shown: false };
    }, ERRBG);
    check('p', p.shown && p.bg === ERRBG && p.color === 'rgb(153, 27, 27)', `no-change toast shown=${p.shown}, bg=${p.bg} (error palette), color=${p.color}`);
    await sleep(4200); // let toast clear

    // q) edit a field + submit → success state + API persistence
    await page.evaluate(() => {
      const inp = [...document.querySelectorAll('input')].find(i => i.value !== undefined && /Dublin|HQ|e\.g\./.test(i.placeholder || '') && /Headquarters|Dublin/.test(i.placeholder || ''));
      // fallback: first text input (Headquarters is first field)
      const target = inp || [...document.querySelectorAll('input')][0];
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(target, 'Phase12 Test HQ ' + Date.now());
      target.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(300);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Submit contribution/.test(x.textContent)); b && b.click(); });
    await sleep(2500);
    const success = await page.evaluate(() => document.body.innerText.includes('Contribution submitted!'));
    const mineAfter = await jf(`/airlines/${air.id}/contributions/mine`, { headers: auth });
    const persisted = (mineAfter.body || []).length > (mineBefore.body || []).length;
    if (!success || !persisted) backlog.push(`contribute submit: success=${success}, mine ${(mineBefore.body||[]).length}→${(mineAfter.body||[]).length}, status ${mineAfter.status}`);
    check('q', success && persisted, `submit → success state=${success}, persisted (getMine ${(mineBefore.body||[]).length}→${(mineAfter.body||[]).length})`);

    // r) cancel navigates back to /airlines/:id
    await page.goto(`${BASE}/airlines/${air.id}/contribute`, { waitUntil: 'networkidle2' }); await sleep(1500);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Cancel'); b && b.click(); });
    await sleep(1500);
    const r = await page.evaluate(() => location.pathname);
    check('r', r === `/airlines/${air.id}`, `Cancel → navigated to ${r}`);

  } finally {
    await browser.close();
    const del = await jf('/auth/account', { method: 'DELETE', headers: auth, body: JSON.stringify({ password: PW }) });
    console.log(`\nCleanup: delete account → ${del.status}`);
    if (backlog.length) { console.log('\n⚠ non-2xx / issues:'); backlog.forEach(x => console.log('  ' + x)); }
    const passed = results.filter(r => r[1]).length;
    console.log(`\n========== PHASE 12.1 RESULT: ${passed}/${results.length} ==========`);
    results.filter(r => !r[1]).forEach(([id, , m]) => console.log(`  ✗ ${id}: ${m}`));
  }
})().catch(e => console.error('FATAL', e.message));
