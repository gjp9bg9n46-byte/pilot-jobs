const puppeteer=require('puppeteer');
const BASE='https://cockpithire.com',CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
const prisma=require('/Users/mohamedalaa/pilot-jobs/backend/src/config/database');
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,body:j}}
(async()=>{
  const email=`pbe_${Date.now()}@example.com`,pw='Verify123!pw';
  const reg=await api('/auth/register',{method:'POST',body:{email,password:pw,firstName:'Empty',lastName:'State',phone:'+10000000000',country:'United States',city:'Dallas'}});
  const tok=reg.body.token;
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  try{
    const p=await b.newPage(); await p.setViewport({width:1280,height:900});
    await p.goto(BASE,{waitUntil:'domcontentloaded'}); await p.evaluate(t=>localStorage.setItem('authToken',t),tok);
    await p.goto(`${BASE}/alerts`,{waitUntil:'networkidle2'}); await sleep(1500);
    await p.evaluate(()=>{const t=[...document.querySelectorAll('button')].find(b=>/Applications/.test(b.textContent));t&&t.click();}); await sleep(2000);
    const r=await p.evaluate(()=>({empty:/haven't applied to any jobs/i.test(document.body.innerText),browse:/Browse jobs/i.test(document.body.innerText),badge:(()=>{const tb=[...document.querySelectorAll('button')].find(b=>/Applications/.test(b.textContent));return tb.textContent.replace('Applications','').trim();})()}));
    console.log('EMPTY state:', JSON.stringify(r), '| badge shows 0 (no number):', r.badge===''||r.badge==='0');
    await p.screenshot({path:`${OUT}/pb-applications-empty.png`});
  } finally { await b.close(); const pl=await prisma.pilot.findFirst({where:{email}}); if(pl)await prisma.pilot.delete({where:{id:pl.id}}).catch(()=>{}); console.log('cleanup done'); process.exit(0); }
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
