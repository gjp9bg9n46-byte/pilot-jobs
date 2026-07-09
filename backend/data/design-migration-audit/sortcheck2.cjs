const puppeteer = require('puppeteer');
const BASE='https://cockpithire.com', CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,json:j}}
(async()=>{
  const email=`sc2_${Date.now()}@example.com`,password='Verify123!pw';
  const reg=await api('/auth/register',{method:'POST',body:{email,password,firstName:'S',lastName:'C',phone:'+10000000000',country:'United States',city:'Dallas'}});
  const token=reg.json?.token;
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  try{
    const p=await b.newPage();await p.setViewport({width:1280,height:900});
    await p.goto(BASE,{waitUntil:'domcontentloaded'});
    await p.evaluate(t=>localStorage.setItem('authToken',t),token);
    await p.goto(`${BASE}/jobs?sort=deadline&authority=EASA&aircraft=A320&qualified=0`,{waitUntil:'networkidle2'});await sleep(2500);
    console.log('sort value =', await p.evaluate(()=>document.querySelector('select[aria-label="Sort jobs"]')?.value), '(expect deadline)');
    console.log('url after load =', await p.evaluate(()=>location.search));
    // open filters to confirm aircraft seeded into pending? authority+aircraft show as active count
    console.log('active filter count badge =', await p.evaluate(()=>{const m=document.body.innerText.replace(/\n/g,' ').match(/Filters\s+(\d+)/);return m?m[1]:'none'}));
    // change sort via UI → URL updates
    await p.select('select[aria-label="Sort jobs"]','relevant');await sleep(1200);
    console.log('after UI change url =', await p.evaluate(()=>location.search));
  } finally { await b.close(); if(token){const d=await api('/auth/account',{method:'DELETE',headers:{Authorization:`Bearer ${token}`},body:{password}});console.log('cleanup=',d.status)} }
})().catch(e=>console.error('FATAL',e.message));
