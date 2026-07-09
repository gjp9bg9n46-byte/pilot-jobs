const puppeteer = require('puppeteer');
const BASE='https://cockpithire.com', CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,json:j}}
const results=[]; const ok=(id,c,m)=>{results.push([id,!!c]);console.log(`  ${c?'✓':'✗'} ${id}  ${m||''}`)};
(async()=>{
  const ts=Date.now();
  const pilotEmail=`auth_pilot_${ts}@example.com`, pilotPw='Verify123!pw';
  const empEmail=`auth_emp_${ts}@example.com`, empPw='Verify123!pw';
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const errs=[];
  const a11y=p=>p.evaluate(()=>{
    const err=document.querySelector('[role="alert"]');
    const af=document.activeElement;
    const inputs=[...document.querySelectorAll('input')];
    return {
      autoFocusOnInput: af&&af.tagName==='INPUT',
      withAutocomplete: inputs.filter(i=>i.getAttribute('autocomplete')).length,
      withAriaLabel: inputs.filter(i=>i.getAttribute('aria-label')).length,
      totalInputs: inputs.length,
      hasToggle: /\bPilot\b/.test(document.body.innerText)&&/\bEmployer\b/.test(document.body.innerText)&&!!document.querySelector('button'),
    };
  });
  try{
    const p=await b.newPage(); await p.setViewport({width:1280,height:1200});
    p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,120))});

    // 1) /login pilot-only
    await p.goto(`${BASE}/login`,{waitUntil:'networkidle2'}); await sleep(800);
    const login=await p.evaluate(()=>({toggle:[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Employer'),hasCompany:/Company/i.test(document.body.innerText),text:document.body.innerText.replace(/\s+/g,' ').slice(0,120)}));
    ok('login-no-toggle', !login.toggle && !login.hasCompany, `toggle=${login.toggle} company=${login.hasCompany}`);
    await p.screenshot({path:`${OUT}/auth-login.png`});
    console.log('   a11y(login):',JSON.stringify(await a11y(p)));

    // 2) /register pilot-only
    await p.goto(`${BASE}/register`,{waitUntil:'networkidle2'}); await sleep(800);
    const reg=await p.evaluate(()=>({toggle:[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Employer'),hasCompany:/Company Type|Company Name/i.test(document.body.innerText),firstName:/First Name/i.test(document.body.innerText)}));
    ok('register-no-toggle', !reg.toggle && !reg.hasCompany && reg.firstName, `toggle=${reg.toggle} company=${reg.hasCompany} pilotFields=${reg.firstName}`);
    await p.screenshot({path:`${OUT}/auth-register.png`});
    console.log('   a11y(register):',JSON.stringify(await a11y(p)));

    // 3) /employer/login app-b2b
    await p.goto(`${BASE}/employer/login`,{waitUntil:'networkidle2'}); await sleep(800);
    const el=await p.evaluate(()=>({appB2b:!!document.querySelector('.app-b2b'),bodyBg:getComputedStyle(document.body).backgroundColor,header:document.body.innerText.split('\n')[0],hasEmail:/Email address/i.test(document.body.innerText),regLink:[...document.querySelectorAll('a')].find(a=>/Register/i.test(a.textContent))?.getAttribute('href'),pilotLink:[...document.querySelectorAll('a')].find(a=>/Sign in here/i.test(a.textContent))?.getAttribute('href')}));
    ok('employer-login-b2b', el.appB2b && el.hasEmail, `appB2b=${el.appB2b} bodyBg=${el.bodyBg} header="${el.header}" regLink=${el.regLink} pilotLink=${el.pilotLink}`);
    await p.screenshot({path:`${OUT}/auth-employer-login.png`});
    console.log('   a11y(emp-login):',JSON.stringify(await a11y(p)));

    // 4) /employer/register app-b2b
    await p.goto(`${BASE}/employer/register`,{waitUntil:'networkidle2'}); await sleep(800);
    const er=await p.evaluate(()=>({appB2b:!!document.querySelector('.app-b2b'),company:/Company Name/i.test(document.body.innerText),loginLink:[...document.querySelectorAll('a')].find(a=>/Sign in/i.test(a.textContent))?.getAttribute('href'),pilotLink:[...document.querySelectorAll('a')].find(a=>/Register here/i.test(a.textContent))?.getAttribute('href')}));
    ok('employer-register-b2b', er.appB2b && er.company, `appB2b=${er.appB2b} company=${er.company} loginLink=${er.loginLink} pilotLink=${er.pilotLink}`);
    await p.screenshot({path:`${OUT}/auth-employer-register.png`});
    console.log('   a11y(emp-register):',JSON.stringify(await a11y(p)));

    // 5) redirect /login?as=employer → /employer/login
    await p.goto(`${BASE}/login?as=employer`,{waitUntil:'networkidle2'}); await sleep(1000);
    ok('redirect-login', /\/employer\/login$/.test(await p.evaluate(()=>location.pathname)), `landed=${await p.evaluate(()=>location.pathname)}`);
    // 6) redirect /register?as=employer → /employer/register
    await p.goto(`${BASE}/register?as=employer`,{waitUntil:'networkidle2'}); await sleep(1000);
    ok('redirect-register', /\/employer\/register$/.test(await p.evaluate(()=>location.pathname)), `landed=${await p.evaluate(()=>location.pathname)}`);

    // 7) PILOT e2e via UI
    await p.goto(`${BASE}/register`,{waitUntil:'networkidle2'}); await sleep(600);
    await p.evaluate((email,pw)=>{
      const setVal=(label,val)=>{const inp=[...document.querySelectorAll('input')].find(i=>(i.getAttribute('aria-label')||'').toLowerCase().includes(label));if(inp){const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(inp,val);inp.dispatchEvent(new Event('input',{bubbles:true}));}};
      setVal('first name','Verify'); setVal('email',email); setVal('password',pw);
    },pilotEmail,pilotPw);
    await sleep(300);
    await p.evaluate(()=>document.querySelector('form button[type], form button').click());
    await sleep(2500);
    const pilotLanded=await p.evaluate(()=>location.pathname);
    ok('pilot-e2e', /\/jobs|\/profile/.test(pilotLanded), `registered → ${pilotLanded}`);

    // 8) EMPLOYER e2e via UI
    const p2=await b.newPage(); await p2.setViewport({width:1280,height:1600});
    await p2.goto(`${BASE}/employer/register`,{waitUntil:'networkidle2'}); await sleep(600);
    await p2.evaluate((email,pw)=>{
      const byLabel=l=>[...document.querySelectorAll('input,select,textarea')].find(i=>(i.getAttribute('aria-label')||'').toLowerCase()===l);
      const setV=(el,val)=>{if(!el)return;const proto=el.tagName==='SELECT'?window.HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,val);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
      setV(byLabel('company name'),'Verify Air Co');
      setV(byLabel('company type'),'CHARTER');
      setV(byLabel('country'),'Portugal');
      setV(byLabel('contact name'),'Verify Contact');
      setV(byLabel('contact email'),email);
      setV(byLabel('password'),pw);
      setV(byLabel('confirm password'),pw);
    },empEmail,empPw);
    await sleep(400);
    await p2.evaluate(()=>document.querySelector('form button').click());
    await sleep(3000);
    const empLanded=await p2.evaluate(()=>location.pathname);
    ok('employer-e2e-pending', /pending-approval/.test(empLanded), `registered → ${empLanded}`);
    await p2.screenshot({path:`${OUT}/auth-employer-pending.png`});
    // dashboard should bounce a PENDING employer to pending-approval
    await p2.goto(`${BASE}/employer/dashboard`,{waitUntil:'networkidle2'}); await sleep(2000);
    ok('employer-dashboard-gate', /pending-approval/.test(await p2.evaluate(()=>location.pathname)), `dashboard → ${await p2.evaluate(()=>location.pathname)}`);

    // mobile 390 render check on all 4
    const pm=await b.newPage(); await pm.setViewport({width:390,height:1400,isMobile:true});
    for(const path of ['/login','/register','/employer/login','/employer/register']){
      await pm.goto(`${BASE}${path}`,{waitUntil:'networkidle2'}); await sleep(600);
      const noH=await pm.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2);
      ok('mobile'+path, noH, `noHScroll=${noH}`);
    }

    console.log('\n  CONSOLE ERRORS:',errs.length?errs:'none');
    console.log('  pilot email:',pilotEmail,'| employer email:',empEmail);
  } finally {
    await b.close();
    // cleanup pilot via API
    const lg=await api('/auth/login',{method:'POST',body:{email:pilotEmail,password:pilotPw}});
    if(lg.json?.token){const d=await api('/auth/account',{method:'DELETE',headers:{Authorization:`Bearer ${lg.json.token}`},body:{password:pilotPw}});console.log('  pilot cleanup:',d.status);}
    const passed=results.filter(r=>r[1]).length;
    console.log(`\n========== AUTH VERIFY: ${passed}/${results.length} ==========`);
    require('fs').writeFileSync('/tmp/emp_cleanup_email.txt', empEmail);
  }
})().catch(e=>console.error('FATAL',e.message,e.stack));
