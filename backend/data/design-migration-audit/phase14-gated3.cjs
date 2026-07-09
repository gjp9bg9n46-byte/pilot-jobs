/* Phase 14 gated re-probe 2 — UI edit (native typing) + delete-<Modal> + repost. */
const puppeteer = require('puppeteer');
const fs = require('fs');
const BASE = 'https://cockpithire.com';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const { token } = JSON.parse(fs.readFileSync('/tmp/p14g.json'));
const results = [];
const check = (id, cond, msg) => { results.push([id, !!cond, msg]); console.log(`  ${cond ? '✓' : '✗'} ${id}  ${msg}`); };
async function poll(page, fn, ms = 12000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn)) return true; await sleep(300); } return false; }

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('employerToken', t), token);

    // EDIT via real typing (reliable React onChange)
    await page.goto(`${BASE}/employer/dashboard`, { waitUntil: 'networkidle2' });
    await poll(page, () => [...document.querySelectorAll('a')].some(a => /\/edit$/.test(a.getAttribute('href') || '')));
    await page.evaluate(() => { const e = [...document.querySelectorAll('a')].find(a => /\/edit$/.test(a.getAttribute('href') || '')); e.click(); });
    await poll(page, () => /\/edit$/.test(location.pathname));
    await poll(page, () => [...document.querySelectorAll('input')].some(x => /P14/.test(x.value || '')), 12000);
    // focus title input, select-all, type
    const titleSel = await page.evaluateHandle(() => [...document.querySelectorAll('input')].find(x => /P14/.test(x.value || '')));
    await titleSel.click({ clickCount: 3 });
    await page.keyboard.type('P14 UI Edited Captain');
    await sleep(300);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Save Changes'); b && b.click(); });
    const edited = await poll(page, () => location.pathname === '/employer/dashboard' && document.body.innerText.includes('P14 UI Edited Captain'), 12000);
    check('l2', edited, `EDIT via UI typing → "P14 UI Edited Captain" in dashboard = ${edited}`);

    // DELETE via <Modal>
    await poll(page, () => [...document.querySelectorAll('button')].some(x => x.textContent.trim() === 'Delete'));
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Delete'); b.click(); });
    const modalShown = await poll(page, () => { const d = document.querySelector('[role="dialog"]'); return !!d && d.textContent.includes('Delete this job?'); }, 5000);
    const modalWidth = await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); return d ? getComputedStyle(d).maxWidth : null; });
    await page.evaluate(() => { const dlg = document.querySelector('[role="dialog"]'); const b = [...dlg.querySelectorAll('button')].find(x => x.textContent.trim() === 'Delete'); b.click(); });
    const deleted = await poll(page, () => /EXPIRED/.test(document.body.innerText), 12000);
    check('l3', modalShown && deleted, `DELETE via <Modal> (shown=${modalShown}, w=${modalWidth}) → EXPIRED = ${deleted}`);
    check('m', modalWidth === '480px', `delete <Modal> sm back-compat maxWidth=${modalWidth}`);

    // REPOST
    await poll(page, () => [...document.querySelectorAll('button')].some(x => x.textContent.trim() === 'Repost'));
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Repost'); b.click(); });
    const reposted = await poll(page, () => /ACTIVE/.test(document.body.innerText) && !/EXPIRED/.test(document.body.innerText), 12000);
    check('l4', reposted, `REPOST → ACTIVE = ${reposted}`);

    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Logout'); b && b.click(); });
    await sleep(600);
    console.log('  (logged out)');
  } finally {
    await browser.close();
    const passed = results.filter(r => r[1]).length;
    console.log(`\n========== GATED CRUD RE-PROBE: ${passed}/${results.length} ==========`);
    results.filter(r => !r[1]).forEach(([id, , m]) => console.log(`  ✗ ${id}: ${m}`));
  }
})().catch(e => console.error('FATAL', e.message));
