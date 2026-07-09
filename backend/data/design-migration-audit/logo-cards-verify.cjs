const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,body:j}}
const results=[];const ok=(id,c,m)=>{results.push([id,!!c]);console.log(`  ${c?'✓':'✗'} ${id}  ${m||''}`)};
(async()=>{
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const errs=[];
  // throwaway pilot for Alerts (needs auth + matched alerts)
  const email=`logo_${Date.now()}@example.com`,pw='Verify123!pw';
  const reg=await api('/auth/register',{method:'POST',body:{email,password:pw,firstName:'L',lastName:'G',phone:'+10000000000',country:'United States',city:'Dallas'}});
  const tok=reg.body?.token; const H={Authorization:`Bearer ${tok}`};
  // seed a profile likely to match A320 FO jobs (aircairo etc.)
  await api('/profile',{method:'PATCH',headers:H,body:{role:'FIRST_OFFICER',nationality:'Egyptian',education:'high_school'}});
  await api('/profile/certificates',{method:'POST',headers:H,body:{type:'MPL',issuingAuthority:'EASA'}});
  await api('/profile/elp',{method:'POST',headers:H,body:{level:'Level 5',issuingAuthority:'ICAO'}});
  await api('/profile/medicals',{method:'POST',headers:H,body:{medicalClass:'CLASS_1',issuingAuthority:'EASA',issueDate:'2026-01-01T00:00:00Z',expiryDate:'2027-01-01T00:00:00Z'}});
  await api('/profile/ratings',{method:'POST',headers:H,body:{aircraftType:'A320',category:'TYPE'}});
  const rm=await api('/jobs/alerts/run-match',{method:'POST',headers:H});
  console.log('run-match:', rm.status, JSON.stringify(rm.body).slice(0,80));
  try{
    // ===== JOBS (public) =====
    const p=await b.newPage(); await p.setViewport({width:1280,height:1600});
    p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text().slice(0,120));});
    const ctx=await b.createBrowserContext(); const pub=await ctx.newPage(); await pub.setViewport({width:1280,height:1600});
    await pub.goto(`${BASE}/jobs`,{waitUntil:'networkidle2'}); await sleep(2500);
    const jobsLogos=await pub.evaluate(()=>{
      const cards=[...document.querySelectorAll('[class],div')].filter(()=>false); // noop
      const imgs=[...document.querySelectorAll('img[alt$="logo"]')];
      const initials=[...document.querySelectorAll('div[aria-hidden="true"]')].filter(d=>{const s=getComputedStyle(d);return s.borderRadius==='50%'&&d.offsetWidth>=30&&d.offsetWidth<=48;});
      const lazy=imgs.filter(i=>i.getAttribute('loading')==='lazy').length;
      return {imgLogos:imgs.length, initialsBoxes:initials.length, lazy, sampleAlt:imgs[0]?imgs[0].getAttribute('alt'):null};
    });
    ok('Jobs cards have logos (img) ', jobsLogos.imgLogos>0, JSON.stringify(jobsLogos));
    ok('Jobs cards have initials fallbacks', jobsLogos.initialsBoxes>0, `initials=${jobsLogos.initialsBoxes}`);
    ok('logos lazy-loaded', jobsLogos.lazy===jobsLogos.imgLogos&&jobsLogos.imgLogos>0, `lazy=${jobsLogos.lazy}/${jobsLogos.imgLogos}`);
    ok('Jobs no h-scroll (desktop)', await pub.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
    await pub.screenshot({path:`${OUT}/logo-jobs-desktop.png`,fullPage:false});

    // Shield AI initials card — find a card containing 'Shield AI' and check it has an initials box not an img
    const shield=await pub.evaluate(()=>{
      const cards=[...document.querySelectorAll('div')].filter(d=>/Shield AI/.test(d.textContent)&&d.querySelector('[aria-hidden="true"],img'));
      // narrow to a card-like ancestor
      const card=cards.find(d=>d.textContent.includes('Shield AI')&&d.querySelector('div[aria-hidden="true"]'));
      if(!card)return null;
      const initial=card.querySelector('div[aria-hidden="true"]');
      return initial?initial.textContent.trim():null;
    });
    ok('Shield AI → initials fallback (SH)', shield==='SH', `initials="${shield}"`);

    // mobile jobs
    const pm=await ctx.newPage(); await pm.setViewport({width:390,height:1600,isMobile:true});
    await pm.goto(`${BASE}/jobs`,{waitUntil:'networkidle2'}); await sleep(2500);
    ok('Jobs mobile no h-scroll', await pm.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
    const mLogo=await pm.evaluate(()=>document.querySelectorAll('img[alt$="logo"],div[aria-hidden="true"]').length>0);
    ok('Jobs mobile logos render', mLogo);
    await pm.screenshot({path:`${OUT}/logo-jobs-mobile.png`,fullPage:false});

    // ===== ALERTS (auth) =====
    await p.goto(BASE,{waitUntil:'domcontentloaded'}); await p.evaluate(t=>localStorage.setItem('authToken',t),tok);
    await p.goto(`${BASE}/alerts`,{waitUntil:'networkidle2'}); await sleep(3000);
    const alertsInfo=await p.evaluate(()=>{
      const empty=/No matches|no alerts|Loading/i.test(document.body.innerText);
      const imgs=[...document.querySelectorAll('img[alt$="logo"]')].length;
      const initials=[...document.querySelectorAll('div[aria-hidden="true"]')].filter(d=>getComputedStyle(d).borderRadius==='50%').length;
      const cards=document.body.innerText.match(/requirements? match|% /i);
      return {empty, imgs, initials, hasAnyAlertText:/match/i.test(document.body.innerText)};
    });
    console.log('  alerts page:', JSON.stringify(alertsInfo));
    ok('Alerts cards have logos or initials', (alertsInfo.imgs+alertsInfo.initials)>0, JSON.stringify(alertsInfo));
    await p.screenshot({path:`${OUT}/logo-alerts-desktop.png`,fullPage:false});
    const pma=await b.newPage(); await pma.setViewport({width:390,height:1600,isMobile:true});
    await pma.goto(BASE,{waitUntil:'domcontentloaded'}); await pma.evaluate(t=>localStorage.setItem('authToken',t),tok);
    await pma.goto(`${BASE}/alerts`,{waitUntil:'networkidle2'}); await sleep(3000);
    ok('Alerts mobile no h-scroll', await pma.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
    await pma.screenshot({path:`${OUT}/logo-alerts-mobile.png`,fullPage:false});

    ok('no console errors', errs.length===0, errs.join('|')||'none');
  } finally { await b.close(); const d=await api('/auth/account',{method:'DELETE',headers:H,body:{password:pw}}); console.log('  cleanup:',d.status);
    const passed=results.filter(r=>r[1]).length; console.log(`\n========== LOGO CARDS VERIFY: ${passed}/${results.length} ==========`);
  }
})().catch(e=>console.error('FATAL',e.message,e.stack));
