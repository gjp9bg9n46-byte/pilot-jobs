const BASE='https://cockpithire.com';
async function api(p){const r=await fetch(`${BASE}/api${p}`);const t=await r.text();try{return JSON.parse(t)}catch{return t}}
const lc=s=>(s||'').toLowerCase().trim();
const aggr=s=>(s||'').toLowerCase().replace(/\(.*?\)/g,'').replace(/[^a-z0-9]/g,'');
(async()=>{
  const first=await api('/airlines?page=1&limit=100');
  const totalPages=first.totalPages||Math.ceil((first.total||0)/100);
  let airlines=first.items||[];
  for(let pg=2; pg<=totalPages; pg++){ const a=await api(`/airlines?page=${pg}&limit=100`); airlines=airlines.concat(a.items||[]); }
  console.log('TOTAL airlines loaded:',airlines.length,'(expect ~468)');
  const exactMap=new Map(); airlines.forEach(a=>exactMap.set(lc(a.name),a));
  const aggrMap=new Map(); airlines.forEach(a=>{const k=aggr(a.name); if(!aggrMap.has(k))aggrMap.set(k,a)});

  const jobsRes=await api('/jobs?limit=1000'); const jobs=jobsRes.jobs||[];
  const companies=[...new Set(jobs.map(j=>j.company))];
  console.log('\n=== 8 job companies: exact(insensitive) vs aggressive-normalized ===');
  let exactN=0, aggrN=0;
  companies.forEach(c=>{
    const e=exactMap.get(lc(c)); const a=aggrMap.get(aggr(c));
    if(e)exactN++; if(a)aggrN++;
    console.log(`  "${c}"\n     exact=${e?e.name:'—'}   aggr=${a?a.name+' ('+a.id+')':'—'}`);
  });
  console.log(`\nSUMMARY: exact ${exactN}/8   aggressive-normalized ${aggrN}/8`);
  console.log('\n=== sanity: are these in DB now? ===');
  ['Southwest Airlines','Republic Airways','Aeroflot','Air Cairo','Etihad Airways','KLM','Delta Air Lines','easyJet'].forEach(n=>{
    console.log(`  "${n}": exact=${exactMap.get(lc(n))?'YES':'no'}  aggr=${aggrMap.get(aggr(n))?aggrMap.get(aggr(n)).name:'no'}`);
  });
})().catch(e=>console.error('FATAL',e.message,e.stack));
