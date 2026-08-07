'use strict';
// One-time headless ATS discovery (discovery only, NOT in the runtime pipeline).
const puppeteer = require('puppeteer');

const CARRIERS = [
  ['Alaska',   'https://careers.alaskaair.com/'],
  ['Atlas Air','https://careers.atlasair.com/'],
  ['Hawaiian', 'https://careers.hawaiianairlines.com/'],
  ['WestJet',  'https://careers.westjet.com/'],
  ['Cathay',   'https://careers.cathaypacific.com/'],
  ['Qantas',   'https://qantas.wd3.myworkdayjobs.com/qantas'],
  ['Envoy',    'https://jobs.envoyair.com/'],
  ['PSA',      'https://careers.psaairlines.com/'],
  ['SkyWest',  'https://www.skywest.com/skywest-airline-jobs/pilots/'],
  ['Avelo',    'https://www.aveloair.com/pages/careers'],
];

const ATS = /myworkdayjobs\.com|[a-z0-9-]+\.icims\.com|avature\.net|greenhouse\.io|jobs\.lever\.co|phenompeople\.com|successfactors|smartrecruiters\.com|jobvite|taleo\.net|recruiting\.ultipro|eightfold|ashbyhq|dayforce|paylocity|jibe|workforcenow|brassring|oraclecloud/i;
const NOISE = /google|gstatic|facebook|doubleclick|cookiebot|onetrust|cloudflare|hotjar|segment|cdn\.jsdelivr|fonts|analytics|licdn|linkedin\.com\/li|bing|adobe|demdex|newrelic|sentry|recaptcha|youtube|twitter|bat\.bing/i;

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });
  for (const [name, url] of CARRIERS) {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36');
    const atsHits = new Set();
    const otherHosts = new Set();
    page.on('request', (r) => {
      const u = r.url();
      if (ATS.test(u)) { try { atsHits.add(new URL(u).host); } catch {} }
      else if (!NOISE.test(u) && /^https/.test(u)) { try { const h = new URL(u).host; if (!h.includes(new URL(url).host.replace(/^www\.|^careers\.|^jobs\./, ''))) otherHosts.add(h); } catch {} }
    });
    let domHits = [];
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise((r) => setTimeout(r, 3500));
      // try clicking a search/jobs affordance to trigger ATS XHRs
      const clicked = await page.evaluate(() => {
        const el = [...document.querySelectorAll('a,button')].find((e) => /search jobs|view (all )?jobs|find jobs|all opportunities|job search|search openings|apply|current openings/i.test(e.textContent || ''));
        if (el) { el.click(); return el.textContent.trim().slice(0, 30); }
        return null;
      }).catch(() => null);
      if (clicked) await new Promise((r) => setTimeout(r, 3500));
      // scrape DOM (iframes, links, inline config) for ATS tenant strings
      domHits = await page.evaluate((re) => {
        const rx = new RegExp(re, 'ig');
        const text = document.documentElement.outerHTML;
        return [...new Set((text.match(rx) || []).slice(0, 400))].slice(0, 5);
      }, ATS.source).catch(() => []);
    } catch (e) { /* keep captures */ }
    console.log(`\n### ${name}`);
    if (atsHits.size) console.log('   ATS network hosts: ' + [...atsHits].join(', '));
    if (domHits.length) console.log('   ATS in DOM: ' + domHits.join(' | '));
    if (!atsHits.size && !domHits.length) console.log('   other hosts: ' + ([...otherHosts].slice(0, 6).join(', ') || '(none)'));
    await page.close().catch(() => {});
  }
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('DISCOVER FAILED:', e.message); process.exit(1); });
