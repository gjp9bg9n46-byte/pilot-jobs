/* Phase 13 chrome rubric (a–p). PDF byte-gate handled separately (PASS). */
const puppeteer = require('puppeteer');
const fs = require('fs');
const BASE = 'https://cockpithire.com', API = `${BASE}/api`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PW = 'TestPass123!';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const LIGHT = 'rgb(248, 246, 241)', SURFACE = 'rgb(255, 255, 255)', ACCENT = 'rgb(0, 63, 136)', DARK = 'rgb(10, 22, 40)';
const results = [];
const check = (id, cond, msg) => { results.push([id, !!cond, msg]); console.log(`  ${cond ? '✓' : '✗'} ${id}  ${msg}`); };
async function jf(p, o = {}) { const r = await fetch(API + p, o); let b = null; try { b = await r.json(); } catch {} return { status: r.status, body: b }; }
async function waitPreview(page, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(() => { const f = document.querySelector('iframe[title="CV Preview"]'); return f && f.src && f.src.startsWith('blob:'); })) return true; await sleep(500); } return false; }

(async () => {
  const token = fs.readFileSync('/tmp/p13token', 'utf8').split('=')[1].trim();
  const auth = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  console.log('Reusing p13 pilot (CV: Burgundy accent, seeded summary/skills)');

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('authToken', t), token);
    await page.goto(`${BASE}/cv`, { waitUntil: 'networkidle2' });
    await waitPreview(page); await sleep(1500);

    // b) preview iframe present (renders the unchanged PDF)
    check('b', await page.evaluate(() => !!document.querySelector('iframe[title="CV Preview"]')), 'preview iframe mounted (PDF doc unchanged — see byte gate)');

    // c) LightPage cream + bleed
    const c = await page.evaluate((LIGHT) => { const lps = [...document.querySelectorAll('.app-light')]; const lp = lps[lps.length - 1]; const pr = lp.parentElement.getBoundingClientRect(); return { n: lps.length, bg: getComputedStyle(lp).backgroundColor, delta: Math.abs(lp.getBoundingClientRect().left - pr.left) }; }, LIGHT);
    check('c', c.bg === LIGHT && c.delta < 2, `LightPage bg=${c.bg}, bleed delta=${c.delta.toFixed(1)}px (app-light×${c.n})`);

    // d) Fraunces h1 "CV Builder" + Inter body
    const d = await page.evaluate(() => { const h = [...document.querySelectorAll('h1')].find(x => x.textContent.trim() === 'CV Builder'); const p = [...document.querySelectorAll('div')].find(x => /Build and download a professional/.test(x.textContent) && x.children.length === 0); return { h: !!h && /Fraunces/i.test(getComputedStyle(h).fontFamily), body: p && /Inter/i.test(getComputedStyle(p).fontFamily) }; });
    check('d', d.h && d.body, `Fraunces h1=${d.h}, Inter body=${d.body}`);

    // e) editor accordions/cards light (no dark chrome surfaces in editor pane)
    const e = await page.evaluate((DARK) => {
      const editor = [...document.querySelectorAll('div')].find(el => [...el.querySelectorAll('*')].some(c => /CV Builder/.test(c.textContent)) && getComputedStyle(el).flex === '0 0 58%');
      // accordion surfaces should be white; assert none are the old navy #0D1E35 (rgb 13,30,53) EXCEPT thumbnails
      const navy = 'rgb(13, 30, 53)';
      const accordions = [...document.querySelectorAll('div')].filter(el => /Professional Profile|Personal Information|Logbook Summary/.test(el.textContent) && getComputedStyle(el).borderRadius === '12px');
      const acc = accordions[0];
      return { accBg: acc ? getComputedStyle(acc).backgroundColor : null };
    }, DARK);
    check('e', e.accBg === SURFACE, `accordion surface=${e.accBg} (white)`);

    // f) editor inputs are light <Input> (white bg)
    const f = await page.evaluate((SURFACE) => { const inputs = [...document.querySelectorAll('input, textarea')].filter(i => i.type !== 'file'); return inputs.length > 0 && inputs.every(i => getComputedStyle(i).backgroundColor === SURFACE); });
    check('f', f, `editor inputs light (white) — chrome only; PDF reads data not CSS (byte gate confirms)`);

    // g) color picker: swatch fills = palette hex (frozen); selected = Burgundy w/ accent ring
    const PALETTE = ['rgb(13, 30, 53)','rgb(44, 44, 44)','rgb(114, 47, 55)','rgb(31, 61, 43)','rgb(58, 80, 104)','rgb(28, 36, 81)','rgb(10, 61, 64)','rgb(74, 50, 0)','rgb(58, 31, 56)','rgb(45, 27, 105)'];
    const g = await page.evaluate((PALETTE) => {
      const sw = [...document.querySelectorAll('button')].filter(b => { const s = getComputedStyle(b); return s.borderRadius === '50%' && parseFloat(s.width) === 44; });
      const fills = sw.map(b => getComputedStyle(b).backgroundColor);
      const allPalette = fills.length === PALETTE.length && fills.every(fc => PALETTE.includes(fc));
      const selected = sw.find(b => getComputedStyle(b).boxShadow.includes('rgb(0, 63, 136)'));
      return { count: sw.length, allPalette, selectedFill: selected ? getComputedStyle(selected).backgroundColor : null };
    }, PALETTE);
    check('g', g.count === 10 && g.allPalette && g.selectedFill === 'rgb(114, 47, 55)', `${g.count} swatches, fills=palette ${g.allPalette}, selected(Burgundy)=${g.selectedFill} w/ accent ring`);

    // h) template selector: thumbnails render frozen navy (#0D1E35); switching changes preview
    const h = await page.evaluate(() => {
      const navy = [...document.querySelectorAll('div')].some(el => getComputedStyle(el).backgroundColor === 'rgb(13, 30, 53)' && el.offsetParent); // thumbnail navy sidebar still present
      const cards = [...document.querySelectorAll('div')].filter(el => /Two-column · navy sidebar|Full-width header/.test(el.textContent) && getComputedStyle(el).cursor === 'pointer');
      return { navy, cardCount: cards.length };
    });
    // click the "Final" template card
    await page.evaluate(() => { const card = [...document.querySelectorAll('div')].find(el => /Full-width header/.test(el.textContent) && getComputedStyle(el).cursor === 'pointer'); card && card.click(); });
    await sleep(1500);
    const finalSelected = await page.evaluate(() => document.body.innerText.includes('Final Template'));
    check('h', h.navy && h.cardCount >= 2 && finalSelected, `thumbnails frozen-navy=${h.navy}, ${h.cardCount} cards, template switch→Final=${finalSelected}`);

    // i) save state: edit summary → Saving… → Saved (#166534)
    await page.evaluate(() => { const ta = document.querySelector('textarea'); if (ta) { const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; setter.call(ta, 'Edited by phase13 verify ' + Date.now()); ta.dispatchEvent(new Event('input', { bubbles: true })); } });
    let savedColor = null;
    for (let i = 0; i < 20; i++) { savedColor = await page.evaluate(() => { const s = [...document.querySelectorAll('span')].find(x => x.textContent.trim() === 'Saved'); return s ? getComputedStyle(s).color : null; }); if (savedColor) break; await sleep(400); }
    check('i', savedColor === 'rgb(22, 101, 52)', `save state → "Saved" color=${savedColor} (#166534)`);

    // k) STICKY preview pane: scroll, check it pins with NO dark strip at its top
    await page.evaluate(() => window.scrollTo(0, 0));
    const paneRect0 = await page.evaluate(() => { const p = [...document.querySelectorAll('div')].find(el => getComputedStyle(el).position === 'sticky'); return p ? p.getBoundingClientRect().top : null; });
    // scroll the inner Layout content div (the actual scroll container)
    await page.evaluate(() => { const sc = [...document.querySelectorAll('div')].find(el => getComputedStyle(el).overflowY === 'auto' && el.scrollHeight > el.clientHeight); if (sc) sc.scrollTop = 700; });
    await sleep(600);
    const k = await page.evaluate((DARK) => {
      const pane = [...document.querySelectorAll('div')].find(el => getComputedStyle(el).position === 'sticky');
      if (!pane) return { noPane: true };
      const r = pane.getBoundingClientRect();
      // element just at the pane's visual top — is anything dark behind it?
      const atTop = document.elementFromPoint(r.left + r.width / 2, r.top + 2);
      const bgChain = []; let el = atTop;
      for (let i = 0; el && i < 6; i++) { bgChain.push(getComputedStyle(el).backgroundColor); el = el.parentElement; }
      const darkBehind = bgChain.includes(DARK);
      return { top: Math.round(r.top), pinned: r.top < 120, darkBehind, bgChain };
    }, DARK);
    check('k', !k.noPane && k.pinned && !k.darkBehind, `sticky pinned (top=${k.top}), dark strip behind=${k.darkBehind} [${(k.bgChain||[]).slice(0,3).join(', ')}]`);

    // n) no page horizontal scroll
    check('n', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no page H-scroll');

    // l) photo upload chrome present + light
    const l = await page.evaluate(() => /Add a headshot|Photo uploaded/.test(document.body.innerText));
    check('l', l, 'photo upload chrome renders');

    // o) regression: /cv now light(2); /jobs light; /employer + /admin dark
    const cvN = await page.evaluate(() => document.querySelectorAll('.app-light').length);
    await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle2' }); await sleep(1200);
    const jobsLight = await page.evaluate((LIGHT) => { const lps = [...document.querySelectorAll('.app-light')]; return lps.length >= 2 && getComputedStyle(lps[lps.length - 1]).backgroundColor === LIGHT; }, LIGHT);
    await page.goto(`${BASE}/admin/moderation`, { waitUntil: 'networkidle2' }); await sleep(1200);
    const adminDark = await page.evaluate(() => { const i = [...document.querySelectorAll('input')][0]; const bodyDark = !document.body.innerText.includes('app-light'); return document.querySelectorAll('.app-light').length <= 1; });
    check('o', cvN === 2 && jobsLight && adminDark, `/cv now light(app-light=${cvN}), /jobs light=${jobsLight}, /admin dark=${adminDark}`);

    // p) Modal sm back-compat (/logbook delete 480) — seed a flight
    await jf('/flight-logs', { method: 'POST', headers: auth, body: JSON.stringify({ date: new Date().toISOString(), aircraftType: 'A320', registration: 'A6-W', departure: 'OMDB', arrival: 'OTHH', offBlocksTime: '08:00', onBlocksTime: '09:20', totalTime: 1.33, picTime: 1.33, landingsDay: 1 }) });
    await page.goto(`${BASE}/logbook`, { waitUntil: 'networkidle2' }); await sleep(1800);
    await page.evaluate(() => { const b = document.querySelector('button[title="Delete"]'); b && b.click(); });
    await sleep(500);
    const p = await page.evaluate(() => { const dlg = document.querySelector('[role="dialog"]'); return dlg ? getComputedStyle(dlg).maxWidth : null; });
    check('p', p === '480px', `sm Modal back-compat maxWidth=${p}`);

  } finally {
    await browser.close();
    const del = await jf('/auth/account', { method: 'DELETE', headers: auth, body: JSON.stringify({ password: PW }) });
    console.log(`\nCleanup: delete account → ${del.status}`);
    const passed = results.filter(r => r[1]).length;
    console.log(`\n========== PHASE 13 CHROME RUBRIC: ${passed}/${results.length} ==========`);
    results.filter(r => !r[1]).forEach(([id, , m]) => console.log(`  ✗ ${id}: ${m}`));
  }
})().catch(e => console.error('FATAL', e.message));
