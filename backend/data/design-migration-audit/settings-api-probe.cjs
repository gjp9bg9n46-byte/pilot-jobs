const BASE='https://cockpithire.com';
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,body:j}}
(async()=>{
  const email=`set_${Date.now()}@example.com`,pw='Verify123!pw';
  const reg=await api('/auth/register',{method:'POST',body:{email,password:pw,firstName:'S',lastName:'P',phone:'+10000000000',country:'United States',city:'Dallas'}});
  const tok=reg.body?.token; const H={Authorization:`Bearer ${tok}`};
  const show=(lbl,r)=>console.log(`${lbl}: ${r.status} ${typeof r.body==='object'?JSON.stringify(r.body).slice(0,140):String(r.body).slice(0,140)}`);

  // 1) preferences save (exact frontend payload)
  show('PREFS save (frontend payload)', await api('/profile/preferences',{method:'PUT',headers:H,body:{preferredCountries:['UAE'],preferredAircraft:['A320'],contractTypes:['Full-time'],routePreferences:['Short-haul'],minSalary:'5000',salaryCurrency:'USD',salaryPeriod:'Per month',salaryNegotiable:false}}));
  // 1b) preferences save with ONLY valid columns
  show('PREFS save (valid columns only)', await api('/profile/preferences',{method:'PUT',headers:H,body:{preferredCountries:['UAE'],preferredAircraft:['A320'],routePreferences:['Short-haul'],minSalary:5000,salaryNegotiable:false}}));
  // 1c) preferences save with correct column names
  show('PREFS save (correct names)', await api('/profile/preferences',{method:'PUT',headers:H,body:{preferredContractTypes:['Full-time'],minSalaryCurrency:'USD',minSalaryPeriod:'year'}}));

  // 2) notifications save (frontend payload)
  show('NOTIF save (frontend payload)', await api('/profile/preferences',{method:'PUT',headers:H,body:{allEmailOn:true,newJobMatch:true,alertDigest:true,applicationUpdate:true,certificateExpiry:true,medicalExpiry:true,productUpdates:false,quietHours:false,quietFrom:'22:00',quietTo:'07:00'}}));

  // 3) privacy save (frontend payload)
  show('PRIVACY save (frontend payload)', await api('/profile/preferences',{method:'PUT',headers:H,body:{visibleToRecruiters:true}}));

  // 4) what does GET profile return under .preferences after the valid save?
  const prof=await api('/profile',{headers:H});
  console.log('PROFILE.preferences:', JSON.stringify(prof.body?.preferences||null).slice(0,400));

  // 5) password change
  show('CHANGE PASSWORD', await api('/auth/change-password',{method:'PATCH',headers:H,body:{currentPassword:pw,newPassword:'NewVerify123!'}}));

  // 6) exports
  show('EXPORT /auth/export', await api('/auth/export',{headers:H}));
  show('EXPORT /flight-logs/export?format=CSV', await api('/flight-logs/export?format=CSV',{headers:H}));

  // 7) delete account WITHOUT password (frontend behavior)
  show('DELETE /auth/account (no body)', await api('/auth/account',{method:'DELETE',headers:H}));
  // 7b) delete WITH password
  show('DELETE /auth/account (with password)', await api('/auth/account',{method:'DELETE',headers:H,body:{password:'NewVerify123!'}}));
})().catch(e=>console.error('FATAL',e.message));
