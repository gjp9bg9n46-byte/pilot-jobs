const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',API=`${BASE}/api`,CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',PW='TestPass123!';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results=[]; const check=(id,c,m)=>{results.push([id,!!c,m]);console.log(`  ${c?'✓':'✗'} ${id}  ${m}`)};
async function jf(p,o={}){const r=await fetch(API+p,o);let b=null;try{b=await r.json()}catch{}return{status:r.status,body:b}}
async function poll(p,fn,ms=10000){const t=Date.now();while(Date.now()-t<ms){if(await p.evaluate(fn))return true;await sleep(300)}return false}
(async()=>{
  const email=`modal_${Date.now()}@example.com`;
  const reg=await jf('/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:PW,firstName:'Modal'})});
  const tok=reg.body.token; const auth={Authorization:`Bearer ${tok}`,'Content-Type':'application/json'};
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  try{
    const p=await b.newPage(); await p.setViewport({width:1280,height:900});
    await p.goto(BASE,{waitUntil:'domcontentloaded'});
    await p.evaluate(t=>localStorage.setItem('authToken',t),tok);
    await p.goto(`${BASE}/logbook`,{waitUntil:'networkidle2'}); await sleep(1800);

    // ── AddFlightModal: open → md width, role=dialog (primitive) ──
    await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>/Log a Flight/i.test(b.textContent));x.click()});
    await poll(p,()=>!!document.querySelector('[role="dialog"]'));
    const af=await p.evaluate(()=>{const d=document.querySelector('[role="dialog"]');return{maxW:getComputedStyle(d).maxWidth,role:d.getAttribute('role'),ariaModal:d.getAttribute('aria-modal'),title:[...d.querySelectorAll('*')].some(e=>/Log a Flight/.test(e.textContent)&&e.children.length===0),scrollLock:getComputedStyle(document.body).overflow}});
    check('af-open', af.maxW==='680px'&&af.role==='dialog'&&af.ariaModal==='true'&&af.scrollLock==='hidden', `AddFlightModal md=${af.maxW}, role=dialog aria-modal=${af.ariaModal}, scroll-lock=${af.scrollLock}`);
    // focus trapped inside dialog
    const af_focus=await p.evaluate(()=>{const d=document.querySelector('[role="dialog"]');return d.contains(document.activeElement)});
    check('af-focus', af_focus, `focus inside dialog = ${af_focus}`);
    // multi-leg: fill leg 1 (date+aircraft+off/on), add leg, save via API-equivalent UI submit
    await p.evaluate(()=>{const setV=(el,v)=>{const s=Object.getOwnPropertyDescriptor((el.tagName==='SELECT'?window.HTMLSelectElement:window.HTMLInputElement).prototype,'value').set;s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))};
      const dlg=document.querySelector('[role="dialog"]');
      const date=dlg.querySelector('input[type="date"]'); if(date) setV(date,'2025-03-01');
      const combo=[...dlg.querySelectorAll('input')].find(x=>/B737, A320, C172/.test(x.placeholder||'')); if(combo) setV(combo,'A320');
      const times=[...dlg.querySelectorAll('input[type="time"]')]; if(times[0])setV(times[0],'08:00'); if(times[3])setV(times[3],'09:30');
    });
    await sleep(400);
    // add another leg
    await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>/Add another leg/.test(b.textContent));x&&x.click()}); await sleep(400);
    const legs=await p.evaluate(()=>document.body.innerText.match(/Leg 2/)?2:1);
    // save
    const before=await jf('/flight-logs',{headers:auth}); const beforeN=before.body?.logs?.length??0;
    await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>/^Save (Flight|\d+ Legs)/.test(b.textContent.trim()));x&&x.click()});
    await poll(p,()=>!document.querySelector('[role="dialog"]'),10000);
    await sleep(1000);
    const after=await jf('/flight-logs',{headers:auth}); const afterN=after.body?.logs?.length??0;
    check('af-save', legs===2 && afterN>beforeN, `multi-leg (legs shown=${legs}) saved → flight-logs ${beforeN}→${afterN}, modal closed`);

    // escape + backdrop close
    await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>/Log a Flight/i.test(b.textContent));x.click()});
    await poll(p,()=>!!document.querySelector('[role="dialog"]'));
    await p.keyboard.press('Escape'); await sleep(500);
    const escClosed=await p.evaluate(()=>!document.querySelector('[role="dialog"]'));
    await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>/Log a Flight/i.test(b.textContent));x.click()});
    await poll(p,()=>!!document.querySelector('[role="dialog"]'));
    await p.evaluate(()=>{const bd=document.querySelector('[role="dialog"]').parentElement;const r=bd.getBoundingClientRect();bd.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:5,clientY:5}))});
    await sleep(500);
    const bdClosed=await p.evaluate(()=>!document.querySelector('[role="dialog"]'));
    check('af-dismiss', escClosed&&bdClosed, `escape closes=${escClosed}, backdrop click closes=${bdClosed}`);

    // mobile sheet at 390
    await p.setViewport({width:390,height:780}); await sleep(300);
    await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>/Log a Flight/i.test(b.textContent));x.click()});
    await poll(p,()=>!!document.querySelector('[role="dialog"]'));
    const afm=await p.evaluate(()=>{const d=document.querySelector('[role="dialog"]');const cs=getComputedStyle(d);return{maxW:cs.maxWidth,rTop:cs.borderTopLeftRadius,rBot:cs.borderBottomLeftRadius,align:getComputedStyle(d.parentElement).alignItems}});
    check('af-mobile', afm.maxW==='100%'&&afm.rTop==='14px'&&afm.rBot==='0px'&&afm.align==='flex-end', `AddFlightModal mobile sheet: maxW=${afm.maxW}, radius ${afm.rTop}/${afm.rBot}, align=${afm.align}`);
    await p.keyboard.press('Escape'); await sleep(400);
    await p.setViewport({width:1280,height:900});

    // ── ImportModal: open → lg width, CSV upload → preview → confirm ──
    await p.goto(`${BASE}/logbook`,{waitUntil:'networkidle2'}); await sleep(1500);
    await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>/Import/.test(b.textContent.trim()));x&&x.click()});
    await poll(p,()=>{const d=document.querySelector('[role="dialog"]');return d&&/Import Flights/.test(d.textContent)});
    const im=await p.evaluate(()=>{const d=document.querySelector('[role="dialog"]');return{maxW:getComputedStyle(d).maxWidth,hasFormatCards:/CSV/.test(d.textContent)&&/Excel/.test(d.textContent)}});
    check('im-open', im.maxW==='960px'&&im.hasFormatCards, `ImportModal lg=${im.maxW}, format cards present=${im.hasFormatCards}`);
    // upload CSV via the hidden file input
    const csv='Date,Aircraft,Reg,From,To,Off,On\n2025-02-02,B737,A6-IMP,OMDB,OTHH,06:00,07:30\n2025-02-03,B737,A6-IMP,OTHH,OMDB,09:00,10:30\n';
    const fileInput=await p.$('input[type="file"]');
    const tmp=require('os').tmpdir()+'/p-import.csv'; require('fs').writeFileSync(tmp,csv);
    await fileInput.uploadFile(tmp);
    const preview=await poll(p,()=>/ready|rows parsed|Column mapping/i.test(document.body.innerText),15000);
    check('im-preview', preview, `CSV upload → preview/stats shown = ${preview}`);
    // confirm import
    const beforeI=(await jf('/flight-logs',{headers:auth})).body?.logs?.length??0;
    await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>/^Import \d+ Flight/.test(b.textContent.trim()));x&&x.click()});
    const done=await poll(p,()=>/imported/i.test(document.body.innerText),15000);
    await sleep(1000);
    const afterI=(await jf('/flight-logs',{headers:auth})).body?.logs?.length??0;
    check('im-confirm', done&&afterI>beforeI, `import confirm → done state, flight-logs ${beforeI}→${afterI}`);

    await b.close();
    // cleanup
    await jf('/auth/account',{method:'DELETE',headers:auth,body:JSON.stringify({password:PW})});
  } catch(e){ console.error('ERR',e.message); await b.close(); }
  const passed=results.filter(r=>r[1]).length;
  console.log(`\n========== COMMIT 2 (modal retrofit): ${passed}/${results.length} ==========`);
  results.filter(r=>!r[1]).forEach(([id,,m])=>console.log(`  ✗ ${id}: ${m}`));
})();
