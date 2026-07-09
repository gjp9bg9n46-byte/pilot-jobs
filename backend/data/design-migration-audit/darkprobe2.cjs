const puppeteer=require('puppeteer');
const API='https://cockpithire.com/api', CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
async function jf(p,o={}){const r=await fetch(API+p,o);let b=null;try{b=await r.json()}catch{}return{status:r.status,body:b}}
(async()=>{
  const email=`emp14p_${Date.now()}@example.com`;
  const reg=await jf('/employers/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyName:'P14 Air',companyType:'AIRLINE',country:'PT',contactName:'T',contactEmail:email,password:'TestPass1234!'})});
  const tok=reg.body.token;
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const p=await b.newPage();
  await p.goto('https://cockpithire.com',{waitUntil:'domcontentloaded'});
  await p.evaluate(t=>localStorage.setItem('employerToken',t),tok);
  await p.goto('https://cockpithire.com/employer/profile',{waitUntil:'networkidle2'});await new Promise(r=>setTimeout(r,1500));
  const info=await p.evaluate(()=>{
    const dark=[...document.querySelectorAll('*')].filter(el=>{const bg=getComputedStyle(el).backgroundColor;return bg==='rgb(13, 30, 53)'||bg==='rgb(10, 22, 40)';});
    return {url:location.pathname, count:dark.length, els:dark.slice(0,6).map(e=>{const r=e.getBoundingClientRect();return `${e.tagName}.${(typeof e.className==='string'?e.className:'')||'(none)'} ${Math.round(r.width)}x${Math.round(r.height)} vis=${e.offsetParent!==null}`}), bodyBg:getComputedStyle(document.body).backgroundColor};
  });
  console.log(JSON.stringify(info,null,2));
  await jf('/employers/me',{method:'DELETE',headers:{Authorization:`Bearer ${tok}`}}).catch(()=>{});
  await b.close();
})();
