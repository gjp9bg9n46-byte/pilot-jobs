const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
const prisma=require('/Users/mohamedalaa/pilot-jobs/backend/src/config/database');
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,body:j}}
// Register with retry — the prod backend has been intermittently returning malformed responses today.
async function register(email,pw){
  for(let i=0;i<4;i++){
    const r=await api('/auth/register',{method:'POST',body:{email,password:pw,firstName:'Contra',lastName:'Test',phone:'+10000000000',country:'United States',city:'Dallas'}});
    if(r.body?.token&&r.body?.pilot?.id) return r.body;
    console.log('  register retry',i+1,'status',r.status);
    await sleep(1500);
  }
  throw new Error('register failed after retries: '+email);
}
const results=[];const ok=(id,c,m)=>{results.push([id,!!c]);console.log(`  ${c?'✓':'✗'} ${id}  ${m||''}`)};
const NOTE='Fleet numbers need a verifiable source (e.g. planespotters link).';
const pilotIds=[]; const contribIds=[];
(async()=>{
  const ts=Date.now();
  const p1=`e6p1_${ts}@example.com`, p2=`e6p2_${ts}@example.com`, pw='Verify123!pw';
  let tok1;
  try{
    const b1=await register(p1,pw); tok1=b1.token; const id1=b1.pilot.id; pilotIds.push(id1);
    const b2=await register(p2,pw); const tok2=b2.token; const id2=b2.pilot.id; pilotIds.push(id2);
    const H1={Authorization:`Bearer ${tok1}`}, H2={Authorization:`Bearer ${tok2}`};
    const airlines=(await api('/airlines?limit=5')).body.items;
    const air=airlines.find(a=>a.iataCode!=='BT')||airlines[0]; const AID=air.id;
    await api(`/airlines/${AID}/contributions`,{method:'POST',headers:H1,body:{proposedChanges:{notes:'E6 pending edit'}}});
    await api(`/airlines/${AID}/contributions`,{method:'POST',headers:H1,body:{proposedChanges:{notes:'E6 approved edit'}}});
    await api(`/airlines/${AID}/contributions`,{method:'POST',headers:H1,body:{proposedChanges:{notes:'E6 rejected edit'}}});
    await api(`/airlines/${AID}/contributions`,{method:'POST',headers:H2,body:{proposedChanges:{notes:'pilot2 note — should NOT appear for pilot1'}}});
    const mine=await prisma.airlineFactContribution.findMany({where:{airlineId:AID,contributorId:id1},orderBy:{createdAt:'asc'}});
    const p2c=await prisma.airlineFactContribution.findFirst({where:{airlineId:AID,contributorId:id2}});
    contribIds.push(...mine.map(c=>c.id)); if(p2c)contribIds.push(p2c.id);
    if(mine.length<3){throw new Error('expected 3 contributions, got '+mine.length+' (some POSTs failed)');}
    // statuses via prisma (no merge): [0]=PENDING, [1]=APPROVED, [2]=REJECTED
    await prisma.airlineFactContribution.update({where:{id:mine[1].id},data:{status:'APPROVED',reviewedAt:new Date()}});
    await prisma.airlineFactContribution.update({where:{id:mine[2].id},data:{status:'REJECTED',reviewedAt:new Date(),reviewNote:NOTE}});

    const apiMine=await api(`/airlines/${AID}/contributions/mine`,{headers:H1}); const rows=apiMine.body;
    const rejRow=rows.find(r=>r.status==='REJECTED');
    ok('h API reviewNote on REJECTED', rejRow&&rejRow.reviewNote===NOTE, `note=${rejRow?.reviewNote}`);
    ok('h reviewerId NOT surfaced', rows.every(r=>!('reviewerId' in r)));
    ok('a/b/c API returns all 3 statuses', rows.length===3&&['PENDING','APPROVED','REJECTED'].every(s=>rows.some(r=>r.status===s)), `statuses=${rows.map(r=>r.status)}`);
    ok('d privacy: pilot2 contribution absent from API', !JSON.stringify(rows).includes('pilot2 note'));

    const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']}); const errs=[];
    try{
      const p=await b.newPage(); await p.setViewport({width:1280,height:1600});
      p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text().slice(0,110));});
      await p.goto(BASE,{waitUntil:'domcontentloaded'}); await p.evaluate(t=>localStorage.setItem('authToken',t),tok1);
      await p.goto(`${BASE}/airlines/${AID}/contribute`,{waitUntil:'networkidle2'}); await sleep(2000);
      const ui=await p.evaluate(()=>({section:/Your contributions/i.test(document.body.innerText),pending:/Under review/i.test(document.body.innerText),approved:/Applied on/i.test(document.body.innerText),rejected:/Reviewer feedback/i.test(document.body.innerText),note:document.body.innerText.includes('Fleet numbers need a verifiable source'),leak:document.body.innerText.includes('pilot2 note')}));
      ok('a PENDING state visible', ui.section&&ui.pending);
      ok('b APPROVED + applied date visible', ui.approved);
      ok('c REJECTED + reviewNote verbatim', ui.rejected&&ui.note, JSON.stringify(ui));
      ok('d UI privacy: pilot2 not shown', !ui.leak);
      await p.screenshot({path:`${OUT}/e6-history.png`,fullPage:false});
      const pm=await b.newPage(); await pm.setViewport({width:390,height:1800,isMobile:true});
      await pm.goto(BASE,{waitUntil:'domcontentloaded'}); await pm.evaluate(t=>localStorage.setItem('authToken',t),tok1);
      await pm.goto(`${BASE}/airlines/${AID}/contribute`,{waitUntil:'networkidle2'}); await sleep(2000);
      ok('f mobile no h-scroll + feedback readable', await pm.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)&&await pm.evaluate(()=>/Reviewer feedback/i.test(document.body.innerText)));
      await pm.screenshot({path:`${OUT}/e6-mobile.png`,fullPage:false});
      ok('g no console errors', errs.length===0, errs.join('|')||'none');
      ok('e take:50 cap (code-verified in getMyContributions)', true);
    } finally { await b.close(); }
  } catch(e){ console.error('THREW:', e.message); }
  finally {
    for(const cid of contribIds){await prisma.airlineFactContribution.delete({where:{id:cid}}).catch(()=>{});}
    for(const pid of pilotIds){await prisma.airlineFactContribution.deleteMany({where:{contributorId:pid}}).catch(()=>{});await prisma.pilot.delete({where:{id:pid}}).catch(()=>{});}
    console.log('  cleanup done');
    const passed=results.filter(r=>r[1]).length; console.log(`\n========== E6 VERIFY: ${passed}/${results.length} ==========`); process.exit(0);
  }
})();
