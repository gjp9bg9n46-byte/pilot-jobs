const puppeteer = require('puppeteer');
const BASE='https://cockpithire.com', CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
async function api(p){const r=await fetch(`${BASE}/api${p}`);return r.json()}
const slugify=s=>String(s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
(async()=>{
  const jobs=(await api('/jobs?limit=1000')).jobs;
  const j=jobs.slice().sort((a,b)=>(b.description||'').length-(a.description||'').length)[0];
  const slug=`${slugify(j.company)}-${slugify(j.role||j.title)}-${j.id}`;
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  try{
    const p=await b.newPage(); await p.setViewport({width:900,height:1600});
    await p.goto(`${BASE}/jobs/${slug}`,{waitUntil:'networkidle2'});
    await p.waitForFunction(()=>document.getElementById('job-description'),{timeout:20000}); await sleep(700);
    await p.evaluate(()=>[...document.querySelectorAll('button')].find(x=>/Show more/.test(x.textContent))?.click()); await sleep(600);
    const el=await p.$('#job-description');
    await el.screenshot({path:`${OUT}/jm-desc-html-clip.png`});
    console.log('clip saved');
  } finally { await b.close(); }
})().catch(e=>console.error('FATAL',e.message));
