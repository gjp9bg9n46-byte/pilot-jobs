const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,body:j}}
const slugify=s=>String(s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const rgb=hex=>{const n=parseInt(hex.slice(1),16);return `rgb(${(n>>16)&255}, ${(n>>8)&255}, ${n&255})`;};
(async()=>{
  const jobs=(await api('/jobs?limit=1000')).body.jobs;
  // pick a job with a role requirement so seeding pilot role gives a MET row
  const job=jobs.find(j=>j.role==='CAPTAIN'&&(j.reqAircraftTypes?.length||j.reqMinTotalHours!=null))||jobs.find(j=>j.role)||jobs[0];
  const slug=`${slugify(job.company)}-${slugify(job.role||job.title)}-${job.id}`;
  console.log('job:',job.company,'|',job.title,'| role:',job.role);
  const email=`aesr_${Date.now()}@example.com`,pw='Verify123!pw';
  const reg=await api('/auth/register',{method:'POST',body:{email,password:pw,firstName:'A',lastName:'R',phone:'+10000000000',country:'United States',city:'Dallas'}});
  const tok=reg.body?.token; const H={Authorization:`Bearer ${tok}`};
  await api('/profile',{method:'PATCH',headers:H,body:{role:job.role||'CAPTAIN',nationality:'American'}}); // match the Role requirement
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  try{
    const p=await b.newPage(); await p.setViewport({width:1280,height:2000});
    await p.goto(BASE,{waitUntil:'domcontentloaded'}); await p.evaluate(t=>localStorage.setItem('authToken',t),tok);
    await p.goto(`${BASE}/jobs/${slug}`,{waitUntil:'networkidle2'});
    await p.waitForFunction(()=>document.querySelector('h1')&&!/Loading job/i.test(document.body.innerText),{timeout:20000}); await sleep(1200);
    // correct page-surface selector: the .app-light that has the inline cool-gray bg (JobDetail LightPage), not Layout root
    const surfaces=await p.evaluate(()=>[...document.querySelectorAll('.app-light')].map(e=>getComputedStyle(e).backgroundColor));
    console.log('PAGE surfaces (.app-light bgs):', JSON.stringify(surfaces), '— expect one =',rgb('#F8F9FA'));
    console.log('  cool-gray surface present:', surfaces.includes(rgb('#F8F9FA')));
    // rows: met (transparent) vs unmet (#FEF2F2)
    const rows=await p.evaluate(()=>[...document.querySelectorAll('div')].filter(d=>{const s=getComputedStyle(d);return s.display==='flex'&&s.borderRadius==='6px'&&d.querySelector('svg');}).map(d=>getComputedStyle(d).backgroundColor));
    const tint=rows.filter(r=>r==='rgb(254, 242, 242)').length;
    const transp=rows.filter(r=>r==='rgba(0, 0, 0, 0)').length;
    const badge=await p.evaluate(()=>{const el=[...document.querySelectorAll('*')].find(e=>/requirements matched/i.test(e.textContent)&&e.children.length===0);return el?el.textContent.trim():null;});
    console.log('match badge:',badge,'| rows tinted(unmet)=',tint,' transparent(met)=',transp);
    console.log(transp>0&&tint>0 ? '  ✓ MIXED: met rows untinted + unmet rows tinted both present' : (transp>0?'  ✓ met rows untinted present':'  (no met rows for this combo)'));
  } finally { await b.close(); const d=await api('/auth/account',{method:'DELETE',headers:H,body:{password:pw}}); console.log('cleanup:',d.status); }
})().catch(e=>console.error('FATAL',e.message,e.stack));
