const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
async function api(p){const r=await fetch(`${BASE}/api${p}`);return r.json()}
const slugify=s=>String(s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
(async()=>{
  const jobs=(await api('/jobs?limit=1000')).jobs;
  const job=jobs.find(j=>j.role&&(j.description||'').length>400)||jobs[0];
  const slug=`${slugify(job.company)}-${slugify(job.role||job.title)}-${job.id}`;
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  try{
    const ctx=await b.createBrowserContext();
    const p=await ctx.newPage(); await p.setViewport({width:390,height:1500,isMobile:true});
    await p.goto(`${BASE}/jobs/${slug}`,{waitUntil:'networkidle2'});
    await p.waitForFunction(()=>document.querySelector('h1')&&!/Loading job/i.test(document.body.innerText),{timeout:20000}); await sleep(1000);
    await p.screenshot({path:`${OUT}/typo-jobdetail-mobile.png`}); // viewport only, 1500 tall
    console.log('captured');
  } finally { await b.close(); }
})().catch(e=>console.error(e.message));
