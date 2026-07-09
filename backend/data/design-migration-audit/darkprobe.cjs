const puppeteer=require('puppeteer');
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
(async()=>{
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const p=await b.newPage();
  // employer page (no token needed for the dark-element identity; use rejected which renders)
  await p.goto('https://cockpithire.com/employer/pending-approval',{waitUntil:'networkidle2'});
  await new Promise(r=>setTimeout(r,1500));
  const info=await p.evaluate(()=>{
    const dark=[...document.querySelectorAll('*')].filter(el=>{const bg=getComputedStyle(el).backgroundColor;return bg==='rgb(13, 30, 53)'||bg==='rgb(10, 22, 40)';});
    const bodyBg=getComputedStyle(document.body).backgroundColor;
    const htmlBg=getComputedStyle(document.documentElement).backgroundColor;
    const rootBg=document.getElementById('root')?getComputedStyle(document.getElementById('root')).backgroundColor:null;
    return {count:dark.length, els:dark.slice(0,5).map(e=>`${e.tagName}.${e.className||'(no-class)'} bg=${getComputedStyle(e).backgroundColor} visible=${e.offsetParent!==null||e===document.body}`), bodyBg, htmlBg, rootBg};
  });
  console.log(JSON.stringify(info,null,2));
  // compare: pilot page body bg
  await p.goto('https://cockpithire.com/jobs',{waitUntil:'networkidle2'});await new Promise(r=>setTimeout(r,1000));
  const pilot=await p.evaluate(()=>({bodyBg:getComputedStyle(document.body).backgroundColor, rootBg:document.getElementById('root')?getComputedStyle(document.getElementById('root')).backgroundColor:null}));
  console.log('PILOT /jobs:',JSON.stringify(pilot));
  await b.close();
})();
