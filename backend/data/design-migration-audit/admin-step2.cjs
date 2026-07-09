const BASE='https://cockpithire.com';
const prisma=require('/Users/mohamedalaa/pilot-jobs/backend/src/config/database');
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,body:j}}
const ok=(id,c,m)=>console.log(`  ${c?'✓':'✗'} ${id}  ${m||''}`);
(async()=>{
  const ts=Date.now();
  const adminEmail=`admin_${ts}@example.com`, pw='Verify123!adm';
  const contribEmail=`contrib_${ts}@example.com`;
  const empEmail=`aemp_${ts}@example.com`, ePw='Verify123!emp';
  const cleanup={pilots:[],employers:[],contributions:[]};
  try{
    // 1. throwaway admin
    const reg=await api('/auth/register',{method:'POST',body:{email:adminEmail,password:pw,firstName:'Ad',lastName:'Min',phone:'+10000000000',country:'United States',city:'Dallas'}});
    const adminTok=reg.body.token;
    await prisma.pilot.update({where:{email:adminEmail},data:{isAdmin:true}});
    const AH={Authorization:`Bearer ${adminTok}`};
    // verify admin access works
    const contribsCheck=await api('/admin/contributions',{headers:AH});
    ok('admin access (GET /admin/contributions 200)', contribsCheck.status===200, `status=${contribsCheck.status}`);
    // non-admin gets 404 (sanity)
    const reg2=await api('/auth/register',{method:'POST',body:{email:contribEmail,password:pw,firstName:'Con',lastName:'Trib',phone:'+10000000000',country:'United States',city:'Dallas'}});
    const contribTok=reg2.body.token; const CH={Authorization:`Bearer ${contribTok}`};
    ok('non-admin → 404 on /admin', (await api('/admin/contributions',{headers:CH})).status===404);

    // ===== #1: employer suspend → reactivate via approveEmployer =====
    await api('/employers/register',{method:'POST',body:{companyName:'Admin Audit Air',companyType:'CHARTER',country:'Portugal',contactName:'AA',contactEmail:empEmail,password:ePw}});
    const emp=await prisma.employer.findFirst({where:{contactEmail:empEmail}}); cleanup.employers=[emp.id];
    await prisma.employer.update({where:{id:emp.id},data:{status:'APPROVED'}});
    const susp=await api(`/admin/employers/${emp.id}/suspend`,{method:'POST',headers:AH,body:{reason:'Audit test suspension reason.'}});
    ok('#1 suspend works', susp.status===200&&susp.body.status==='SUSPENDED', `status=${susp.body.status}`);
    // approveEmployer on a SUSPENDED employer → reactivates? (backend supports it; UI button disabled)
    const react=await api(`/admin/employers/${emp.id}/approve`,{method:'POST',headers:AH});
    ok('#1 approveEmployer REACTIVATES suspended (backend works despite UI "no endpoint")', react.status===200&&react.body.status==='APPROVED', `status=${react.body.status}`);
    // reject → re-approve
    const rej=await api(`/admin/employers/${emp.id}/reject`,{method:'POST',headers:AH,body:{reason:'Audit test rejection reason.'}});
    const reAppr=await api(`/admin/employers/${emp.id}/approve`,{method:'POST',headers:AH});
    ok('#1 approveEmployer reactivates REJECTED too', rej.body.status==='REJECTED'&&reAppr.body.status==='APPROVED', `${rej.body.status}→${reAppr.body.status}`);

    // ===== #2: reject contribution → contributor view =====
    const airlines=await api('/airlines?limit=1'); const airlineId=airlines.body.items[0].id;
    const contribRes=await api(`/airlines/${airlineId}/contributions`,{method:'POST',headers:CH,body:{proposedChanges:{notes:'Audit test contribution note.'}}});
    ok('#2 contribution created', contribRes.status===200||contribRes.status===201, `status=${contribRes.status}`);
    // find the contribution id
    const contrib=await prisma.airlineFactContribution.findFirst({where:{airlineId,status:'PENDING'},orderBy:{createdAt:'desc'}});
    cleanup.contributions=[contrib.id];
    // contributor sees it as PENDING
    const mineBefore=await api(`/airlines/${airlineId}/contributions/mine`,{headers:CH});
    ok('#2 contributor sees PENDING contribution', Array.isArray(mineBefore.body)&&mineBefore.body.length>=1, `count=${mineBefore.body.length}`);
    // admin rejects with reviewNote
    const rejC=await api(`/admin/contributions/${contrib.id}/reject`,{method:'POST',headers:AH,body:{note:'Audit reject note — fleet numbers unverified.'}});
    ok('#2 admin reject (reviewNote required + stored)', rejC.status===200&&rejC.body.reviewNote==='Audit reject note — fleet numbers unverified.', `note=${rejC.body.reviewNote}`);
    // contributor view AFTER reject — does it vanish + no reviewNote?
    const mineAfter=await api(`/airlines/${airlineId}/contributions/mine`,{headers:CH});
    const stillThere=Array.isArray(mineAfter.body)&&mineAfter.body.some(c=>c.id===contrib.id);
    const noteVisible=JSON.stringify(mineAfter.body).includes('Audit reject note');
    ok('#2 CONFIRMED: rejected contribution vanishes from contributor view', !stillThere, `stillThere=${stillThere}`);
    ok('#2 CONFIRMED: reviewNote NOT surfaced to contributor', !noteVisible, `noteVisible=${noteVisible}`);

    // ===== #6: jobs/pending 200 but orphaned =====
    const jp=await api('/admin/jobs/pending',{headers:AH});
    ok('#6 /admin/jobs/pending returns 200 (orphaned — no UI)', jp.status===200, `status=${jp.status}`);
  } finally {
    for(const cid of cleanup.contributions){await prisma.airlineFactContribution.delete({where:{id:cid}}).catch(()=>{});}
    for(const eid of cleanup.employers){await prisma.employer.delete({where:{id:eid}}).catch(()=>{});}
    for(const em of [adminEmail,contribEmail]){const p=await prisma.pilot.findFirst({where:{email:em}});if(p){await prisma.airlineFactContribution.deleteMany({where:{contributorId:p.id}}).catch(()=>{});await prisma.pilot.delete({where:{id:p.id}}).catch(e=>console.log('del',em,e.message));}}
    console.log('  cleanup done'); process.exit(0);
  }
})().catch(e=>{console.error('FATAL',e.message,e.stack);process.exit(1);});
