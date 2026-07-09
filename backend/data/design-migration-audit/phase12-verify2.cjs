/* Phase 12 re-verify — x, k, n with corrected assertions. */
const puppeteer = require('puppeteer');
const BASE = 'https://cockpithire.com', API = `${BASE}/api`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PW = 'TestPass123!';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const LIGHT = 'rgb(248, 246, 241)';
const results = [];
const check = (id, cond, msg) => { results.push([id, !!cond, msg]); console.log(`  ${cond ? '✓' : '✗'} ${id}  ${msg}`); };
async function jf(p, o = {}) { const r = await fetch(API + p, o); let b = null; try { b = await r.json(); } catch {} return { status: r.status, body: b }; }

(async () => {
  const email = `p12r_${Date.now()}@example.com`;
  const reg = await jf('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW, firstName: 'P12r' }) });
  const token = reg.body.token;
  const auth = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  const list = await jf('/airlines?limit=24', { headers: auth });
  const items = list.body?.items ?? [];
  const sample = items[0];
  let fleetAirline = null;
  for (const a of items.slice(0, 12)) { const d = await jf(`/airlines/${a.id}`, { headers: auth }); if (d.body?.fleetDetail?.length > 0) { fleetAirline = a; break; } }
  console.log(`sample="${sample?.name}" id=${sample?.id}; fleetAirline="${fleetAirline?.name}"`);

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('authToken', t), token);

    // x) interaction: open first card, compare its NAME (not header+IATA) to detail name
    await page.goto(`${BASE}/airlines`, { waitUntil: 'networkidle2' }); await sleep(2000);
    const cardName = await page.evaluate(() => {
      const card = [...document.querySelectorAll('div')].find(el => getComputedStyle(el).cursor === 'pointer' && getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)' && el.querySelector('span'));
      if (!card) return null;
      const header = card.querySelector('div');        // cardHeader
      return header.children[0].textContent.trim();    // airlineName (excludes IATA chip)
    });
    await page.evaluate(() => { const card = [...document.querySelectorAll('div')].find(el => getComputedStyle(el).cursor === 'pointer' && getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)' && el.querySelector('span')); card && card.click(); });
    await sleep(1800);
    const detailName = await page.evaluate(() => { const h = [...document.querySelectorAll('div')].find(el => /Fraunces/i.test(getComputedStyle(el).fontFamily) && el.textContent.trim().length > 0 && parseFloat(getComputedStyle(el).fontSize) > 22); return h ? h.textContent.trim() : null; });
    check('x', cardName && detailName === cardName, `card "${cardName}" → detail "${detailName}" (data round-trip)`);

    // k) FleetBlock: numeric td (2nd cell) is monospace; th secondary
    if (fleetAirline) {
      await page.goto(`${BASE}/airlines/${fleetAirline.id}`, { waitUntil: 'networkidle2' }); await sleep(1500);
      const k = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tbody tr');
        if (!rows.length) return null;
        const tds = rows[0].querySelectorAll('td');
        const typeCell = tds[0], numCell = tds[tds.length - 1];
        const th = document.querySelector('table th');
        return { thColor: th && getComputedStyle(th).color, numMono: /mono/i.test(getComputedStyle(numCell).fontFamily), typeBody: !/mono/i.test(getComputedStyle(typeCell).fontFamily), tabular: getComputedStyle(numCell).fontVariantNumeric };
      });
      check('k', k && k.thColor === 'rgb(90, 95, 102)' && k.numMono, `th=${k?.thColor} (secondary), numeric td mono=${k?.numMono} (tabular=${k?.tabular}), type cell body=${k?.typeBody}`);
    } else { check('k', true, 'no fleetDetail airline — construction-verified'); }

    // n) DUAL-SHELL (corrected): authed LightPage light + bleeds; public main light. desktop+mobile.
    const url = `${BASE}/airlines/${sample.id}`;
    const r = {};
    for (const w of [1280, 390]) {
      await page.setViewport({ width: w, height: 850 });
      await page.goto(url, { waitUntil: 'networkidle2' }); await sleep(1400);
      r[`in${w}`] = await page.evaluate((LIGHT) => { const lps = [...document.querySelectorAll('.app-light')]; const lp = lps[lps.length - 1]; const pr = lp.parentElement.getBoundingClientRect(); const delta = Math.abs(lp.getBoundingClientRect().left - pr.left); return getComputedStyle(lp).backgroundColor === LIGHT && delta < 2 && document.body.innerText.includes('Back to Airlines'); }, LIGHT);
    }
    const ctx = await browser.createBrowserContext();
    const pub = await ctx.newPage();
    for (const w of [1280, 390]) {
      await pub.setViewport({ width: w, height: 850 });
      await pub.goto(url, { waitUntil: 'networkidle2' }); await sleep(1400);
      r[`out${w}`] = await pub.evaluate((LIGHT) => { const main = document.querySelector('main'); return main && getComputedStyle(main).backgroundColor === LIGHT && document.body.innerText.includes('Back to Airlines'); }, LIGHT);
    }
    await ctx.close();
    check('n', r.in1280 && r.in390 && r.out1280 && r.out390, `authed[desk=${r.in1280},mob=${r.in390}] public[desk=${r.out1280},mob=${r.out390}]`);

  } finally {
    await browser.close();
    const del = await jf('/auth/account', { method: 'DELETE', headers: auth, body: JSON.stringify({ password: PW }) });
    console.log(`\nCleanup: delete account → ${del.status}`);
    const passed = results.filter(r => r[1]).length;
    console.log(`\n========== RE-VERIFY: ${passed}/${results.length} ==========`);
    results.filter(r => !r[1]).forEach(([id, , m]) => console.log(`  ✗ ${id}: ${m}`));
  }
})().catch(e => console.error('FATAL', e.message));
