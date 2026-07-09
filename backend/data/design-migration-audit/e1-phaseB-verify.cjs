const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
const prisma=require('/Users/mohamedalaa/pilot-jobs/backend/src/config/database');
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,body:j}}
const slugify=s=>String(s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const results=[];const ok=(id,c,m)=>{results.push([id,!!c]);console.log(`  ${c?'✓':'✗'} ${id}  ${m||''}`)};
(async()=>{
  const jobs=(await api('/jobs?limit=1000')).body.jobs;
  const j1=jobs[0], j2=jobs.find(j=>j.id!==j1.id);
  const slug=j=>`${slugify(j.company)}-${slugify(j.role||j.title)}-${j.id}`;
  const email=`pb_${Date.now()}@example.com`,pw='Verify123!pw';
  const reg=await api('/auth/register',{method:'POST',body:{email,password:pw,firstName:'Phase',lastName:'Bravo',phone:'+10000000000',country:'United States',city:'Dallas'}});
  const tok=reg.body.token; const H={Authorization:`Bearer ${tok}`};
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const errs=[]; let popup=0;
  try{
    const p=await b.newPage(); await p.setViewport({width:1280,height:1400});
    p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text().slice(0,110));});
    p.on('popup',()=>popup++); // window.open new tab
    const ctx=p.browserContext();

    // ===== (c) LOGGED-OUT apply =====
    const po=await b.newPage(); await po.setViewport({width:1280,height:1400}); let popupO=0; po.on('popup',()=>popupO++);
    await po.goto(`${BASE}/jobs/${slug(j1)}`,{waitUntil:'networkidle2'});
    await po.waitForFunction(()=>document.querySelector('h1')&&!/Loading job/i.test(document.body.innerText),{timeout:20000}); await sleep(1000);
    await po.evaluate(()=>{const btn=[...document.querySelectorAll('button')].find(b=>/Apply/.test(b.textContent)&&!/Save/.test(b.textContent));btn&&btn.click();}); await sleep(1200);
    const loInfo=await po.evaluate(()=>({signin:/Sign in to track this application/i.test(document.body.innerText),link:[...document.querySelectorAll('a')].find(a=>/track this application/i.test(a.textContent))?.getAttribute('href')}));
    ok('c logged-out: external opened + signin toast', popupO>=1&&loInfo.signin, `popup=${popupO} signin=${loInfo.signin} link=${loInfo.link}`);
    await po.screenshot({path:`${OUT}/pb-loggedout-apply.png`}); await po.close();

    // ===== (a) AUTHED apply =====
    await p.goto(BASE,{waitUntil:'domcontentloaded'}); await p.evaluate(t=>localStorage.setItem('authToken',t),tok);
    await p.goto(`${BASE}/jobs/${slug(j1)}`,{waitUntil:'networkidle2'});
    await p.waitForFunction(()=>document.querySelector('h1')&&!/Loading job/i.test(document.body.innerText),{timeout:20000}); await sleep(1000);
    await p.evaluate(()=>{const btn=[...document.querySelectorAll('button')].find(b=>/Apply/.test(b.textContent)&&!/Save/.test(b.textContent));btn&&btn.click();}); await sleep(800);
    // (b) double-click rapidly
    await p.evaluate(()=>{const btn=[...document.querySelectorAll('button')].find(b=>/Apply/.test(b.textContent)&&!/Save/.test(b.textContent));btn&&btn.click();}); await sleep(2000);
    const appliedIndicator=await p.evaluate(()=>/✓ Applied/.test(document.body.innerText));
    ok('a authed apply: external opened + ✓ Applied indicator', popup>=1&&appliedIndicator, `popup=${popup} applied=${appliedIndicator}`);
    await p.screenshot({path:`${OUT}/pb-applied-indicator.png`});
    // reload → persistent
    await p.goto(`${BASE}/jobs/${slug(j1)}`,{waitUntil:'networkidle2'}); await sleep(2000);
    ok('a ✓ Applied persists after reload (isApplied)', await p.evaluate(()=>/✓ Applied/.test(document.body.innerText)));
    // (b) idempotent: exactly 1 application
    const apps1=await api('/jobs/applications',{headers:H});
    ok('b idempotent: 1 application after double-click', apps1.body.length===1, `count=${apps1.body.length}`);

    // apply to a 2nd job (for the populated ApplicationsTab → 2 rows)
    await p.goto(`${BASE}/jobs/${slug(j2)}`,{waitUntil:'networkidle2'}); await sleep(1500);
    await p.evaluate(()=>{const btn=[...document.querySelectorAll('button')].find(b=>/Apply/.test(b.textContent)&&!/Save/.test(b.textContent));btn&&btn.click();}); await sleep(2000);
    // give one a non-APPLIED status via admin-ish prisma so pills vary
    const pilotId=(await prisma.pilot.findFirst({where:{email}})).id;
    const myApps=await prisma.application.findMany({where:{pilotId}});
    if(myApps[0]) await prisma.application.update({where:{id:myApps[0].id},data:{status:'SHORTLISTED',statusUpdatedAt:new Date()}});

    // ===== (d) ApplicationsTab populated =====
    await p.goto(`${BASE}/alerts`,{waitUntil:'networkidle2'}); await sleep(2000);
    await p.evaluate(()=>{const t=[...document.querySelectorAll('button')].find(b=>/Applications/.test(b.textContent));t&&t.click();}); await sleep(2500);
    const tab=await p.evaluate(()=>{
      const rows=[...document.querySelectorAll('div')].filter(d=>/Applied (today|\d)/.test(d.textContent)&&d.querySelector('img,[aria-hidden="true"]'));
      const badge=(document.body.innerText.match(/Applications\s*(\d+)/)||[])[1];
      return { hasShortlisted:/Shortlisted/.test(document.body.innerText), hasApplied:/Applied/.test(document.body.innerText), rowCount:[...document.querySelectorAll('div')].filter(d=>/Applied (today|1 day|\d+ days)/.test(d.textContent)).length };
    });
    const appsApi=await api('/jobs/applications',{headers:H});
    ok('d ApplicationsTab populated (2 apps, mixed status)', appsApi.body.length===2&&tab.hasShortlisted, `apiCount=${appsApi.body.length} shortlisted=${tab.hasShortlisted}`);
    ok('d tab badge = count', await p.evaluate(()=>{const tb=[...document.querySelectorAll('button')].find(b=>/Applications/.test(b.textContent));return /2/.test(tb.textContent);}));
    await p.screenshot({path:`${OUT}/pb-applications-populated.png`});

    // (j) regression: MatchesTab still renders (not applications)
    await p.evaluate(()=>{const t=[...document.querySelectorAll('button')].find(b=>/Matches/.test(b.textContent));t&&t.click();}); await sleep(1500);
    ok('j MatchesTab still renders (regression)', await p.evaluate(()=>!/You haven't applied/i.test(document.body.innerText)));

    // ===== mobile (h) =====
    const pm=await b.newPage(); await pm.setViewport({width:390,height:1600,isMobile:true});
    await pm.goto(BASE,{waitUntil:'domcontentloaded'}); await pm.evaluate(t=>localStorage.setItem('authToken',t),tok);
    await pm.goto(`${BASE}/alerts`,{waitUntil:'networkidle2'}); await sleep(1500);
    await pm.evaluate(()=>{const t=[...document.querySelectorAll('button')].find(b=>/Applications/.test(b.textContent));t&&t.click();}); await sleep(2500);
    ok('h mobile ApplicationsTab no h-scroll', await pm.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
    await pm.screenshot({path:`${OUT}/pb-applications-mobile.png`});

    ok('i no console errors', errs.length===0, errs.join('|')||'none');
  } finally {
    await b.close();
    const pl=await prisma.pilot.findFirst({where:{email}}); if(pl){await prisma.application.deleteMany({where:{pilotId:pl.id}});await prisma.jobAlert.deleteMany({where:{pilotId:pl.id}}).catch(()=>{});await prisma.savedJob.deleteMany({where:{pilotId:pl.id}}).catch(()=>{});await prisma.pilot.delete({where:{id:pl.id}}).catch(e=>console.log('del err',e.message));}
    console.log('  cleanup done');
    const passed=results.filter(r=>r[1]).length; console.log(`\n========== E1 PHASE B: ${passed}/${results.length} ==========`); process.exit(0);
  }
})().catch(e=>{console.error('FATAL',e.message,e.stack);process.exit(1);});
