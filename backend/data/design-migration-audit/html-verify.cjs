const puppeteer = require('puppeteer');
const BASE='https://cockpithire.com', CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
async function api(p){const r=await fetch(`${BASE}/api${p}`);return r.json()}
const slugify=s=>String(s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const slug=j=>`${slugify(j.company)}-${slugify(j.role||j.title)}-${j.id}`;
(async()=>{
  const jobs=(await api('/jobs?limit=1000')).jobs;
  const longJob=jobs.slice().sort((a,b)=>(b.description||'').length-(a.description||'').length)[0];
  const shortJob=jobs.find(j=>j.company==='Southwest Airlines'&&/Flight Instructor/i.test(j.title));
  // check raw description for whether it contains script/iframe to confirm stripping
  const rawHasScript=/<script|<iframe|onclick=/i.test(longJob.description||'');
  console.log('LONG:',longJob.company,'|',longJob.title,'rawLen=',(longJob.description||'').length,'rawHasUnsafe=',rawHasScript);
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const errs=[];
  const waitDesc=async p=>{await p.waitForFunction(()=>document.getElementById('job-description')&&!/Loading job/i.test(document.body.innerText),{timeout:20000});await sleep(700)};
  try{
    const p=await b.newPage(); await p.setViewport({width:1280,height:1600});
    p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,140))});
    await p.goto(`${BASE}/jobs/${slug(longJob)}`,{waitUntil:'networkidle2'}); await waitDesc(p);
    const long=await p.evaluate(()=>{
      const d=document.getElementById('job-description');
      const inner=d.querySelector('.job-desc-html')||d;
      return {
        tagCounts:{p:inner.querySelectorAll('p').length,li:inner.querySelectorAll('li').length,ul:inner.querySelectorAll('ul,ol').length,strong:inner.querySelectorAll('strong,b').length,a:inner.querySelectorAll('a').length,h:inner.querySelectorAll('h2,h3,h4').length},
        literalMarkup:/<(div|p|li|ul|strong)\b/i.test(inner.textContent),  // tags showing as TEXT = bad
        scriptOrIframe:document.querySelectorAll('#job-description script, #job-description iframe').length,
        anyOnclick:[...inner.querySelectorAll('*')].some(e=>e.getAttribute&&e.getAttribute('onclick')),
        firstLink:(()=>{const a=inner.querySelector('a');return a?{href:a.getAttribute('href'),target:a.getAttribute('target'),rel:a.getAttribute('rel')}:null})(),
        showMoreBtn:[...document.querySelectorAll('button')].some(x=>/Show more/.test(x.textContent)),
      };
    });
    console.log('\n[LONG rendered]',JSON.stringify(long,null,0));
    await p.evaluate(()=>document.getElementById('job-description').scrollIntoView({block:'center'})); await sleep(400);
    await p.screenshot({path:`${OUT}/jm-desc-html-rendered.png`});
    // toggle expand to confirm collapse still works on rendered HTML
    await p.evaluate(()=>[...document.querySelectorAll('button')].find(x=>/Show more/.test(x.textContent))?.click()); await sleep(600);
    const afterExpand=await p.evaluate(()=>({btn:[...document.querySelectorAll('button')].find(x=>/Show (more|less)/.test(x.textContent))?.textContent.trim(),maxH:document.getElementById('job-description').style.maxHeight}));
    console.log('[LONG after expand]',JSON.stringify(afterExpand));

    // SHORT plain text unchanged
    await p.goto(`${BASE}/jobs/${slug(shortJob)}`,{waitUntil:'networkidle2'}); await waitDesc(p);
    const short=await p.evaluate(()=>{const d=document.getElementById('job-description');return{text:d.textContent.trim(),showMore:[...document.querySelectorAll('button')].some(x=>/Show more/.test(x.textContent))}});
    console.log('[SHORT]',JSON.stringify(short));

    // mobile 390
    const pm=await b.newPage(); await pm.setViewport({width:390,height:2000,isMobile:true});
    await pm.goto(`${BASE}/jobs/${slug(longJob)}`,{waitUntil:'networkidle2'}); await waitDesc(pm);
    const mo=await pm.evaluate(()=>({noHScroll:document.documentElement.scrollWidth<=window.innerWidth+2,maxH:document.getElementById('job-description').style.maxHeight,li:document.querySelectorAll('#job-description li').length}));
    console.log('[MOBILE390]',JSON.stringify(mo));

    console.log('\nCONSOLE ERRORS:',errs.length?errs:'none');
  } finally { await b.close(); }
})().catch(e=>console.error('FATAL',e.message,e.stack));
