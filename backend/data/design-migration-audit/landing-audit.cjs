const puppeteer=require('puppeteer');
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const p=await b.newPage(); await p.setViewport({width:1280,height:900});
  const consoleErrs=[], failed=[];
  p.on('console',m=>{if(m.type()==='error')consoleErrs.push(m.text())});
  p.on('requestfailed',r=>failed.push(`${r.url()} (${r.failure()?.errorText})`));
  const resp={};
  p.on('response',r=>{const u=r.url();if(/landing-photos|screenshot-hero|flagcdn|\/api\/stats/.test(u))resp[u.replace('https://cockpithire.com','')]=r.status()});
  await p.goto('https://cockpithire.com/',{waitUntil:'networkidle2'}); await sleep(2500);
  // images natural size (broken = 0)
  const imgs=await p.evaluate(()=>[...document.querySelectorAll('img')].map(i=>({src:i.getAttribute('src'),alt:i.alt,ok:i.complete&&i.naturalWidth>0,w:i.naturalWidth})));
  // data strip + stats
  const strip=await p.evaluate(()=>{const nums=[...document.querySelectorAll('div')].filter(d=>/Airlines tracked|With detailed fleets|Data refreshed/.test(d.textContent)&&d.children.length===0);return nums.map(n=>n.previousElementSibling?.textContent+' '+n.textContent)});
  // hardcoded 185 occurrences in rendered text
  const has185=await p.evaluate(()=>(document.body.innerText.match(/185 airlines/g)||[]).length);
  // /api/stats body
  let statsBody=null; try{statsBody=await (await fetch('https://cockpithire.com/api/stats')).json()}catch(e){statsBody=String(e)}
  // horizontal scroll desktop
  const hscrollD=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  // nav scrolled state (scroll down, check nav bg)
  await p.evaluate(()=>window.scrollTo(0,400)); await sleep(500);
  const navBg=await p.evaluate(()=>{const n=document.querySelector('nav');return getComputedStyle(n).backgroundColor});
  // MOBILE
  await p.setViewport({width:390,height:780}); await p.goto('https://cockpithire.com/',{waitUntil:'networkidle2'}); await sleep(1500);
  const hscrollM=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  const heroH=await p.evaluate(()=>{const h=document.querySelector('header');return h?Math.round(h.getBoundingClientRect().height):null});

  console.log('=== CONSOLE ERRORS ==='); console.log(consoleErrs.length?consoleErrs.join('\n'):'(none)');
  console.log('\n=== FAILED REQUESTS ==='); console.log(failed.length?failed.join('\n'):'(none)');
  console.log('\n=== KEY RESOURCE STATUSES ==='); Object.entries(resp).forEach(([u,s])=>console.log(`  ${s} ${u}`));
  console.log('\n=== IMAGES (broken = ok:false) ==='); imgs.forEach(i=>console.log(`  ${i.ok?'OK ':'BROKEN'} ${i.w}px  ${i.src}  alt="${i.alt}"`));
  console.log('\n=== DATA STRIP (rendered) ==='); console.log(strip.length?strip.join(' | '):'(hidden — stats failed/empty)');
  console.log('\n=== /api/stats body ==='); console.log(JSON.stringify(statsBody));
  console.log('\n=== "185 airlines" hardcoded occurrences in copy ==='); console.log(has185);
  console.log('\n=== nav bg after scroll (expect cream rgb(248,246,241)):', navBg);
  console.log('=== horizontal scroll: desktop=',hscrollD,' mobile=',hscrollM,' | mobile hero height=',heroH);
  await b.close();
})();
