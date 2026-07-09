const puppeteer = require('puppeteer');
const BASE='https://cockpithire.com', CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='/Users/mohamedalaa/pilot-jobs/backend/data/design-migration-audit';
async function api(p,o={}){const r=await fetch(`${BASE}/api${p}`,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,json:j}}
// measure a representative Card's width vs the main content area width
const cardFill=p=>p.evaluate(()=>{
  const main=document.querySelector('main')||document.body;
  const mainRect=main.getBoundingClientRect();
  // first card-like element after the h1
  const cards=[...document.querySelectorAll('div')].filter(d=>{const s=getComputedStyle(d);return s.borderRadius!=='0px'&&(s.borderWidth!=='0px')&&d.getBoundingClientRect().width>300&&d.getBoundingClientRect().height>40});
  const widest=cards.reduce((a,c)=>{const w=c.getBoundingClientRect().width;return w>a?w:a},0);
  return {mainWidth:Math.round(mainRect.width), widestCard:Math.round(widest), ratio:+(widest/mainRect.width).toFixed(2)};
});
(async()=>{
  const email=`width_${Date.now()}@example.com`,pw='Verify123!pw';
  const reg=await api('/auth/register',{method:'POST',body:{email,password:pw,firstName:'W',lastName:'V',phone:'+10000000000',country:'United States',city:'Dallas'}});
  const token=reg.json?.token;
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const errs=[];
  try{
    const p=await b.newPage(); await p.setViewport({width:1500,height:1200});
    p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,120))});
    await p.goto(BASE,{waitUntil:'domcontentloaded'}); await p.evaluate(t=>localStorage.setItem('authToken',t),token);

    for(const path of ['/settings','/support','/profile','/jobs','/logbook']){
      await p.goto(`${BASE}${path}`,{waitUntil:'networkidle2'}); await sleep(1800);
      console.log(path, JSON.stringify(await cardFill(p)));
    }
    await p.goto(`${BASE}/settings`,{waitUntil:'networkidle2'}); await sleep(1800);
    await p.screenshot({path:`${OUT}/settings-fullwidth.png`});
    await p.goto(`${BASE}/support`,{waitUntil:'networkidle2'}); await sleep(1500);
    await p.screenshot({path:`${OUT}/support-fullwidth.png`});

    // mobile 390 no hscroll
    const pm=await b.newPage(); await pm.setViewport({width:390,height:1400,isMobile:true});
    await pm.goto(BASE,{waitUntil:'domcontentloaded'}); await pm.evaluate(t=>localStorage.setItem('authToken',t),token);
    for(const path of ['/settings','/support']){
      await pm.goto(`${BASE}${path}`,{waitUntil:'networkidle2'}); await sleep(1500);
      console.log('mobile',path,'noHScroll=',await pm.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
    }
    console.log('CONSOLE ERRORS:',errs.length?errs:'none');
  } finally { await b.close(); if(token){const d=await api('/auth/account',{method:'DELETE',headers:{Authorization:`Bearer ${token}`},body:{password:pw}});console.log('cleanup',d.status);} }
})().catch(e=>console.error('FATAL',e.message,e.stack));
