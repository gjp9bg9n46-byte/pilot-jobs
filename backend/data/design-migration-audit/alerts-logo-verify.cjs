const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,body:j}}
(async()=>{
  const email=`alg_${Date.now()}@example.com`,pw='Verify123!pw';
  const reg=await api('/auth/register',{method:'POST',body:{email,password:pw,firstName:'A',lastName:'L',phone:'+10000000000',country:'United States',city:'Dallas'}});
  const tok=reg.body?.token; const H={Authorization:`Bearer ${tok}`};
  await api('/profile',{method:'PATCH',headers:H,body:{role:'FIRST_OFFICER',nationality:'Egyptian',education:'high_school'}});
  await api('/profile/certificates',{method:'POST',headers:H,body:{type:'MPL',issuingAuthority:'EASA'}});
  await api('/profile/elp',{method:'POST',headers:H,body:{level:'Level 5',issuingAuthority:'ICAO'}});
  await api('/profile/medicals',{method:'POST',headers:H,body:{medicalClass:'CLASS_1',issuingAuthority:'EASA',issueDate:'2026-01-01T00:00:00Z',expiryDate:'2027-01-01T00:00:00Z'}});
  await api('/profile/ratings',{method:'POST',headers:H,body:{aircraftType:'A320',category:'TYPE'}});
  const rm=await api('/jobs/alerts/run-match',{method:'POST',headers:H}); console.log('run-match:',rm.status,JSON.stringify(rm.body));
  const alerts=await api('/jobs/alerts',{headers:H}); const n=(alerts.body?.alerts||alerts.body||[]).length; console.log('alerts via API:',Array.isArray(alerts.body)?alerts.body.length:(alerts.body?.alerts?.length??'?'));
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  try{
    const p=await b.newPage(); await p.setViewport({width:1280,height:1700});
    await p.goto(BASE,{waitUntil:'domcontentloaded'}); await p.evaluate(t=>localStorage.setItem('authToken',t),tok);
    await p.goto(`${BASE}/alerts`,{waitUntil:'networkidle2'});
    // wait until an alert card (with a logo or company) renders, past the on-mount re-match Loading
    await p.waitForFunction(()=>!/Loading your alerts/i.test(document.body.innerText)&&(document.querySelector('img[alt$="logo"]')||[...document.querySelectorAll('div[aria-hidden="true"]')].some(d=>getComputedStyle(d).borderRadius==='50%')),{timeout:25000}).catch(()=>{});
    await sleep(1500);
    const info=await p.evaluate(()=>({
      imgs:[...document.querySelectorAll('img[alt$="logo"]')].length,
      initials:[...document.querySelectorAll('div[aria-hidden="true"]')].filter(d=>getComputedStyle(d).borderRadius==='50%').length,
      sampleAlt:[...document.querySelectorAll('img[alt$="logo"]')][0]?.getAttribute('alt')||null,
      bodyHasMatch:/% |match/i.test(document.body.innerText),
    }));
    console.log('ALERTS rendered:', JSON.stringify(info));
    console.log((info.imgs+info.initials)>0 ? '  ✓ alert cards show logos/initials' : '  ✗ still none');
    await p.screenshot({path:`${OUT}/logo-alerts-desktop.png`,fullPage:false});
    const pm=await b.newPage(); await pm.setViewport({width:390,height:1700,isMobile:true});
    await pm.goto(BASE,{waitUntil:'domcontentloaded'}); await pm.evaluate(t=>localStorage.setItem('authToken',t),tok);
    await pm.goto(`${BASE}/alerts`,{waitUntil:'networkidle2'});
    await pm.waitForFunction(()=>!/Loading your alerts/i.test(document.body.innerText)&&(document.querySelector('img[alt$="logo"]')||[...document.querySelectorAll('div[aria-hidden="true"]')].some(d=>getComputedStyle(d).borderRadius==='50%')),{timeout:25000}).catch(()=>{});
    await sleep(1500);
    console.log('mobile no h-scroll:', await pm.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
    await pm.screenshot({path:`${OUT}/logo-alerts-mobile.png`});
  } finally { await b.close(); const d=await api('/auth/account',{method:'DELETE',headers:H,body:{password:pw}}); console.log('cleanup:',d.status); }
})().catch(e=>console.error('FATAL',e.message,e.stack));
