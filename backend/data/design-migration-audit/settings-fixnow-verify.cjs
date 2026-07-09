const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,body:j}}
const results=[];const ok=(id,c,m)=>{results.push([id,!!c]);console.log(`  ${c?'✓':'✗'} ${id}  ${m||''}`)};
(async()=>{
  const email=`fxn_${Date.now()}@example.com`,pw='Verify123!pw';
  const reg=await api('/auth/register',{method:'POST',body:{email,password:pw,firstName:'F',lastName:'X',phone:'+10000000000',country:'United States',city:'Dallas'}});
  let tok=reg.body?.token; const H=()=>({Authorization:`Bearer ${tok}`});
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const errs=[];
  try{
    const p=await b.newPage(); await p.setViewport({width:1280,height:1200});
    p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text().slice(0,120))});
    await p.goto(BASE,{waitUntil:'domcontentloaded'}); await p.evaluate(t=>localStorage.setItem('authToken',t),tok);
    await p.goto(`${BASE}/settings`,{waitUntil:'networkidle2'}); await sleep(1800);

    // CHECK: Save Preferences (500 path) → red banner with role=alert
    await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>/Save Preferences/.test(b.textContent));x&&x.click();});
    await sleep(2000);
    const prefErr=await p.evaluate(()=>{const a=[...document.querySelectorAll('[role="alert"]')].map(e=>e.textContent.trim());return{alerts:a,hasPrefErr:a.some(t=>/Failed to save preferences/i.test(t))};});
    ok('#2 prefs error banner (role=alert)', prefErr.hasPrefErr, JSON.stringify(prefErr.alerts));

    // CHECK: Toggle a11y — role=switch, aria-checked, tabindex, keyboard
    const tog=await p.evaluate(()=>{const t=document.querySelector('[role="switch"]');return t?{role:t.getAttribute('role'),ariaChecked:t.getAttribute('aria-checked'),tabindex:t.getAttribute('tabindex')}:null;});
    ok('#5 Toggle role/aria/tabindex', tog&&tog.role==='switch'&&tog.ariaChecked!=null&&tog.tabindex==='0', JSON.stringify(tog));
    // keyboard toggle: focus first switch, read state, press Space, re-read
    const kb=await p.evaluate(async()=>{const t=document.querySelector('[role="switch"]');t.focus();const before=t.getAttribute('aria-checked');return {focused:document.activeElement===t,before};});
    await p.keyboard.press('Space'); await sleep(400);
    const after=await p.evaluate(()=>document.querySelector('[role="switch"]').getAttribute('aria-checked'));
    ok('#5 Space toggles aria-checked', kb.focused&&kb.before!==after, `focused=${kb.focused} ${kb.before}→${after}`);

    // CHECK: notif checkbox label association
    const lbl=await p.evaluate(()=>{const c=document.getElementById('notif-newJobMatch');if(!c)return{found:false};const lab=c.closest('label')||document.querySelector('label[for="notif-newJobMatch"]');return{found:true,hasLabel:!!lab,labelText:lab?lab.textContent.trim().slice(0,30):null};});
    ok('#6 checkbox label association', lbl.found&&lbl.hasLabel, JSON.stringify(lbl));

    // CHECK: success banner role=status — use password change (real 200)
    await p.evaluate((pw)=>{const set=(ph,v)=>{const i=[...document.querySelectorAll('input[type=password]')].find(x=>(x.getAttribute('placeholder')||'').includes(ph));if(i){const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,v);i.dispatchEvent(new Event('input',{bubbles:true}));}};set('Enter current',pw);set('At least 8','NewVerify123!');set('Repeat','NewVerify123!');},pw);
    await sleep(300);
    await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>/Update Password/.test(b.textContent));x&&x.click();});
    await sleep(2500);
    const statusBanner=await p.evaluate(()=>{const s=[...document.querySelectorAll('[role="status"]')].map(e=>e.textContent.trim());return{statuses:s,hasPwSuccess:s.some(t=>/Password changed/i.test(t))};});
    ok('#7 success banner role=status', statusBanner.hasPwSuccess, JSON.stringify(statusBanner.statuses));
    tok=tok; // password changed; cleanup uses new pw below

    // CHECK: Tag remove is a button with aria-label — add a tag then check
    await p.evaluate(()=>{const inp=[...document.querySelectorAll('input[type=text]')][0];if(inp){const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(inp,'TestCountry');inp.dispatchEvent(new Event('input',{bubbles:true}));inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));}});
    await sleep(600);
    const tagBtn=await p.evaluate(()=>{const btn=[...document.querySelectorAll('button[aria-label^="Remove"]')];return{count:btn.length,label:btn[0]?btn[0].getAttribute('aria-label'):null,isButton:btn[0]?btn[0].tagName==='BUTTON':false};});
    ok('#8 Tag remove is <button aria-label>', tagBtn.count>0&&tagBtn.isButton, JSON.stringify(tagBtn));

    // CHECK: Chip aria-pressed
    const chip=await p.evaluate(()=>{const c=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Full-time');return c?{hasAriaPressed:c.getAttribute('aria-pressed')!=null,val:c.getAttribute('aria-pressed')}:null;});
    ok('#9 Chip aria-pressed', chip&&chip.hasAriaPressed, JSON.stringify(chip));
    // toggle chip → aria-pressed flips
    await p.evaluate(()=>{const c=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Full-time');c&&c.click();});
    await sleep(300);
    const chipAfter=await p.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Full-time').getAttribute('aria-pressed'));
    ok('#9 Chip aria-pressed flips', chip.val!==chipAfter, `${chip.val}→${chipAfter}`);

    // CHECK: delete → in-Modal red banner, no native alert, modal stays open
    let nativeAlert=false; p.on('dialog',async d=>{nativeAlert=true;await d.dismiss();});
    await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Delete Account');x&&x.click();});
    await sleep(500);
    await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Delete account');x&&x.click();});
    await sleep(2500);
    const del=await p.evaluate(()=>{const dlg=document.querySelector('[role="dialog"]');const open=!!dlg&&/Delete account\?/.test(dlg.textContent);const err=dlg?[...dlg.querySelectorAll('[role="alert"]')].map(e=>e.textContent.trim()):[];return{modalOpen:open,errInModal:err};});
    ok('#4 delete error in-Modal, no native alert', del.modalOpen&&del.errInModal.length>0&&!nativeAlert, `modalOpen=${del.modalOpen} nativeAlert=${nativeAlert} err=${JSON.stringify(del.errInModal)}`);

    // mobile
    const pm=await b.newPage(); await pm.setViewport({width:390,height:1400,isMobile:true});
    await pm.goto(BASE,{waitUntil:'domcontentloaded'}); await pm.evaluate(t=>localStorage.setItem('authToken',t),tok);
    await pm.goto(`${BASE}/settings`,{waitUntil:'networkidle2'}); await sleep(1500);
    ok('mobile no h-scroll', await pm.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
    console.log('  CONSOLE ERRORS (non-network):', errs.length?errs:'none');
  } finally {
    await b.close();
    // cleanup — password was changed to NewVerify123!
    const lg=await api('/auth/login',{method:'POST',body:{email,password:'NewVerify123!'}});
    if(lg.body?.token){const d=await api('/auth/account',{method:'DELETE',headers:{Authorization:`Bearer ${lg.body.token}`},body:{password:'NewVerify123!'}});console.log('  cleanup:',d.status);}
    const passed=results.filter(r=>r[1]).length;
    console.log(`\n========== FIX-NOW VERIFY: ${passed}/${results.length} ==========`);
  }
})().catch(e=>console.error('FATAL',e.message,e.stack));
