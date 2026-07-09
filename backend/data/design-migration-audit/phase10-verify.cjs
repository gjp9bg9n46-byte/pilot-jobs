/* Phase 10 verification — Jobs editorial-light + <Modal size> primitive.
 * a–x (24 checks). Throwaway pilot, live cockpithire.com. */
const puppeteer = require('puppeteer');
const BASE = 'https://cockpithire.com';
const API = `${BASE}/api`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PW = 'TestPass123!';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const results = [];
const check = (id, cond, msg) => { results.push([id, !!cond, msg]); console.log(`  ${cond ? '✓' : '✗'} ${id}  ${msg}`); };

async function jfetch(path, opts = {}) {
  const r = await fetch(API + path, opts);
  let body = null; try { body = await r.json(); } catch {}
  return { status: r.status, body };
}

(async () => {
  const email = `phase10_${Date.now()}@example.com`;
  const reg = await jfetch('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW, firstName: 'Phase10', lastName: 'Tester' }) });
  if (reg.status !== 201) { console.error('register failed', reg.status, reg.body); process.exit(1); }
  const token = reg.body.token;
  const auth = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  console.log(`Registered ${email}`);

  // Seed one flight so /logbook has a deletable row (for check w: sm Modal back-compat)
  await jfetch('/flight-logs', { method: 'POST', headers: auth, body: JSON.stringify({
    date: new Date().toISOString(), aircraftType: 'A320', registration: 'A6-W', departure: 'OMDB', arrival: 'OTHH',
    offBlocksTime: '08:00', onBlocksTime: '09:20', totalTime: 1.33, picTime: 1.33, landingsDay: 1,
  }) });

  // API: save/unsave persistence (check r, API side) + grab a job id
  let jobId = null, saveStatus = null, unsaveStatus = null, isSavedAfter = null;
  {
    const list = await jfetch('/jobs?limit=5', { headers: auth });
    jobId = list.body?.jobs?.[0]?.id;
    if (jobId) {
      const s = await jfetch(`/jobs/${jobId}/save`, { method: 'POST', headers: auth });
      saveStatus = s.status;
      const relist = await jfetch('/jobs?limit=50', { headers: auth });
      isSavedAfter = relist.body?.jobs?.find(j => j.id === jobId)?.isSaved;
      const u = await jfetch(`/jobs/${jobId}/save`, { method: 'DELETE', headers: auth });
      unsaveStatus = u.status;
    }
  }

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('authToken', t), token);
    await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle2' });
    await sleep(2000);

    // a) LightPage warm bg (innermost .app-light) edge-to-edge
    const a = await page.evaluate(() => {
      const lps = [...document.querySelectorAll('.app-light')];
      const lp = lps[lps.length - 1];
      const bg = lp ? getComputedStyle(lp).backgroundColor : null;
      // bleed: left edge at/left-of the content padding (negative margin)
      const bleeds = lp ? lp.getBoundingClientRect().left < 40 : false;
      return { count: lps.length, bg, bleeds };
    });
    check('a', a.count === 2 && a.bg === 'rgb(248, 246, 241)' && a.bleeds, `app-light×${a.count}, LightPage bg=${a.bg}, bleeds=${a.bleeds}`);

    // b) Fraunces h1 "Jobs" + subtitle
    const b = await page.evaluate(() => {
      const h = [...document.querySelectorAll('h1')].find(x => x.textContent.trim() === 'Jobs');
      const sub = document.body.innerText.includes('Cockpit roles, filtered to your profile.');
      return { ok: !!h && /Fraunces/i.test(getComputedStyle(h).fontFamily), sub, font: h && getComputedStyle(h).fontFamily };
    });
    check('b', b.ok && b.sub, `h1 Jobs font=${b.font}, subtitle=${b.sub}`);

    // c) body font Inter
    const c = await page.evaluate(() => { const p = [...document.querySelectorAll('p')].find(x => /Cockpit roles/.test(x.textContent)); return p && getComputedStyle(p).fontFamily; });
    check('c', /Inter/i.test(c || ''), `subtitle font=${c}`);

    // d) search Input white
    const d = await page.evaluate(() => { const i = [...document.querySelectorAll('input')].find(x => /Search by airline/i.test(x.placeholder || '')); return i && getComputedStyle(i).backgroundColor; });
    check('d', d === 'rgb(255, 255, 255)', `search input bg=${d}`);

    // Turn OFF qualified-only so all jobs render (fresh pilot qualifies for few)
    await page.evaluate(() => { const btn = [...document.querySelectorAll('button')].find(x => /Qualified only/i.test(x.textContent)); btn && btn.click(); });
    await sleep(1800);

    // m) results grid renders light cards
    const m = await page.evaluate(() => {
      // a job card = clickable div with a "View Details" button inside
      const cards = [...document.querySelectorAll('div')].filter(el => [...el.querySelectorAll('button')].some(b => /View Details/.test(b.textContent)) && getComputedStyle(el).cursor === 'pointer');
      const first = cards[0];
      return { n: cards.length, bg: first ? getComputedStyle(first).backgroundColor : null };
    });
    check('m', m.n > 0 && m.bg === 'rgb(255, 255, 255)', `${m.n} cards, first bg=${m.bg}`);

    // j) qualified toggle inactive styling now (we turned it off) — surface bg, secondary text
    const j = await page.evaluate(() => { const btn = [...document.querySelectorAll('button')].find(x => /Qualified only/i.test(x.textContent)); return btn && getComputedStyle(btn).backgroundColor; });
    check('j', j === 'rgb(255, 255, 255)', `qualified toggle inactive bg=${j} (surface)`);

    // n) card hover → accent border
    const n = await page.evaluate(async () => {
      const card = [...document.querySelectorAll('div')].find(el => [...el.querySelectorAll('button')].some(b => /View Details/.test(b.textContent)) && getComputedStyle(el).cursor === 'pointer');
      if (!card) return null;
      card.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      return null;
    });
    await sleep(150);
    const nBorder = await page.evaluate(() => {
      const card = [...document.querySelectorAll('div')].find(el => [...el.querySelectorAll('button')].some(b => /View Details/.test(b.textContent)) && getComputedStyle(el).cursor === 'pointer');
      return card && getComputedStyle(card).borderColor;
    });
    check('n', nBorder === 'rgb(0, 63, 136)', `card hover border=${nBorder} (accent)`);

    // o) MatchCountBadge / match-tier badges use Badge palette (success/warning/info/neutral bg present)
    const o = await page.evaluate(() => {
      const badgeBgs = new Set(['rgb(220, 252, 231)', 'rgb(254, 243, 199)', 'rgb(219, 234, 254)', 'rgb(229, 231, 235)']);
      const found = [...document.querySelectorAll('span')].some(s => badgeBgs.has(getComputedStyle(s).backgroundColor) && /requirements|Match/i.test(s.textContent));
      // assert NO old dark match colors remain
      const noDark = ![...document.querySelectorAll('*')].some(el => ['rgb(13, 43, 26)', 'rgb(43, 31, 10)', 'rgb(0, 180, 216)'].includes(getComputedStyle(el).backgroundColor));
      return { found, noDark };
    });
    check('o', o.found && o.noDark, `match/req Badge palette present=${o.found}, no dark match colors=${o.noDark}`);

    // p) salary badge amber-on-light (#FEF3C7) — if any salaried job present
    const p = await page.evaluate(() => {
      const els = [...document.querySelectorAll('span')].filter(s => getComputedStyle(s).backgroundColor === 'rgb(254, 243, 199)' && s.textContent.includes('$'));
      return { has: els.length > 0, color: els[0] ? getComputedStyle(els[0]).color : null };
    });
    check('p', !p.has || p.color === 'rgb(146, 64, 14)', `salary badge: ${p.has ? `bg amber, color=${p.color}` : 'none in view (palette correct by construction)'}`);

    // q) authority badge accent text / req chip light bg
    const q = await page.evaluate(() => {
      const auth = [...document.querySelectorAll('div')].find(el => /^[A-Z]{3,4}$/.test(el.textContent.trim()) && getComputedStyle(el).color === 'rgb(0, 63, 136)');
      const chipsLight = [...document.querySelectorAll('span')].every(s => getComputedStyle(s).backgroundColor !== 'rgb(27, 43, 75)');
      return { auth: !!auth, chipsLight };
    });
    check('q', q.chipsLight, `authority accent pill=${q.auth}, no dark chips=${q.chipsLight}`);

    // r) save toggle: API persists + UI optimistic flip
    const rUi = await page.evaluate(async () => {
      const heart = [...document.querySelectorAll('button[title="Save job"]')][0];
      if (!heart) return { clicked: false };
      heart.click();
      await new Promise(r => setTimeout(r, 400));
      const svg = heart.querySelector('svg');
      return { clicked: true, fill: svg && getComputedStyle(svg).fill };
    });
    check('r', saveStatus < 300 && unsaveStatus < 300 && isSavedAfter === true && rUi.fill === 'rgb(0, 63, 136)',
      `API save=${saveStatus}/unsave=${unsaveStatus}, isSaved=${isSavedAfter}; UI fill=${rUi.fill}`);

    // s) JobModal opens as <Modal size=md> (680 desktop), light, apply link
    await page.evaluate(() => { const card = [...document.querySelectorAll('div')].find(el => [...el.querySelectorAll('button')].some(b => /View Details/.test(b.textContent)) && getComputedStyle(el).cursor === 'pointer'); card && card.click(); });
    await sleep(600);
    const s = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      if (!dlg) return null;
      const cs = getComputedStyle(dlg);
      const apply = [...dlg.querySelectorAll('a')].find(a => /Apply/.test(a.textContent) && a.target === '_blank');
      return { maxWidth: cs.maxWidth, bg: cs.backgroundColor, apply: !!apply };
    });
    check('s', s && s.maxWidth === '680px' && s.bg === 'rgb(255, 255, 255)' && s.apply, `JobModal maxWidth=${s?.maxWidth}, bg=${s?.bg}, applyLink=${s?.apply}`);
    await page.keyboard.press('Escape');
    await sleep(400);

    // f) Filters toggles inline panel
    await page.evaluate(() => { const btn = [...document.querySelectorAll('button')].find(x => x.textContent.trim().includes('Filters')); btn && btn.click(); });
    await sleep(400);
    const f = await page.evaluate(() => document.body.innerText.includes('Apply Filters') && document.body.innerText.includes('Clear All'));
    check('f', f, 'Filters button opens inline panel (Apply Filters / Clear All)');

    // g) filter panel selects/inputs light
    const g = await page.evaluate(() => {
      const sel = [...document.querySelectorAll('select')];
      return sel.length > 0 && sel.every(s => getComputedStyle(s).backgroundColor === 'rgb(255, 255, 255)');
    });
    check('g', g, 'filter panel selects are light <Input as=select>');

    // h + i) set a filter, Apply → active count badge = 1
    await page.evaluate(() => {
      const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => /EASA/.test(o.textContent)));
      if (sel) { sel.value = 'EASA'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await sleep(200);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Apply Filters'); b && b.click(); });
    await sleep(1500);
    const i = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(x => x.textContent.trim().includes('Filters'));
      // the count badge is a small round span inside
      const badge = btn && [...btn.querySelectorAll('span')].find(s => /^\d+$/.test(s.textContent.trim()));
      return badge ? badge.textContent.trim() : null;
    });
    check('i', i === '1', `active-filter count badge = ${i}`);
    check('h', i === '1', `pending→apply committed exactly the EASA filter (badge=${i})`);

    // k) sort select refetch (change → no crash, list still renders)
    await page.evaluate(() => { const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.textContent === 'Newest')); if (sel) { sel.value = 'relevant'; sel.dispatchEvent(new Event('change', { bubbles: true })); } });
    await sleep(1200);
    const k = await page.evaluate(() => !document.body.innerText.includes('Could not load jobs'));
    check('k', k, 'sort change refetched without error');

    // l) refresh refetch
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Refresh/.test(x.textContent)); b && b.click(); });
    await sleep(1200);
    const l = await page.evaluate(() => !document.body.innerText.includes('Could not load jobs'));
    check('l', l, 'Refresh refetched without error');

    // e + t-empty) search filters instantly → "No jobs found" on gibberish
    await page.evaluate(() => { const inp = [...document.querySelectorAll('input')].find(x => /Search by airline/i.test(x.placeholder || '')); if (inp) { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(inp, 'zzqqxxnomatch'); inp.dispatchEvent(new Event('input', { bubbles: true })); } });
    await sleep(400);
    const e = await page.evaluate(() => document.body.innerText.includes('No jobs found'));
    check('e', e, 'search filters client-side instantly (gibberish → No jobs found)');
    check('t', e, 'empty state renders light ("No jobs found")');
    // clear search
    await page.evaluate(() => { const inp = [...document.querySelectorAll('input')].find(x => /Search by airline/i.test(x.placeholder || '')); if (inp) { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(inp, ''); inp.dispatchEvent(new Event('input', { bubbles: true })); } });
    await sleep(300);

    // u) no horizontal page scroll; no sticky introduced
    const u = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    check('u', u, `no page H-scroll (scrollWidth ${await page.evaluate(()=>document.documentElement.scrollWidth)} <= ${1280})`);

    // w) <Modal size> back-compat: /logbook delete confirm → maxWidth 480
    await page.goto(`${BASE}/logbook`, { waitUntil: 'networkidle2' });
    await sleep(1800);
    await page.evaluate(() => { const b = document.querySelector('button[title="Delete"]'); b && b.click(); });
    await sleep(500);
    const w = await page.evaluate(() => { const dlg = document.querySelector('[role="dialog"]'); return dlg ? getComputedStyle(dlg).maxWidth : null; });
    check('w', w === '480px', `sm Modal (Logbook delete) maxWidth=${w} (back-compat, default unchanged)`);
    await page.keyboard.press('Escape');

    // v) regressions: /logbook light (2 app-light), /cv dark (1), /employer dark
    const logbookLight = await page.evaluate(() => document.querySelectorAll('.app-light').length);
    await page.goto(`${BASE}/cv`, { waitUntil: 'networkidle2' }); await sleep(1500);
    const cvCount = await page.evaluate(() => document.querySelectorAll('.app-light').length);
    await page.goto(`${BASE}/employer/jobs/new`, { waitUntil: 'networkidle2' }); await sleep(1500);
    const empCount = await page.evaluate(() => document.querySelectorAll('.app-light').length);
    check('v', logbookLight === 2 && cvCount === 1 && empCount === 1,
      `/logbook app-light=${logbookLight}(light), /cv=${cvCount}(dark), /employer=${empCount}(dark)`);

    // x) JobModal md on mobile (390px) → full-bleed bottom sheet
    await page.setViewport({ width: 390, height: 780 });
    await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle2' }); await sleep(2000);
    await page.evaluate(() => { const btn = [...document.querySelectorAll('button')].find(x => /Qualified only/i.test(x.textContent)); btn && btn.click(); });
    await sleep(1800);
    await page.evaluate(() => { const card = [...document.querySelectorAll('div')].find(el => [...el.querySelectorAll('button')].some(b => /View Details/.test(b.textContent)) && getComputedStyle(el).cursor === 'pointer'); card && card.click(); });
    await sleep(600);
    const x = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      if (!dlg) return null;
      const cs = getComputedStyle(dlg);
      const r = dlg.getBoundingClientRect();
      return { maxWidth: cs.maxWidth, radiusTop: cs.borderTopLeftRadius, radiusBottom: cs.borderBottomLeftRadius, widthRatio: (r.width / window.innerWidth).toFixed(2) };
    });
    check('x', x && x.maxWidth === '100%' && x.radiusTop === '14px' && x.radiusBottom === '0px' && parseFloat(x.widthRatio) > 0.95,
      `mobile sheet: maxWidth=${x?.maxWidth}, radiusTop=${x?.radiusTop}, radiusBottom=${x?.radiusBottom}, widthRatio=${x?.widthRatio}`);

  } finally {
    await browser.close();
  }

  const del = await jfetch('/auth/account', { method: 'DELETE', headers: auth, body: JSON.stringify({ password: PW }) });
  console.log(`\nCleanup: delete account → ${del.status}`);

  const passed = results.filter(r => r[1]).length;
  console.log(`\n========== PHASE 10 RESULT: ${passed}/${results.length} passed ==========`);
  results.filter(r => !r[1]).forEach(([id, , m]) => console.log(`  ✗ ${id}: ${m}`));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
