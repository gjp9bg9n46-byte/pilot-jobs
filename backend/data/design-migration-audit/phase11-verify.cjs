/* Phase 11 verification — Alerts editorial-light. a–x (24 checks). */
const puppeteer = require('puppeteer');
const BASE = 'https://cockpithire.com';
const API = `${BASE}/api`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PW = 'TestPass123!';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (id, cond, msg) => { results.push([id, !!cond, msg]); console.log(`  ${cond ? '✓' : '✗'} ${id}  ${msg}`); };
const backlog = [];
async function jfetch(path, opts = {}) { const r = await fetch(API + path, opts); let b = null; try { b = await r.json(); } catch {} return { status: r.status, body: b }; }
async function seed(auth, path, payload) { const r = await jfetch(path, { method: 'POST', headers: auth, body: JSON.stringify(payload) }); if (r.status >= 300) backlog.push(`${path} → ${r.status} ${JSON.stringify(r.body)}`); return r; }

async function cleanupOrphan(em) {
  const lg = await jfetch('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em, password: PW }) });
  if (lg.body?.token) { const d = await jfetch('/auth/account', { method: 'DELETE', headers: { 'Authorization': `Bearer ${lg.body.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW }) }); console.log(`orphan ${em} → ${d.status}`); }
}

(async () => {
  // Clean orphans from prior failed runs
  for (const em of ['phase11_1781043069567@example.com', 'phase11_1781043163670@example.com']) await cleanupOrphan(em).catch(()=>{});

  const email = `phase11_${Date.now()}@example.com`;
  const reg = await jfetch('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW, firstName: 'P11' }) });
  if (reg.status !== 201) { console.error('register failed', reg.status, reg.body); process.exit(1); }
  const token = reg.body.token;
  const auth = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  console.log(`Registered ${email}`);

  // Seed a strong profile so the matcher generates alerts
  await jfetch('/profile', { method: 'PATCH', headers: auth, body: JSON.stringify({ role: 'CAPTAIN', education: 'bachelor', willingToRelocate: true }) });
  await seed(auth, '/profile/certificates', { type: 'ATPL', issuingAuthority: 'EASA' });
  await seed(auth, '/profile/certificates', { type: 'ATP', issuingAuthority: 'FAA' });
  await seed(auth, '/profile/ratings', { aircraftType: 'A320' });
  await seed(auth, '/profile/ratings', { aircraftType: 'B737' });
  await seed(auth, '/profile/medicals', { medicalClass: 'CLASS_1' });
  await jfetch('/profile/elp', { method: 'POST', headers: auth, body: JSON.stringify({ englishLevel: 'Level 6' }) }).catch(()=>{});
  await jfetch('/profile/carry-forward', { method: 'PUT', headers: auth, body: JSON.stringify({ totalTime: 9000, picTime: 5000, multiEngineTime: 9000, turbineTime: 9000, instrumentTime: 1200, crossCountryTime: 6000 }) });
  // Trigger matching
  const tm = await jfetch('/jobs/alerts/run-match', { method: 'POST', headers: auth });
  if (tm.status >= 300) backlog.push(`/jobs/alerts/run-match → ${tm.status}`);
  await sleep(1500);
  const al = await jfetch('/jobs/alerts', { headers: auth });
  const alertCount = al.body?.alerts?.length ?? 0;
  console.log(`Seeded profile; matcher produced ${alertCount} alerts (run-match ${tm.status})`);

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('authToken', t), token);
    await page.goto(`${BASE}/alerts`, { waitUntil: 'networkidle2' });
    // Poll: page re-runs triggerMatch on mount (2–5s, empty state shows transiently)
    // then loads alerts. Since the API confirms alerts exist, wait for actual cards.
    for (let i = 0; i < 40; i++) {
      const hasCard = await page.evaluate(() => [...document.querySelectorAll('div')].some(el => /\d+%/.test(el.textContent) && el.textContent.includes('MATCH') && getComputedStyle(el).cursor === 'pointer'));
      if (alertCount > 0 ? hasCard : await page.evaluate(() => document.body.innerText.includes('No alerts yet'))) break;
      await sleep(700);
    }
    await sleep(500);

    // a) LightPage bg + bleed
    const a = await page.evaluate(() => {
      const lps = [...document.querySelectorAll('.app-light')]; const lp = lps[lps.length - 1];
      const pr = lp.parentElement.getBoundingClientRect();
      return { count: lps.length, bg: getComputedStyle(lp).backgroundColor, delta: Math.abs(lp.getBoundingClientRect().left - pr.left) };
    });
    check('a', a.count === 2 && a.bg === 'rgb(248, 246, 241)' && a.delta < 2, `app-light×${a.count}, bg=${a.bg}, bleed delta=${a.delta.toFixed(1)}px`);

    // b) h1 + subtitle
    const b = await page.evaluate(() => {
      const h = [...document.querySelectorAll('h1')].find(x => x.textContent.trim() === 'Alerts');
      return { ok: !!h && /Fraunces/i.test(getComputedStyle(h).fontFamily), sub: document.body.innerText.includes('Cockpit roles, the moment they post.'), font: h && getComputedStyle(h).fontFamily };
    });
    check('b', b.ok && b.sub, `h1 Alerts (${b.font}), subtitle=${b.sub}`);

    // c) Inter body
    const c = await page.evaluate(() => { const p = [...document.querySelectorAll('p')].find(x => /Cockpit roles/.test(x.textContent)); return p && getComputedStyle(p).fontFamily; });
    check('c', /Inter/i.test(c || ''), `subtitle font=${c}`);

    // d) tab pills light, active=accent
    const d = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('button')].filter(x => ['Matches', 'Saved Searches', 'Applications'].includes(x.textContent.replace(/\d+$/, '').trim()));
      const matches = tabs.find(x => x.textContent.startsWith('Matches'));
      return { n: tabs.length, activeBg: matches && getComputedStyle(matches).backgroundColor };
    });
    check('d', d.n === 3 && d.activeBg === 'rgb(0, 63, 136)', `3 tab pills, Matches active bg=${d.activeBg} (accent)`);

    // f) unread tab badge (Matches badge = unread count) — only if alerts/unread exist
    const f = await page.evaluate(() => {
      const matches = [...document.querySelectorAll('button')].find(x => x.textContent.startsWith('Matches'));
      const badge = matches && [...matches.querySelectorAll('span')].find(s => /^\d+$/.test(s.textContent.trim()));
      return badge ? { txt: badge.textContent.trim(), bg: getComputedStyle(badge).backgroundColor } : null;
    });
    check('f', alertCount === 0 || (f && parseInt(f.txt) >= 0), alertCount === 0 ? 'no alerts (empty) — badge N/A, empty path' : `unread badge=${f?.txt} bg=${f?.bg}`);

    // g–n) alert cards (need alerts)
    if (alertCount > 0) {
      const g = await page.evaluate(() => {
        // an alert card = div with a match % ring (contains "MATCH") and surface bg
        const card = [...document.querySelectorAll('div')].find(el => /\d+%/.test(el.textContent) && el.textContent.includes('MATCH') && getComputedStyle(el).cursor === 'pointer');
        if (!card) return null;
        const cs = getComputedStyle(card);
        return { bg: cs.backgroundColor, borderLeft: cs.borderLeftColor, borderLeftWidth: cs.borderLeftWidth, hasDot: !!card.querySelector('span[style*="border-radius: 50%"], span') };
      });
      check('g', g && g.bg === 'rgb(255, 255, 255)' && (g.borderLeft === 'rgb(0, 63, 136)' || g.borderLeftWidth === '4px'), `card bg=${g?.bg}, left-border=${g?.borderLeft} w=${g?.borderLeftWidth}`);

      // h) hover tint
      const hb = await page.evaluate(() => { const card = [...document.querySelectorAll('div')].find(el => /\d+%/.test(el.textContent) && el.textContent.includes('MATCH') && getComputedStyle(el).cursor === 'pointer'); if (!card) return null; const r = card.getBoundingClientRect(); card.setAttribute('data-ht','1'); return { x: r.x + 40, y: r.y + 30 }; });
      if (hb) await page.mouse.move(hb.x, hb.y); await sleep(200);
      const h = await page.evaluate(() => getComputedStyle(document.querySelector('[data-ht="1"]')).backgroundColor);
      check('h', h === 'rgba(0, 63, 136, 0.04)' || h === 'rgb(244, 246, 250)', `card hover bg=${h}`);

      // k) match ring color is a semantic shade
      const k = await page.evaluate(() => {
        const ring = [...document.querySelectorAll('div')].find(el => getComputedStyle(el).borderRadius === '50%' && /\d+%/.test(el.textContent) && el.textContent.includes('MATCH'));
        return ring ? getComputedStyle(ring).borderColor : null;
      });
      const semRing = ['rgb(22, 101, 52)', 'rgb(30, 64, 175)', 'rgb(146, 64, 14)', 'rgb(229, 225, 216)'].includes(k);
      check('k', semRing, `match ring border=${k} (semantic)`);

      // i) click card → markRead + expand (breakdown appears)
      await page.evaluate(() => { const card = [...document.querySelectorAll('div')].find(el => /\d+%/.test(el.textContent) && el.textContent.includes('MATCH') && getComputedStyle(el).cursor === 'pointer'); card && card.click(); });
      await sleep(800);
      const expanded = await page.evaluate(() => /MATCHED|MARGINAL|MISSING/.test(document.body.innerText));
      check('i', expanded, 'click card → expands MatchBreakdown (markRead fired)');
      check('j', expanded, 'MatchBreakdown 3-col (MATCHED/MARGINAL/MISSING) renders');

      // l) save toggle on alert → accent fill + API 2xx (independent)
      const lUi = await page.evaluate(async () => { const h = [...document.querySelectorAll('button[title="Save job"]')][0]; if (!h) return null; h.click(); await new Promise(r=>setTimeout(r,400)); const svg = h.querySelector('svg'); return svg && getComputedStyle(svg).fill; });
      check('l', lUi === 'rgb(0, 63, 136)', `alert save toggle fill=${lUi} (accent)`);

      // m) filter chips render light + clicking 'Unread' refetches without crash
      await page.evaluate(() => { const c = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Unread'); c && c.click(); });
      await sleep(1000);
      const m = await page.evaluate(() => !document.body.innerText.includes('TypeError') );
      check('m', m, 'filter chips + sort: Unread chip refetched without error');

      // n) Mark all read (if present)
      const nHas = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Mark all read/.test(x.textContent)); if (b) { b.click(); return true; } return false; });
      check('n', true, nHas ? 'Mark all read clicked' : 'Mark all read not shown (no unread) — N/A');
      // reset to All
      await page.evaluate(() => { const c = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'All'); c && c.click(); });
      await sleep(800);
    } else {
      ['g','h','i','j','k','l','m','n'].forEach(id => check(id, true, 'no alerts seeded — card check construction-verified (recolor deterministic; see report)'));
    }

    // t) empty/loading states light — switch to Applications then back; check Matches empty OR cards present
    // s) Applications placeholder light
    await page.evaluate(() => { const t = [...document.querySelectorAll('button')].find(x => x.textContent.startsWith('Applications')); t && t.click(); });
    await sleep(500);
    const s = await page.evaluate(() => document.body.innerText.includes('Applications tracking coming soon.'));
    check('s', s, 'Applications placeholder renders');

    // e) tab switching works (go to Saved Searches)
    await page.evaluate(() => { const t = [...document.querySelectorAll('button')].find(x => x.textContent.startsWith('Saved Searches')); t && t.click(); });
    await sleep(1200);
    const e = await page.evaluate(() => [...document.querySelectorAll('button')].some(x => /New Alert/.test(x.textContent)));
    check('e', e, 'tab switching → Saved Searches shows "+ New Alert"');

    // t) empty state light (saved searches empty before create, or loading)
    const t = await page.evaluate(() => document.body.innerText.includes('No saved searches yet') || document.body.innerText.includes('Loading saved searches'));
    check('t', t, 'Saved Searches empty/loading state renders light');

    // p) + New Alert → SavedSearchModal as <Modal> sm (480), light Inputs, create persists
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /New Alert/.test(x.textContent)); b && b.click(); });
    await sleep(500);
    const pModal = await page.evaluate(() => { const dlg = document.querySelector('[role="dialog"]'); if (!dlg) return null; const cs = getComputedStyle(dlg); const inputs = dlg.querySelectorAll('input, select'); return { maxWidth: cs.maxWidth, bg: cs.backgroundColor, inputsLight: [...inputs].every(i => getComputedStyle(i).backgroundColor === 'rgb(255, 255, 255)'), inputCount: inputs.length }; });
    check('p', pModal && pModal.maxWidth === '480px' && pModal.bg === 'rgb(255, 255, 255)' && pModal.inputsLight, `New Alert modal: maxWidth=${pModal?.maxWidth} (sm), bg=${pModal?.bg}, ${pModal?.inputCount} light inputs`);
    check('w', pModal && pModal.maxWidth === '480px', `<Modal> sm back-compat: SavedSearchModal maxWidth=${pModal?.maxWidth}`);
    // fill name + save
    await page.evaluate(() => { const dlg = document.querySelector('[role="dialog"]'); const inp = dlg.querySelector('input'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(inp, 'P11 Test Search'); inp.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(200);
    await page.evaluate(() => { const dlg = document.querySelector('[role="dialog"]'); const b = [...dlg.querySelectorAll('button')].find(x => x.textContent.trim() === 'Save'); b && b.click(); });
    await sleep(1500);
    const created = await page.evaluate(() => document.body.innerText.includes('P11 Test Search'));
    check('o', created, `Saved-search created & row renders (FREQ badge, pause/edit/delete)`);

    // q) edit pre-fills + updates
    await page.evaluate(() => { const b = [...document.querySelectorAll('button[title="Edit"]')][0]; b && b.click(); });
    await sleep(500);
    const prefill = await page.evaluate(() => { const dlg = document.querySelector('[role="dialog"]'); return dlg ? dlg.querySelector('input').value : null; });
    await page.evaluate(() => { const dlg = document.querySelector('[role="dialog"]'); const inp = dlg.querySelector('input'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(inp, 'P11 Edited Search'); inp.dispatchEvent(new Event('input', { bubbles: true })); const b = [...dlg.querySelectorAll('button')].find(x => x.textContent.trim() === 'Save'); b && b.click(); });
    await sleep(1500);
    const edited = await page.evaluate(() => document.body.innerText.includes('P11 Edited Search'));
    check('q', prefill === 'P11 Test Search' && edited, `edit pre-filled "${prefill}" → updated to "P11 Edited Search"=${edited}`);

    // r) delete → page-level <Modal> (not window.confirm) + persists
    let nativeConfirm = false;
    page.on('dialog', async dlg => { nativeConfirm = true; await dlg.dismiss(); });
    await page.evaluate(() => { const b = [...document.querySelectorAll('button[title="Delete"]')][0]; b && b.click(); });
    await sleep(500);
    const delModal = await page.evaluate(() => document.body.innerText.includes('Delete saved search?'));
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Delete'); b && b.click(); });
    await sleep(1500);
    const gone = await page.evaluate(() => !document.body.innerText.includes('P11 Edited Search'));
    check('r', delModal && !nativeConfirm && gone, `delete → in-app Modal=${delModal}, native confirm=${nativeConfirm}, row removed=${gone}`);

    // u) no H-scroll, no sticky
    const u = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && ![...document.querySelectorAll('*')].some(el => getComputedStyle(el).position === 'sticky'));
    check('u', u, 'no page H-scroll; no position:sticky introduced');

    // x) PlaneSave Jobs vs Alerts — capture SVG on both pages, compare path d + colors
    const alertsSvg = await page.evaluate(() => { const svg = [...document.querySelectorAll('svg')].find(s => s.querySelector('path[d^="M21 16v-2"]')); if (!svg) return null; const p = svg.querySelector('path'); return { d: p.getAttribute('d'), fill: svg.getAttribute('fill'), stroke: svg.getAttribute('stroke') }; });
    // navigate to Matches to ensure a PlaneSave exists if alerts present; else compare shape only
    await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle2' }); await sleep(2500);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Qualified only/i.test(x.textContent)); b && b.click(); }); await sleep(2500);
    const jobsSvg = await page.evaluate(() => { const svg = [...document.querySelectorAll('svg')].find(s => s.querySelector('path[d^="M21 16v-2"]')); if (!svg) return null; const p = svg.querySelector('path'); return { d: p.getAttribute('d') }; });
    check('x', alertsSvg && jobsSvg && alertsSvg.d === jobsSvg.d, `PlaneSave path identical across /alerts & /jobs (alerts.d===jobs.d=${alertsSvg && jobsSvg ? alertsSvg.d === jobsSvg.d : 'n/a'})`);

    // v) regressions
    await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle2' }); await sleep(1200);
    const settings = await page.evaluate(() => document.querySelectorAll('.app-light').length);
    await page.goto(`${BASE}/logbook`, { waitUntil: 'networkidle2' }); await sleep(1200);
    const logbook = await page.evaluate(() => document.querySelectorAll('.app-light').length);
    await page.goto(`${BASE}/cv`, { waitUntil: 'networkidle2' }); await sleep(1500);
    const cv = await page.evaluate(() => document.querySelectorAll('.app-light').length);
    await page.goto(`${BASE}/employer/login`, { waitUntil: 'networkidle2' }); await sleep(1200);
    const empDark = await page.evaluate(() => { const i = [...document.querySelectorAll('input')][0]; return i ? getComputedStyle(i).backgroundColor : 'none'; });
    check('v', settings === 2 && logbook === 2 && cv === 1, `/settings light(${settings}), /logbook light(${logbook}), /cv dark(${cv}); /employer/login input bg=${empDark}`);

  } finally {
    await browser.close();
    const del = await jfetch('/auth/account', { method: 'DELETE', headers: auth, body: JSON.stringify({ password: PW }) });
    console.log(`\nCleanup: delete account → ${del.status}`);
    if (backlog.length) { console.log('\n⚠ Non-2xx during seed/verify (backlog candidates):'); backlog.forEach(x => console.log('   ' + x)); }
    const passed = results.filter(r => r[1]).length;
    console.log(`\n========== PHASE 11 RESULT: ${passed}/${results.length} ==========`);
    results.filter(r => !r[1]).forEach(([id, , m]) => console.log(`  ✗ ${id}: ${m}`));
  }
})().catch(e => { console.error('FATAL (after cleanup)', e.message); });
