/* Phase 14 gated re-probe — k (clean scroll) + l2/l3/l4/m (proper waits). */
const puppeteer = require('puppeteer');
const fs = require('fs');
const BASE = 'https://cockpithire.com';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const { token } = JSON.parse(fs.readFileSync('/tmp/p14g.json'));
const results = [];
const check = (id, cond, msg) => { results.push([id, !!cond, msg]); console.log(`  ${cond ? '✓' : '✗'} ${id}  ${msg}`); };
async function poll(page, fn, ms = 10000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn)) return true; await sleep(300); } return false; }

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('employerToken', t), token);

    // k) sticky preview — clean load, modest scroll within the preview cell
    await page.goto(`${BASE}/employer/jobs/new`, { waitUntil: 'networkidle2' }); await sleep(1500);
    const top0 = await page.evaluate(() => { const p = [...document.querySelectorAll('div')].find(el => getComputedStyle(el).position === 'sticky'); return p ? Math.round(p.getBoundingClientRect().top) : null; });
    await page.evaluate(() => window.scrollTo(0, 200)); await sleep(400);
    const top200 = await page.evaluate(() => { const p = [...document.querySelectorAll('div')].find(el => getComputedStyle(el).position === 'sticky'); return p ? Math.round(p.getBoundingClientRect().top) : null; });
    // pinned: after scrolling 200px the sticky top settled near its 24px offset (didn't move ~1:1 with scroll)
    check('k', top200 !== null && top200 <= 28 && top200 >= 20, `sticky preview pins at top≈24 (top ${top0}→${top200} after 200px scroll)`);

    // ── CRUD on the existing job "P14 Gated Test Captain" (created in prior run) ──
    // l2) EDIT
    await page.goto(`${BASE}/employer/dashboard`, { waitUntil: 'networkidle2' });
    await poll(page, () => document.body.innerText.includes('P14 Gated Test Captain'));
    await page.evaluate(() => { const e = [...document.querySelectorAll('a')].find(a => /\/edit$/.test(a.getAttribute('href') || '')); e && e.click(); });
    await poll(page, () => /\/edit$/.test(location.pathname));
    // wait for the edit form to POPULATE (async listJobs → find)
    await poll(page, () => [...document.querySelectorAll('input')].some(x => /P14 Gated Test Captain/.test(x.value || '')), 12000);
    const editedSet = await page.evaluate(() => {
      const t = [...document.querySelectorAll('input')].find(x => /P14 Gated Test Captain/.test(x.value || ''));
      if (!t) return false;
      const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      s.call(t, 'P14 Gated Test Captain (edited)'); t.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    });
    await sleep(300);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Save Changes'); b && b.click(); });
    const edited = await poll(page, () => location.pathname === '/employer/dashboard' && document.body.innerText.includes('(edited)'), 12000);
    check('l2', editedSet && edited, `EDIT (form populated=${editedSet}) → "(edited)" in dashboard = ${edited}`);

    // l3 + m) DELETE via <Modal> (sm)
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Delete'); b && b.click(); });
    const modalShown = await poll(page, () => { const d = document.querySelector('[role="dialog"]'); return d && d.textContent.includes('Delete this job?'); }, 5000);
    const modalWidth = await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); return d ? getComputedStyle(d).maxWidth : null; });
    await page.evaluate(() => { const dlg = document.querySelector('[role="dialog"]'); const b = dlg && [...dlg.querySelectorAll('button')].find(x => x.textContent.trim() === 'Delete'); b && b.click(); });
    const deleted = await poll(page, () => /EXPIRED/.test(document.body.innerText), 12000);
    check('l3', modalShown && deleted, `DELETE via <Modal> (shown=${modalShown}) → EXPIRED = ${deleted}`);
    check('m', modalWidth === '480px', `delete <Modal> sm back-compat maxWidth=${modalWidth}`);

    // l4) REPOST
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Repost'); b && b.click(); });
    const reposted = await poll(page, () => /ACTIVE/.test(document.body.innerText) && !/EXPIRED/.test(document.body.innerText), 12000);
    check('l4', reposted, `REPOST → ACTIVE again = ${reposted}`);

    // logout (cleanup session)
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Logout'); b && b.click(); });
    await sleep(800);
    console.log('  (logged out throwaway session)');

  } finally {
    await browser.close();
    const passed = results.filter(r => r[1]).length;
    console.log(`\n========== GATED RE-PROBE: ${passed}/${results.length} ==========`);
    results.filter(r => !r[1]).forEach(([id, , m]) => console.log(`  ✗ ${id}: ${m}`));
  }
})().catch(e => console.error('FATAL', e.message));
