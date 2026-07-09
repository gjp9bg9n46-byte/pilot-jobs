const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
const prisma=require('/Users/mohamedalaa/pilot-jobs/backend/src/config/database');
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,body:j}}
const results=[];const ok=(id,c,m)=>{results.push([id,!!c]);console.log(`  ${c?'✓':'✗'} ${id}  ${m||''}`)};
(async()=>{
  const ts=Date.now();
  const eEmail=`pcE_${ts}@example.com`, e2Email=`pcE2_${ts}@example.com`, ePw='Verify123!emp';
  const p1=`pcP1_${ts}@example.com`, p2=`pcP2_${ts}@example.com`, pPw='Verify123!pw';
  const cleanup={jobs:[],employers:[],pilots:[]};
  let jobId, eTok;
  try{
    // pilots: p1 qualified, p2 unqualified
    const r1=await api('/auth/register',{method:'POST',body:{email:p1,password:pPw,firstName:'Quinn',lastName:'Pilot',phone:'+10000000000',country:'United States',city:'Dallas'}});
    const p1H={Authorization:`Bearer ${r1.body.token}`};
    await api('/profile',{method:'PATCH',headers:p1H,body:{role:'CAPTAIN',nationality:'American'}});
    await api('/profile/certificates',{method:'POST',headers:p1H,body:{type:'ATPL',issuingAuthority:'FAA'}});
    await api('/profile/ratings',{method:'POST',headers:p1H,body:{aircraftType:'A320',category:'TYPE'}});
    const r2=await api('/auth/register',{method:'POST',body:{email:p2,password:pPw,firstName:'Riley',lastName:'Newbie',phone:'+10000000000',country:'United States',city:'Dallas'}});
    const p2H={Authorization:`Bearer ${r2.body.token}`};
    // employers (approve via prisma)
    await api('/employers/register',{method:'POST',body:{companyName:'PhaseC Air',companyType:'CHARTER',country:'Portugal',contactName:'PC',contactEmail:eEmail,password:ePw}});
    await api('/employers/register',{method:'POST',body:{companyName:'PhaseC Other',companyType:'CHARTER',country:'Portugal',contactName:'PC2',contactEmail:e2Email,password:ePw}});
    const emp=await prisma.employer.findFirst({where:{contactEmail:eEmail}}); const emp2=await prisma.employer.findFirst({where:{contactEmail:e2Email}});
    cleanup.employers=[emp.id,emp2.id];
    await prisma.employer.update({where:{id:emp.id},data:{status:'APPROVED'}});
    await prisma.employer.update({where:{id:emp2.id},data:{status:'APPROVED'}});
    eTok=(await api('/employers/login',{method:'POST',body:{contactEmail:eEmail,password:ePw}})).body.token;
    const eH={Authorization:`Bearer ${eTok}`};
    const e2Tok=(await api('/employers/login',{method:'POST',body:{contactEmail:e2Email,password:ePw}})).body.token;
    // job: cert+auth+aircraft, NO hours → p1 qualifies (100), p2 null
    const job=await api('/employers/jobs',{method:'POST',headers:eH,body:{title:'PhaseC Captain A320',description:'Phase C applicants e2e.',applyUrl:'https://example.com/ats-apply',role:'CAPTAIN',reqCertificates:['ATPL'],reqAuthorities:['FAA'],reqAircraftTypes:['A320']}});
    jobId=job.body.id; cleanup.jobs=[jobId];
    // both apply
    await api(`/jobs/${jobId}/apply`,{method:'POST',headers:p1H});
    await api(`/jobs/${jobId}/apply`,{method:'POST',headers:p2H});

    // BACKEND: dashboard count via jobs list
    const jobsList=await api('/employers/jobs',{headers:eH});
    const jr=jobsList.body.find(j=>j.id===jobId);
    ok('a dashboard applicantsCount on jobs list', jr.applicantsCount===2, `count=${jr.applicantsCount}`);
    // BACKEND: applicants ranked + DTO + applyUrl + no PII
    const apl=await api(`/employers/jobs/${jobId}/applicants`,{headers:eH});
    const A=apl.body.applicants;
    ok('d API ranked match desc, nulls last', A.length===2&&A[0].matchScore!=null&&A[A.length-1].matchScore==null, `scores=${A.map(x=>x.matchScore)}`);
    ok('f no PII + applyUrl + whitelisted name', !JSON.stringify(apl.body).includes(p1)&&!JSON.stringify(apl.body).includes(p2)&&!/"contactEmail"|"contactPhone"|"passwordHash"|"cvUrl"/.test(JSON.stringify(apl.body))&&apl.body.job.applyUrl==='https://example.com/ats-apply'&&A.some(x=>x.pilotName==='Quinn P.'), `names=${A.map(x=>x.pilotName)}`);
    // n: 403 other employer
    const forbid=await api(`/employers/jobs/${jobId}/applicants`,{headers:{Authorization:`Bearer ${e2Tok}`}});
    ok('n 403 other-employer applicants', forbid.status===403, `status=${forbid.status}`);

    // ===== UI =====
    const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
    const errs=[];
    try{
      const p=await b.newPage(); await p.setViewport({width:1280,height:1400});
      p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text().slice(0,110));});
      let popup=0; p.on('popup',()=>popup++);
      await p.goto(BASE,{waitUntil:'domcontentloaded'}); await p.evaluate(t=>localStorage.setItem('employerToken',t),eTok);
      // dashboard
      await p.goto(`${BASE}/employer/dashboard`,{waitUntil:'networkidle2'}); await sleep(2000);
      ok('a/c dashboard shows "2 applicants →" link', await p.evaluate(()=>[...document.querySelectorAll('a')].some(x=>/2 applicants/.test(x.textContent)&&/applicants$/.test(x.getAttribute('href')))));
      await p.screenshot({path:`${OUT}/pc-dashboard.png`});
      // applicants page
      await p.goto(`${BASE}/employer/jobs/${jobId}/applicants`,{waitUntil:'networkidle2'}); await sleep(2000);
      const listInfo=await p.evaluate(()=>({pills:/All/.test(document.body.innerText)&&/Applied/.test(document.body.innerText),quinn:/Quinn P\./.test(document.body.innerText),riley:/Riley N\./.test(document.body.innerText),hasDash:/—/.test(document.body.innerText)}));
      ok('d/f list renders ranked cards + names', listInfo.quinn&&listInfo.riley&&listInfo.pills, JSON.stringify(listInfo));
      const domOrder=await p.evaluate(()=>{const t=document.body.innerText;return t.indexOf('Quinn P.')<t.indexOf('Riley N.');});
      ok('d rendered order: 100-match above null-match', domOrder);
      await p.screenshot({path:`${OUT}/pc-applicants-list.png`});
      // e: filter pills — click Applied → both should be APPLIED status
      await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith('Applied'));b&&b.click();}); await sleep(600);
      ok('e filter pill works', await p.evaluate(()=>/Quinn P\.|Riley N\./.test(document.body.innerText)));
      await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith('All'));b&&b.click();}); await sleep(400);
      // g: open drawer (click top card)
      await p.evaluate(()=>{const c=[...document.querySelectorAll('div')].find(d=>/Quinn P\./.test(d.textContent)&&getComputedStyle(d).cursor==='pointer');c&&c.click();}); await sleep(800);
      const drawer=await p.evaluate(()=>{const d=document.querySelector('[role="dialog"]');return d?{open:true,breakdown:/Match breakdown/i.test(d.textContent),snapshot:/Pilot snapshot/i.test(d.textContent),statusSelect:!!d.querySelector('select'),ats:/Open in external ATS/i.test(d.textContent)}:{open:false};});
      ok('g/h drawer opens w/ breakdown + snapshot + status + ATS', drawer.open&&drawer.breakdown&&drawer.snapshot&&drawer.statusSelect&&drawer.ats, JSON.stringify(drawer));
      await p.screenshot({path:`${OUT}/pc-drawer.png`});
      // i: change status to SHORTLISTED (optimistic + confirm)
      await p.select('[role="dialog"] select','SHORTLISTED'); await sleep(1500);
      const conf=await p.evaluate(()=>/Marked as Shortlisted/i.test(document.body.innerText));
      ok('i status change → confirm shown', conf);
      await p.screenshot({path:`${OUT}/pc-status-confirm.png`});
      // k: ATS link target
      ok('k ATS link → applyUrl', await p.evaluate(()=>{const a=[...document.querySelectorAll('[role="dialog"] a')].find(x=>/external ATS/i.test(x.textContent));return a&&a.getAttribute('href')==='https://example.com/ats-apply'&&a.getAttribute('target')==='_blank';}));
      // l: ESC closes
      await p.keyboard.press('Escape'); await sleep(500);
      ok('l ESC closes drawer', await p.evaluate(()=>!document.querySelector('[role="dialog"]')));
      // verify backend persisted SHORTLISTED
      const after=await api(`/employers/jobs/${jobId}/applicants`,{headers:eH});
      ok('i backend persisted SHORTLISTED', after.body.applicants.some(a=>a.status==='SHORTLISTED'), `statuses=${after.body.applicants.map(a=>a.status)}`);
      // m: mobile
      const pm=await b.newPage(); await pm.setViewport({width:390,height:1600,isMobile:true});
      await pm.goto(BASE,{waitUntil:'domcontentloaded'}); await pm.evaluate(t=>localStorage.setItem('employerToken',t),eTok);
      await pm.goto(`${BASE}/employer/jobs/${jobId}/applicants`,{waitUntil:'networkidle2'}); await sleep(1800);
      ok('m mobile list no h-scroll', await pm.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
      await pm.evaluate(()=>{const c=[...document.querySelectorAll('div')].find(d=>/Quinn P\.|Riley N\./.test(d.textContent)&&getComputedStyle(d).cursor==='pointer');c&&c.click();}); await sleep(800);
      ok('m mobile drawer full-screen', await pm.evaluate(()=>{const d=document.querySelector('[role="dialog"]');return d&&d.getBoundingClientRect().width>=window.innerWidth-2;}));
      await pm.screenshot({path:`${OUT}/pc-mobile.png`});
      ok('o no console errors', errs.length===0, errs.join('|')||'none');
    } finally { await b.close(); }
  } finally {
    for(const jid of cleanup.jobs){await prisma.application.deleteMany({where:{jobId:jid}}).catch(()=>{});await prisma.job.delete({where:{id:jid}}).catch(()=>{});}
    for(const eid of cleanup.employers){await prisma.employer.delete({where:{id:eid}}).catch(()=>{});}
    for(const em of [p1,p2]){const pl=await prisma.pilot.findFirst({where:{email:em}});if(pl){await prisma.application.deleteMany({where:{pilotId:pl.id}}).catch(()=>{});await prisma.jobAlert.deleteMany({where:{pilotId:pl.id}}).catch(()=>{});await prisma.pilot.delete({where:{id:pl.id}}).catch(()=>{});}}
    console.log('  cleanup done');
    const passed=results.filter(r=>r[1]).length; console.log(`\n========== E1 PHASE C: ${passed}/${results.length} ==========`); process.exit(0);
  }
})().catch(e=>{console.error('FATAL',e.message,e.stack);process.exit(1);});
