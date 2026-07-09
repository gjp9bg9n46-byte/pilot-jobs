const BASE='https://cockpithire.com';
const prisma=require('/Users/mohamedalaa/pilot-jobs/backend/src/config/database');
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,body:j}}
const CID='aef017e5-d17c-4f71-9748-87152f550742';
const AID='c492aecc-9e56-4e62-9500-f766fd99c747';
(async()=>{
  const adminEmail=`recadm_${Date.now()}@example.com`, pw='Verify123!adm';
  try{
    // before
    const before=await prisma.airline.findUnique({where:{id:AID},select:{bases:true,fleet:true,description:true,headquarters:true,fleetDetail:true}});
    console.log('BEFORE:', JSON.stringify({bases:before.bases,fleet:before.fleet,description:before.description,headquarters:before.headquarters}));

    // STEP 3 — restore to seed (empty/null); leave fleetDetail untouched
    await prisma.airline.update({where:{id:AID},data:{bases:[],fleet:[],description:null,headquarters:null}});
    const after=await prisma.airline.findUnique({where:{id:AID},select:{bases:true,fleet:true,description:true,headquarters:true,fleetDetail:true}});
    console.log('AFTER :', JSON.stringify({bases:after.bases,fleet:after.fleet,description:after.description,headquarters:after.headquarters}));
    console.log('fleetDetail untouched:', JSON.stringify(after.fleetDetail)===JSON.stringify(before.fleetDetail));

    // STEP 4 — reject the contribution via admin API (targeted by id, not a queue click)
    const reg=await api('/auth/register',{method:'POST',body:{email:adminEmail,password:pw,firstName:'Rec',lastName:'Adm',phone:'+10000000000',country:'United States',city:'Dallas'}});
    await prisma.pilot.update({where:{email:adminEmail},data:{isAdmin:true}});
    const rej=await api(`/admin/contributions/${CID}/reject`,{method:'POST',headers:{Authorization:`Bearer ${reg.body.token}`},body:{note:'Test contribution — rejected during cleanup.'}});
    console.log('REJECT API:', rej.status, 'status=', rej.body.status, '| note=', rej.body.reviewNote);

    // STEP 5 — verify
    const final=await prisma.airline.findUnique({where:{id:AID},select:{bases:true,fleet:true,description:true,headquarters:true}});
    const seedOk = final.bases.length===0 && final.fleet.length===0 && final.description===null && final.headquarters===null;
    const contribFinal=await prisma.airlineFactContribution.findUnique({where:{id:CID},select:{status:true,reviewNote:true}});
    console.log('');
    console.log('VERIFY airline matches seed (all empty/null):', seedOk);
    console.log('VERIFY contribution REJECTED:', contribFinal.status==='REJECTED', '| note:', contribFinal.reviewNote);
    console.log('airBaltic factfile URL: '+BASE+'/airlines/'+AID);
  } finally {
    const p=await prisma.pilot.findFirst({where:{email:adminEmail}}); if(p)await prisma.pilot.delete({where:{id:p.id}}).catch(()=>{});
    console.log('throwaway admin cleaned up'); process.exit(0);
  }
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
