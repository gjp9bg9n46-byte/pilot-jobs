const puppeteer = require('puppeteer');
const BASE='https://cockpithire.com', CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
async function api(p){const r=await fetch(`${BASE}/api${p}`);return r.json()}
const slugify=s=>String(s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const slug=j=>`${slugify(j.company)}-${slugify(j.role||j.title)}-${j.id}`;
const descState=p=>p.evaluate(()=>{
  const d=document.getElementById('job-description'); if(!d)return{present:false};
  const btn=[...document.querySelectorAll('button')].find(b=>/Show (more|less)/.test(b.textContent));
  const fade=!!d.parentElement.querySelector('div[aria-hidden="true"]');
  return {present:true, maxH:d.style.maxHeight, overflow:d.style.overflow, rectH:Math.round(d.getBoundingClientRect().height),
    btn:btn?btn.textContent.trim():null, ariaExpanded:btn?btn.getAttribute('aria-expanded'):null, ariaControls:btn?btn.getAttribute('aria-controls'):null, fade};
});
(async()=>{
  const jobs=(await api('/jobs?limit=1000')).jobs;
  const shortJob=jobs.find(j=>j.company==='Southwest Airlines'&&/Flight Instructor/i.test(j.title))||jobs.sort((a,b)=>(a.description||'').length-(b.description||'').length)[0];
  const longJob=jobs.sort((a,b)=>(b.description||'').length-(a.description||'').length)[0];
  console.log('SHORT:',shortJob.company,'|',shortJob.title,`(${(shortJob.description||'').length} chars)`);
  console.log('LONG :',longJob.company,'|',longJob.title,`(${(longJob.description||'').length} chars)`);
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const errs=[];
  const waitDesc=async p=>{await p.waitForFunction(()=>document.getElementById('job-description')&&!/Loading job/i.test(document.body.innerText),{timeout:20000}); await sleep(700)};
  try{
    const p=await b.newPage(); await p.setViewport({width:1280,height:1500});
    p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,120))});

    // SHORT — no button
    await p.goto(`${BASE}/jobs/${slug(shortJob)}`,{waitUntil:'networkidle2'}); await waitDesc(p);
    console.log('\n[SHORT]',JSON.stringify(await descState(p)));
    await p.screenshot({path:`${OUT}/jm-desc-short.png`});

    // LONG — collapsed
    await p.goto(`${BASE}/jobs/${slug(longJob)}`,{waitUntil:'networkidle2'}); await waitDesc(p);
    const collapsed=await descState(p);
    console.log('[LONG collapsed]',JSON.stringify(collapsed));
    // scroll desc into view + screenshot collapsed
    await p.evaluate(()=>document.getElementById('job-description').scrollIntoView({block:'center'})); await sleep(400);
    await p.screenshot({path:`${OUT}/jm-desc-long-collapsed.png`});

    // keyboard: focus button, press Enter
    await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Show more/.test(x.textContent));b.focus()});
    const focused=await p.evaluate(()=>document.activeElement&&/Show more/.test(document.activeElement.textContent));
    await p.keyboard.press('Enter'); await sleep(600);
    const expanded=await descState(p);
    console.log('[LONG expanded via Enter] focusedBtn=',focused,JSON.stringify(expanded));
    await p.evaluate(()=>document.getElementById('job-description').scrollIntoView({block:'start'})); await sleep(400);
    await p.screenshot({path:`${OUT}/jm-desc-long-expanded.png`,fullPage:false});

    // collapse again via Space
    await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Show less/.test(x.textContent));b.focus()});
    await p.keyboard.press('Space'); await sleep(800);
    console.log('[LONG re-collapsed via Space]',JSON.stringify(await descState(p)));

    // MOBILE 390 threshold
    const pm=await b.newPage(); await pm.setViewport({width:390,height:1800,isMobile:true});
    await pm.goto(`${BASE}/jobs/${slug(longJob)}`,{waitUntil:'networkidle2'}); await waitDesc(pm);
    const m=await descState(pm);
    console.log('[MOBILE390 long]',JSON.stringify(m),'(maxH should be 320px)');
    await pm.goto(`${BASE}/jobs/${slug(shortJob)}`,{waitUntil:'networkidle2'}); await waitDesc(pm);
    console.log('[MOBILE390 short]',JSON.stringify(await descState(pm)));

    console.log('\nCONSOLE ERRORS:',errs.length?errs:'none');
  } finally { await b.close(); }
})().catch(e=>console.error('FATAL',e.message,e.stack));
