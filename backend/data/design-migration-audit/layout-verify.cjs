const puppeteer = require('puppeteer');
const BASE='https://cockpithire.com', CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,json:j}}
const slugify=s=>String(s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
(async()=>{
  const email=`lay_${Date.now()}@example.com`,password='Verify123!pw';
  const reg=await api('/auth/register',{method:'POST',body:{email,password,firstName:'L',lastName:'V',phone:'+10000000000',country:'United States',city:'Dallas'}});
  const token=reg.json?.token;
  const jobs=(await api('/jobs?limit=1000')).json.jobs;
  const mapJob=jobs.find(j=>j.company==='aircairo');         // maps -> Air Cairo
  const noMapJob=jobs.find(j=>j.company==='Shield AI');       // unmapped
  const slug=j=>`${slugify(j.company)}-${slugify(j.role||j.title)}-${j.id}`;
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const errs=[];
  const probe=async(p)=>{
    await p.waitForFunction(()=>document.querySelector('h1')&&!/Loading job/i.test(document.body.innerText),{timeout:20000});
    // wait for factfile CTA (button) to appear when applicable
    let t0=Date.now();
    while(Date.now()-t0<10000){ const has=await p.evaluate(()=>[...document.querySelectorAll('button')].some(x=>/factfile/i.test(x.textContent))); if(has)break; await sleep(400); }
    await sleep(800);
    return p.evaluate(()=>{
      const applyEls=[...document.querySelectorAll('a,button')].filter(x=>/Apply|Applications closed/i.test(x.textContent));
      const saveEls=[...document.querySelectorAll('a,button')].filter(x=>/Save job|Sign in to save|Saved/i.test(x.textContent));
      const disc=(document.body.innerText.match(/Never share bank or credit card/g)||[]).length;
      const factBtn=[...document.querySelectorAll('button')].find(x=>/factfile/i.test(x.textContent));
      const factLink=factBtn?factBtn.closest('a'):null;
      // is the factfile CTA above the match section?
      const yMatch=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&/^YOUR MATCH$/i.test(e.textContent.trim()));
      const factTop = factBtn&&yMatch ? (factBtn.getBoundingClientRect().top < yMatch.getBoundingClientRect().top) : null;
      return {
        applyCount: applyEls.length, saveCount: saveEls.length, disclaimerCount: disc,
        factfileButton: factBtn?factBtn.textContent.trim():null,
        factfileHref: factLink?factLink.getAttribute('href'):null,
        factAboveMatch: factTop,
      };
    });
  };
  try{
    // logged-in, mapped job
    const p=await b.newPage(); await p.setViewport({width:1280,height:1700});
    p.on('console',m=>{if(m.type()==='error')errs.push('LI:'+m.text().slice(0,120))});
    await p.goto(BASE,{waitUntil:'domcontentloaded'}); await p.evaluate(t=>localStorage.setItem('authToken',t),token);
    await p.goto(`${BASE}/jobs/${slug(mapJob)}`,{waitUntil:'networkidle2'});
    const li=await probe(p); console.log('LOGGED-IN (aircairo):',JSON.stringify(li));
    await p.screenshot({path:`${OUT}/jm-layout-loggedin.png`});

    // unmapped job — factfile hidden
    await p.goto(`${BASE}/jobs/${slug(noMapJob)}`,{waitUntil:'networkidle2'});
    const un=await probe(p); console.log('LOGGED-IN (Shield AI, unmapped):',JSON.stringify(un));

    // logged-out, mapped job
    const po=await b.newPage(); await po.setViewport({width:1280,height:1700});
    po.on('console',m=>{if(m.type()==='error')errs.push('LO:'+m.text().slice(0,120))});
    await po.goto(`${BASE}/jobs/${slug(mapJob)}`,{waitUntil:'networkidle2'});
    const lo=await probe(po); console.log('LOGGED-OUT (aircairo):',JSON.stringify(lo));

    // mobile 390
    const pm=await b.newPage(); await pm.setViewport({width:390,height:2400,isMobile:true});
    await pm.goto(`${BASE}/jobs/${slug(mapJob)}`,{waitUntil:'networkidle2'});
    const mo=await probe(pm); console.log('MOBILE390 (aircairo):',JSON.stringify(mo),'noHScroll=',await pm.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
    await pm.screenshot({path:`${OUT}/jm-layout-mobile.png`});

    console.log('CONSOLE ERRORS:',errs.length?errs:'none');
  } finally { await b.close(); if(token){await api('/auth/account',{method:'DELETE',headers:{Authorization:`Bearer ${token}`},body:{password}})} }
})().catch(e=>console.error('FATAL',e.message,e.stack));
