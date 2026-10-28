const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const engine = process.env.BROWSER_ENGINE || 'chromium';
const base = process.env.APP_URL || 'http://127.0.0.1:4189';
const createdAt = '2026-10-28T09:00:00.000Z';
const fixture = { version: 1, revision: null, dirty: false, workspace: {
 columns: [{id:'todo',title:'Att göra',color:'gray'},{id:'done',title:'Klart',color:'green'},{id:'finalized',title:'Avslutat',color:'gray'}], projects: [],
 tasks:[{id:'timed',title:'Testaktivitet',description:'',columnId:'todo',labels:[],checklist:[],comments:[],projectId:null,deadline:null,createdAt,schedule:{date:'2026-10-28',startTime:'10:00',endTime:'11:00'}}],
 notes:[{id:'note',title:'Testanteckning',content:'<div>Testtext</div>',font:'system',createdAt,updatedAt:createdAt}],
}};
(async()=>{
 const browser = await ({chromium,webkit}[engine]).launch();
 try {
  for (const touch of [false,true]) {
   const context = await browser.newContext({viewport:touch?{width:390,height:844}:{width:1440,height:1000},hasTouch:touch,locale:'sv-SE',timezoneId:'Europe/Stockholm',serviceWorkers:'block'});
   await context.addInitScript(f=>{
    if(!localStorage.getItem('forma:workspace:v1:guest'))localStorage.setItem('forma:workspace:v1:guest',JSON.stringify(f));
    Object.defineProperty(navigator,'canShare',{value:()=>true,configurable:true});
    Object.defineProperty(navigator,'share',{value:async data=>{window.__exported=await data.files[0].text();throw new DOMException('Cancelled','AbortError')},configurable:true});
   },fixture);
   const page = await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.clock.install({time:new Date('2026-10-28T10:00:00+01:00')});
   await page.goto(base);
   const nav=page.getByRole('navigation',{name:'Huvudnavigation'});
   await nav.getByRole('button',{name:'Others',exact:true}).click();
   await page.getByRole('button',{name:/^Anteckningar(?:\s|$)/}).click();
   await page.getByRole('button',{name:'Öppna anteckning Testanteckning',exact:true}).click();
   const editor=page.getByRole('textbox',{name:'Anteckningens text',exact:true});
   await editor.fill(''); await editor.pressSequentially('- ');
   await editor.locator('ul li').waitFor();await page.keyboard.type('Första punkten');
   assert.match(await editor.innerHTML(),/Första punkten/);
   await editor.fill('');await editor.click();
   const bold=page.locator('.note-toolbar').getByRole('button',{name:'Fet',exact:true});
   for(let i=0;i<4;i++){
    if(touch)await bold.tap();else await bold.click();
    assert.equal(await bold.getAttribute('aria-pressed'),i%2===0?'true':'false');
   }
   await bold.click();await page.keyboard.type('Fet text');
   assert.match(await editor.innerHTML(),/<(?:b|strong)>Fet text/);
   if(touch){await editor.evaluate(e=>{const r=document.createRange();r.selectNodeContents(e);const s=getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('selectionchange'))});assert.equal(await page.locator('.note-format-bubble').count(),0)}
   await page.getByRole('button',{name:'Anteckningar',exact:true}).click();
   await nav.getByRole('button',{name:'Schema',exact:true}).click();
   await page.getByRole('button',{name:'Exportera kalender',exact:true}).click();
   await page.waitForFunction(()=>typeof window.__exported === 'string');
   assert.match(await page.evaluate(()=>window.__exported),/BEGIN:VCALENDAR/);
   await page.getByRole('button',{name:'+ Planera',exact:true}).click();await page.getByRole('dialog').waitFor();
   await page.getByRole('button',{name:'Stäng',exact:true}).click();
   await nav.getByRole('button',{name:'Home',exact:true}).click();
   assert.equal(await page.getByText('lite mer fokus.',{exact:true}).count(),0);
   assert.deepEqual(errors,[]);
   console.log(`PASS ${engine} ${touch?'touch':'desktop'}: automatic bullet, single-tap bold, export cancellation, navigation`);
   await context.close();
  }
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
