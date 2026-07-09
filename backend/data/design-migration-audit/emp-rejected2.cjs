const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,body:j}}
(async()=>{
  const lg=await api('/employers/login',{method:'POST',body:{contactEmail:'emp_1781735440500@example.com',password:'Verify123!emp'}});
  const tok=lg.body?.token;
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  try{
    const p=await b.newPage(); await p.setViewport({width:1280,height:900});
    await p.goto(BASE,{waitUntil:'domcontentloaded'}); await p.evaluate(t=>localStorage.setItem('employerToken',t),tok);
    // dashboard inline REJECTED banner
    await p.goto(`${BASE}/employer/dashboard`,{waitUntil:'networkidle2'}); await sleep(1500);
    console.log('dashboard REJECTED banner:', await p.evaluate(()=>/was not approved/i.test(document.body.innerText)), '| post disabled:', await p.evaluate(()=>{const a=[...document.querySelectorAll('a')].find(x=>/Post New Job/.test(x.textContent));return a?getComputedStyle(a).pointerEvents:'?'}));
    // try to post → RequireEmployerStatus bounce
    await p.goto(`${BASE}/employer/jobs/new`,{waitUntil:'networkidle2'}); await sleep(1500);
    console.log('rejected → /jobs/new redirects to:', await p.evaluate(()=>location.pathname));
    // direct StatusNotice
    await p.goto(`${BASE}/employer/rejected`,{waitUntil:'networkidle2'}); await sleep(1500);
    const r=await p.evaluate(()=>({path:location.pathname,badge:/APPLICATION DECLINED/i.test(document.body.innerText),headline:/not approved/i.test(document.body.innerText),reason:/Audit test/i.test(document.body.innerText),logout:[...document.querySelectorAll('button')].some(b=>/Log out/i.test(b.textContent)),appB2b:!!document.querySelector('.app-b2b')}));
    console.log('StatusNotice /employer/rejected:', JSON.stringify(r));
    await p.screenshot({path:`${OUT}/emp-rejected.png`});
  } finally { await b.close(); }
})().catch(e=>console.error('FATAL',e.message));
