const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  try{
    const ctx=await b.createBrowserContext(); const p=await ctx.newPage(); await p.setViewport({width:1280,height:1600});
    await p.goto(`${BASE}/support`,{waitUntil:'networkidle2'}); await sleep(1500);
    // categories via textContent (source case, not text-transform)
    const cats=await p.evaluate(()=>[...document.querySelectorAll('div')].map(d=>d.childNodes.length===1&&d.firstChild.nodeType===3?d.textContent.trim():null).filter(t=>['Jobs & Matching','Your Profile','CV & Logbook','Account & Privacy'].includes(t)));
    console.log('category headers (textContent):', JSON.stringify([...new Set(cats)]));
    // page-scoped mailto count (inside the Contact card, not footer)
    const pageMailtos=await p.evaluate(()=>[...document.querySelectorAll('a.support-contact')].map(a=>a.getAttribute('href')));
    console.log('Contact-card mailtos:', JSON.stringify(pageMailtos));
    // expand "how often" FAQ → check cadence text
    await p.evaluate(()=>{const btn=[...document.querySelectorAll('button.faq-header')].find(b=>/How often are jobs updated/i.test(b.textContent));btn&&btn.click();}); await sleep(400);
    const cadence=await p.evaluate(()=>({withinDay:/within a day/i.test(document.body.innerText),withinHours:/within hours/i.test(document.body.innerText)}));
    console.log('cadence (expanded):', JSON.stringify(cadence));
  } finally { await b.close(); }
})().catch(e=>console.error('FATAL',e.message));
