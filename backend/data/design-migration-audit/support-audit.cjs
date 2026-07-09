const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,body:j}}
(async()=>{
  const email=`sup_${Date.now()}@example.com`,pw='Verify123!pw';
  const reg=await api('/auth/register',{method:'POST',body:{email,password:pw,firstName:'S',lastName:'U',phone:'+10000000000',country:'United States',city:'Dallas'}});
  const tok=reg.body?.token; const H={Authorization:`Bearer ${tok}`};
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const errs=[];
  try{
    // logged-out /support
    const ctx=await b.createBrowserContext(); const po=await ctx.newPage(); await po.setViewport({width:1280,height:1000});
    await po.goto(`${BASE}/support`,{waitUntil:'networkidle2'}); await sleep(1500);
    console.log('logged-out /support → path:', await po.evaluate(()=>location.pathname));

    // authed
    const p=await b.newPage(); await p.setViewport({width:1280,height:1800});
    p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text().slice(0,120));});
    await p.goto(BASE,{waitUntil:'domcontentloaded'}); await p.evaluate(t=>localStorage.setItem('authToken',t),tok);
    await p.goto(`${BASE}/support`,{waitUntil:'networkidle2'}); await sleep(1500);
    const info=await p.evaluate(()=>{
      const faqHeaders=[...document.querySelectorAll('div')].filter(d=>/How does job matching work\?|How often are jobs updated\?/.test(d.textContent)&&d.querySelector('span'));
      // a11y: are FAQ headers buttons? do they have aria-expanded?
      const firstFaq=[...document.querySelectorAll('div')].find(d=>d.textContent.trim().startsWith('How does job matching work?'));
      const mailtos=[...document.querySelectorAll('a[href^="mailto:"]')].map(a=>a.getAttribute('href'));
      return {
        faqButtons: document.querySelectorAll('button').length,
        firstFaqTag: firstFaq?firstFaq.tagName:null,
        firstFaqAria: firstFaq?firstFaq.getAttribute('aria-expanded'):'none',
        mailtos,
        faqCount: (document.body.innerText.match(/\+/g)||[]).length,
      };
    });
    console.log('authed support:', JSON.stringify(info));
    // expand first two FAQs, check independence
    const faqEls=await p.$$('div');
    await p.evaluate(()=>{const h=[...document.querySelectorAll('div')].find(d=>d.style.cursor==='pointer'&&/job matching/.test(d.textContent));h&&h.click();});
    await sleep(400);
    const afterExpand=await p.evaluate(()=>/compares your pilot profile/.test(document.body.innerText));
    console.log('FAQ#1 expands on click:', afterExpand);
    // keyboard: can you Tab to a FAQ header and Enter? (it's a div — likely not focusable)
    const faqFocusable=await p.evaluate(()=>{const h=[...document.querySelectorAll('div')].find(d=>d.style.cursor==='pointer'&&/job matching/.test(d.textContent));if(!h)return null;h.focus();return document.activeElement===h;});
    console.log('FAQ header keyboard-focusable:', faqFocusable);
    await p.screenshot({path:`${OUT}/support-audit.png`,fullPage:true});
    console.log('console errors:', errs.length?errs:'none');
  } finally { await b.close(); const d=await api('/auth/account',{method:'DELETE',headers:H,body:{password:pw}}); console.log('cleanup:',d.status); }
})().catch(e=>console.error('FATAL',e.message,e.stack));
