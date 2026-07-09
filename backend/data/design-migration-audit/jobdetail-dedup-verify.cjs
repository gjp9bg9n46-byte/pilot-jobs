const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,body:j}}
const slugify=s=>String(s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const results=[];const ok=(id,c,m)=>{results.push([id,!!c]);console.log(`  ${c?'✓':'✗'} ${id}  ${m||''}`)};
const waitMain=async p=>{await p.waitForFunction(()=>document.querySelector('h1')&&!/Loading job/i.test(document.body.innerText),{timeout:20000});await sleep(1200);};
const inspect=p=>p.evaluate(()=>{
  const txt=document.body.innerText;
  // count "Requirements" section headers (the standalone section had a 'Requirements' sectionLabel)
  const reqHeaders=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&/^Requirements$/i.test(e.textContent.trim())).length;
  const yourMatch=/YOUR MATCH/i.test(txt);
  const whatMissing=/WHAT YOU'RE MISSING/i.test(txt);
  // order: index of "Your Match"/sign-in vs "Job Description"
  const labels=[...document.querySelectorAll('*')].filter(e=>e.children.length===0).map(e=>e.textContent.trim());
  const jdIdx=labels.findIndex(t=>/^Job Description$/i.test(t));
  return {reqHeaders, yourMatch, whatMissing, hasJobDescription: jdIdx>=0};
});
(async()=>{
  const jobs=(await api('/jobs?limit=1000')).body.jobs;
  const job=jobs.find(j=>j.role&&(j.description||'').length>50)||jobs[0];
  const slug=`${slugify(job.company)}-${slugify(job.role||job.title)}-${job.id}`;
  // throwaway pilot with some profile so match widget shows reqs (and would have shown 'missing')
  const email=`jdd_${Date.now()}@example.com`,pw='Verify123!pw';
  const reg=await api('/auth/register',{method:'POST',body:{email,password:pw,firstName:'J',lastName:'D',phone:'+10000000000',country:'United States',city:'Dallas'}});
  const tok=reg.body?.token; const H={Authorization:`Bearer ${tok}`};
  await api('/profile/certificates',{method:'POST',headers:H,body:{type:'ATP',issuingAuthority:'FAA'}}); // partial match → would trigger 'missing' before
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const errs=[];
  try{
    // logged-in
    const p=await b.newPage(); await p.setViewport({width:1280,height:2000});
    p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text().slice(0,120));});
    await p.goto(BASE,{waitUntil:'domcontentloaded'}); await p.evaluate(t=>localStorage.setItem('authToken',t),tok);
    await p.goto(`${BASE}/jobs/${slug}`,{waitUntil:'networkidle2'}); await waitMain(p);
    const li=await inspect(p);
    ok('logged-in: YOUR MATCH present', li.yourMatch);
    ok('logged-in: no standalone Requirements section', li.reqHeaders===0, `reqHeaders=${li.reqHeaders}`);
    ok('logged-in: no "What you\'re missing"', !li.whatMissing);
    ok('logged-in: Job Description present', li.hasJobDescription);
    await p.screenshot({path:`${OUT}/jdd-loggedin.png`,fullPage:false});

    // logged-out
    const po=await b.newPage(); await po.setViewport({width:1280,height:2000});
    await po.goto(`${BASE}/jobs/${slug}`,{waitUntil:'networkidle2'}); await waitMain(po);
    const lo=await po.evaluate(()=>({signin:/Sign in to see your match/i.test(document.body.innerText),reqHeaders:[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&/^Requirements$/i.test(e.textContent.trim())).length,jd:/Job Description/i.test(document.body.innerText),missing:/WHAT YOU'RE MISSING/i.test(document.body.innerText)}));
    ok('logged-out: sign-in panel present', lo.signin);
    ok('logged-out: no Requirements section', lo.reqHeaders===0, `reqHeaders=${lo.reqHeaders}`);
    ok('logged-out: no missing block', !lo.missing);
    ok('logged-out: Job Description present', lo.jd);
    await po.screenshot({path:`${OUT}/jdd-loggedout.png`,fullPage:false});

    // mobile
    const pm=await b.newPage(); await pm.setViewport({width:390,height:2200,isMobile:true});
    await pm.goto(BASE,{waitUntil:'domcontentloaded'}); await pm.evaluate(t=>localStorage.setItem('authToken',t),tok);
    await pm.goto(`${BASE}/jobs/${slug}`,{waitUntil:'networkidle2'}); await waitMain(pm);
    ok('mobile no h-scroll', await pm.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
    const mreq=await pm.evaluate(()=>[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&/^Requirements$/i.test(e.textContent.trim())).length);
    ok('mobile no Requirements section', mreq===0);
    await pm.screenshot({path:`${OUT}/jdd-mobile.png`,fullPage:false});

    ok('no console errors', errs.length===0, errs.join('|')||'none');
  } finally { await b.close(); const d=await api('/auth/account',{method:'DELETE',headers:H,body:{password:pw}}); console.log('  cleanup:',d.status);
    const passed=results.filter(r=>r[1]).length; console.log(`\n========== JOBDETAIL DEDUP VERIFY: ${passed}/${results.length} ==========`);
  }
})().catch(e=>console.error('FATAL',e.message,e.stack));
