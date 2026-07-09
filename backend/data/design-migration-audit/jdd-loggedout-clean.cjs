const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
async function api(p){const r=await fetch(`${BASE}/api${p}`);return r.json()}
const slugify=s=>String(s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
(async()=>{
  const jobs=(await api('/jobs?limit=1000')).jobs;
  const job=jobs.find(j=>j.role&&(j.description||'').length>50)||jobs[0];
  const slug=`${slugify(job.company)}-${slugify(job.role||job.title)}-${job.id}`;
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  try{
    const ctx=await b.createBrowserContext(); // isolated, no shared localStorage
    const p=await ctx.newPage(); await p.setViewport({width:1280,height:2000});
    await p.goto(`${BASE}/jobs/${slug}`,{waitUntil:'networkidle2'});
    await p.waitForFunction(()=>document.querySelector('h1')&&!/Loading job/i.test(document.body.innerText),{timeout:20000}); await sleep(1200);
    const r=await p.evaluate(()=>({signin:/Sign in to see your match/i.test(document.body.innerText),reqHeaders:[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&/^Requirements$/i.test(e.textContent.trim())).length,jd:/Job Description/i.test(document.body.innerText),missing:/WHAT YOU'RE MISSING/i.test(document.body.innerText)}));
    console.log('LOGGED-OUT (clean ctx):',JSON.stringify(r));
    console.log(r.signin&&r.reqHeaders===0&&!r.missing&&r.jd ? '  ✓ sign-in panel → Job Description, no Requirements, no missing' : '  ✗ unexpected');
    await p.screenshot({path:`${OUT}/jdd-loggedout.png`,fullPage:false});
  } finally { await b.close(); }
})().catch(e=>console.error('FATAL',e.message,e.stack));
