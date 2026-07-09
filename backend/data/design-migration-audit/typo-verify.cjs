const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,body:j}}
const slugify=s=>String(s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const results=[];const ok=(id,c,m)=>{results.push([id,!!c]);console.log(`  ${c?'✓':'✗'} ${id}  ${m||''}`)};
const waitMain=async p=>{await p.waitForFunction(()=>document.querySelector('h1')&&!/Loading job/i.test(document.body.innerText),{timeout:20000});await sleep(1000);};
(async()=>{
  const jobs=(await api('/jobs?limit=1000')).body.jobs;
  const job=jobs.find(j=>j.role&&(j.description||'').length>400)||jobs[0];
  const slug=`${slugify(job.company)}-${slugify(job.role||job.title)}-${job.id}`;
  const email=`typo_${Date.now()}@example.com`,pw='Verify123!pw';
  const reg=await api('/auth/register',{method:'POST',body:{email,password:pw,firstName:'T',lastName:'Y',phone:'+10000000000',country:'United States',city:'Dallas'}});
  const tok=reg.body?.token; const H={Authorization:`Bearer ${tok}`};
  await api('/profile/certificates',{method:'POST',headers:H,body:{type:'ATP',issuingAuthority:'FAA'}});
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const errs=[];
  try{
    const p=await b.newPage(); await p.setViewport({width:1280,height:2000});
    p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text().slice(0,120));});
    await p.goto(BASE,{waitUntil:'domcontentloaded'}); await p.evaluate(t=>localStorage.setItem('authToken',t),tok);

    // JobDetail
    await p.goto(`${BASE}/jobs/${slug}`,{waitUntil:'networkidle2'}); await waitMain(p);
    const h1=await p.evaluate(()=>{const h=document.querySelector('h1');const s=getComputedStyle(h);return{ff:s.fontFamily,fw:s.fontWeight,fs:s.fontSize};});
    ok('a h1 = Inter (sans), weight 700', /inter/i.test(h1.ff)&&h1.fw==='700', JSON.stringify(h1));
    const lbl=await p.evaluate(()=>{const el=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&/^JOB DESCRIPTION$/i.test(e.textContent.trim()));const s=el?getComputedStyle(el):null;return s?{ff:s.fontFamily,fw:s.fontWeight,ls:s.letterSpacing}:null;});
    ok('section label Inter 600 + letter-spacing', lbl&&/inter/i.test(lbl.ff)&&lbl.fw==='600', JSON.stringify(lbl));
    // description line-height (p inside job-desc-html)
    const lh=await p.evaluate(()=>{const pEl=document.querySelector('.job-desc-html p, .job-desc-html');if(!pEl)return null;const s=getComputedStyle(pEl);return{fontSize:s.fontSize,lineHeight:s.lineHeight,ratio:(parseFloat(s.lineHeight)/parseFloat(s.fontSize)).toFixed(2)};});
    ok('description line-height generous (~1.8)', lh&&parseFloat(lh.ratio)>=1.7, JSON.stringify(lh));
    // ReqRow label/value weight hierarchy
    const rr=await p.evaluate(()=>{const rows=[...document.querySelectorAll('.completeness-row')];return null;});
    await p.screenshot({path:`${OUT}/typo-jobdetail-desktop.png`,fullPage:false});

    // regression: /jobs list h1 still Fraunces
    await p.goto(`${BASE}/jobs`,{waitUntil:'networkidle2'}); await sleep(2000);
    const jobsH1=await p.evaluate(()=>{const h=document.querySelector('h1');const s=getComputedStyle(h);return{text:h.textContent.trim(),ff:s.fontFamily};});
    ok('regression /jobs h1 still Fraunces', /fraunces/i.test(jobsH1.ff), JSON.stringify(jobsH1));
    await p.screenshot({path:`${OUT}/typo-jobs-regression.png`,fullPage:false});

    // regression: /settings + /profile h1 Fraunces
    await p.goto(`${BASE}/settings`,{waitUntil:'networkidle2'}); await sleep(1500);
    const setH1=await p.evaluate(()=>{const h=document.querySelector('h1');return getComputedStyle(h).fontFamily;});
    ok('regression /settings h1 still Fraunces', /fraunces/i.test(setH1), setH1);

    // mobile JobDetail
    const pm=await b.newPage(); await pm.setViewport({width:390,height:2200,isMobile:true});
    await pm.goto(BASE,{waitUntil:'domcontentloaded'}); await pm.evaluate(t=>localStorage.setItem('authToken',t),tok);
    await pm.goto(`${BASE}/jobs/${slug}`,{waitUntil:'networkidle2'}); await waitMain(pm);
    const mh1=await pm.evaluate(()=>{const s=getComputedStyle(document.querySelector('h1'));return{ff:s.fontFamily,fw:s.fontWeight};});
    ok('mobile h1 Inter 700', /inter/i.test(mh1.ff)&&mh1.fw==='700', JSON.stringify(mh1));
    ok('mobile no h-scroll', await pm.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
    await pm.screenshot({path:`${OUT}/typo-jobdetail-mobile.png`,fullPage:false});

    ok('no console errors', errs.length===0, errs.join('|')||'none');
  } finally { await b.close(); const d=await api('/auth/account',{method:'DELETE',headers:H,body:{password:pw}}); console.log('  cleanup:',d.status);
    const passed=results.filter(r=>r[1]).length; console.log(`\n========== TYPO VERIFY: ${passed}/${results.length} ==========`);
  }
})().catch(e=>console.error('FATAL',e.message,e.stack));
