const BASE='https://cockpithire.com';
const prisma=require('/Users/mohamedalaa/pilot-jobs/backend/src/config/database');
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,body:j}}
(async()=>{
  const ts=Date.now(); const pEmail=`snap_${ts}@example.com`, pPw='Verify123!pw', eEmail=`snape_${ts}@example.com`, ePw='Verify123!emp';
  const cleanup={jobs:[],employers:[],pilots:[]};
  try{
    const reg=await api('/auth/register',{method:'POST',body:{email:pEmail,password:pPw,firstName:'Qual',lastName:'Pilot',phone:'+10000000000',country:'United States',city:'Dallas'}});
    const pH={Authorization:`Bearer ${reg.body.token}`};
    await api('/profile',{method:'PATCH',headers:pH,body:{role:'CAPTAIN',nationality:'American'}});
    await api('/profile/certificates',{method:'POST',headers:pH,body:{type:'ATPL',issuingAuthority:'FAA'}});
    await api('/profile/ratings',{method:'POST',headers:pH,body:{aircraftType:'A320',category:'TYPE'}});
    await api('/employers/register',{method:'POST',body:{companyName:'Snap Air',companyType:'CHARTER',country:'Portugal',contactName:'S',contactEmail:eEmail,password:ePw}});
    const emp=await prisma.employer.findFirst({where:{contactEmail:eEmail}}); cleanup.employers=[emp.id];
    await prisma.employer.update({where:{id:emp.id},data:{status:'APPROVED'}});
    const eH={Authorization:`Bearer ${(await api('/employers/login',{method:'POST',body:{contactEmail:eEmail,password:ePw}})).body.token}`};
    // Job with NO hour requirement → pilot QUALIFIES (cert+auth+aircraft all match)
    const job=await api('/employers/jobs',{method:'POST',headers:eH,body:{title:'Qual Job',description:'No hour req.',applyUrl:'https://example.com/a',role:'CAPTAIN',reqCertificates:['ATPL'],reqAuthorities:['FAA'],reqAircraftTypes:['A320']}});
    cleanup.jobs=[job.body.id];
    await api(`/jobs/${job.body.id}/apply`,{method:'POST',headers:pH});
    const snap=await prisma.application.findFirst({where:{jobId:job.body.id}});
    console.log('QUALIFYING snapshot: matchScore =', snap.matchScore, '| breakdown present:', !!snap.matchBreakdown);
    console.log('  ✓ non-null + <=100:', snap.matchScore!=null && snap.matchScore<=100);
    console.log('  breakdown buckets:', snap.matchBreakdown ? Object.keys(snap.matchBreakdown) : 'none');
    // confirm breakdown ALSO captured in the null/disqualified case from main e2e is moot — here we prove qualifying path
    const list=await api(`/employers/jobs/${job.body.id}/applicants`,{headers:eH});
    console.log('  employer sees score:', list.body.applicants[0].matchScore, '| snapshot:', JSON.stringify(list.body.applicants[0].snapshot));
  } finally {
    for(const jid of cleanup.jobs){await prisma.application.deleteMany({where:{jobId:jid}}).catch(()=>{});await prisma.job.delete({where:{id:jid}}).catch(()=>{});}
    for(const eid of cleanup.employers){await prisma.employer.delete({where:{id:eid}}).catch(()=>{});}
    const pl=await prisma.pilot.findFirst({where:{email:pEmail}}); if(pl){await prisma.application.deleteMany({where:{pilotId:pl.id}}).catch(()=>{});await prisma.jobAlert.deleteMany({where:{pilotId:pl.id}}).catch(()=>{});await prisma.pilot.delete({where:{id:pl.id}}).catch(()=>{});}
    console.log('  cleanup done'); process.exit(0);
  }
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
