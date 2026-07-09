/* Phase 14 GATED rubric (g–m) — approved employer. */
const puppeteer = require('puppeteer');
const fs = require('fs');
const BASE = 'https://cockpithire.com', API = `${BASE}/api`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const COOL = 'rgb(243, 244, 246)', WARM = 'rgb(248, 246, 241)', SURFACE = 'rgb(255, 255, 255)', ACCENT = 'rgb(0, 63, 136)';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const { token } = JSON.parse(fs.readFileSync('/tmp/p14g.json'));
const results = [];
const check = (id, cond, msg) => { results.push([id, !!cond, msg]); console.log(`  ${cond ? '✓' : '✗'} ${id}  ${msg}`); };
async function poll(page, fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn)) return true; await sleep(300); } return false; }

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('employerToken', t), token);

    // ── g) Dashboard cool ──
    await page.goto(`${BASE}/employer/dashboard`, { waitUntil: 'networkidle2' }); await sleep(1500);
    const g = await page.evaluate((COOL) => {
      const b2b = document.querySelector('.app-b2b');
      const acctBadge = [...document.querySelectorAll('span')].find(s => s.textContent.trim() === 'APPROVED');
      const post = [...document.querySelectorAll('a')].find(a => /Post New Job/.test(a.textContent));
      return { bg: b2b ? getComputedStyle(b2b).backgroundColor : null, badgeBg: acctBadge ? getComputedStyle(acctBadge).backgroundColor : null, postEnabled: post ? getComputedStyle(post).pointerEvents !== 'none' : false };
    }, COOL);
    check('g', g.bg === COOL && g.badgeBg === 'rgb(220, 252, 231)' && g.postEnabled, `Dashboard cool bg=${g.bg}, APPROVED badge=success ${g.badgeBg}, post enabled=${g.postEnabled}`);

    // ── h) JobForm cool end-to-end ──
    await page.goto(`${BASE}/employer/jobs/new`, { waitUntil: 'networkidle2' }); await sleep(1500);
    const h = await page.evaluate((COOL, SURFACE) => {
      const b2b = document.querySelector('.app-b2b');
      const formCard = [...document.querySelectorAll('form')][0];
      const h1 = [...document.querySelectorAll('div')].find(el => el.textContent.trim() === 'Post New Job');
      // any warm .app-light bleed OUTSIDE the preview island?
      const islands = [...document.querySelectorAll('.app-light')];
      return {
        pageBg: b2b ? getComputedStyle(b2b).backgroundColor : null,
        cardBg: formCard ? getComputedStyle(formCard).backgroundColor : null,
        h1Inter: h1 ? /Inter/i.test(getComputedStyle(h1).fontFamily) : false,
        islandCount: islands.length,
      };
    }, COOL, SURFACE);
    check('h', h.pageBg === COOL && h.cardBg === SURFACE && h.h1Inter && h.islandCount === 1, `JobForm: page cool=${h.pageBg}, card white=${h.cardBg}, Inter h1=${h.h1Inter}, app-light islands=${h.islandCount} (only the preview)`);

    // ── i) AircraftCombobox light flip (under .app-b2b → cool-light) ──
    await page.evaluate(() => { const i = [...document.querySelectorAll('input')].find(x => /B737, A320, C172/.test(x.placeholder || '')); i && i.focus(); });
    await sleep(500);
    const i = await page.evaluate(() => {
      const inp = [...document.querySelectorAll('input')].find(x => /B737, A320, C172/.test(x.placeholder || ''));
      const inputBg = inp ? getComputedStyle(inp).backgroundColor : null;
      const inputBorder = inp ? getComputedStyle(inp).borderColor : null;
      const dd = [...document.querySelectorAll('div')].find(x => /Commercial — Airbus/i.test(x.textContent) && getComputedStyle(x).overflowY === 'auto' && getComputedStyle(x).position === 'absolute');
      const ddBg = dd ? getComputedStyle(dd).backgroundColor : null;
      const hdr = [...document.querySelectorAll('div')].find(x => x.textContent.trim() === 'Commercial — Airbus' && getComputedStyle(x).textTransform === 'uppercase');
      const hdrColor = hdr ? getComputedStyle(hdr).color : null;
      return { inputBg, inputBorder, ddBg, hdrColor };
    });
    check('i', i.inputBg === SURFACE && i.ddBg === SURFACE && i.hdrColor === ACCENT, `combobox light: input white=${i.inputBg}, dropdown white=${i.ddBg}, group header accent=${i.hdrColor}`);

    // ── j) WARM JobPreviewCard island inside cool form ──
    const j = await page.evaluate((WARM, COOL) => {
      const island = document.querySelector('.app-light');
      const b2b = document.querySelector('.app-b2b');
      const islandBg = island ? getComputedStyle(island).backgroundColor : null;
      const pageBg = b2b ? getComputedStyle(b2b).backgroundColor : null;
      // the pilot card inside should use warm-primary text
      const card = island ? [...island.querySelectorAll('div')].find(d => getComputedStyle(d).backgroundColor === 'rgb(255, 255, 255)') : null;
      return { islandBg, pageBg, jarring: islandBg === WARM && pageBg === COOL && islandBg !== pageBg, hasCard: !!card };
    }, WARM, COOL);
    check('j', j.islandBg === WARM && j.jarring && j.hasCard, `warm island bg=${j.islandBg} vs cool page bg=${j.pageBg} → jarring WYSIWYG=${j.jarring}, pilot card present=${j.hasCard}`);

    // ── k) sticky preview pins ──
    const beforeTop = await page.evaluate(() => { const p = [...document.querySelectorAll('div')].find(el => getComputedStyle(el).position === 'sticky'); return p ? Math.round(p.getBoundingClientRect().top) : null; });
    await page.evaluate(() => window.scrollTo(0, 600));
    await sleep(400);
    const afterTop = await page.evaluate(() => { const p = [...document.querySelectorAll('div')].find(el => getComputedStyle(el).position === 'sticky'); return p ? Math.round(p.getBoundingClientRect().top) : null; });
    check('k', afterTop !== null && afterTop <= beforeTop + 2 && afterTop >= 0 && afterTop < 60, `sticky preview pins (top ${beforeTop}→${afterTop} after scroll)`);

    // ── l) job CRUD e2e ──
    // CREATE
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => {
      const setVal = (el, v) => { const s = Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      const title = [...document.querySelectorAll('input')].find(x => /Citation CJ3/.test(x.placeholder || ''));
      const apply = [...document.querySelectorAll('input')].find(x => /your-careers-page/.test(x.placeholder || ''));
      const desc = document.querySelector('textarea');
      setVal(title, 'P14 Gated Test Captain');
      setVal(apply, 'https://example.com/apply');
      setVal(desc, 'Phase 14 gated verification job — created by the test harness.');
    });
    await sleep(300);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Post Job'); b && b.click(); });
    const created = await poll(page, () => location.pathname === '/employer/dashboard' && document.body.innerText.includes('P14 Gated Test Captain'), 10000);
    check('l1', created, `CREATE → job appears in dashboard = ${created}`);

    // EDIT
    await page.evaluate(() => { const e = [...document.querySelectorAll('a')].find(a => /\/edit$/.test(a.getAttribute('href') || '')); e && e.click(); });
    await poll(page, () => /\/edit$/.test(location.pathname), 6000); await sleep(1000);
    await page.evaluate(() => { const t = [...document.querySelectorAll('input')].find(x => x.value === 'P14 Gated Test Captain'); if (t) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(t, 'P14 Gated Test Captain (edited)'); t.dispatchEvent(new Event('input', { bubbles: true })); } });
    await sleep(300);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Save Changes'); b && b.click(); });
    const edited = await poll(page, () => location.pathname === '/employer/dashboard' && document.body.innerText.includes('(edited)'), 10000);
    check('l2', edited, `EDIT → updated title shows in dashboard = ${edited}`);

    // DELETE via <Modal>
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Delete'); b && b.click(); });
    const modalShown = await poll(page, () => { const d = document.querySelector('[role="dialog"]'); return d && d.textContent.includes('Delete this job?'); }, 4000);
    const modalWidth = await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); return d ? getComputedStyle(d).maxWidth : null; });
    await page.evaluate(() => { const dlg = document.querySelector('[role="dialog"]'); const b = [...dlg.querySelectorAll('button')].find(x => x.textContent.trim() === 'Delete'); b && b.click(); });
    const deleted = await poll(page, () => { const txt = document.body.innerText; return /EXPIRED/.test(txt); }, 10000);
    check('l3', modalShown && deleted, `DELETE via <Modal> (shown=${modalShown}, maxWidth=${modalWidth}) → job EXPIRED = ${deleted}`);
    check('m', modalWidth === '480px', `delete <Modal> sm back-compat maxWidth=${modalWidth}`);

    // REPOST
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Repost'); b && b.click(); });
    const reposted = await poll(page, () => { const txt = document.body.innerText; return /ACTIVE/.test(txt) && !/EXPIRED/.test(txt); }, 10000);
    check('l4', reposted, `REPOST → job ACTIVE again = ${reposted}`);

    // logout
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Logout'); b && b.click(); });
    await sleep(800);

  } finally {
    await browser.close();
    const passed = results.filter(r => r[1]).length;
    console.log(`\n========== PHASE 14 GATED: ${passed}/${results.length} ==========`);
    results.filter(r => !r[1]).forEach(([id, , m]) => console.log(`  ✗ ${id}: ${m}`));
  }
})().catch(e => console.error('FATAL', e.message));
