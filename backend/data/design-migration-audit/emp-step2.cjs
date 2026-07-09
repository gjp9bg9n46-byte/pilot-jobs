const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,body:j}}
const rgb=hex=>{const n=parseInt(hex.slice(1),16);return `rgb(${(n>>16)&255}, ${(n>>8)&255}, ${n&255})`;};
const results=[];const ok=(id,c,m)=>{results.push([id,!!c]);console.log(`  ${c?'✓':'✗'} ${id}  ${m||''}`)};
const EMAIL='emp_1781735440500@example.com', PW='Verify123!emp';
(async()=>{
  const lg=await api('/employers/login',{method:'POST',body:{contactEmail:EMAIL,password:PW}});
  const tok=lg.body?.token; console.log('login status:',lg.status,'| employer status:',lg.body?.employer?.status);
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const errs=[];
  const inject=async p=>{await p.goto(BASE,{waitUntil:'domcontentloaded'});await p.evaluate(t=>localStorage.setItem('employerToken',t),tok);};
  try{
    const p=await b.newPage(); await p.setViewport({width:1280,height:1700});
    p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text().slice(0,110));});
    await inject(p);

    // ===== DASHBOARD empty =====
    await p.goto(`${BASE}/employer/dashboard`,{waitUntil:'networkidle2'}); await sleep(2000);
    const dash=await p.evaluate(()=>({appB2b:!!document.querySelector('.app-b2b'),bg:getComputedStyle(document.body).backgroundColor,approvedBadge:/APPROVED/.test(document.body.innerText),empty:/haven't posted any jobs/i.test(document.body.innerText),postBtn:/Post New Job/i.test(document.body.innerText),firstJobLink:/Post your first job/i.test(document.body.innerText)}));
    ok('Dashboard cool-operator + APPROVED badge', dash.appB2b&&dash.bg===rgb('#F3F4F6')&&dash.approvedBadge, JSON.stringify(dash));
    ok('Dashboard empty state (no jobs)', dash.empty&&dash.firstJobLink);
    await p.screenshot({path:`${OUT}/emp-dash-empty.png`});

    // ===== JOBFORM new (empty) =====
    await p.goto(`${BASE}/employer/jobs/new`,{waitUntil:'networkidle2'}); await sleep(1500);
    const form=await p.evaluate(()=>{
      const island=document.querySelector('.app-light');
      const islandBg=island?getComputedStyle(island).backgroundColor:null;
      const pageBg=getComputedStyle(document.querySelector('.app-b2b')).backgroundColor;
      return {appB2b:!!document.querySelector('.app-b2b'),warmIsland:islandBg,coolPage:pageBg,preview:/Live preview/i.test(document.body.innerText),previewEmpty:/Start filling the form/i.test(document.body.innerText),combo:!!document.querySelector('input')};
    });
    ok('JobForm cool page + WARM preview island', form.coolPage===rgb('#F3F4F6')&&form.warmIsland===rgb('#F8F6F1'), `page=${form.coolPage} island=${form.warmIsland}`);
    ok('JobForm preview empty-state copy', form.previewEmpty);
    await p.screenshot({path:`${OUT}/emp-jobform-new.png`});
    // validation: submit empty
    await p.evaluate(()=>{const btns=[...document.querySelectorAll('button')];const s=btns.find(b=>/Post Job/.test(b.textContent));s&&s.click();}); await sleep(800);
    ok('JobForm validation blocks empty submit', await p.evaluate(()=>/required/i.test(document.body.innerText)));
    // AircraftCombobox: type + dropdown
    const combo=await p.evaluate(()=>{const inp=[...document.querySelectorAll('input')].find(i=>(i.getAttribute('placeholder')||'').match(/A320|B737|search|aircraft/i));return !!inp;});
    // fill required fields + post
    await p.evaluate(()=>{
      const setByLabelText=(labelText,val)=>{const lbls=[...document.querySelectorAll('label,div')];/*Input primitive renders label*/};
      const inputs=[...document.querySelectorAll('input,textarea')];
      const setVal=(el,val)=>{const proto=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,val);el.dispatchEvent(new Event('input',{bubbles:true}));};
      // title is the first text input (autoFocus)
      const title=inputs.find(i=>i.type==='text'||!i.type||i.type==='');
      setVal(title,'Audit Captain — Citation CJ3');
      const ta=document.querySelector('textarea'); setVal(ta,'Audit job description for the employer portal audit. Seeking a captain.');
      const apply=inputs.find(i=>(i.getAttribute('placeholder')||'').includes('careers-page')); setVal(apply,'https://example.com/apply');
    }); await sleep(500);
    await p.evaluate(()=>{const s=[...document.querySelectorAll('button')].find(b=>/Post Job/.test(b.textContent));s&&s.click();}); await sleep(3000);
    ok('JobForm post → dashboard toast', /\/employer\/dashboard$/.test(await p.evaluate(()=>location.pathname))&&/Job posted/i.test(await p.evaluate(()=>document.body.innerText)), await p.evaluate(()=>location.pathname));

    // ===== DASHBOARD populated =====
    await sleep(1000);
    const dashPop=await p.evaluate(()=>({hasJob:/Audit Captain/i.test(document.body.innerText),activeBadge:/ACTIVE/.test(document.body.innerText),edit:/Edit/.test(document.body.innerText),del:/Delete/.test(document.body.innerText)}));
    ok('Dashboard populated: job + ACTIVE badge + Edit/Delete', dashPop.hasJob&&dashPop.activeBadge&&dashPop.edit&&dashPop.del, JSON.stringify(dashPop));
    await p.screenshot({path:`${OUT}/emp-dash-populated.png`});

    // ===== JOBFORM edit (prefilled) =====
    await p.evaluate(()=>{const e=[...document.querySelectorAll('a')].find(a=>/Edit/.test(a.textContent)&&/\/edit$/.test(a.getAttribute('href')||''));e&&e.click();}); await sleep(2500);
    const edit=await p.evaluate(()=>({isEdit:/Edit Job/.test(document.body.innerText),titlePrefill:[...document.querySelectorAll('input')].some(i=>/Audit Captain/.test(i.value))}));
    ok('JobForm edit pre-fills', edit.isEdit&&edit.titlePrefill, JSON.stringify(edit));
    await p.screenshot({path:`${OUT}/emp-jobform-edit.png`});

    // ===== PROFILE prefilled + edit =====
    await p.goto(`${BASE}/employer/profile`,{waitUntil:'networkidle2'}); await sleep(1500);
    const prof=await p.evaluate(()=>({appB2b:!!document.querySelector('.app-b2b'),namePrefill:[...document.querySelectorAll('input')].some(i=>/Audit Air Co/.test(i.value)),emailReadonly:[...document.querySelectorAll('input')].some(i=>i.disabled&&/example.com/.test(i.value)),statusBadge:/APPROVED/.test(document.body.innerText)}));
    ok('Profile prefilled + email readonly + status badge', prof.namePrefill&&prof.emailReadonly&&prof.statusBadge, JSON.stringify(prof));
    await p.screenshot({path:`${OUT}/emp-profile.png`});
    // edit save
    await p.evaluate(()=>{const i=[...document.querySelectorAll('input')].find(x=>/Audit Air Co/.test(x.value));const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,'Audit Air Co (edited)');i.dispatchEvent(new Event('input',{bubbles:true}));});
    await p.evaluate(()=>{const s=[...document.querySelectorAll('button')].find(b=>/Save Profile/.test(b.textContent));s&&s.click();}); await sleep(2500);
    ok('Profile save → dashboard toast', /Profile updated/i.test(await p.evaluate(()=>document.body.innerText)));

    // ===== DELETE via modal =====
    await sleep(800);
    await p.evaluate(()=>{const d=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Delete');d&&d.click();}); await sleep(600);
    const modal=await p.evaluate(()=>{const dlg=document.querySelector('[role="dialog"]');return dlg?{open:true,title:[...dlg.querySelectorAll('*')].some(e=>/Delete this job/i.test(e.textContent)),titleFont:(()=>{const t=[...dlg.querySelectorAll('*')].find(e=>/Delete this job/i.test(e.textContent)&&e.children.length===0);return t?getComputedStyle(t).fontFamily:null})()}:{open:false};});
    ok('Delete modal opens (Inter title, not Fraunces)', modal.open&&modal.title&&/Inter/i.test(modal.titleFont||''), JSON.stringify(modal));
    await p.evaluate(()=>{const d=[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent.trim()==='Delete');d&&d.click();}); await sleep(2500);
    ok('Delete → job set EXPIRED', await p.evaluate(()=>/EXPIRED/.test(document.body.innerText)||/haven't posted/i.test(document.body.innerText)));

    // ===== MOBILE jobform (form/preview tabs) =====
    const pm=await b.newPage(); await pm.setViewport({width:390,height:1700,isMobile:true});
    await inject(pm); await pm.goto(`${BASE}/employer/jobs/new`,{waitUntil:'networkidle2'}); await sleep(1500);
    const mob=await pm.evaluate(()=>({tabs:/Form/.test(document.body.innerText)&&/Preview/.test(document.body.innerText),noHScroll:document.documentElement.scrollWidth<=window.innerWidth+2}));
    ok('Mobile JobForm Form/Preview tabs + no h-scroll', mob.tabs&&mob.noHScroll, JSON.stringify(mob));
    await pm.screenshot({path:`${OUT}/emp-jobform-mobile.png`});
    await pm.goto(`${BASE}/employer/dashboard`,{waitUntil:'networkidle2'}); await sleep(1500);
    ok('Mobile dashboard no h-scroll', await pm.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
    await pm.screenshot({path:`${OUT}/emp-dash-mobile.png`});

    ok('no console errors', errs.length===0, errs.join('|')||'none');
  } finally { await b.close();
    const passed=results.filter(r=>r[1]).length; console.log(`\n========== EMPLOYER STEP2 VERIFY: ${passed}/${results.length} ==========`);
  }
})().catch(e=>console.error('FATAL',e.message,e.stack));
