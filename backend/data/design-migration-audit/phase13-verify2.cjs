/* Phase 13 re-verify — f (diagnostic), k (visible-surface), o (corrected regressions). */
const puppeteer = require('puppeteer');
const BASE = 'https://cockpithire.com', API = `${BASE}/api`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PW = 'TestPass123!';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const LIGHT = 'rgb(248, 246, 241)', SURFACE = 'rgb(255, 255, 255)';
const results = [];
const check = (id, cond, msg) => { results.push([id, !!cond, msg]); console.log(`  ${cond ? '✓' : '✗'} ${id}  ${msg}`); };
async function jf(p, o = {}) { const r = await fetch(API + p, o); let b = null; try { b = await r.json(); } catch {} return { status: r.status, body: b }; }
async function waitPreview(page, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(() => { const f = document.querySelector('iframe[title="CV Preview"]'); return f && f.src && f.src.startsWith('blob:'); })) return true; await sleep(500); } return false; }

(async () => {
  const email = `p13b_${Date.now()}@example.com`;
  const reg = await jf('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW, firstName: 'P13b' }) });
  const token = reg.body.token;
  const auth = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  await jf('/cv', { method: 'PUT', headers: auth, body: JSON.stringify({ summary: 'Test summary', skills: ['CRM'], education: [{ institution: 'X', degree: 'ATPL', year: '2019' }], languages: [], other: [], accentColor: '#722f37' }) });
  console.log(`Registered ${email}`);

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('authToken', t), token);
    await page.goto(`${BASE}/cv`, { waitUntil: 'networkidle2' });
    await waitPreview(page); await sleep(1500);

    // f) diagnostic: list inputs/textareas (non-file) + bgs; open an accordion to expand fields
    await page.evaluate(() => { const acc = [...document.querySelectorAll('div')].find(el => el.textContent.trim().startsWith('Skills') && getComputedStyle(el).cursor === 'pointer'); acc && acc.click(); });
    await sleep(400);
    const f = await page.evaluate((SURFACE) => {
      const inputs = [...document.querySelectorAll('input, textarea')].filter(i => i.type !== 'file');
      const detail = inputs.map(i => ({ tag: i.tagName, ph: (i.placeholder || '').slice(0, 18), bg: getComputedStyle(i).backgroundColor }));
      return { count: inputs.length, allWhite: inputs.length > 0 && inputs.every(i => getComputedStyle(i).backgroundColor === SURFACE), detail };
    }, SURFACE);
    console.log('   inputs:', JSON.stringify(f.detail));
    check('f', f.allWhite, `${f.count} editor inputs, all white=${f.allWhite}`);

    // k) sticky: scroll inner container, assert the VISIBLE element at the pane top is light (no dark seam)
    await page.evaluate(() => { const sc = [...document.querySelectorAll('div')].find(el => getComputedStyle(el).overflowY === 'auto' && el.scrollHeight > el.clientHeight); if (sc) sc.scrollTop = 800; });
    await sleep(600);
    const k = await page.evaluate(() => {
      const pane = [...document.querySelectorAll('div')].find(el => getComputedStyle(el).position === 'sticky');
      const r = pane.getBoundingClientRect();
      // sample 3 points down the LEFT edge of the preview column at the pane's pinned top
      const pts = [r.top + 1, r.top + 8, r.top + 20].map(y => {
        const el = document.elementFromPoint(r.left + 4, y);
        return el ? getComputedStyle(el).backgroundColor : null;
      });
      const DARK = 'rgb(10, 22, 40)', NAVY = 'rgb(13, 30, 53)';
      const anyVisibleDark = pts.some(c => c === DARK || c === NAVY);
      return { top: Math.round(r.top), pinned: r.top >= 0 && r.top < 130, pts, anyVisibleDark };
    });
    check('k', k.pinned && !k.anyVisibleDark, `sticky pinned top=${k.top}, visible-top bgs=[${k.pts.join(', ')}], visible dark seam=${k.anyVisibleDark}`);

    // o) regressions — /cv now light + prior light surfaces; admin/employer dark-by-construction (redirect for non-admin, can't observe)
    const cvN = await page.evaluate(() => document.querySelectorAll('.app-light').length);
    const lit = {};
    for (const [path, key] of [['/jobs','jobs'],['/alerts','alerts'],['/logbook','logbook'],['/profile','profile'],['/settings','settings'],['/support','support'],['/airlines','airlines']]) {
      await page.goto(BASE + path, { waitUntil: 'networkidle2' }); await sleep(900);
      lit[key] = await page.evaluate((LIGHT) => { const lps=[...document.querySelectorAll('.app-light')]; return lps.length>=2 && getComputedStyle(lps[lps.length-1]).backgroundColor===LIGHT; }, LIGHT);
    }
    const allPriorLight = Object.values(lit).every(Boolean);
    check('o', cvN === 2 && allPriorLight, `/cv now light(app-light=${cvN}); prior light surfaces all light=${allPriorLight} ${JSON.stringify(lit)}`);

  } finally {
    await browser.close();
    const del = await jf('/auth/account', { method: 'DELETE', headers: auth, body: JSON.stringify({ password: PW }) });
    console.log(`\nCleanup: delete account → ${del.status}`);
    const passed = results.filter(r => r[1]).length;
    console.log(`\n========== RE-VERIFY: ${passed}/${results.length} ==========`);
    results.filter(r => !r[1]).forEach(([id, , m]) => console.log(`  ✗ ${id}: ${m}`));
  }
})().catch(e => console.error('FATAL', e.message));
