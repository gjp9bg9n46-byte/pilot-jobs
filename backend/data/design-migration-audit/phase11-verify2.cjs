/* Phase 11 re-verify — i,j,o,q,r,x with robust sequencing/polling. */
const puppeteer = require('puppeteer');
const BASE = 'https://cockpithire.com', API = `${BASE}/api`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PW = 'TestPass123!';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (id, cond, msg) => { results.push([id, !!cond, msg]); console.log(`  ${cond ? '✓' : '✗'} ${id}  ${msg}`); };
async function jf(p, o = {}) { const r = await fetch(API + p, o); let b = null; try { b = await r.json(); } catch {} return { status: r.status, body: b }; }
async function poll(page, fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn)) return true; await sleep(400); } return false; }

(async () => {
  const email = `p11r_${Date.now()}@example.com`;
  const reg = await jf('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW, firstName: 'P11r' }) });
  const token = reg.body.token;
  const auth = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  console.log(`Registered ${email}`);
  await jf('/profile/certificates', { method: 'POST', headers: auth, body: JSON.stringify({ type: 'ATPL', issuingAuthority: 'EASA' }) });
  await jf('/profile/elp', { method: 'POST', headers: auth, body: JSON.stringify({ englishLevel: 'Level 6' }) });
  await jf('/profile/carry-forward', { method: 'PUT', headers: auth, body: JSON.stringify({ totalTime: 9000, picTime: 5000, multiEngineTime: 9000, turbineTime: 9000 }) });
  await jf('/jobs/alerts/run-match', { method: 'POST', headers: auth });
  await sleep(1500);
  const al = await jf('/jobs/alerts', { headers: auth });
  const alertCount = al.body?.alerts?.length ?? 0;
  console.log(`alerts: ${alertCount}`);

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  let alertsPlanePath = null;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('authToken', t), token);
    await page.goto(`${BASE}/alerts`, { waitUntil: 'networkidle2' });
    await poll(page, () => [...document.querySelectorAll('div')].some(el => /\d+%/.test(el.textContent) && el.textContent.includes('MATCH') && getComputedStyle(el).cursor === 'pointer'), 20000);
    await sleep(500);

    // capture PlaneSave path on Matches tab (x part A)
    alertsPlanePath = await page.evaluate(() => { const svg = [...document.querySelectorAll('svg')].find(s => s.querySelector('path[d^="M21 16v-2"]')); return svg ? svg.querySelector('path').getAttribute('d') : null; });

    // unread before
    const unreadBefore = await page.evaluate(() => { const m = [...document.querySelectorAll('button')].find(x => x.textContent.startsWith('Matches')); const b = m && [...m.querySelectorAll('span')].find(s => /^\d+$/.test(s.textContent.trim())); return b ? parseInt(b.textContent) : 0; });

    // i) click first card → expand + markRead
    await page.evaluate(() => { const card = [...document.querySelectorAll('div')].find(el => /\d+%/.test(el.textContent) && el.textContent.includes('MATCH') && getComputedStyle(el).cursor === 'pointer'); card && card.click(); });
    const expandedOk = await poll(page, () => /MATCHED|MARGINAL|MISSING/.test(document.body.innerText) || document.body.innerText.includes('Apply for this job'), 5000);
    await sleep(500);
    const unreadAfter = await page.evaluate(() => { const m = [...document.querySelectorAll('button')].find(x => x.textContent.startsWith('Matches')); const b = m && [...m.querySelectorAll('span')].find(s => /^\d+$/.test(s.textContent.trim())); return b ? parseInt(b.textContent) : 0; });
    check('i', expandedOk && unreadAfter < unreadBefore, `expand=${expandedOk}, markRead unread ${unreadBefore}→${unreadAfter}`);

    // j) MatchBreakdown 3-col
    const j = await page.evaluate(() => /MATCHED/.test(document.body.innerText) && /MARGINAL/.test(document.body.innerText) && /MISSING/.test(document.body.innerText));
    check('j', j, `MatchBreakdown MATCHED/MARGINAL/MISSING all present=${j}`);

    // ── Saved Searches CRUD ──
    await page.evaluate(() => { const t = [...document.querySelectorAll('button')].find(x => x.textContent.startsWith('Saved Searches')); t && t.click(); });
    await poll(page, () => [...document.querySelectorAll('button')].some(x => /New Alert/.test(x.textContent)), 6000);

    // o) create
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /New Alert/.test(x.textContent)); b && b.click(); });
    await poll(page, () => !!document.querySelector('[role="dialog"]'), 4000);
    await page.evaluate(() => { const dlg = document.querySelector('[role="dialog"]'); const inp = dlg.querySelector('input'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(inp, 'P11 Test Search'); inp.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(200);
    await page.evaluate(() => { const dlg = document.querySelector('[role="dialog"]'); const b = [...dlg.querySelectorAll('button')].find(x => x.textContent.trim() === 'Save'); b && b.click(); });
    const createdOk = await poll(page, () => !document.querySelector('[role="dialog"]') && document.body.innerText.includes('P11 Test Search'), 8000);
    const freqBadge = await page.evaluate(() => { const sp = [...document.querySelectorAll('span')].find(s => s.textContent.trim() === 'DAILY'); return sp ? getComputedStyle(sp).backgroundColor : null; });
    check('o', createdOk && freqBadge === 'rgb(219, 234, 254)', `created row=${createdOk}, DAILY freq Badge bg=${freqBadge} (info)`);

    // q) edit
    await page.evaluate(() => { const b = document.querySelector('button[title="Edit"]'); b && b.click(); });
    await poll(page, () => !!document.querySelector('[role="dialog"]'), 4000);
    const prefill = await page.evaluate(() => document.querySelector('[role="dialog"]')?.querySelector('input')?.value);
    await page.evaluate(() => { const dlg = document.querySelector('[role="dialog"]'); const inp = dlg.querySelector('input'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(inp, 'P11 Edited Search'); inp.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(200);
    await page.evaluate(() => { const dlg = document.querySelector('[role="dialog"]'); const b = [...dlg.querySelectorAll('button')].find(x => x.textContent.trim() === 'Save'); b && b.click(); });
    const editedOk = await poll(page, () => !document.querySelector('[role="dialog"]') && document.body.innerText.includes('P11 Edited Search'), 8000);
    check('q', prefill === 'P11 Test Search' && editedOk, `prefill="${prefill}", updated→"P11 Edited Search"=${editedOk}`);

    // r) delete → page-level Modal (not window.confirm)
    let nativeConfirm = false;
    page.on('dialog', async d => { nativeConfirm = true; await d.dismiss(); });
    await page.evaluate(() => { const b = document.querySelector('button[title="Delete"]'); b && b.click(); });
    const delModalShown = await poll(page, () => document.body.innerText.includes('Delete saved search?'), 4000);
    await page.evaluate(() => { const dlgs = [...document.querySelectorAll('[role="dialog"]')]; const dlg = dlgs.find(d => d.textContent.includes('Delete saved search?')) || dlgs[0]; const b = [...dlg.querySelectorAll('button')].find(x => x.textContent.trim() === 'Delete'); b && b.click(); });
    const removed = await poll(page, () => !document.body.innerText.includes('P11 Edited Search'), 8000);
    check('r', delModalShown && !nativeConfirm && removed, `in-app Modal=${delModalShown}, native confirm=${nativeConfirm}, row removed=${removed}`);

    // x part B) PlaneSave on /jobs
    await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle2' }); await sleep(2500);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Qualified only/i.test(x.textContent)); b && b.click(); });
    await poll(page, () => [...document.querySelectorAll('svg')].some(s => s.querySelector('path[d^="M21 16v-2"]')), 10000);
    const jobsPlanePath = await page.evaluate(() => { const svg = [...document.querySelectorAll('svg')].find(s => s.querySelector('path[d^="M21 16v-2"]')); return svg ? svg.querySelector('path').getAttribute('d') : null; });
    check('x', alertsPlanePath && jobsPlanePath && alertsPlanePath === jobsPlanePath, `PlaneSave path identical (/alerts vs /jobs): ${alertsPlanePath === jobsPlanePath}`);

  } finally {
    await browser.close();
    const del = await jf('/auth/account', { method: 'DELETE', headers: auth, body: JSON.stringify({ password: PW }) });
    console.log(`\nCleanup: delete account → ${del.status}`);
    const passed = results.filter(r => r[1]).length;
    console.log(`\n========== RE-VERIFY: ${passed}/${results.length} ==========`);
    results.filter(r => !r[1]).forEach(([id, , m]) => console.log(`  ✗ ${id}: ${m}`));
  }
})().catch(e => console.error('FATAL', e.message));
