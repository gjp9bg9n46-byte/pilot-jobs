const puppeteer = require('puppeteer');
const BASE='https://cockpithire.com', CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(p){const r=await fetch(`${BASE}/api${p}`);const t=await r.text();try{return JSON.parse(t)}catch{return t}}
const slugify=s=>String(s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
(async()=>{
  const jobsRes=await api('/jobs?limit=1000'); const jobs=jobsRes.jobs||[];
  // pick representative jobs across distinct companies
  const wanted=['aircairo','Republic Airways (RJet)','Southwest Airlines','Shield AI','Magellan Aviation Services'];
  const picks=wanted.map(c=>jobs.find(j=>j.company===c)).filter(Boolean);
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  try{
    const p=await b.newPage(); await p.setViewport({width:1280,height:1400});
    for(const job of picks){
      const slug=`${slugify(job.company)}-${slugify(job.role||job.title)}-${job.id}`;
      await p.goto(`${BASE}/jobs/${slug}`,{waitUntil:'networkidle2'});
      await p.waitForFunction(()=>document.querySelector('h1')&&!/Loading job/i.test(document.body.innerText),{timeout:20000});
      await sleep(1500);
      const link=await p.evaluate(()=>{const a=[...document.querySelectorAll('a')].find(x=>/factfile/i.test(x.textContent));return a?{text:a.textContent.trim(),href:a.getAttribute('href')}:null});
      // verify the link target resolves to a real airline
      let airlineOk='n/a';
      if(link){ const id=link.href.split('/').pop(); const air=await api('/airlines/'+id); airlineOk = air&&air.name?air.name:'BAD-ID'; }
      console.log(`company="${job.company}"\n   factfile link: ${link?('"'+link.text+'" -> '+link.href):'(hidden)'}   resolvesTo=${airlineOk}`);
    }
  } finally { await b.close(); }
})().catch(e=>console.error('FATAL',e.message,e.stack));
