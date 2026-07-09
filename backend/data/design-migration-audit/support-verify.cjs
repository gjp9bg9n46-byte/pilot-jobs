const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,body:j}}
const results=[];const ok=(id,c,m)=>{results.push([id,!!c]);console.log(`  ${c?'✓':'✗'} ${id}  ${m||''}`)};
const waitFaq=async p=>{await p.waitForFunction(()=>/Frequently Asked Questions/.test(document.body.innerText),{timeout:20000});await sleep(800);};
(async()=>{
  const email=`spv_${Date.now()}@example.com`,pw='Verify123!pw';
  const reg=await api('/auth/register',{method:'POST',body:{email,password:pw,firstName:'S',lastName:'V',phone:'+10000000000',country:'United States',city:'Dallas'}});
  const tok=reg.body?.token; const H={Authorization:`Bearer ${tok}`};
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const errs=[];
  try{
    // ===== E1 logged-OUT (public) =====
    const ctx=await b.createBrowserContext(); const po=await ctx.newPage(); await po.setViewport({width:1280,height:2000});
    po.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push('LO:'+m.text().slice(0,100));});
    await po.goto(`${BASE}/support`,{waitUntil:'networkidle2'}); await sleep(1500);
    ok('E1 logged-out NOT redirected to /login', /\/support$/.test(await po.evaluate(()=>location.pathname)), await po.evaluate(()=>location.pathname));
    const lo=await po.evaluate(()=>({publicShell:!!document.querySelector('footer')||/Web App/i.test(document.body.innerText),faq:/Frequently Asked Questions/.test(document.body.innerText),contacts:document.querySelectorAll('a[href^="mailto:"]').length}));
    ok('E1 logged-out renders FAQ+contacts (PublicLayout)', lo.faq&&lo.contacts===3, JSON.stringify(lo));
    await po.screenshot({path:`${OUT}/sup-loggedout.png`,fullPage:true});

    // ===== logged-IN =====
    const p=await b.newPage(); await p.setViewport({width:1280,height:2200});
    p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push('LI:'+m.text().slice(0,100));});
    await p.goto(BASE,{waitUntil:'domcontentloaded'}); await p.evaluate(t=>localStorage.setItem('authToken',t),tok);
    await p.goto(`${BASE}/support`,{waitUntil:'networkidle2'}); await waitFaq(p);
    ok('E1 logged-in renders in Layout (sidebar)', await p.evaluate(()=>/Logbook|CV Builder|Sign Out/.test(document.body.innerText)));

    // fix-now #1 privacy copy
    const priv=await p.evaluate(()=>{const el=[...document.querySelectorAll('button.faq-header')].find(b=>/visible to airlines/i.test(b.textContent));if(el)el.click();return true;});
    await sleep(400);
    ok('#1 privacy FAQ says visible-by-default', await p.evaluate(()=>/by default your profile is visible/i.test(document.body.innerText)));
    // #5 cadence
    ok('#5 cadence "within a day", no "within hours"', await p.evaluate(()=>/within a day/i.test(document.body.innerText)&&!/within hours/i.test(document.body.innerText)));

    // #4 accordion a11y: real buttons + aria-expanded + focusable
    const a11y=await p.evaluate(()=>{const btns=[...document.querySelectorAll('button.faq-header')];const f=btns[0];f.focus();return{count:btns.length,allButtons:btns.every(b=>b.tagName==='BUTTON'),hasAria:btns.every(b=>b.getAttribute('aria-expanded')!=null),controls:f.getAttribute('aria-controls'),focusable:document.activeElement===f};});
    ok('#4 FAQ headers are buttons w/ aria-expanded + focusable', a11y.allButtons&&a11y.hasAria&&a11y.focusable&&a11y.count===12, JSON.stringify(a11y));
    // Enter toggles focused button
    const before=await p.evaluate(()=>document.querySelector('button.faq-header').getAttribute('aria-expanded'));
    await p.keyboard.press('Enter'); await sleep(300);
    const after=await p.evaluate(()=>document.querySelector('button.faq-header').getAttribute('aria-expanded'));
    ok('#4 Enter toggles aria-expanded', before!==after, `${before}→${after}`);
    // #7 contact focus ring (class present)
    ok('#7 contact links have .support-contact class', await p.evaluate(()=>document.querySelectorAll('a.support-contact').length===3));

    // E3 categories
    const cats=await p.evaluate(()=>['Jobs & Matching','Your Profile','CV & Logbook','Account & Privacy'].filter(c=>document.body.innerText.includes(c)));
    ok('E3 4 category headers present', cats.length===4, cats.join(', '));
    // E3 ids
    ok('E3 FAQ ids present (faq-<slug>)', await p.evaluate(()=>!!document.getElementById('faq-how-job-matching-works')&&!!document.getElementById('faq-profile-visibility')));

    // E2 search
    await p.evaluate(()=>{const i=document.querySelector('input[type=search]');const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,'logbook');i.dispatchEvent(new Event('input',{bubbles:true}));}); await sleep(500);
    const searchRes=await p.evaluate(()=>{const heads=[...document.querySelectorAll('button.faq-header')].map(b=>b.textContent.replace(/[−+]/g,'').trim());return{count:heads.length,heads,catsShown:['Jobs & Matching','Your Profile','CV & Logbook','Account & Privacy'].filter(c=>document.body.innerText.includes(c))};});
    ok('E2 search filters FAQs', searchRes.count>0&&searchRes.count<12&&searchRes.heads.some(h=>/logbook/i.test(h)), `count=${searchRes.count}`);
    ok('E2 empty categories hidden during search', searchRes.catsShown.length<4, `catsShown=${searchRes.catsShown.join(',')}`);
    await p.screenshot({path:`${OUT}/sup-search.png`,fullPage:false});
    // no-match
    await p.evaluate(()=>{const i=document.querySelector('input[type=search]');const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,'zzzqqq');i.dispatchEvent(new Event('input',{bubbles:true}));}); await sleep(400);
    ok('E2 no-match state', await p.evaluate(()=>/No FAQs match your search/i.test(document.body.innerText)));
    await p.evaluate(()=>{const btn=[...document.querySelectorAll('button')].find(b=>/Clear search/.test(b.textContent));btn&&btn.click();}); await sleep(400);
    ok('E2 clear restores all', await p.evaluate(()=>document.querySelectorAll('button.faq-header').length===12));

    // E5 About
    const about=await p.evaluate(()=>({whatsNew:/What's new/i.test(document.body.innerText),version:/Version 1\.0\.0/.test(document.body.innerText),noVersionDetails:!/version details/i.test(document.body.innerText),beta:/Beta/.test(document.body.innerText),airlines468:/468 airline/i.test(document.body.innerText)}));
    ok('E5 About: What\'s new + version + no "version details" + beta', about.whatsNew&&about.version&&about.noVersionDetails&&about.beta&&about.airlines468, JSON.stringify(about));
    await p.screenshot({path:`${OUT}/sup-loggedin.png`,fullPage:true});

    // E3 deep-link
    const dp=await b.newPage(); await dp.setViewport({width:1280,height:1400});
    await dp.goto(BASE,{waitUntil:'domcontentloaded'}); await dp.evaluate(t=>localStorage.setItem('authToken',t),tok);
    await dp.goto(`${BASE}/support#faq-carry-forward-hours`,{waitUntil:'networkidle2'}); await sleep(2000);
    const deep=await dp.evaluate(()=>{const el=document.getElementById('faq-carry-forward-hours');const btn=el?.querySelector('button.faq-header');return{exists:!!el,expanded:btn?.getAttribute('aria-expanded'),answerVisible:/those hours won/i.test(document.body.innerText)};});
    ok('E3 deep-link auto-expands target FAQ', deep.exists&&deep.expanded==='true'&&deep.answerVisible, JSON.stringify(deep));
    await dp.screenshot({path:`${OUT}/sup-deeplink.png`,fullPage:false});

    // mobile
    const pm=await b.newPage(); await pm.setViewport({width:390,height:2000,isMobile:true});
    await pm.goto(`${BASE}/support`,{waitUntil:'networkidle2'}); await sleep(1500);
    ok('mobile no h-scroll', await pm.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
    await pm.screenshot({path:`${OUT}/sup-mobile.png`,fullPage:false});

    ok('no console errors', errs.length===0, errs.join('|')||'none');
  } finally { await b.close(); const d=await api('/auth/account',{method:'DELETE',headers:H,body:{password:pw}}); console.log('cleanup:',d.status);
    const passed=results.filter(r=>r[1]).length; console.log(`\n========== SUPPORT VERIFY: ${passed}/${results.length} ==========`);
  }
})().catch(e=>console.error('FATAL',e.message,e.stack));
