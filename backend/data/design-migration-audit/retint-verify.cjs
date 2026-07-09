const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
async function api(p){const r=await fetch(`${BASE}/api${p}`);return r.json()}
const slugify=s=>String(s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const rgb=hex=>{const n=parseInt(hex.slice(1),16);return `rgb(${(n>>16)&255}, ${(n>>8)&255}, ${n&255})`;};
(async()=>{
  const jobs=(await api('/jobs?limit=1000')).jobs;
  const empJob=jobs.find(j=>j.sourcePlatform==='EMPLOYER_DIRECT');
  const notesJob=jobs.find(j=>j.notes&&j.notes.trim());
  console.log('employer-direct job:', empJob?`${empJob.company} | ${empJob.title}`:'none');
  console.log('notes job:', notesJob?`${notesJob.company} | ${notesJob.title}`:'none');
  const target=empJob||notesJob;
  const slug=`${slugify(target.company)}-${slugify(target.role||target.title)}-${target.id}`;
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const errs=[];
  try{
    const ctx=await b.createBrowserContext();
    const p=await ctx.newPage(); await p.setViewport({width:1280,height:1600});
    p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text().slice(0,120));});
    await p.goto(`${BASE}/jobs/${slug}`,{waitUntil:'networkidle2'});
    await p.waitForFunction(()=>document.querySelector('h1')&&!/Loading job/i.test(document.body.innerText),{timeout:20000}); await sleep(1000);
    const r=await p.evaluate(()=>{
      const badge=[...document.querySelectorAll('div')].find(d=>/^Posted directly by employer$/.test(d.textContent.trim()));
      const notesHdr=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&/^Notes \/ Benefits$/i.test(e.textContent.trim()));
      const notesPanel=notesHdr?notesHdr.parentElement.querySelector('div:last-child'):null;
      return {
        badgeBg: badge?getComputedStyle(badge).backgroundColor:null,
        notesBg: notesPanel?getComputedStyle(notesPanel).backgroundColor:null,
        pageGray: [...document.querySelectorAll('.app-light')].map(e=>getComputedStyle(e).backgroundColor).includes('rgb(248, 249, 250)'),
      };
    });
    console.log('badge bg:', r.badgeBg, '(expect', rgb('#FFFFFF')+')');
    console.log('notes bg:', r.notesBg, '(expect', rgb('#FFFFFF')+' or null if no notes)');
    console.log('cool-gray surface intact:', r.pageGray);
    console.log('result:', (r.badgeBg===rgb('#FFFFFF')||r.notesBg===rgb('#FFFFFF'))&&r.pageGray ? '✓ PASS — white element on cool-gray, regression intact' : '✗ check');
    console.log('console errors:', errs.length?errs:'none');
    await p.screenshot({path:`${OUT}/retint-desktop.png`,fullPage:false});
    // mobile
    const pm=await ctx.newPage(); await pm.setViewport({width:390,height:1400,isMobile:true});
    await pm.goto(`${BASE}/jobs/${slug}`,{waitUntil:'networkidle2'});
    await pm.waitForFunction(()=>document.querySelector('h1')&&!/Loading job/i.test(document.body.innerText),{timeout:20000}); await sleep(800);
    const mBadge=await pm.evaluate(()=>{const b=[...document.querySelectorAll('div')].find(d=>/^Posted directly by employer$/.test(d.textContent.trim()));return b?getComputedStyle(b).backgroundColor:null;});
    console.log('mobile badge bg:', mBadge);
    await pm.screenshot({path:`${OUT}/retint-mobile.png`});
  } finally { await b.close(); }
})().catch(e=>console.error('FATAL',e.message,e.stack));
