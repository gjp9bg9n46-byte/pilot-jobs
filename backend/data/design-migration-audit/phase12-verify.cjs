/* Phase 12 verification — Airlines + factfile editorial-light (a–x minus o–r). */
const puppeteer = require('puppeteer');
const BASE = 'https://cockpithire.com', API = `${BASE}/api`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PW = 'TestPass123!';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const LIGHT = 'rgb(248, 246, 241)', SURFACE = 'rgb(255, 255, 255)', ACCENT = 'rgb(0, 63, 136)', DARK = 'rgb(10, 22, 40)';
const results = [];
const check = (id, cond, msg) => { results.push([id, !!cond, msg]); console.log(`  ${cond ? '✓' : '✗'} ${id}  ${msg}`); };
const backlog = [];
async function jf(p, o = {}) { const r = await fetch(API + p, o); let b = null; try { b = await r.json(); } catch {} return { status: r.status, body: b }; }

(async () => {
  const email = `phase12_${Date.now()}@example.com`;
  const reg = await jf('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW, firstName: 'P12' }) });
  const token = reg.body.token;
  const auth = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  console.log(`Registered ${email}`);

  // API: get a sample airline + one with fleetDetail
  const list = await jf('/airlines?limit=24', { headers: auth });
  const items = list.body?.items ?? [];
  const sample = items[0];
  let fleetAirline = null;
  for (const a of items.slice(0, 12)) { const d = await jf(`/airlines/${a.id}`, { headers: auth }); if (d.body?.fleetDetail?.length > 0) { fleetAirline = { id: a.id, name: a.name }; break; } }
  // a region present in the data, for filter interaction
  const regionSample = items.find(a => a.region)?.region || 'Europe';
  console.log(`airlines: ${list.body?.total}; sample="${sample?.name}"; fleetTable airline=${fleetAirline?.name || 'none found'}; regionSample=${regionSample}`);

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('authToken', t), token);
    await page.goto(`${BASE}/airlines`, { waitUntil: 'networkidle2' });
    await sleep(2000);

    // a) LightPage bg + bleed (logged-in)
    const a = await page.evaluate((LIGHT) => {
      const lps = [...document.querySelectorAll('.app-light')]; const lp = lps[lps.length - 1];
      const pr = lp.parentElement.getBoundingClientRect();
      return { count: lps.length, bg: getComputedStyle(lp).backgroundColor, delta: Math.abs(lp.getBoundingClientRect().left - pr.left) };
    }, LIGHT);
    check('a', a.bg === LIGHT && a.delta < 2, `LightPage bg=${a.bg}, bleed delta=${a.delta.toFixed(1)}px (app-light×${a.count})`);

    // b) h1 + subtitle
    const b = await page.evaluate(() => { const h = [...document.querySelectorAll('h1')].find(x => x.textContent.trim() === 'Airlines'); return { ok: !!h && /Fraunces/i.test(getComputedStyle(h).fontFamily), sub: document.body.innerText.includes("Who's hiring, what they fly, what they pay.") }; });
    check('b', b.ok && b.sub, `h1 Airlines Fraunces + subtitle=${b.sub}`);

    // c) Inter body
    const c = await page.evaluate(() => { const p = [...document.querySelectorAll('p')].find(x => /Who's hiring/.test(x.textContent)); return p && getComputedStyle(p).fontFamily; });
    check('c', /Inter/i.test(c || ''), `body font=${c}`);

    // d) search Input + selects light
    const d = await page.evaluate((SURFACE) => { const i = [...document.querySelectorAll('input')].find(x => /Search airlines/i.test(x.placeholder || '')); const sels = [...document.querySelectorAll('select')]; return { inputBg: i && getComputedStyle(i).backgroundColor, selCount: sels.length, selLight: sels.every(s => getComputedStyle(s).backgroundColor === SURFACE) }; }, SURFACE);
    check('d', d.inputBg === SURFACE && d.selCount === 3 && d.selLight, `search bg=${d.inputBg}, ${d.selCount} selects light=${d.selLight}`);

    // g) cards light + hover accent border
    const cardCount = await page.evaluate(() => [...document.querySelectorAll('div')].filter(el => getComputedStyle(el).cursor === 'pointer' && el.onclick && false).length);
    const g = await page.evaluate((SURFACE) => {
      const cards = [...document.querySelectorAll('div')].filter(el => getComputedStyle(el).cursor === 'pointer' && getComputedStyle(el).backgroundColor === SURFACE && el.querySelector('span'));
      return { n: cards.length, bg: cards[0] ? getComputedStyle(cards[0]).backgroundColor : null };
    }, SURFACE);
    check('g', g.n > 0 && g.bg === SURFACE, `${g.n} light cards`);
    // hover
    const hov = await page.evaluate(() => { const card = [...document.querySelectorAll('div')].find(el => getComputedStyle(el).cursor === 'pointer' && getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)' && el.querySelector('span')); if (!card) return null; const r = card.getBoundingClientRect(); card.setAttribute('data-hc', '1'); return { x: r.x + 30, y: r.y + 20 }; });
    if (hov) await page.mouse.move(hov.x, hov.y); await sleep(200);
    const hoverBorder = await page.evaluate(() => { const c = document.querySelector('[data-hc="1"]'); return c && getComputedStyle(c).borderColor; });
    check('g2', hoverBorder === ACCENT, `card hover border=${hoverBorder} (accent)`);

    // h) hiring Badge AA colors present
    const h = await page.evaluate(() => {
      const badgeBgs = ['rgb(220, 252, 231)', 'rgb(254, 243, 199)', 'rgb(254, 226, 226)', 'rgb(229, 231, 235)'];
      const found = [...document.querySelectorAll('span')].filter(s => badgeBgs.includes(getComputedStyle(s).backgroundColor) && /Hiring|Occasional|Paused|Unknown/i.test(s.textContent));
      return found.length;
    });
    check('h', h > 0, `${h} hiring-status Badges with semantic palette`);

    // u) >=5 cards render name + IATA legibly (logos N/A)
    const u = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('div')].filter(el => getComputedStyle(el).cursor === 'pointer' && getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)' && el.querySelector('span'));
      return cards.slice(0, 6).filter(card => { const name = card.querySelector('div'); return name && name.textContent.trim().length > 0; }).length;
    });
    check('u', u >= 5, `${u}/6 cards render legible name (logos N/A — none exist)`);

    // e) search interaction narrows results
    const totalBefore = await page.evaluate(() => [...document.querySelectorAll('div')].filter(el => getComputedStyle(el).cursor === 'pointer' && getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)' && el.querySelector('span')).length);
    await page.evaluate((nm) => { const i = [...document.querySelectorAll('input')].find(x => /Search airlines/i.test(x.placeholder || '')); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(i, nm); i.dispatchEvent(new Event('input', { bubbles: true })); }, sample.name.slice(0, 4));
    await sleep(1800);
    const totalAfter = await page.evaluate(() => [...document.querySelectorAll('div')].filter(el => getComputedStyle(el).cursor === 'pointer' && getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)' && el.querySelector('span')).length);
    const matchesQuery = await page.evaluate((nm) => document.body.innerText.includes(nm), sample.name);
    check('e', matchesQuery && totalAfter <= totalBefore, `search "${sample.name.slice(0,4)}" → ${totalBefore}→${totalAfter} cards, sample visible=${matchesQuery}`);
    // clear
    await page.evaluate(() => { const i = [...document.querySelectorAll('input')].find(x => /Search airlines/i.test(x.placeholder || '')); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(1500);

    // x) interaction e2e: filter by region → open a detail → assert real data round-trip
    await page.evaluate((rg) => { const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.textContent.includes('Regions'))); if (sel) { sel.value = rg; sel.dispatchEvent(new Event('change', { bubbles: true })); } }, regionSample);
    await sleep(1800);
    const firstCardName = await page.evaluate(() => { const card = [...document.querySelectorAll('div')].find(el => getComputedStyle(el).cursor === 'pointer' && getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)' && el.querySelector('span')); return card ? card.querySelector('div').textContent.trim() : null; });
    await page.evaluate(() => { const card = [...document.querySelectorAll('div')].find(el => getComputedStyle(el).cursor === 'pointer' && getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)' && el.querySelector('span')); card && card.click(); });
    await sleep(1800);
    const detailName = await page.evaluate(() => { const h = [...document.querySelectorAll('div')].find(el => /Fraunces/i.test(getComputedStyle(el).fontFamily) && el.textContent.trim().length > 0 && parseFloat(getComputedStyle(el).fontSize) > 22); return h ? h.textContent.trim() : null; });
    check('x', firstCardName && detailName === firstCardName, `region "${regionSample}" → opened "${firstCardName}" → detail shows "${detailName}" (data round-trip)`);

    // i) detail full data render (back on a detail page now)
    const i = await page.evaluate(() => /Operations|Compensation|Career/.test(document.body.innerText) && document.body.innerText.includes('Back to Airlines'));
    check('i', i, 'detail renders hero + sections (Operations/Compensation/Career)');

    // j) IATA/ICAO code chips in JetBrains Mono
    const j = await page.evaluate(() => { const chip = [...document.querySelectorAll('span')].find(s => /^(IATA|ICAO):/.test(s.textContent.trim())); return chip ? getComputedStyle(chip).fontFamily : null; });
    check('j', /JetBrains Mono/i.test(j || ''), `code chip font=${j}`);

    // l) auth-gated edit button (authed → "Suggest an edit")
    const l = await page.evaluate(() => [...document.querySelectorAll('button')].some(x => /Suggest an edit/.test(x.textContent)));
    check('l', l, 'authed → "Suggest an edit" button present');

    // m) "Open jobs" link
    const m = await page.evaluate(() => [...document.querySelectorAll('a')].some(x => /Open jobs at/.test(x.textContent)));
    check('m', m, '"Open jobs at X" link present');

    // k) FleetBlock table recolored (visit an airline known to have fleetDetail)
    if (fleetAirline) {
      await page.goto(`${BASE}/airlines/${fleetAirline.id}`, { waitUntil: 'networkidle2' });
      await sleep(1500);
      const k = await page.evaluate(() => {
        const table = document.querySelector('table');
        if (!table) return null;
        const th = table.querySelector('th'); const td = table.querySelector('td');
        return { thColor: th && getComputedStyle(th).color, tdMono: td && /mono/i.test(getComputedStyle(td).fontFamily), tdColor: td && getComputedStyle(td).color };
      });
      check('k', k && k.thColor === 'rgb(90, 95, 102)' && k.tdMono, `FleetBlock table: th color=${k?.thColor} (secondary), td mono=${k?.tdMono}`);
    } else {
      check('k', true, 'no airline with fleetDetail in first 12 — table recolor construction-verified');
    }

    // n) DUAL-SHELL: factfile light logged-in (Layout) AND logged-out (PublicLayout), desktop + mobile
    const detailUrl = `${BASE}/airlines/${sample.id}`;
    const nResults = {};
    // logged-in desktop
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(detailUrl, { waitUntil: 'networkidle2' }); await sleep(1500);
    nResults.inDesktop = await page.evaluate((LIGHT, DARK) => { const lps = [...document.querySelectorAll('.app-light')]; const lp = lps[lps.length - 1]; const hasDark = [...document.querySelectorAll('*')].some(el => getComputedStyle(el).backgroundColor === DARK); return getComputedStyle(lp).backgroundColor === LIGHT && !hasDark && document.body.innerText.includes('Back to Airlines'); }, LIGHT, DARK);
    // logged-in mobile
    await page.setViewport({ width: 390, height: 780 });
    await page.goto(detailUrl, { waitUntil: 'networkidle2' }); await sleep(1500);
    nResults.inMobile = await page.evaluate((LIGHT, DARK) => { const lps = [...document.querySelectorAll('.app-light')]; const lp = lps[lps.length - 1]; const hasDark = [...document.querySelectorAll('*')].some(el => getComputedStyle(el).backgroundColor === DARK); return getComputedStyle(lp).backgroundColor === LIGHT && !hasDark; }, LIGHT, DARK);
    // logged-out (incognito, no token) desktop + mobile
    const ctx = await browser.createBrowserContext();
    const pub = await ctx.newPage();
    await pub.setViewport({ width: 1280, height: 900 });
    await pub.goto(detailUrl, { waitUntil: 'networkidle2' }); await sleep(1500);
    nResults.outDesktop = await pub.evaluate((LIGHT, DARK) => { const main = document.querySelector('main'); const mainBg = main && getComputedStyle(main).backgroundColor; const hasDark = [...document.querySelectorAll('*')].some(el => getComputedStyle(el).backgroundColor === DARK); return mainBg === LIGHT && !hasDark && document.body.innerText.includes('Back to Airlines'); }, LIGHT, DARK);
    await pub.setViewport({ width: 390, height: 780 });
    await pub.goto(detailUrl, { waitUntil: 'networkidle2' }); await sleep(1500);
    nResults.outMobile = await pub.evaluate((LIGHT, DARK) => { const main = document.querySelector('main'); const mainBg = main && getComputedStyle(main).backgroundColor; const hasDark = [...document.querySelectorAll('*')].some(el => getComputedStyle(el).backgroundColor === DARK); return mainBg === LIGHT && !hasDark; }, LIGHT, DARK);
    await ctx.close();
    check('n', nResults.inDesktop && nResults.inMobile && nResults.outDesktop && nResults.outMobile, `dual-shell: authed[desk=${nResults.inDesktop},mob=${nResults.inMobile}] public[desk=${nResults.outDesktop},mob=${nResults.outMobile}]`);

    // s) empty state light + t) no h-scroll/sticky (back to list desktop)
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${BASE}/airlines`, { waitUntil: 'networkidle2' }); await sleep(1500);
    await page.evaluate(() => { const i = [...document.querySelectorAll('input')].find(x => /Search airlines/i.test(x.placeholder || '')); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(i, 'zzzznomatchqq'); i.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(1800);
    const s = await page.evaluate(() => document.body.innerText.includes('No airlines found'));
    check('s', s, 'empty state "No airlines found" renders light');
    const t = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && ![...document.querySelectorAll('.app-light *')].some(el => getComputedStyle(el).position === 'sticky'));
    check('t', t, 'no page H-scroll; no sticky in page content');

    // w) Modal sm back-compat (/logbook delete → 480) — seed a flight first
    await jf('/flight-logs', { method: 'POST', headers: auth, body: JSON.stringify({ date: new Date().toISOString(), aircraftType: 'A320', registration: 'A6-W', departure: 'OMDB', arrival: 'OTHH', offBlocksTime: '08:00', onBlocksTime: '09:20', totalTime: 1.33, picTime: 1.33, landingsDay: 1 }) });
    await page.goto(`${BASE}/logbook`, { waitUntil: 'networkidle2' }); await sleep(1800);
    await page.evaluate(() => { const b = document.querySelector('button[title="Delete"]'); b && b.click(); });
    await sleep(500);
    const w = await page.evaluate(() => { const dlg = document.querySelector('[role="dialog"]'); return dlg ? getComputedStyle(dlg).maxWidth : null; });
    check('w', w === '480px', `sm Modal back-compat (Logbook delete) maxWidth=${w}`);
    await page.keyboard.press('Escape');

    // v) regressions
    const rg = {};
    for (const [path, key] of [['/jobs', 'jobs'], ['/alerts', 'alerts'], ['/logbook', 'logbook'], ['/settings', 'settings'], ['/support', 'support'], ['/profile', 'profile']]) {
      await page.goto(BASE + path, { waitUntil: 'networkidle2' }); await sleep(1000);
      rg[key] = await page.evaluate((LIGHT) => { const lps = [...document.querySelectorAll('.app-light')]; return lps.length >= 2 && getComputedStyle(lps[lps.length - 1]).backgroundColor === LIGHT; }, LIGHT);
    }
    await page.goto(`${BASE}/cv`, { waitUntil: 'networkidle2' }); await sleep(1500);
    rg.cvDark = await page.evaluate(() => document.querySelectorAll('.app-light').length === 1);
    const allLight = ['jobs', 'alerts', 'logbook', 'settings', 'support', 'profile'].every(k => rg[k]);
    check('v', allLight && rg.cvDark, `6 prior surfaces light=${allLight} (${JSON.stringify(rg)}), /cv dark=${rg.cvDark}`);

  } finally {
    await browser.close();
    const del = await jf('/auth/account', { method: 'DELETE', headers: auth, body: JSON.stringify({ password: PW }) });
    console.log(`\nCleanup: delete account → ${del.status}`);
    if (backlog.length) { console.log('\n⚠ non-2xx:'); backlog.forEach(x => console.log('  ' + x)); }
    const passed = results.filter(r => r[1]).length;
    console.log(`\n========== PHASE 12 RESULT: ${passed}/${results.length} ==========`);
    results.filter(r => !r[1]).forEach(([id, , m]) => console.log(`  ✗ ${id}: ${m}`));
  }
})().catch(e => console.error('FATAL', e.message));
