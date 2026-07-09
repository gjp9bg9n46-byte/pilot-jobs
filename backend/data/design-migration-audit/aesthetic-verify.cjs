const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,body:j}}
const slugify=s=>String(s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const results=[];const ok=(id,c,m)=>{results.push([id,!!c]);console.log(`  ${c?'✓':'✗'} ${id}  ${m||''}`)};
const waitMain=async p=>{await p.waitForFunction(()=>document.querySelector('h1')&&!/Loading job/i.test(document.body.innerText),{timeout:20000});await sleep(1000);};
const rgb=hex=>{const n=parseInt(hex.slice(1),16);return `rgb(${(n>>16)&255}, ${(n>>8)&255}, ${n&255})`;};
(async()=>{
  const jobs=(await api('/jobs?limit=1000')).body.jobs;
  // pick a job with several requirements so met+unmet both appear
  const job=jobs.find(j=>j.reqAircraftTypes?.length&&(j.reqMinTotalHours!=null||j.reqAuthorities?.length))||jobs.find(j=>j.role)||jobs[0];
  const slug=`${slugify(job.company)}-${slugify(job.role||job.title)}-${job.id}`;
  const email=`aes_${Date.now()}@example.com`,pw='Verify123!pw';
  const reg=await api('/auth/register',{method:'POST',body:{email,password:pw,firstName:'A',lastName:'E',phone:'+10000000000',country:'United States',city:'Dallas'}});
  const tok=reg.body?.token; const H={Authorization:`Bearer ${tok}`};
  // seed partial: a licence (FAA ATP) so authority/cert MIGHT match, but no ratings/medical/hours → guaranteed mix of met+unmet
  await api('/profile/certificates',{method:'POST',headers:H,body:{type:'ATP',issuingAuthority:'FAA'}});
  await api('/profile',{method:'PATCH',headers:H,body:{role:'CAPTAIN',nationality:'American'}});
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const errs=[];
  try{
    const p=await b.newPage(); await p.setViewport({width:1280,height:2000});
    p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text().slice(0,120));});
    await p.goto(BASE,{waitUntil:'domcontentloaded'}); await p.evaluate(t=>localStorage.setItem('authToken',t),tok);
    await p.goto(`${BASE}/jobs/${slug}`,{waitUntil:'networkidle2'}); await waitMain(p);

    // page bg cool-gray
    const pageBg=await p.evaluate(()=>{const lp=document.querySelector('.app-light');return lp?getComputedStyle(lp).backgroundColor:null;});
    ok('a page surface = #F8F9FA', pageBg===rgb('#F8F9FA'), `${pageBg} (expect ${rgb('#F8F9FA')})`);
    const bodyBg=await p.evaluate(()=>getComputedStyle(document.body).backgroundColor);
    ok('body bg matches (no cream flash)', bodyBg===rgb('#F8F9FA'), bodyBg);

    // match rows: borders removed + tint analysis. ReqRows are the flex rows inside the match Card.
    const rowInfo=await p.evaluate(()=>{
      // find rows: divs containing a 'Not on profile' or value, with icon — use the match card
      const cards=[...document.querySelectorAll('*')];
      // rows are the flex divs with borderRadius 6 we set; detect by background variety
      const candidates=[...document.querySelectorAll('div')].filter(d=>{
        const s=getComputedStyle(d); return s.display==='flex'&&s.borderRadius==='6px'&&d.querySelector('svg');
      });
      return candidates.map(d=>{const s=getComputedStyle(d);return {bg:s.backgroundColor,borderBottom:s.borderBottomWidth};});
    });
    const tinted=rowInfo.filter(r=>r.bg===rgb('#FEF2F2'));
    const transparent=rowInfo.filter(r=>r.bg==='rgba(0, 0, 0, 0)'||r.bg==='transparent');
    const anyBorder=rowInfo.some(r=>r.borderBottom!=='0px');
    ok('b no inter-row borders', !anyBorder&&rowInfo.length>0, `rows=${rowInfo.length} anyBorder=${anyBorder}`);
    ok('c unmet rows tinted #FEF2F2', tinted.length>0, `tinted=${tinted.length}`);
    ok('c met rows untinted', transparent.length>0, `transparent=${transparent.length}`);
    // widget container border preserved (the Card)
    const cardBorder=await p.evaluate(()=>{const lbl=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&/^YOUR MATCH$/i.test(e.textContent.trim()));let el=lbl;while(el&&getComputedStyle(el).borderWidth==='0px')el=el.parentElement;return el?getComputedStyle(el).borderWidth:null;});
    ok('widget container border preserved', cardBorder&&cardBorder!=='0px', `cardBorder=${cardBorder}`);
    await p.screenshot({path:`${OUT}/aes-desktop.png`,fullPage:false});

    // regression /jobs cream
    await p.goto(`${BASE}/jobs`,{waitUntil:'networkidle2'}); await sleep(2000);
    const jobsBg=await p.evaluate(()=>{const lp=document.querySelector('.app-light');return lp?getComputedStyle(lp).backgroundColor:null;});
    ok('regression /jobs still cream #F8F6F1', jobsBg===rgb('#F8F6F1'), `${jobsBg} (expect ${rgb('#F8F6F1')})`);
    await p.screenshot({path:`${OUT}/aes-jobs-regression.png`,fullPage:false});
    await p.goto(`${BASE}/settings`,{waitUntil:'networkidle2'}); await sleep(1500);
    const setBg=await p.evaluate(()=>{const lp=document.querySelector('.app-light');return lp?getComputedStyle(lp).backgroundColor:null;});
    ok('regression /settings still cream', setBg===rgb('#F8F6F1'), setBg);

    // mobile
    const pm=await b.newPage(); await pm.setViewport({width:390,height:1500,isMobile:true});
    await pm.goto(BASE,{waitUntil:'domcontentloaded'}); await pm.evaluate(t=>localStorage.setItem('authToken',t),tok);
    await pm.goto(`${BASE}/jobs/${slug}`,{waitUntil:'networkidle2'}); await waitMain(pm);
    ok('mobile no h-scroll', await pm.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
    const mTint=await pm.evaluate(()=>[...document.querySelectorAll('div')].some(d=>getComputedStyle(d).backgroundColor==='rgb(254, 242, 242)'));
    ok('mobile unmet tint visible', mTint);
    await pm.screenshot({path:`${OUT}/aes-mobile.png`});

    ok('no console errors', errs.length===0, errs.join('|')||'none');
  } finally { await b.close(); const d=await api('/auth/account',{method:'DELETE',headers:H,body:{password:pw}}); console.log('  cleanup:',d.status);
    const passed=results.filter(r=>r[1]).length; console.log(`\n========== AESTHETIC VERIFY: ${passed}/${results.length} ==========`);
  }
})().catch(e=>console.error('FATAL',e.message,e.stack));
