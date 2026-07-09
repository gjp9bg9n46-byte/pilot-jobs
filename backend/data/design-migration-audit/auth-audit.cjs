const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',API=`${BASE}/api`,CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',PW='TestPass123!';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function jf(p,o={}){const r=await fetch(API+p,o);let b=null;try{b=await r.json()}catch{}return{status:r.status,body:b}}
const log=(...a)=>console.log(...a);
(async()=>{
  const email=`authaudit_${Date.now()}@example.com`;
  const reg=await jf('/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:PW,firstName:'Audit'})});
  const token=reg.body?.token;
  log('throwaway pilot:',email,'reg status',reg.status);

  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const errs=[];
  try{
    const p=await b.newPage(); await p.setViewport({width:1280,height:900});
    p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});

    // ---------- LOGIN DOM ----------
    await p.goto(`${BASE}/login`,{waitUntil:'networkidle2'}); await sleep(1200);
    const loginDom=await p.evaluate(()=>{
      const inputs=[...document.querySelectorAll('input')].map(i=>({type:i.type,ac:i.getAttribute('autocomplete'),id:i.id,labelled:!!(i.id&&document.querySelector(`label[for="${i.id}"]`)),name:i.name||null}));
      const pwToggle=!![...document.querySelectorAll('button,[role=button]')].find(b=>/show|hide|👁|eye/i.test(b.textContent+b.getAttribute('aria-label')));
      const forgot=!![...document.querySelectorAll('a,button')].find(x=>/forgot/i.test(x.textContent));
      const social=!![...document.querySelectorAll('button,a')].find(x=>/google|apple|continue with/i.test(x.textContent));
      return {inputs,pwToggle,forgot,social};
    });
    log('\n=== LOGIN ===');
    log('inputs:',JSON.stringify(loginDom.inputs));
    log('password show/hide toggle:',loginDom.pwToggle,'| forgot-password link:',loginDom.forgot,'| social auth:',loginDom.social);

    // submit empty
    await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Sign In/i.test(x.textContent));b&&b.click()}); await sleep(500);
    log('submit empty →',JSON.stringify(await p.evaluate(()=>{const e=[...document.querySelectorAll('div')].find(d=>/please|invalid|required/i.test(d.textContent)&&d.children.length===0&&getComputedStyle(d).backgroundColor==='rgb(254, 226, 226)');return e?{text:e.textContent.trim(),role:e.getAttribute('role'),ariaLive:e.getAttribute('aria-live')}:null})));

    // wrong password
    await p.evaluate((em)=>{const set=(el,v)=>{const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};const ins=[...document.querySelectorAll('input')];set(ins[0],em);set(ins[1],'wrongpassword')},email);
    await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Sign In/i.test(x.textContent));b&&b.click()}); await sleep(1500);
    log('wrong password →',JSON.stringify(await p.evaluate(()=>{const e=[...document.querySelectorAll('div')].find(d=>getComputedStyle(d).backgroundColor==='rgb(254, 226, 226)'&&d.children.length===0);return e?e.textContent.trim():'(no error shown)'})));

    // network failure → submit valid creds offline
    await p.setOfflineMode(true);
    await p.evaluate((em)=>{const set=(el,v)=>{const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};const ins=[...document.querySelectorAll('input')];set(ins[1],'TestPass123!')},email);
    await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Sign In/i.test(x.textContent));b&&b.click()}); await sleep(2000);
    log('NETWORK FAILURE (offline) → error text:',JSON.stringify(await p.evaluate(()=>{const e=[...document.querySelectorAll('div')].find(d=>getComputedStyle(d).backgroundColor==='rgb(254, 226, 226)'&&d.children.length===0);return e?e.textContent.trim():'(none)'})));
    await p.setOfflineMode(false);

    // ---------- REGISTER ----------
    await p.goto(`${BASE}/register`,{waitUntil:'networkidle2'}); await sleep(1200);
    const regDom=await p.evaluate(()=>{const inputs=[...document.querySelectorAll('input')].map(i=>({type:i.type,ac:i.getAttribute('autocomplete'),labelled:!!(i.id&&document.querySelector(`label[for="${i.id}"]`))}));return {inputs,count:inputs.length}});
    log('\n=== REGISTER (pilot) ===');
    log('inputs:',JSON.stringify(regDom.inputs));

    // submit empty (pilot) — banner vs per-field?
    await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Create Account/i.test(x.textContent));b&&b.click()}); await sleep(500);
    log('pilot submit empty →',JSON.stringify(await p.evaluate(()=>{const e=[...document.querySelectorAll('div')].find(d=>getComputedStyle(d).backgroundColor==='rgb(254, 226, 226)'&&d.children.length===0);return e?e.textContent.trim():'(none)'})));

    // invalid email (pilot): firstName + bad email + valid pw
    await p.evaluate(()=>{const set=(el,v)=>{const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};const ins=[...document.querySelectorAll('input')];set(ins[0],'Test');/*firstName*/ const em=ins.find(i=>i.type==='email');set(em,'notanemail'); const pwf=ins.find(i=>i.type==='password');set(pwf,'TestPass123!')});
    await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Create Account/i.test(x.textContent));b&&b.click()}); await sleep(1500);
    log('pilot invalid email →',JSON.stringify(await p.evaluate(()=>{const e=[...document.querySelectorAll('div')].find(d=>getComputedStyle(d).backgroundColor==='rgb(254, 226, 226)'&&d.children.length===0);return e?e.textContent.trim():'(none)'})));

    // already-registered email (pilot)
    await p.evaluate((em)=>{const set=(el,v)=>{const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};const e=[...document.querySelectorAll('input')].find(i=>i.type==='email');set(e,em)},email);
    await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Create Account/i.test(x.textContent));b&&b.click()}); await sleep(1800);
    log('pilot already-registered email →',JSON.stringify(await p.evaluate(()=>{const e=[...document.querySelectorAll('div')].find(d=>getComputedStyle(d).backgroundColor==='rgb(254, 226, 226)'&&d.children.length===0);return e?e.textContent.trim():'(none)'})));

    // employer mode: password mismatch → field error
    await p.goto(`${BASE}/register?as=employer`,{waitUntil:'networkidle2'}); await sleep(1000);
    await p.evaluate(()=>{const set=(el,v)=>{const s=Object.getOwnPropertyDescriptor((el.tagName==='SELECT'?window.HTMLSelectElement:window.HTMLInputElement).prototype,'value').set;s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))};
      const pws=[...document.querySelectorAll('input[type=password]')]; set(pws[0],'TestPass123!'); set(pws[1],'DIFFERENT123!');});
    await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Create Employer Account/i.test(x.textContent));b&&b.click()}); await sleep(800);
    log('\n=== REGISTER (employer) ===');
    log('mismatch passwords → field errors shown:',JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('div')].filter(d=>d.children.length===0&&/match|required|valid/i.test(d.textContent)&&getComputedStyle(d).color==='rgb(153, 27, 27)').map(d=>d.textContent.trim()).slice(0,8))));

    // ---------- REDIRECT (authed → /login) ----------
    if(token){ const ctx=await b.createBrowserContext(); const pg=await ctx.newPage(); await pg.goto(BASE,{waitUntil:'domcontentloaded'}); await pg.evaluate(t=>localStorage.setItem('authToken',t),token); await pg.goto(`${BASE}/login`,{waitUntil:'networkidle2'}); await sleep(1500); log('\n=== REDIRECT ===\nauthed pilot → /login lands on:',await pg.evaluate(()=>location.pathname)); await ctx.close(); }

    // ---------- MOBILE ----------
    await p.setViewport({width:390,height:780});
    for(const path of ['/login','/register','/register?as=employer']){ await p.goto(BASE+path,{waitUntil:'networkidle2'}); await sleep(800); const mh=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1); log('mobile',path,'h-scroll:',mh); }

    log('\nCONSOLE ERRORS:',errs.length?errs.join(' | '):'(none)');
  } finally {
    await b.close();
    if(token) await jf('/auth/account',{method:'DELETE',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({password:PW})});
    log('cleanup done');
  }
})();
