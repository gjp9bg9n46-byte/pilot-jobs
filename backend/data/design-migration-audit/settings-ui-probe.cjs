const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,body:j}}
(async()=>{
  const email=`setui_${Date.now()}@example.com`,pw='Verify123!pw';
  const reg=await api('/auth/register',{method:'POST',body:{email,password:pw,firstName:'S',lastName:'P',phone:'+10000000000',country:'United States',city:'Dallas'}});
  const tok=reg.body?.token; const H={Authorization:`Bearer ${tok}`};
  // seed preferences with CORRECT column names so server has real data
  await api('/profile/preferences',{method:'PUT',headers:H,body:{preferredCountries:['UAE','Germany'],preferredAircraft:['A320','B777'],preferredContractTypes:['Full-time','ACMI'],routePreferences:['Long-haul'],minSalary:8000,minSalaryCurrency:'EUR',minSalaryPeriod:'month',salaryNegotiable:false,notifyEmail:false,notifyProductUpdatesEmail:true}});
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const errs=[];
  try{
    const p=await b.newPage(); await p.setViewport({width:1400,height:1200});
    p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,120))});
    p.on('response',r=>{if(r.url().includes('/profile/preferences')&&r.request().method()==='PUT')console.log('  [PUT /profile/preferences] →',r.status());});
    await p.goto(BASE,{waitUntil:'domcontentloaded'}); await p.evaluate(t=>localStorage.setItem('authToken',t),tok);
    await p.goto(`${BASE}/settings`,{waitUntil:'networkidle2'}); await sleep(2000);

    // populated-vs-masked: do the seeded server values show in the UI?
    const masked=await p.evaluate(()=>{
      const txt=document.body.innerText;
      return {
        showsUAE: /UAE/.test(txt), showsGermany:/Germany/.test(txt),       // preferredCountries (valid name) → should show
        showsA320:/A320/.test(txt),                                          // preferredAircraft → should show
        fulltimeActive: !!([...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Full-time')), // chip exists
        salaryVal: (document.querySelector('input[type=number]')||{}).value, // minSalary 8000?
      };
    });
    console.log('POPULATED-STATE read:', JSON.stringify(masked));
    // which contract chips are active (seeded Full-time+ACMI under preferredContractTypes — frontend reads p.contractTypes → undefined → none active = MASKED)
    const activeChips=await p.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>['Full-time','Part-time','Contract','ACMI','Wet Lease','Long-haul','Short-haul'].includes(b.textContent.trim())&&/0, 63, 136/.test(getComputedStyle(b).borderColor||'')).map(b=>b.textContent.trim()));
    console.log('ACTIVE chips (color-detected):', JSON.stringify(activeChips), '(seeded Full-time,ACMI,Long-haul server-side)');

    // a11y DOM checks
    const a11y=await p.evaluate(()=>{
      const toggles=[...document.querySelectorAll('div')].filter(d=>{const s=getComputedStyle(d);return d.style.borderRadius==='12px'||s.borderRadius==='12px'&&d.offsetWidth===44;});
      const firstToggle=[...document.querySelectorAll('div')].find(d=>d.offsetWidth===44&&d.offsetHeight===24);
      return {
        toggleHasRole: firstToggle?firstToggle.getAttribute('role'):'no-toggle-found',
        toggleTabIndex: firstToggle?firstToggle.getAttribute('tabindex'):null,
        notifCheckboxesWithLabel: [...document.querySelectorAll('input[type=checkbox]')].filter(c=>c.id&&document.querySelector(`label[for="${c.id}"]`)).length,
        totalCheckboxes: document.querySelectorAll('input[type=checkbox]').length,
        bannersWithAriaLive: document.querySelectorAll('[role="status"],[role="alert"],[aria-live]').length,
      };
    });
    console.log('A11Y:', JSON.stringify(a11y));

    // click Save Preferences → observe button text + any banner
    await p.evaluate(()=>{const btns=[...document.querySelectorAll('button')];const b=btns.find(x=>/Save Preferences/.test(x.textContent));b&&b.click();});
    await sleep(2000);
    const afterPrefSave=await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Save Preferences|Saved/.test(x.textContent));return{btn:b?b.textContent.trim():'?',greenBanner:/saved|success/i.test(document.body.innerText)&&!!document.querySelector('[style*="DCFCE7"]'),anyErr:/Failed/i.test(document.body.innerText)};});
    console.log('AFTER Save Preferences click:', JSON.stringify(afterPrefSave));

    // click Save Notifications → observe error banner
    await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Save Notification/.test(x.textContent));b&&b.click();});
    await sleep(2000);
    const afterNotif=await p.evaluate(()=>({errBanner:/Failed to save preferences/i.test(document.body.innerText)}));
    console.log('AFTER Save Notifications click:', JSON.stringify(afterNotif));

    await p.screenshot({path:`${OUT}/settings-audit-desktop.png`,fullPage:true});
    // mobile
    const pm=await b.newPage(); await pm.setViewport({width:390,height:1400,isMobile:true});
    await pm.goto(BASE,{waitUntil:'domcontentloaded'}); await pm.evaluate(t=>localStorage.setItem('authToken',t),tok);
    await pm.goto(`${BASE}/settings`,{waitUntil:'networkidle2'}); await sleep(1800);
    console.log('MOBILE noHScroll=', await pm.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
    await pm.screenshot({path:`${OUT}/settings-audit-mobile.png`});

    console.log('CONSOLE ERRORS:', errs.length?errs:'none');
  } finally { await b.close(); await api('/auth/account',{method:'DELETE',headers:H,body:{password:pw}}); console.log('cleanup done'); }
})().catch(e=>console.error('FATAL',e.message,e.stack));
