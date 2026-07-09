const BASE='https://cockpithire.com';
async function api(p){const r=await fetch(`${BASE}/api${p}`);const t=await r.text();try{return JSON.parse(t)}catch{return t}}
const norm=s=>(s||'').toLowerCase().trim();
(async()=>{
  // detect shape
  const first=await api('/airlines?page=1&limit=500');
  console.log('airlines resp keys:',Object.keys(first), 'total:',first.total,'pages:',first.pages,'items.len:',(first.items||[]).length);
  let airlines=first.items||[]; const pages=first.pages||1;
  for(let pg=2; pg<=pages; pg++){ const a=await api(`/airlines?page=${pg}&limit=500`); airlines=airlines.concat(a.items||[]); }
  console.log('TOTAL airlines loaded:',airlines.length);
  const byName=new Map(); airlines.forEach(a=>byName.set(norm(a.name),a));

  const jobsRes=await api('/jobs?limit=1000'); const jobs=jobsRes.jobs||[];
  const companies=[...new Set(jobs.map(j=>j.company))];
  console.log('\n=== 8 distinct job companies vs FULL airline set ===');
  // normalization candidates for fuzzy: strip parenthetical, strip "Airlines/Airways/Air" suffix words, insert spaces
  const stripParen=s=>norm(s).replace(/\s*\(.*?\)\s*/g,'').trim();
  companies.forEach(c=>{
    const k=norm(c);
    const exact=byName.get(k);
    const paren=byName.get(stripParen(c));
    // contains-based candidate
    const cand=airlines.filter(a=>{const an=norm(a.name); return an===k||an===stripParen(c)||an.includes(k)||k.includes(an)}).slice(0,4).map(a=>a.name);
    console.log(`  "${c}"\n     exact=${exact?exact.name:'—'}  stripParen=${paren?paren.name:'—'}  candidates=[${cand.join(' | ')||'none'}]`);
  });

  console.log('\n=== user-named airlines present in DB? ===');
  ['Etihad','Etihad Airways','KLM','Aeroflot','Delta','Delta Air Lines','easyJet','Southwest Airlines','Air Cairo','Republic Airways'].forEach(n=>{
    const hit=byName.get(norm(n)); 
    const partial=airlines.filter(a=>norm(a.name).includes(norm(n))).slice(0,3).map(a=>a.name);
    console.log(`  "${n}": exact=${hit?'YES':'no'}  partial=[${partial.join(' | ')||'none'}]`);
  });
})().catch(e=>console.error('FATAL',e.message,e.stack));
