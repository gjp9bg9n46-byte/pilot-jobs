'use strict';
// One-time headless XHR discovery: load each SPA careers page once and capture
// the JSON/XHR data endpoints it calls (discovery only, NOT in the pipeline).
const puppeteer = require('puppeteer');

const OPERATORS = [
  ['AvionExpress', 'https://careers.avionexpress.aero/'],
  ['SmartLynx',    'https://www.smartlynx.aero/careers'],
  ['Airhub',       'https://airhubairlines.com/careers/'],
  ['Heston',       'https://heston.aero/careers/'],
  ['Fly2Sky',      'https://fly2sky.com/en/careers/'],
  ['Wamos',        'https://wamosair.com/work-with-us/'],
  ['PrivilegeStyle','https://www.privilegestyle.com/en/work-with-us/'],
  ['Xfly',         'https://www.xfly.eu/careers'],
  ['Amapola',      'https://www.amapola.nu/lediga-tjanster/'],
  ['DAT',          'https://dat.dk/en/corporate/careers/'],
  ['AirGreenland', 'https://www.airgreenland.com/careers'],
  ['GulfAir',      'https://www.gulfair.com/careers'],
  ['OmanAir',      'https://www.omanair.com/careers'],
  ['LATAM',        'https://talent.latam.com/'],
  ['Avianca',      'https://www.avianca.com/careers'],
];

// Data-endpoint signal: JSON response OR URL hinting at a jobs feed.
const DATA_URL = /\/(jobs|positions|vacancies|openings|requisition|recruit|careers?\/api|api\/.*job|offers|search)/i;
const KNOWN_ATS = /recruitee|teamtailor|bamboohr|personio|breezy|greenhouse|lever|myworkdayjobs|icims|ashbyhq|smartrecruiters|successfactors|oraclecloud|jibe|phenom|jobvite|workable|factorial/i;
const NOISE = /google|gstatic|facebook|doubleclick|cookiebot|onetrust|hotjar|segment|cdn\.|fonts|analytics|sentry|recaptcha|youtube|clarity|gtm|tagmanager|linkedin|bing/i;

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });
  for (const [name, url] of OPERATORS) {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    const hits = new Map(); // url -> {status, ctype, ats, sample}
    page.on('response', async (resp) => {
      try {
        const u = resp.url();
        if (NOISE.test(u)) return;
        const ct = resp.headers()['content-type'] || '';
        const isJson = /json/i.test(ct);
        const ats = KNOWN_ATS.test(u);
        if (!isJson && !DATA_URL.test(u) && !ats) return;
        let sample = '';
        if (isJson) { try { const t = await resp.text(); sample = t.slice(0, 140).replace(/\s+/g, ' '); } catch {} }
        if (isJson || ats || DATA_URL.test(u)) hits.set(u.slice(0, 160), { status: resp.status(), ct: ct.split(';')[0], ats, sample });
      } catch {}
    });
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise((r) => setTimeout(r, 3500));
      // click a jobs/search affordance to trigger lazy XHRs
      await page.evaluate(() => {
        const el = [...document.querySelectorAll('a,button')].find((e) => /vacanc|job|position|opening|apply|career|search/i.test(e.textContent || ''));
        if (el) el.click();
      }).catch(() => {});
      await new Promise((r) => setTimeout(r, 3500));
    } catch (e) { /* keep captures */ }
    console.log(`\n### ${name}  (${url})`);
    const rows = [...hits.entries()].filter(([, v]) => v.ats || /json/i.test(v.ct));
    if (!rows.length) console.log('   (no JSON/ATS data endpoint captured)');
    for (const [u, v] of rows.slice(0, 8)) {
      console.log(`   [${v.status}] ${v.ct}${v.ats ? ' ★ATS' : ''}  ${u}`);
      if (v.sample) console.log(`        ${v.sample}`);
    }
    await page.close().catch(() => {});
  }
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('XHR DISCOVER FAILED:', e.message); process.exit(1); });
