const BASE='https://cockpithire.com';
async function api(p){const r=await fetch(`${BASE}/api${p}`);const t=await r.text();try{return JSON.parse(t)}catch{return t}}
(async()=>{
  const jobsRes=await api('/jobs?limit=1000');
  const jobs=jobsRes.jobs||[];
  // fetch all airlines (paginate if needed)
  let airlines=[]; let page=1;
  while(true){ const a=await api(`/airlines?limit=500&page=${page}`); const items=a.items||a.airlines||a.data||[]; airlines=airlines.concat(items); if(items.length<500||!items.length)break; page++; if(page>5)break; }
  console.log('jobs total:',jobs.length,'  airlines fetched:',airlines.length);
  const byName=new Map(); airlines.forEach(a=>byName.set((a.name||'').toLowerCase().trim(),a));
  const companies=[...new Set(jobs.map(j=>j.company))];
  console.log('\ndistinct company values:',companies.length);
  let exact=0, none=0;
  const unmatched=[];
  companies.forEach(c=>{
    const k=(c||'').toLowerCase().trim();
    const hit=byName.get(k);
    if(hit){exact++} else {none++; 
      // try fuzzy: airline name startsWith company or company startsWith airline name, or contains
      const fuzz=airlines.filter(a=>{const an=(a.name||'').toLowerCase();return an.includes(k)||k.includes(an)});
      unmatched.push({company:c, fuzzyCandidates:fuzz.slice(0,3).map(a=>a.name)});
    }
  });
  console.log(`exact insensitive match: ${exact}/${companies.length}   no match: ${none}`);
  console.log('\n--- unmatched companies + fuzzy candidates ---');
  unmatched.forEach(u=>console.log(`  "${u.company}"  -> [${u.fuzzyCandidates.join(' | ')||'(none)'}]`));
  console.log('\n--- first 5 jobs verbatim company + exact match ---');
  jobs.slice(0,5).forEach(j=>{const k=j.company.toLowerCase().trim();console.log(`  "${j.company}"  match=${byName.get(k)?byName.get(k).name:'NULL'}`)});
})().catch(e=>console.error('FATAL',e.message,e.stack));
