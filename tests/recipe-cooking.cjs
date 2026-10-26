const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),playwright=require('playwright');
const {routeWeather}=require('./helpers/weather-mock.cjs');
const engine=process.env.BROWSER_ENGINE==='webkit'?'webkit':'chromium',base=process.env.APP_URL||'http://127.0.0.1:4173',key='forma:workspace:v1:guest',timerKey='forma-recipe-timers-v1:guest';
const out=path.join(__dirname,'artifacts',engine,'recipe-cooking');fs.mkdirSync(out,{recursive:true});
const recipe={id:'cooking',title:'Gryta för köksbänken',url:'https://example.org/gryta',ingredients:Array.from({length:28},(_,i)=>`${i+1} dl råvara ${i+1}`).join('\n'),steps:['Sjud i 4 sekunder.','Rör om och tillsätt grönsakerna.','Grädda i 15–20 minuter i 200 grader.',...Array.from({length:9},(_,i)=>`Tillagningssteg ${i+4}. Blanda försiktigt och smaka av med salt, citron och färska örter.`)].join('\n'),notes:'4 portioner · 30 minuter · cirka 25 kr/portion.',labels:['Nordiskt'],createdAt:'2026-10-26T08:00:00.000Z'};
const workspace={columns:[{id:'todo',title:'Att göra',color:'gray'},{id:'done',title:'Klart',color:'green'},{id:'finalized',title:'Finalized',color:'green'}],tasks:[],projects:[],recipes:[recipe],cuisineCookbooksOrganized:true,cookbooks:[]};
const results=[],contexts=new Set();let browser;
const reader=page=>page.locator('dialog.recipe-reader'),dock=page=>page.getByRole('region',{name:'Dina timers',exact:true});
async function shelf(page){await page.locator('.bottom-nav').getByRole('button',{name:'Others',exact:true}).click();await page.getByRole('button',{name:/^Recept(?:\s|$)/}).click();await page.getByRole('button',{name:/^Alla recept/}).click()}
async function show(page){await page.locator(`[data-recipe-id="${recipe.id}"]`).getByRole('button',{name:/^Öppna recept/}).click();await reader(page).waitFor();await reader(page).evaluate(el=>el.getAnimations().forEach(animation=>animation.finish()));await page.clock.runFor(250)}
async function open({width=1024,height=768,touch=true,theme='bento-space-gray',wake=false,withImage=false}={}){
 const c=await browser.newContext({viewport:{width,height},hasTouch:touch,locale:'sv-SE',timezoneId:'Europe/Stockholm',serviceWorkers:'block'});contexts.add(c);await routeWeather(c,{},'2026-10-26T09:00:00+01:00');
 await c.addInitScript(({key,workspace,theme,wake,withImage})=>{if(withImage){const canvas=document.createElement('canvas');canvas.width=600;canvas.height=240;const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,1200,500);gradient.addColorStop(0,'#476c56');gradient.addColorStop(1,'#c7b58c');ctx.fillStyle=gradient;ctx.fillRect(0,0,1200,500);workspace.recipes[0].image=canvas.toDataURL('image/jpeg',.7)}if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({version:1,revision:null,dirty:false,workspace}));localStorage.setItem('forma-theme',theme);if(wake){window.wakeCalls={requested:0,released:0};Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{request:async()=>{window.wakeCalls.requested++;const lock=new EventTarget();lock.released=false;lock.release=async()=>{if(!lock.released){lock.released=true;window.wakeCalls.released++;lock.dispatchEvent(new Event('release'))}};return lock}}})}},{key,workspace,theme,wake,withImage});
 const page=await c.newPage();page.setDefaultTimeout(10000);page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));await page.clock.install({time:new Date('2026-10-26T09:00:00+01:00')});await page.clock.pauseAt(new Date('2026-10-26T09:01:00+01:00'));await page.goto(base);await page.locator('.loading-notice').waitFor({state:'detached'});await shelf(page);await show(page);return page;
}
async function noOverflow(page){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const r=await reader(page).boundingBox(),v=page.viewportSize();assert.ok(r.x>=-1&&r.y>=-1&&r.x+r.width<=v.width+1&&r.y+r.height<=v.height+1)}
async function check(name,fn){try{await fn();for(const c of contexts)for(const p of c.pages())assert.deepEqual(p.errors,[]);results.push({name,passed:true});console.log('PASS '+name)}catch(e){results.push({name,passed:false,error:String(e.stack)});console.log('FAIL '+name+': '+e.stack);for(const c of contexts)for(const p of c.pages())console.log('PAGE ERRORS',p.errors);for(const c of contexts)for(const p of c.pages())await p.screenshot({path:path.join(out,`failure-${results.length}.png`),animations:'disabled'}).catch(()=>{})}finally{for(const c of contexts)await c.close();contexts.clear()}}
(async()=>{browser=await playwright[engine].launch({headless:true});try{
 await check('Landscape iPads fill the screen with independent ingredient and method panes; rotation preserves progress',async()=>{
  for(const [width,height]of [[1024,768],[1180,820],[1366,1024]]){
   const page=await open({width,height}),r=await reader(page).boundingBox();assert.ok(r.width>=width-2&&r.height>=height-2,JSON.stringify({width,height,r,style:await reader(page).evaluate(el=>({height:getComputedStyle(el).height,maxHeight:getComputedStyle(el).maxHeight,transform:getComputedStyle(el).transform,coarse:matchMedia('(pointer: coarse)').matches,visible:el.style.getPropertyValue('--modal-visible-height')}))}));
   const panes=reader(page).locator('.recipe-content-box'),a=await panes.nth(0).boundingBox(),b=await panes.nth(1).boundingBox();assert.ok(b.x>=a.x+a.width+10&&Math.abs(a.y-b.y)<2);
   const ingredients=page.getByRole('region',{name:'Ingredienslista',exact:true}),method=page.getByRole('region',{name:'Tillagningssteg',exact:true});
   await ingredients.getByRole('checkbox').first().check();await page.getByRole('button',{name:'Markera steg 1 som klart',exact:true}).click();
   await method.evaluate(el=>{el.scrollTop=el.scrollHeight});assert.ok(await method.evaluate(el=>el.scrollTop>50));assert.equal(await ingredients.evaluate(el=>el.scrollTop),0);assert.equal(await reader(page).locator('.modal-content').evaluate(el=>el.scrollTop),0);
   await page.screenshot({path:path.join(out,`landscape-${width}.png`),animations:'disabled'});await noOverflow(page);
   await page.setViewportSize({width:768,height:1024});assert.equal(await ingredients.getByRole('checkbox').first().isChecked(),true);assert.equal(await page.getByRole('button',{name:'Återöppna steg 1',exact:true}).getAttribute('aria-pressed'),'true');await noOverflow(page);
  }
 });
 await check('PC and tablets show one full-width photo section above two columns; mobile uses a compact image and stacked sections',async()=>{
  for(const [width,height,touch]of [[1440,900,false],[1920,1080,false],[1024,768,true],[768,1024,true],[700,900,true],[390,844,true],[320,700,true],[844,390,true],[1000,550,false]]){
   const page=await open({width,height,touch,withImage:true}),hero=reader(page).locator('.recipe-reader-hero'),thumb=reader(page).locator('.recipe-reader-image'),panes=reader(page).locator('.recipe-content-box');
   const mobile=width<700||(touch&&height<600),a=await panes.nth(0).boundingBox(),b=await panes.nth(1).boundingBox();
   if(mobile){assert.equal(await hero.isVisible(),false);assert.equal(await thumb.isVisible(),true);const image=await thumb.boundingBox();assert.ok(image.width<=64&&image.height<=64);assert.ok(b.y>=a.y+a.height&&Math.abs(a.x-b.x)<2)}
   else{assert.equal(await hero.isVisible(),true);assert.equal(await thumb.isVisible(),false);const image=await hero.boundingBox(),content=await reader(page).locator('.modal-content').boundingBox();assert.ok(image.width>=content.width-52&&image.height>=135);assert.ok(a.y>=image.y+image.height+10);assert.ok(b.x>=a.x+a.width+10&&Math.abs(a.y-b.y)<2)}
   assert.equal(await reader(page).locator('img:visible').count(),1);
   await noOverflow(page);await page.screenshot({path:path.join(out,`image-${width}x${height}.png`),animations:'disabled'});
  }
 });
 await check('Timers pause, survive reload, resume accurately, finish visibly, reset and can be removed',async()=>{
  let page=await open();await page.getByRole('button',{name:'Starta timer på 4 s för steg 1',exact:true}).click();assert.match(await dock(page).innerText(),/00:04/);const timerBounds=await dock(page).boundingBox();assert.ok(timerBounds.y+timerBounds.height<=page.viewportSize().height);await page.screenshot({path:path.join(out,'timer-running.png'),animations:'disabled'});
  await page.clock.runFor(1500);await page.getByRole('button',{name:'Pausa timer för steg 1',exact:true}).click();assert.match(await dock(page).innerText(),/00:03/);await page.clock.runFor(10000);assert.match(await dock(page).innerText(),/00:03/);
  assert.equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k))[0].endsAt,timerKey),null);
  await page.reload();await page.locator('.loading-notice').waitFor({state:'detached'});await shelf(page);await show(page);assert.match(await dock(page).innerText(),/00:03/);
  await page.getByRole('button',{name:'Fortsätt timer för steg 1',exact:true}).click();await page.clock.runFor(1000);assert.match(await dock(page).innerText(),/00:02/);await page.clock.runFor(2000);await dock(page).getByRole('alert').waitFor();assert.match(await dock(page).innerText(),/Klar!/);
  await page.getByRole('button',{name:'Återställ timer för steg 1',exact:true}).click();assert.match(await dock(page).innerText(),/00:04/);assert.equal(await dock(page).getByRole('alert').count(),0);
  await page.getByRole('button',{name:'Ta bort timer för steg 1',exact:true}).click();assert.equal(await dock(page).count(),0);await noOverflow(page);
 });
 await check('Time ranges offer explicit choices; elapsed wall time and closing/reopening retain the countdown',async()=>{
  const page=await open();assert.equal(await page.getByRole('button',{name:'Starta timer på 15 min för steg 3',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'Starta timer på 20 min för steg 3',exact:true}).count(),1);assert.equal(await reader(page).getByRole('button',{name:/Starta timer/}).count(),3);
  await page.getByRole('button',{name:'Starta timer på 15 min för steg 3',exact:true}).click();assert.match(await dock(page).innerText(),/15:00/);
  await reader(page).locator('.modal-footer').getByRole('button',{name:'Stäng',exact:true}).click();await page.clock.fastForward(60000);await show(page);assert.match(await dock(page).innerText(),/14:00/);
  await page.clock.fastForward(15*60000);await dock(page).getByRole('alert').waitFor();assert.match(await dock(page).innerText(),/Klar!/);assert.equal(await reader(page).count(),1);
 });
 await check('The kitchen reader stays open after tablet idle and releases its screen wake lock when closed',async()=>{
  const page=await open({wake:true});await page.getByText('Skärm vaken',{exact:true}).waitFor();await page.clock.runFor(190000);assert.equal(await reader(page).isVisible(),true);assert.ok(await page.evaluate(()=>window.wakeCalls.requested>0));
  await reader(page).locator('.modal-footer').getByRole('button',{name:'Stäng',exact:true}).click();await page.waitForFunction(()=>window.wakeCalls.released===window.wakeCalls.requested);assert.equal(await reader(page).count(),0);
 });
 await check('Portrait, phone and PC layouts remain readable in every theme with large text and accessible controls',async()=>{
  for(const [width,height,touch,theme]of [[768,1024,true,'light'],[390,844,true,'dark'],[1024,768,true,'bento'],[1180,820,true,'bento-aurora'],[1440,900,false,'bento-space-gray']]){
   const page=await open({width,height,touch,theme});const text=reader(page).locator('.recipe-step-text').first(),before=await text.evaluate(el=>parseFloat(getComputedStyle(el).fontSize));assert.ok(before>=(width<700?18:20));
   await page.getByRole('button',{name:'Öka textstorlek',exact:true}).click();assert.equal(await text.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)),before+2);const button=await page.getByRole('button',{name:'Markera steg 1 som klart',exact:true}).boundingBox();assert.ok(button.width>=44&&button.height>=44);await noOverflow(page);if(width<700||(touch&&height<600)){await page.getByRole('navigation',{name:'Läs receptet',exact:true}).getByRole('button',{name:'Gör så här',exact:true}).click();const method=await page.getByRole('heading',{name:'Gör så här',exact:true}).boundingBox();assert.ok(method.y>=0&&method.y+method.height<height);await page.getByRole('button',{name:'Starta timer på 4 s för steg 1',exact:true}).click();const timer=await dock(page).boundingBox();assert.ok(timer.y>=0&&timer.y+timer.height<=height)}await page.screenshot({path:path.join(out,`${theme}-${width}.png`),animations:'disabled'});
  }
 });
}finally{await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2))}console.log(`${results.filter(r=>r.passed).length}/${results.length} cooking scenarios passed (${engine}).`);process.exitCode=results.every(r=>r.passed)?0:1})().catch(e=>{console.error(e);process.exitCode=1});
