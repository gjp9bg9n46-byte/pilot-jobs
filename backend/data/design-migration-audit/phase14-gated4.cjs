const puppeteer=require('puppeteer'); const fs=require('fs');
const BASE='https://cockpithire.com', CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const {token}=JSON.parse(fs.readFileSync('/tmp/p14g.json'));
const results=[]; const check=(id,c,m)=>{results.push([id,!!c,m]);console.log(`  ${c?'✓':'✗'} ${id}  ${m}`)};
async function poll(p,fn,ms=12000){const t=Date.now();while(Date.now()-t<ms){if(await p.evaluate(fn))return true;await sleep(300)}return false}
(async()=>{
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  try{
    const p=await b.newPage(); await p.setViewport({width:1280,height:900});
    await p.goto(BASE,{waitUntil:'domcontentloaded'});
    await p.evaluate(t=>localStorage.setItem('employerToken',t),token);
    await p.goto(`${BASE}/employer/dashboard`,{waitUntil:'networkidle2'}); await sleep(1500);
    // ensure an ACTIVE job with a Delete button
    const hasDelete=await poll(p,()=>[...document.querySelectorAll('button')].some(x=>x.textContent.trim()==='Delete'));
    // l3 + m) DELETE via <Modal>
    await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Delete');x.click()});
    const shown=await poll(p,()=>{const d=document.querySelector('[role="dialog"]');return !!d&&d.textContent.includes('Delete this job?')},5000);
    const w=await p.evaluate(()=>{const d=document.querySelector('[role="dialog"]');return d?getComputedStyle(d).maxWidth:null});
    const titleFont=await p.evaluate(()=>{const d=document.querySelector('[role="dialog"]');const t=d&&[...d.querySelectorAll('*')].find(e=>/Delete this job\?/.test(e.textContent)&&e.children.length===0);return t?getComputedStyle(t).fontFamily:null});
    await p.evaluate(()=>{const d=document.querySelector('[role="dialog"]');const x=[...d.querySelectorAll('button')].find(b=>b.textContent.trim()==='Delete');x.click()});
    const expired=await poll(p,()=>/EXPIRED/.test(document.body.innerText),12000);
    check('l3', shown&&expired, `DELETE via <Modal> shown=${shown} → EXPIRED=${expired}`);
    check('m', w==='480px', `delete <Modal> sm maxWidth=${w}; title font=${(titleFont||'').split(',')[0]}`);
    // l4) REPOST
    await poll(p,()=>[...document.querySelectorAll('button')].some(x=>x.textContent.trim()==='Repost'));
    await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Repost');x.click()});
    const active=await poll(p,()=>/ACTIVE/.test(document.body.innerText)&&!/EXPIRED/.test(document.body.innerText),12000);
    check('l4', active, `REPOST → ACTIVE=${active}`);
    await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Logout');x&&x.click()}); await sleep(600);
  } finally {
    await b.close();
    const passed=results.filter(r=>r[1]).length;
    console.log(`\n========== GATED CRUD (delete/repost): ${passed}/${results.length} ==========`);
  }
})().catch(e=>console.error('FATAL',e.message));
