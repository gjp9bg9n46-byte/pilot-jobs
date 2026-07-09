/* Phase 11 re-verify 3 — o/q/r against an API-seeded saved-search row.
 * (UI create is pre-existingly broken: backend wants {name,filters}; frontend
 *  posts flat fields → 400. Migration preserved verbatim; logged to backlog.) */
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
  const email = `p11s_${Date.now()}@example.com`;
  const reg = await jf('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW, firstName: 'P11s' }) });
  const token = reg.body.token;
  const auth = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  // Seed a saved-search row via API (correct {name, filters, frequency} payload)
  const seed = await jf('/jobs/saved-searches', { method: 'POST', headers: auth, body: JSON.stringify({ name: 'P11 Row', filters: { authority: 'EASA' }, frequency: 'DAILY' }) });
  console.log(`Registered ${email}; seeded saved search → ${seed.status}`);

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('authToken', t), token);
    await page.goto(`${BASE}/alerts`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    // go to Saved Searches tab
    await page.evaluate(() => { const t = [...document.querySelectorAll('button')].find(x => x.textContent.startsWith('Saved Searches')); t && t.click(); });
    await poll(page, () => document.body.innerText.includes('P11 Row'), 8000);

    // o) row renders light + DAILY Badge (info) + pause/edit/delete buttons
    const o = await page.evaluate(() => {
      const row = [...document.querySelectorAll('div')].find(el => el.textContent.includes('P11 Row') && getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)' && el.querySelector('button[title="Delete"]'));
      const badge = [...document.querySelectorAll('span')].find(s => s.textContent.trim() === 'DAILY');
      const hasBtns = !!document.querySelector('button[title="Edit"]') && !!document.querySelector('button[title="Delete"]') && [...document.querySelectorAll('button')].some(b => /Pause|Resume/.test(b.textContent));
      return { rowLight: !!row, badgeBg: badge ? getComputedStyle(badge).backgroundColor : null, hasBtns };
    });
    check('o', o.rowLight && o.badgeBg === 'rgb(219, 234, 254)' && o.hasBtns, `row light=${o.rowLight}, DAILY Badge bg=${o.badgeBg} (info), pause/edit/delete=${o.hasBtns}`);

    // q) edit → SavedSearchModal opens LIGHT (sm 480) prefilled with the name
    await page.evaluate(() => { const b = document.querySelector('button[title="Edit"]'); b && b.click(); });
    await poll(page, () => !!document.querySelector('[role="dialog"]'), 4000);
    const q = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      if (!dlg) return null;
      const cs = getComputedStyle(dlg);
      return { name: dlg.querySelector('input')?.value, maxWidth: cs.maxWidth, bg: cs.backgroundColor };
    });
    check('q', q && q.name === 'P11 Row' && q.maxWidth === '480px' && q.bg === 'rgb(255, 255, 255)', `edit modal: name prefill="${q?.name}", maxWidth=${q?.maxWidth} (sm), bg=${q?.bg}`);
    // close edit modal
    await page.evaluate(() => { const dlg = document.querySelector('[role="dialog"]'); const b = [...dlg.querySelectorAll('button')].find(x => x.textContent.trim() === 'Cancel'); b && b.click(); });
    await poll(page, () => !document.querySelector('[role="dialog"]'), 3000);

    // r) delete → in-app <Modal> "Delete saved search?" (NOT window.confirm) → row removed
    let nativeConfirm = false;
    page.on('dialog', async d => { nativeConfirm = true; await d.dismiss(); });
    await page.evaluate(() => { const b = document.querySelector('button[title="Delete"]'); b && b.click(); });
    const delModal = await poll(page, () => document.body.innerText.includes('Delete saved search?'), 4000);
    await page.evaluate(() => { const dlg = [...document.querySelectorAll('[role="dialog"]')].find(d => d.textContent.includes('Delete saved search?')); const b = dlg && [...dlg.querySelectorAll('button')].find(x => x.textContent.trim() === 'Delete'); b && b.click(); });
    const removed = await poll(page, () => !document.body.innerText.includes('P11 Row'), 8000);
    check('r', delModal && !nativeConfirm && removed, `in-app Modal=${delModal}, native confirm=${nativeConfirm}, row removed=${removed}`);

  } finally {
    await browser.close();
    const del = await jf('/auth/account', { method: 'DELETE', headers: auth, body: JSON.stringify({ password: PW }) });
    console.log(`\nCleanup: delete account → ${del.status}`);
    const passed = results.filter(r => r[1]).length;
    console.log(`\n========== RE-VERIFY 3: ${passed}/${results.length} ==========`);
    results.filter(r => !r[1]).forEach(([id, , m]) => console.log(`  ✗ ${id}: ${m}`));
  }
})().catch(e => console.error('FATAL', e.message));
