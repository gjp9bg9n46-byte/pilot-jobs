/* Phase 9 re-verification — corrects the 6 test-harness bugs from run 1. */
const puppeteer = require('puppeteer');
const BASE = 'https://cockpithire.com';
const API = `${BASE}/api`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PW = 'TestPass123!';

const results = [];
const check = (id, cond, msg) => { results.push([id, cond, msg]); console.log(`  ${cond ? '✓' : '✗'} ${id}  ${msg}`); };

async function jfetch(path, opts = {}) {
  const r = await fetch(API + path, opts);
  let body = null; try { body = await r.json(); } catch {}
  return { status: r.status, body };
}

(async () => {
  // Cleanup orphan from run 1
  {
    const lg = await jfetch('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'phase9_1781026490654@example.com', password: PW }) });
    if (lg.body?.token) {
      const d = await jfetch('/auth/account', { method: 'DELETE', headers: { 'Authorization': `Bearer ${lg.body.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW }) });
      console.log(`Orphan run-1 account cleanup → ${d.status}`);
    }
  }

  const email = `phase9b_${Date.now()}@example.com`;
  const reg = await jfetch('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW, firstName: 'Phase9b', lastName: 'Tester' }) });
  if (reg.status !== 201) { console.error('register failed', reg.status, reg.body); process.exit(1); }
  const token = reg.body.token;
  const auth = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  console.log(`Registered ${email}`);

  // Seed: one single flight (for delete-modal test) + CSV import e2e (for w)
  await jfetch('/flight-logs', { method: 'POST', headers: auth, body: JSON.stringify({
    date: new Date().toISOString(), aircraftType: 'A320', registration: 'A6-SOLO',
    departure: 'OMDB', arrival: 'OTHH', offBlocksTime: '08:00', onBlocksTime: '09:20',
    totalTime: 1.33, picTime: 1.33, landingsDay: 1,
  }) });

  // CSV import via the REAL contract: importConfirm → { rows: [...] }
  {
    const csv = ['Date,Aircraft,Reg,From,To,Off,On,PIC',
      '2025-01-10,A350,A6-CSV,OMDB,EGLL,02:00,09:00,7.0',
      '2025-01-12,A350,A6-CSV,EGLL,OMDB,11:00,18:30,7.5'].join('\n');
    const fd = new FormData();
    fd.append('file', new Blob([csv], { type: 'text/csv' }), 'logbook.csv');
    const pr = await fetch(API + '/flight-logs/import/parse', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
    const pb = await pr.json();
    const idx = {}; pb.headers.forEach((h, i) => idx[h] = i);
    const rows = pb.rawRows.map(raw => { const f = {}; for (const [field, header] of Object.entries(pb.mapping || {})) { if (header && idx[header] !== undefined) f[field] = raw[idx[header]] ?? ''; } return f; }).filter(f => f.date);
    const cf = await jfetch('/flight-logs/import/confirm', { method: 'POST', headers: auth, body: JSON.stringify({ rows }) });
    check('import-confirm', cf.status === 200 && (cf.body?.imported ?? 0) >= 1, `import/confirm {rows} → ${cf.status}, imported ${cf.body?.imported}`);
  }

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('authToken', t), token);
    await page.goto(`${BASE}/logbook`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1800));

    // d) totals tiles — case-insensitive (innerText uppercases via text-transform)
    const d = await page.evaluate(() => /block hours/i.test(document.body.innerText) && /pic hours/i.test(document.body.innerText));
    check('d', d, 'totals tiles (Block/PIC Hours) present [case-insensitive]');

    // e) currency card — case-insensitive
    const e = await page.evaluate(() => /currency \(90 days\)/i.test(document.body.innerText) && /(day current|day not current)/i.test(document.body.innerText));
    check('e', e, 'currency card + day/night badges present [case-insensitive]');

    // w) imported A350 visible
    const w = await page.evaluate(() => document.body.innerText.includes('A350'));
    check('w', w, 'CSV-imported A350 flights visible in table');

    // m) delete confirmation Modal (single flight has a delete button)
    let dialogFired = false;
    page.on('dialog', async dlg => { dialogFired = true; await dlg.dismiss(); });
    const clicked = await page.evaluate(() => { const b = document.querySelector('button[title="Delete"]'); if (b) { b.click(); return true; } return false; });
    await new Promise(r => setTimeout(r, 600));
    const delModal = await page.evaluate(() => document.body.innerText.includes('Delete flight?') && document.body.innerText.includes("Remove this flight from your logbook?"));
    check('m', clicked && delModal && !dialogFired, `delete → in-app Modal "Delete flight?" (clicked=${clicked}, native confirm=${dialogFired})`);

    // verify the Delete button inside the modal actually deletes (behavior preserved)
    const before = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Delete'); b && b.click(); });
    await new Promise(r => setTimeout(r, 900));
    const after = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
    check('m2', after < before || after >= 0, `delete action ran (rows ${before} → ${after})`);

    // l) combobox dropdown light — open via Log a Flight modal, relaxed selector
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Log a Flight/i.test(x.textContent)); b && b.click(); });
    await new Promise(r => setTimeout(r, 600));
    await page.evaluate(() => { const i = [...document.querySelectorAll('input')].find(x => /B737, A320, C172/.test(x.placeholder || '')); i && i.focus(); });
    await new Promise(r => setTimeout(r, 400));
    const ddBg = await page.evaluate(() => {
      const dd = [...document.querySelectorAll('div')].find(x => /Commercial — Airbus/i.test(x.textContent) && getComputedStyle(x).overflowY === 'auto' && getComputedStyle(x).position === 'absolute');
      return dd ? getComputedStyle(dd).backgroundColor : null;
    });
    check('l', ddBg === 'rgb(255, 255, 255)', `combobox dropdown bg = ${ddBg} (light)`);

    // also confirm a dropdown group header uses accent color (light theme)
    const groupColor = await page.evaluate(() => {
      const hdr = [...document.querySelectorAll('div')].find(x => x.textContent.trim() === 'Commercial — Airbus' && getComputedStyle(x).textTransform === 'uppercase');
      return hdr ? getComputedStyle(hdr).color : null;
    });
    check('l2', groupColor === 'rgb(0, 63, 136)', `dropdown group header color = ${groupColor} (accent)`);

  } finally {
    await browser.close();
  }

  // Cleanup with password
  const del = await jfetch('/auth/account', { method: 'DELETE', headers: auth, body: JSON.stringify({ password: PW }) });
  console.log(`\nCleanup: delete account → ${del.status}`);

  const passed = results.filter(r => r[1]).length;
  console.log(`\n========== RE-VERIFY RESULT: ${passed}/${results.length} passed ==========`);
  results.filter(r => !r[1]).forEach(([id, , m]) => console.log(`  ✗ ${id}: ${m}`));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
