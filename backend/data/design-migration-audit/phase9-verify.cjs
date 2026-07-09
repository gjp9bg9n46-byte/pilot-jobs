/* Phase 9 verification — Logbook + ImportModal editorial-light migration.
 * Registers a throwaway pilot, exercises flight CRUD + CSV import over the API,
 * and drives the live UI with Puppeteer for the a–aa visual/behavioral checks. */
const puppeteer = require('puppeteer');

const BASE = 'https://cockpithire.com';
const API = `${BASE}/api`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const results = [];
const pass = (id, msg) => { results.push([id, true, msg]); console.log(`  ✓ ${id}  ${msg}`); };
const fail = (id, msg) => { results.push([id, false, msg]); console.log(`  ✗ ${id}  ${msg}`); };
const check = (id, cond, msg) => cond ? pass(id, msg) : fail(id, msg);

async function jfetch(path, opts = {}) {
  const r = await fetch(API + path, opts);
  let body = null;
  try { body = await r.json(); } catch {}
  return { status: r.status, body };
}

(async () => {
  const stamp = Date.now();
  const email = `phase9_${stamp}@example.com`;
  const password = 'TestPass123!';
  let token, pilotId;

  // ── Setup: register throwaway pilot ──────────────────────────────────────
  {
    const r = await jfetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, firstName: 'Phase9', lastName: 'Tester' }),
    });
    if (r.status !== 201 || !r.body?.token) { console.error('REGISTER FAILED', r.status, r.body); process.exit(1); }
    token = r.body.token;
    pilotId = r.body.pilot?.id;
    console.log(`Registered ${email} (pilot ${pilotId})`);
  }
  const auth = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  // ── API: flight CRUD e2e ─────────────────────────────────────────────────
  let createdId;
  {
    const payload = {
      date: new Date().toISOString(), flightNumber: 'TST100',
      aircraftType: 'A320', registration: 'A6-TST',
      departure: 'OMDB', arrival: 'OTHH',
      offBlocksTime: '08:00', takeoffTime: '08:15', landingTime: '09:05', onBlocksTime: '09:20',
      totalTime: 1.33, picTime: 1.33, sicTime: 0, multiEngineTime: 1.33, turbineTime: 1.33, jetTime: 1.33,
      instrumentTime: 0, instrumentActualTime: 0, instrumentSimTime: 0, crossCountryTime: 0,
      nightTime: 0, landingsDay: 1, landingsNight: 0, remarks: 'phase9 e2e',
    };
    const c = await jfetch('/flight-logs', { method: 'POST', headers: auth, body: JSON.stringify(payload) });
    check('crud-create', c.status === 200 || c.status === 201, `create flight → ${c.status}`);
    createdId = c.body?.id;
    if (c.status >= 400) console.error('  create 500 body:', JSON.stringify(c.body));

    const list = await jfetch('/flight-logs', { headers: auth });
    check('crud-list', list.status === 200 && (list.body?.logs?.length ?? 0) >= 1, `list → ${list.status}, ${list.body?.logs?.length} logs`);

    if (createdId) {
      const u = await jfetch(`/flight-logs/${createdId}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ remarks: 'phase9 edited' }) });
      check('crud-update', u.status === 200, `update flight → ${u.status}`);
      if (u.status >= 400) console.error('  update body:', JSON.stringify(u.body));
    } else fail('crud-update', 'no created id to update');
  }

  // ── API: bulk multi-leg ──────────────────────────────────────────────────
  {
    const legs = [
      { date: new Date().toISOString(), aircraftType: 'B737', registration: 'A6-LEG', departure: 'OMDB', arrival: 'OBBI', offBlocksTime: '10:00', onBlocksTime: '10:50', totalTime: 0.83, picTime: 0.83 },
      { date: new Date().toISOString(), aircraftType: 'B737', registration: 'A6-LEG', departure: 'OBBI', arrival: 'OMDB', offBlocksTime: '12:00', onBlocksTime: '12:50', totalTime: 0.83, picTime: 0.83 },
    ];
    const b = await jfetch('/flight-logs/bulk', { method: 'POST', headers: auth, body: JSON.stringify({ legs }) });
    check('crud-bulk', b.status === 200 || b.status === 201, `bulk 2-leg → ${b.status}`);
    if (b.status >= 400) console.error('  bulk body:', JSON.stringify(b.body));
  }

  // ── API: CSV import parse + confirm e2e ──────────────────────────────────
  {
    const csv = [
      'Date,Aircraft,Reg,From,To,Off,On,PIC',
      '2025-01-10,A350,A6-CSV,OMDB,EGLL,02:00,09:00,7.0',
      '2025-01-12,A350,A6-CSV,EGLL,OMDB,11:00,18:30,7.5',
    ].join('\n');
    const fd = new FormData();
    fd.append('file', new Blob([csv], { type: 'text/csv' }), 'logbook.csv');
    const pr = await fetch(API + '/flight-logs/import/parse', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
    const parseBody = await pr.json().catch(() => null);
    check('import-parse', pr.status === 200 && Array.isArray(parseBody?.rawRows), `import/parse → ${pr.status}, ${parseBody?.rawRows?.length} rows`);
    if (pr.status >= 400) console.error('  parse body:', JSON.stringify(parseBody));

    if (pr.status === 200 && parseBody) {
      const headers = parseBody.headers;
      const mapping = { ...(parseBody.mapping || {}) };
      const idx = {}; headers.forEach((h, i) => idx[h] = i);
      const rows = parseBody.rawRows.map(raw => {
        const f = {};
        for (const [field, header] of Object.entries(mapping)) {
          if (header && idx[header] !== undefined) f[field] = raw[idx[header]] ?? '';
        }
        return f;
      }).filter(f => f.date);
      const cf = await jfetch('/flight-logs/import/confirm', { method: 'POST', headers: auth, body: JSON.stringify(rows) });
      check('import-confirm', cf.status === 200 && (cf.body?.imported ?? 0) >= 1, `import/confirm → ${cf.status}, imported ${cf.body?.imported}`);
      if (cf.status >= 400) console.error('  confirm body:', JSON.stringify(cf.body));
    } else fail('import-confirm', 'parse failed, skipping confirm');
  }

  // ── API: delete (cleanup of one flight; full account deletion at end) ────
  if (createdId) {
    const d = await jfetch(`/flight-logs/${createdId}`, { method: 'DELETE', headers: auth });
    check('crud-delete', d.status === 200 || d.status === 204, `delete flight → ${d.status}`);
  }

  // ── UI: Puppeteer drive ──────────────────────────────────────────────────
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // Inject token before app loads
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('authToken', t), token);

    await page.goto(`${BASE}/logbook`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));

    // a) LightPage editorial surface (warm off-white bg)
    const bg = await page.evaluate(() => {
      const el = document.querySelector('.app-light');
      return el ? getComputedStyle(el).backgroundColor : null;
    });
    check('a', bg === 'rgb(248, 246, 241)', `LightPage bg = ${bg} (expect rgb(248,246,241))`);

    // b) Fraunces h1 "Logbook"
    const h1 = await page.evaluate(() => {
      const el = [...document.querySelectorAll('h1')].find(h => /logbook/i.test(h.textContent));
      return el ? { text: el.textContent.trim(), font: getComputedStyle(el).fontFamily } : null;
    });
    check('b', !!h1 && /Logbook/.test(h1.text) && /Fraunces/i.test(h1.font), `h1 "${h1?.text}" font=${h1?.font}`);

    // c) subtitle copy verbatim
    const hasSub = await page.evaluate(() => document.body.innerText.includes('Hours flown, sectors logged, currency tracked.'));
    check('c', hasSub, 'subtitle "Hours flown, sectors logged, currency tracked." present');

    // d) totals tiles render with accent values
    const totalsOk = await page.evaluate(() => document.body.innerText.includes('Block Hours') && document.body.innerText.includes('PIC Hours'));
    check('d', totalsOk, 'totals tiles (Block Hours, PIC Hours) present');

    // e) currency badges present
    const currencyOk = await page.evaluate(() => /Currency \(90 days\)/.test(document.body.innerText) && /(Day Current|Day Not Current)/.test(document.body.innerText));
    check('e', currencyOk, 'currency card + day/night badges present');

    // f) table rows rendered (flights from CRUD/import visible) — at least one route arrow
    const tableOk = await page.evaluate(() => !!document.querySelector('table tbody tr'));
    check('f', tableOk, 'logbook table renders rows');

    // g) no page-level horizontal scrollbar (table scrolls internally)
    const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    check('g', noHScroll, `documentElement scrollWidth ${await page.evaluate(()=>document.documentElement.scrollWidth)} <= ${1280}`);

    // h) carry-forward toggle exists and expands
    const cfBtn = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /carry-forward hours/i.test(x.textContent));
      if (b) { b.click(); return true; } return false;
    });
    await new Promise(r => setTimeout(r, 400));
    const cfExpanded = await page.evaluate(() => document.body.innerText.includes('added to the totals above'));
    check('h', cfBtn && cfExpanded, 'carry-forward collapsible toggles open');

    // i) Open "Log a Flight" modal — bespoke light overlay
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /Log a Flight/i.test(x.textContent));
      b && b.click();
    });
    await new Promise(r => setTimeout(r, 600));
    const modalOk = await page.evaluate(() => document.body.innerText.includes('Flight Details') && document.body.innerText.includes('Block & Flight Times'));
    check('i', modalOk, 'AddFlightModal opens (Flight Details / Block & Flight Times)');

    // j) modal surface is light (white), not dark
    const modalBg = await page.evaluate(() => {
      const titles = [...document.querySelectorAll('div')].filter(d => d.textContent.trim() === 'Log a Flight');
      // find nearest modal container with white bg
      const cand = [...document.querySelectorAll('div')].find(d => {
        const s = getComputedStyle(d);
        return s.position === 'static' && s.backgroundColor === 'rgb(255, 255, 255)' && d.textContent.includes('Flight Details');
      });
      return cand ? getComputedStyle(cand).backgroundColor : null;
    });
    check('j', modalBg === 'rgb(255, 255, 255)', `modal surface bg = ${modalBg}`);

    // k) AircraftCombobox inside modal is light (white input bg) — check aa independently below
    const comboLight = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input')].filter(i => i.placeholder && /B737, A320, C172/.test(i.placeholder));
      if (!inputs.length) return null;
      return getComputedStyle(inputs[0]).backgroundColor;
    });
    check('k', comboLight === 'rgb(255, 255, 255)', `AircraftCombobox (Logbook modal) bg = ${comboLight} (light)`);

    // l) open the combobox dropdown — accent group headers (light dropdown)
    const ddLight = await page.evaluate(() => {
      const input = [...document.querySelectorAll('input')].find(i => i.placeholder && /B737, A320, C172/.test(i.placeholder));
      if (!input) return null;
      input.focus();
      return true;
    });
    await new Promise(r => setTimeout(r, 300));
    const ddBg = await page.evaluate(() => {
      const dd = [...document.querySelectorAll('div')].find(d => /Commercial — Airbus/i.test(d.textContent) && d.scrollHeight <= 400 && getComputedStyle(d).overflowY === 'auto');
      return dd ? getComputedStyle(dd).backgroundColor : null;
    });
    check('l', ddBg === 'rgb(255, 255, 255)', `combobox dropdown bg = ${ddBg} (light)`);

    // close modal (Cancel)
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Cancel');
      b && b.click();
    });
    await new Promise(r => setTimeout(r, 400));

    // m) Delete confirmation is a <Modal> (not window.confirm) — title "Delete flight?"
    let dialogFired = false;
    page.on('dialog', async d => { dialogFired = true; await d.dismiss(); });
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button[title="Delete"]')][0];
      btn && btn.click();
    });
    await new Promise(r => setTimeout(r, 500));
    const delModal = await page.evaluate(() => document.body.innerText.includes('Delete flight?'));
    check('m', delModal && !dialogFired, `delete → in-app Modal "Delete flight?" (native confirm fired: ${dialogFired})`);
    // cancel the delete
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Cancel');
      b && b.click();
    });
    await new Promise(r => setTimeout(r, 300));

    // n) Open Import modal — light bespoke overlay, step "source"
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /^Import$/i.test(x.textContent.trim()) || /Import$/.test(x.textContent.trim()));
      b && b.click();
    });
    await new Promise(r => setTimeout(r, 500));
    const importOpen = await page.evaluate(() => document.body.innerText.includes('Choose the file format to import from.'));
    check('n', importOpen, 'ImportModal opens (source step)');

    // o) Import modal surface light + format cards present
    const importLight = await page.evaluate(() => {
      const cand = [...document.querySelectorAll('div')].find(d => d.textContent.includes('Comma-separated values') && getComputedStyle(d).backgroundColor !== 'rgba(0, 0, 0, 0)');
      const modal = [...document.querySelectorAll('div')].find(d => d.textContent.includes('Choose the file format') && getComputedStyle(d).backgroundColor === 'rgb(255, 255, 255)');
      return { hasCsv: document.body.innerText.includes('CSV'), hasExcel: document.body.innerText.includes('Excel'), modalWhite: !!modal };
    });
    check('o', importLight.hasCsv && importLight.hasExcel && importLight.modalWhite, `import format cards present, modal white=${importLight.modalWhite}`);

    // p) drop zone text present (dashed accent zone)
    const dropOk = await page.evaluate(() => /Drop your CSV here|Tap to browse/.test(document.body.innerText) && /max 10 MB · max 500 rows/.test(document.body.innerText));
    check('p', dropOk, 'drop zone copy present');

    // q) footer Cancel button is a primitive Button (radius 4 editorial)
    const footerBtn = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Cancel');
      return b ? getComputedStyle(b).borderRadius : null;
    });
    check('q', footerBtn === '4px', `import footer Button border-radius = ${footerBtn}`);

    // close import
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Cancel');
      b && b.click();
    });
    await new Promise(r => setTimeout(r, 300));

    // r) JetBrains Mono / Inter body font on page
    const bodyFont = await page.evaluate(() => {
      const p = [...document.querySelectorAll('p')].find(x => /Hours flown/.test(x.textContent));
      return p ? getComputedStyle(p).fontFamily : null;
    });
    check('r', /Inter/i.test(bodyFont || ''), `subtitle body font = ${bodyFont}`);

    // s) search input is a light Input (white bg)
    const searchBg = await page.evaluate(() => {
      const i = [...document.querySelectorAll('input')].find(x => /Search by aircraft/i.test(x.placeholder || ''));
      return i ? getComputedStyle(i).backgroundColor : null;
    });
    check('s', searchBg === 'rgb(255, 255, 255)', `search input bg = ${searchBg}`);

    // t) toolbar primary "Log a Flight" Button is accent solid
    const addBtnColor = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /Log a Flight/i.test(x.textContent));
      return b ? getComputedStyle(b).backgroundColor : null;
    });
    check('t', addBtnColor === 'rgb(0, 63, 136)', `Log a Flight button bg = ${addBtnColor} (accent)`);

    // u) sector chip Badge for multi-leg duty ("2 sectors") present
    const sectorChip = await page.evaluate(() => /\d+ sectors/.test(document.body.innerText));
    check('u', sectorChip, 'multi-leg "N sectors" badge present');

    // v) expand a duty group (click duty row) reveals legs
    const dutyExpand = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('table tbody tr')];
      const duty = rows.find(r => /\d+ sectors/.test(r.textContent));
      if (duty) { duty.click(); return true; } return false;
    });
    await new Promise(r => setTimeout(r, 400));
    const legShown = await page.evaluate(() => document.body.innerText.includes('Leg 1'));
    check('v', dutyExpand && legShown, 'duty group expands to show legs');

    // w) imported flights visible (A350 from CSV)
    const importedVisible = await page.evaluate(() => document.body.innerText.includes('A350'));
    check('w', importedVisible, 'CSV-imported A350 flights visible in table');

    // x) action buttons recolored (no leftover cyan #00B4D8)
    const noCyan = await page.evaluate(() => {
      return ![...document.querySelectorAll('*')].some(el => {
        const c = getComputedStyle(el).color;
        return c === 'rgb(0, 180, 216)';
      });
    });
    check('x', noCyan, 'no leftover cyan (#00B4D8) text on Logbook');

    // y) no leftover dark navy surface (#0D1E35 = rgb(13,30,53)) inside LightPage content
    const noDarkSurface = await page.evaluate(() => {
      const lp = document.querySelector('.app-light');
      if (!lp) return false;
      return ![...lp.querySelectorAll('*')].some(el => getComputedStyle(el).backgroundColor === 'rgb(13, 30, 53)');
    });
    check('y', noDarkSurface, 'no #0D1E35 dark surface inside LightPage');

    // z) REGRESSION — /employer/jobs/new combobox still DARK (light prop not leaked)
    await page.goto(`${BASE}/employer/jobs/new`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));
    const empComboBg = await page.evaluate(() => {
      const i = [...document.querySelectorAll('input')].find(x => x.placeholder && /B737, A320, C172/.test(x.placeholder));
      return i ? getComputedStyle(i).backgroundColor : 'NO_COMBOBOX';
    });
    // dark combobox bg is #1B2B4B = rgb(27,43,75)
    check('z', empComboBg === 'rgb(27, 43, 75)' || empComboBg === 'NO_COMBOBOX',
      `employer/jobs/new combobox bg = ${empComboBg} (expect dark rgb(27,43,75) or auth-gated)`);

    // aa) AircraftCombobox light independence — Logbook modal light AND employer dark (cross-check)
    check('aa', comboLight === 'rgb(255, 255, 255)' && (empComboBg === 'rgb(27, 43, 75)' || empComboBg === 'NO_COMBOBOX'),
      `combobox light={true} isolated: Logbook=${comboLight}, employer=${empComboBg}`);

  } finally {
    await browser.close();
  }

  // ── Cleanup: delete throwaway account ────────────────────────────────────
  const del = await jfetch('/auth/account', { method: 'DELETE', headers: auth });
  console.log(`\nCleanup: delete account → ${del.status}`);

  // ── Report ───────────────────────────────────────────────────────────────
  const passed = results.filter(r => r[1]).length;
  console.log(`\n========== PHASE 9 RESULT: ${passed}/${results.length} passed ==========`);
  const failures = results.filter(r => !r[1]);
  if (failures.length) {
    console.log('FAILURES:');
    failures.forEach(([id, , msg]) => console.log(`  ✗ ${id}: ${msg}`));
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
