const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',API=`${BASE}/api`,CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',PW='TestPass123!';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results=[]; const check=(id,c,m)=>{results.push([id,!!c,m]);console.log(`  ${c?'✓':'✗'} ${id}  ${m}`)};
async function jf(p,o={}){const r=await fetch(API+p,o);let b=null;try{b=await r.json()}catch{}return{status:r.status,body:b}}
async function poll(p,fn,ms=12000){const t=Date.now();while(Date.now()-t<ms){if(await p.evaluate(fn))return true;await sleep(300)}return false}
// select the AddFlightModal dialog (contains the form title), NOT Layout's nav drawer
const formDialog=()=>{const ds=[...document.querySelectorAll('[role="dialog"]')];return ds.find(d=>/Log a Flight|Block & Flight Times/.test(d.textContent))||null};
(async()=>{
  const email=`modal2_${Date.now()}@example.com`;
  const reg=await jf('/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:PW,firstName:'Modal2'})});
  const tok=reg.body.token; const auth={Authorization:`Bearer ${tok}`,'Content-Type':'application/json'};
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  try{
    const p=await b.newPage(); await p.setViewport({width:1280,height:900});
    await p.goto(BASE,{waitUntil:'domcontentloaded'}); await p.evaluate(t=>localStorage.setItem('authToken',t),tok);

    // af-save: SINGLE valid leg
    await p.goto(`${BASE}/logbook`,{waitUntil:'networkidle2'}); await sleep(1800);
    await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>/Log a Flight/i.test(b.textContent));x.click()});
    await poll(p,()=>!!document.querySelector('[role="dialog"]'));
    await p.evaluate(()=>{const setV=(el,v)=>{const s=Object.getOwnPropertyDescriptor((el.tagName==='SELECT'?window.HTMLSelectElement:window.HTMLInputElement).prototype,'value').set;s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))};
      const dlg=document.querySelector('[role="dialog"]');
      const date=dlg.querySelector('input[type="date"]'); if(date) setV(date,'2025-03-01');
      const combo=[...dlg.querySelectorAll('input')].find(x=>/B737, A320, C172/.test(x.placeholder||'')); if(combo) setV(combo,'A320');
      const times=[...dlg.querySelectorAll('input[type="time"]')]; if(times[0])setV(times[0],'08:00'); if(times[3])setV(times[3],'09:30');
    });
    await sleep(500);
    const beforeN=(await jf('/flight-logs',{headers:auth})).body?.logs?.length??0;
    await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Save Flight');x&&x.click()});
    const closed=await poll(p,()=>!document.querySelector('[role="dialog"]'),12000); await sleep(1000);
    const afterN=(await jf('/flight-logs',{headers:auth})).body?.logs?.length??0;
    check('af-save', closed&&afterN>beforeN, `single-leg save → flight-logs ${beforeN}→${afterN}, modal closed=${closed}`);

    // af-mobile: correct dialog selection
    await p.setViewport({width:390,height:780}); await p.goto(`${BASE}/logbook`,{waitUntil:'networkidle2'}); await sleep(1800);
    await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>/Log a Flight/i.test(b.textContent));x.click()});
    await poll(p, formDialog);
    const afm=await p.evaluate(`(${formDialog})()`).then(()=>p.evaluate(()=>{const ds=[...document.querySelectorAll('[role="dialog"]')];const d=ds.find(x=>/Log a Flight|Block & Flight Times/.test(x.textContent));if(!d)return{none:true};const cs=getComputedStyle(d);return{maxW:cs.maxWidth,rTop:cs.borderTopLeftRadius,rBot:cs.borderBottomLeftRadius,align:getComputedStyle(d.parentElement).alignItems,w:Math.round(d.getBoundingClientRect().width)}}));
    check('af-mobile', !afm.none&&afm.maxW==='100%'&&afm.rTop==='14px'&&afm.rBot==='0px'&&afm.align==='flex-end'&&afm.w>=388, `AddFlightModal mobile sheet: maxW=${afm.maxW}, radius ${afm.rTop}/${afm.rBot}, align=${afm.align}, width=${afm.w}`);
    await p.keyboard.press('Escape'); await sleep(400);

    // im-mobile: ImportModal bottom sheet at 390 (same primitive)
    await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>/Import/.test(b.textContent.trim()));x&&x.click()});
    await poll(p,()=>{const ds=[...document.querySelectorAll('[role="dialog"]')];return ds.some(d=>/Import Flights/.test(d.textContent))});
    const imm=await p.evaluate(()=>{const d=[...document.querySelectorAll('[role="dialog"]')].find(x=>/Import Flights/.test(x.textContent));const cs=getComputedStyle(d);return{maxW:cs.maxWidth,rTop:cs.borderTopLeftRadius,align:getComputedStyle(d.parentElement).alignItems}});
    check('im-mobile', imm.maxW==='100%'&&imm.rTop==='14px'&&imm.align==='flex-end', `ImportModal mobile sheet: maxW=${imm.maxW}, radiusTop=${imm.rTop}, align=${imm.align}`);

    await b.close();
    await jf('/auth/account',{method:'DELETE',headers:auth,body:JSON.stringify({password:PW})});
  } catch(e){ console.error('ERR',e.message); await b.close(); }
  const passed=results.filter(r=>r[1]).length;
  console.log(`\n========== COMMIT 2 RE-PROBE: ${passed}/${results.length} ==========`);
  results.filter(r=>!r[1]).forEach(([id,,m])=>console.log(`  ✗ ${id}: ${m}`));
})();
