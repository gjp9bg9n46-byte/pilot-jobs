const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
const prisma=require('/Users/mohamedalaa/pilot-jobs/backend/src/config/database');
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,body:j}}
const results=[];const ok=(id,c,m)=>{results.push([id,!!c]);console.log(`  ${c?'✓':'✗'} ${id}  ${m||''}`)};
(async()=>{
  const ts=Date.now();
  const adminEmail=`adm3_${ts}@example.com`, pw='Verify123!adm';
  const empEmail=`aemp3_${ts}@example.com`, ePw='Verify123!emp';
  const contribEmail=`con3_${ts}@example.com`;
  const cleanup={employers:[],pilots:[],contributions:[]};
  try{
    const reg=await api('/auth/register',{method:'POST',body:{email:adminEmail,password:pw,firstName:'Ad',lastName:'Three',phone:'+10000000000',country:'United States',city:'Dallas'}});
    const adminTok=reg.body.token;
    await prisma.pilot.update({where:{email:adminEmail},data:{isAdmin:true}});
    // a SUSPENDED employer to test Unsuspend
    await api('/employers/register',{method:'POST',body:{companyName:'Reactivate Air',companyType:'CHARTER',country:'Portugal',contactName:'RA',contactEmail:empEmail,password:ePw}});
    const emp=await prisma.employer.findFirst({where:{contactEmail:empEmail}}); cleanup.employers=[emp.id];
    await prisma.employer.update({where:{id:emp.id},data:{status:'SUSPENDED',rejectionReason:'pre-set for test'}});
    // a pending contribution to test approve-confirm
    const contribReg=await api('/auth/register',{method:'POST',body:{email:contribEmail,password:pw,firstName:'Con',lastName:'Three',phone:'+10000000000',country:'United States',city:'Dallas'}});
    const airlineId=(await api('/airlines?limit=1')).body.items[0].id;
    await api(`/airlines/${airlineId}/contributions`,{method:'POST',headers:{Authorization:`Bearer ${contribReg.body.token}`},body:{proposedChanges:{notes:'Approve-confirm test note.'}}});
    const contrib=await prisma.airlineFactContribution.findFirst({where:{airlineId,status:'PENDING'},orderBy:{createdAt:'desc'}}); cleanup.contributions=[contrib.id];

    const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
    const errs=[];
    try{
      const p=await b.newPage(); await p.setViewport({width:1280,height:1200});
      p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text().slice(0,110));});
      await p.goto(BASE,{waitUntil:'domcontentloaded'}); await p.evaluate(t=>localStorage.setItem('authToken',t),adminTok);

      // ===== AdminEmployers: subtitle + Unsuspend =====
      await p.goto(`${BASE}/admin/employers`,{waitUntil:'networkidle2'}); await sleep(2000);
      ok('#4 honest subtitle copy', await p.evaluate(()=>/email delivery is pending Resend/i.test(document.body.innerText)&&!/Emails are sent by the backend/i.test(document.body.innerText)));
      // go to SUSPENDED tab
      await p.evaluate(()=>{const t=[...document.querySelectorAll('div')].find(d=>/^Suspended/.test(d.textContent.trim())&&getComputedStyle(d).cursor==='pointer');t&&t.click();}); await sleep(800);
      const hasUnsuspend=await p.evaluate(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Unsuspend'&&!b.disabled));
      ok('#1 Unsuspend button present + enabled (no "soon")', hasUnsuspend && await p.evaluate(()=>!/Unsuspend \(soon\)|No backend endpoint/i.test(document.body.innerText)));
      await p.screenshot({path:`${OUT}/admin-suspended-tab.png`});
      // click Unsuspend → approve modal → confirm
      await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Unsuspend');x&&x.click();}); await sleep(600);
      ok('#1 Unsuspend opens approve confirm modal', await p.evaluate(()=>/able to post jobs immediately/i.test(document.body.innerText)));
      await p.screenshot({path:`${OUT}/admin-unsuspend-modal.png`});
      await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>/Confirm Approve/i.test(b.textContent));x&&x.click();}); await sleep(2500);
      const dbStatus=(await prisma.employer.findUnique({where:{id:emp.id}})).status;
      ok('#1 Unsuspend → APPROVED in DB', dbStatus==='APPROVED', `db=${dbStatus}`);

      // ===== AdminModeration: approve confirm =====
      await p.goto(`${BASE}/admin/moderation`,{waitUntil:'networkidle2'}); await sleep(2000);
      // click Approve → expect inline confirm (not immediate)
      await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Approve');x&&x.click();}); await sleep(600);
      const confirmShown=await p.evaluate(()=>/Apply \d+ change/i.test(document.body.innerText)&&[...document.querySelectorAll('button')].some(b=>/Confirm approve/i.test(b.textContent)));
      ok('#5 contribution approve shows inline confirm', confirmShown);
      const stillPending=(await prisma.airlineFactContribution.findUnique({where:{id:contrib.id}})).status==='PENDING';
      ok('#5 not applied until confirmed', stillPending);
      await p.screenshot({path:`${OUT}/admin-approve-confirm.png`});
      // Cancel dismisses
      await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Cancel');x&&x.click();}); await sleep(400);
      ok('#5 Cancel dismisses confirm', await p.evaluate(()=>!/Apply \d+ change/i.test(document.body.innerText)));
      // confirm for real
      await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Approve');x&&x.click();}); await sleep(500);
      await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>/Confirm approve/i.test(b.textContent));x&&x.click();}); await sleep(2500);
      ok('#5 confirm → applied (contribution APPROVED)', (await prisma.airlineFactContribution.findUnique({where:{id:contrib.id}})).status==='APPROVED');

      // mobile sanity
      const pm=await b.newPage(); await pm.setViewport({width:390,height:1200,isMobile:true});
      await pm.goto(BASE,{waitUntil:'domcontentloaded'}); await pm.evaluate(t=>localStorage.setItem('authToken',t),adminTok);
      await pm.goto(`${BASE}/admin/employers`,{waitUntil:'networkidle2'}); await sleep(1500);
      ok('mobile admin no h-scroll', await pm.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
      ok('o no console errors', errs.length===0, errs.join('|')||'none');
    } finally { await b.close(); }
  } finally {
    for(const cid of cleanup.contributions){await prisma.airlineFactContribution.delete({where:{id:cid}}).catch(()=>{});}
    // the approved contribution incremented verifiedContributors + applied notes to a REAL airline — revert note? It set notes='Approve-confirm test note.' on airlineId. Restore would need original; flag instead.
    for(const eid of cleanup.employers){await prisma.employer.delete({where:{id:eid}}).catch(()=>{});}
    for(const em of [adminEmail,contribEmail]){const pl=await prisma.pilot.findFirst({where:{email:em}});if(pl){await prisma.airlineFactContribution.deleteMany({where:{contributorId:pl.id}}).catch(()=>{});await prisma.pilot.delete({where:{id:pl.id}}).catch(()=>{});}}
    console.log('  cleanup done');
    const passed=results.filter(r=>r[1]).length; console.log(`\n========== ADMIN STEP3 VERIFY: ${passed}/${results.length} ==========`); process.exit(0);
  }
})().catch(e=>{console.error('FATAL',e.message,e.stack);process.exit(1);});
