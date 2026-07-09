const puppeteer = require('puppeteer');
const BASE='https://cockpithire.com', CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,json:j}}
(async()=>{
  const email=`sc_${Date.now()}@example.com`,password='Verify123!pw';
  const reg=await api('/auth/register',{method:'POST',body:{email,password,firstName:'S',lastName:'C',phone:'+10000000000',country:'United States',city:'Dallas'}});
  const token=reg.json?.token;
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  try{
    const p=await b.newPage();await p.setViewport({width:1280,height:900});
    await p.goto(BASE,{waitUntil:'domcontentloaded'});
    await p.evaluate(t=>localStorage.setItem('authToken',t),token);
    await p.goto(`${BASE}/jobs?sort=salary_high&authority=EASA&qualified=0`,{waitUntil:'networkidle2'});await sleep(2500);
    const v=await p.evaluate(()=>{const s=document.querySelector('select[aria-label="Sort jobs"]');return s?s.value:'?'});
    const filtersBadge=await p.evaluate(()=>{const t=document.body.innerText;return /Filters\s*1/.test(t.replace(/\n/g,' '))});
    const qualHidden=await p.evaluate(()=>!/Qualified only/i.test(document.body.innerText));
    console.log('sort select value =', v, '(expect salary_high)');
    console.log('authority filter badge present =', filtersBadge);
    console.log('qualified toggle hidden(loggedin should be FALSE i.e. visible) =', qualHidden);
    // now logged-out: qualified toggle should be hidden
    await p.evaluate(()=>localStorage.removeItem('authToken'));
    await p.goto(`${BASE}/jobs`,{waitUntil:'networkidle2'});await sleep(2000);
    const qualHiddenOut=await p.evaluate(()=>!/Qualified only/i.test(document.body.innerText));
    const signinHint=await p.evaluate(()=>/Sign in to see how you match/i.test(document.body.innerText));
    console.log('LOGGED-OUT qualified toggle hidden =', qualHiddenOut, '| sign-in hint =', signinHint);
  } finally { await b.close(); if(token){await api('/auth/account',{method:'DELETE',headers:{Authorization:`Bearer ${token}`},body:{password}})} }
})().catch(e=>console.error('FATAL',e.message));
