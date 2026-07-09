const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,body:j}}
const rgb=hex=>{const n=parseInt(hex.slice(1),16);return `rgb(${(n>>16)&255}, ${(n>>8)&255}, ${n&255})`;};
const email=`emp_${Date.now()}@example.com`, pw='Verify123!emp';
(async()=>{
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const errs=[];
  try{
    // ===== EMPLOYER LOGIN =====
    const p=await b.newPage(); await p.setViewport({width:1280,height:1000});
    p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text().slice(0,110));});
    await p.goto(`${BASE}/employer/login`,{waitUntil:'networkidle2'}); await sleep(1000);
    const login=await p.evaluate(()=>({
      appB2b:!!document.querySelector('.app-b2b'), bodyBg:getComputedStyle(document.body).backgroundColor,
      header:[...document.querySelectorAll('*')].find(e=>/Employer sign in/i.test(e.textContent)&&e.children.length===0)?.textContent.trim(),
      headerFont:(()=>{const h=[...document.querySelectorAll('div')].find(d=>/Employer sign in/i.test(d.textContent)&&d.children.length===0);return h?getComputedStyle(h).fontFamily:null})(),
      autocompletes:[...document.querySelectorAll('input')].map(i=>i.getAttribute('autocomplete')),
      regLink:[...document.querySelectorAll('a')].find(a=>/Register/i.test(a.textContent))?.getAttribute('href'),
      pilotLink:[...document.querySelectorAll('a')].find(a=>/pilot/i.test(a.textContent))?.getAttribute('href'),
      forgot:/forgot/i.test(document.body.innerText),
    }));
    console.log('LOGIN:',JSON.stringify(login));
    console.log('  bodyBg cool-gray:', login.bodyBg===rgb('#F3F4F6'), '| header Inter:', /Inter/i.test(login.headerFont||''));
    // wrong password → error
    await p.evaluate(()=>{const set=(t,v)=>{const i=[...document.querySelectorAll('input')].find(x=>x.type===t);const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,v);i.dispatchEvent(new Event('input',{bubbles:true}));};set('email','nobody@example.com');set('password','wrongpass');});
    await p.evaluate(()=>document.querySelector('form button').click()); await sleep(2000);
    const loginErr=await p.evaluate(()=>{const a=document.querySelector('[role="alert"]');return a?a.textContent.trim():null;});
    console.log('  wrong-password error (role=alert):', JSON.stringify(loginErr));
    await p.screenshot({path:`${OUT}/emp-login.png`});

    // ===== EMPLOYER REGISTER (UI submit → PENDING) =====
    const pr=await b.newPage(); await pr.setViewport({width:1280,height:1800});
    pr.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push('REG:'+m.text().slice(0,100));});
    await pr.goto(`${BASE}/employer/register`,{waitUntil:'networkidle2'}); await sleep(1000);
    const reg=await pr.evaluate(()=>({appB2b:!!document.querySelector('.app-b2b'),autocompletes:[...document.querySelectorAll('input,select,textarea')].map(i=>i.getAttribute('autocomplete')).filter(Boolean),inputs:document.querySelectorAll('input,select,textarea').length}));
    console.log('REGISTER:',JSON.stringify(reg));
    await pr.screenshot({path:`${OUT}/emp-register.png`});
    // fill + submit
    await pr.evaluate((email,pw)=>{
      const byLabel=l=>[...document.querySelectorAll('input,select,textarea')].find(i=>(i.getAttribute('aria-label')||'').toLowerCase()===l);
      const setV=(el,val)=>{if(!el)return;const proto=el.tagName==='SELECT'?window.HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,val);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
      setV(byLabel('company name'),'Audit Air Co'); setV(byLabel('company type'),'CHARTER'); setV(byLabel('country'),'Portugal');
      setV(byLabel('contact name'),'Audit Contact'); setV(byLabel('contact email'),email); setV(byLabel('password'),pw); setV(byLabel('confirm password'),pw);
    },email,pw);
    await sleep(400);
    await pr.evaluate(()=>document.querySelector('form button').click()); await sleep(3500);
    const landed=await pr.evaluate(()=>location.pathname);
    const token=await pr.evaluate(()=>localStorage.getItem('employerToken'));
    console.log('  register → landed:', landed, '| got token:', !!token);

    // ===== PENDING APPROVAL =====
    const pend=await pr.evaluate(()=>({
      badge:[...document.querySelectorAll('*')].find(e=>/UNDER REVIEW/i.test(e.textContent)&&e.children.length===0)?.textContent.trim(),
      headline:/under review/i.test(document.body.innerText),
      timeline:/48 hours|review/i.test(document.body.innerText),
      logout:[...document.querySelectorAll('button')].some(b=>/Log out/i.test(b.textContent)),
      appB2b:!!document.querySelector('.app-b2b'),
    }));
    console.log('PENDING:',JSON.stringify(pend));
    await pr.screenshot({path:`${OUT}/emp-pending.png`});
    // verify PENDING employer stays (dashboard → bounce to pending)
    await pr.goto(`${BASE}/employer/dashboard`,{waitUntil:'networkidle2'}); await sleep(2000);
    console.log('  PENDING visiting /dashboard → ', await pr.evaluate(()=>location.pathname));

    // employer id via API
    const me=await api('/employer/me',{headers:{Authorization:`Bearer ${token}`}});
    console.log('\n=== THROWAWAY EMPLOYER ===');
    console.log('  id:', me.body?.id, '| status:', me.body?.status);
    console.log('  email:', email, '| password:', pw);
    console.log('CONSOLE ERRORS:', errs.length?errs:'none');
  } finally { await b.close(); }
})().catch(e=>console.error('FATAL',e.message,e.stack));
