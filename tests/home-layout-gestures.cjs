const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require('playwright');
const { routeWeather } = require('./helpers/weather-mock.cjs');
const engine = process.env.BROWSER_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const key = 'forma:workspace:v1:guest', layoutKey = 'forma-home-layout-v1';
const out = path.join(__dirname,'artifacts',engine,'home-layout-gestures');
fs.mkdirSync(out,{recursive:true});
const date='2026-10-26',createdAt='2026-10-01T09:00:00.000Z';
const fixture={version:1,revision:null,dirty:false,workspace:{columns:[{id:'todo',title:'Att göra',color:'gray'},{id:'done',title:'Klart',color:'green'},{id:'finalized',title:'Finalized',color:'green'}],projects:[],tasks:[{id:'plan',title:'Planera arbetsveckan',description:'Samla underlag och välj vad som är viktigast.',columnId:'todo',labels:[],checklist:[],deadline:date,comments:[],projectId:null,createdAt}],nutritionHabits:[],birthdays:[]}};
const results=[],contexts=new Set();let browser;
const tile = (page,id)=>page.locator(`.home-module[data-module="${id}"]`);
const size = (page,id)=>tile(page,id).evaluate(el=>({width:Number(el.style.getPropertyValue('--module-columns')),height:Number(el.style.getPropertyValue('--module-height').replace('px',''))}));
const order = page=>page.locator('.home-module').evaluateAll(nodes=>nodes.map(el=>({id:el.dataset.module,order:Number(el.style.order)})).sort((a,b)=>a.order-b.order).map(x=>x.id));
const saved = page=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),layoutKey);
async function open({width=1440,height=1000,touch=false,theme='light',layout}={}){
 const context=await browser.newContext({viewport:{width,height},hasTouch:touch,locale:'sv-SE',timezoneId:'Europe/Stockholm',serviceWorkers:'block'});contexts.add(context);
 await routeWeather(context,{},date+'T09:00:00+01:00');
 await context.addInitScript(({key,fixture,theme,layout,layoutKey})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(fixture));if(layout)localStorage.setItem(layoutKey,JSON.stringify(layout))}localStorage.setItem('forma-theme',theme)},{key,fixture,theme,layout,layoutKey});
 const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date(date+'T09:00:00+01:00')});await page.goto(base);await page.locator('.loading-notice').waitFor({state:'detached'});await page.getByTestId('home-overview').or(page.getByTestId('home-screen')).waitFor();return {page,errors};
}
async function edit(page){await page.getByRole('button',{name:'Edit Home',exact:true}).click();await page.getByRole('button',{name:'Spara layout',exact:true}).waitFor()}
async function save(page){await page.getByRole('button',{name:'Spara layout',exact:true}).click();await page.getByRole('button',{name:'Edit Home',exact:true}).waitFor()}
async function dragHandle(page,handle,dx,dy){await handle.scrollIntoViewIfNeeded();const r=await handle.boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:7});await page.mouse.up()}
async function check(name,fn){try{await fn();results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:String(error.stack)});console.log('FAIL '+name+': '+error.stack);for(const c of contexts)for(const p of c.pages()){await p.screenshot({path:path.join(out,`failure-${results.length}.png`),animations:'disabled'}).catch(()=>{});console.log('STATE '+(await p.locator('body').innerText()).slice(0,1200))}}finally{for(const context of contexts)await context.close();contexts.clear()}}
(async()=>{browser=await playwright[engine].launch({headless:true});try{
 await check('A module can be dragged by its header, dropped into a new position and saved through reload',async()=>{
  const {page,errors}=await open();await edit(page);const before=await order(page);
  const source=page.getByRole('button',{name:'Flytta Dagens briefing',exact:true});await source.scrollIntoViewIfNeeded();
  const a=await source.boundingBox(),b=await tile(page,'focus').boundingBox();
  await page.mouse.move(a.x+40,a.y+a.height/2);await page.mouse.down();await page.mouse.move(a.x+50,a.y+a.height/2);await page.locator('.home-module-drag-preview').waitFor();
  await page.mouse.move(b.x+b.width/2,b.y+30,{steps:12});await page.locator('.is-drop-target[data-module="focus"]').waitFor();await page.mouse.up();await page.clock.runFor(250);
  await page.locator('.home-module-drag-preview').waitFor({state:'detached'});
  const after=await order(page);assert.notDeepEqual(after,before);assert.ok(after.indexOf('summary')>after.indexOf('focus'));
  await save(page);const value=await saved(page);assert.ok(value.order.indexOf('summary')>value.order.indexOf('focus'));
  await page.reload();await tile(page,'summary').waitFor();assert.ok((await order(page)).indexOf('summary')>(await order(page)).indexOf('focus'));assert.deepEqual(errors,[]);
 });
 await check('The corner resizes width and height live, then save and reload preserve arbitrary valid sizes',async()=>{
  const {page,errors}=await open();await edit(page);const before=await size(page,'summary');
  await dragHandle(page,page.getByRole('button',{name:'Ändra storlek på Dagens briefing',exact:true}),-110,115);
  const changed=await size(page,'summary');assert.ok(changed.width<before.width&&changed.width>=4);assert.ok(changed.height>=160&&changed.height%20===0);
  assert.equal(await page.getByLabel('Bredd för Dagens briefing',{exact:true}).inputValue(),String(changed.width));
  assert.equal(await page.getByLabel('Höjd för Dagens briefing',{exact:true}).inputValue(),String(changed.height));
  await page.screenshot({path:path.join(out,'resize-editing.png'),animations:'disabled'});
  await save(page);assert.deepEqual((await saved(page)).sizes.summary,changed);
  await page.reload();await tile(page,'summary').waitFor();assert.deepEqual(await size(page,'summary'),changed);assert.deepEqual(errors,[]);
 });
 await check('Side and bottom edges resize independently; Escape and Cancel restore the correct layout',async()=>{
  const {page,errors}=await open();await edit(page);await save(page);const original=await saved(page);await edit(page);
  const start=await size(page,'summary');await dragHandle(page,page.getByRole('button',{name:'Ändra bredd för Dagens briefing',exact:true}),-100,0);
  let next=await size(page,'summary');assert.ok(next.width<start.width);assert.equal(next.height,start.height);
  const beforeHeight=next;await dragHandle(page,page.getByRole('button',{name:'Ändra höjd för Dagens briefing',exact:true}),0,100);
  next=await size(page,'summary');assert.equal(next.width,beforeHeight.width);assert.ok(next.height>=160);
  const beforeEscape=next;const corner=page.getByRole('button',{name:'Ändra storlek på Dagens briefing',exact:true});await corner.scrollIntoViewIfNeeded();const r=await corner.boundingBox();
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x-120,r.y+110,{steps:6});
  assert.notDeepEqual(await size(page,'summary'),beforeEscape);await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await size(page,'summary'),beforeEscape);
  await page.getByRole('button',{name:'Avbryt',exact:true}).click();assert.deepEqual(await size(page,'summary'),original.sizes.summary);assert.deepEqual(await saved(page),original);assert.deepEqual(errors,[]);
 });
 await check('Keyboard resize, keyboard movement and safe size bounds work in all desktop themes',async()=>{
  for(const theme of ['light','dark','bento','bento-aurora']){
   const {page,errors}=await open({theme,width:1280});await edit(page);
   const before=await size(page,'summary');const edge=page.getByRole('button',{name:'Ändra bredd för Dagens briefing',exact:true});await edge.focus();await page.keyboard.press('ArrowRight');
   assert.equal((await size(page,'summary')).width,before.width+1);
   const bottom=page.getByRole('button',{name:'Ändra höjd för Dagens briefing',exact:true});await bottom.focus();await page.keyboard.press('ArrowDown');assert.ok((await size(page,'summary')).height>=160);
   const beforeOrder=await order(page);const grip=page.getByRole('button',{name:'Flytta Dagens briefing',exact:true});await grip.focus();await page.keyboard.press('Space');await page.locator('.home-module-drag-preview').waitFor();await page.clock.runFor(100);await page.keyboard.press('ArrowDown');await page.clock.runFor(250);await page.locator('.is-drop-target[data-module="schedule"]').waitFor();await page.keyboard.press('Space');await page.clock.runFor(250);await page.waitForFunction(()=>Number(document.querySelector('.home-module[data-module="summary"]').style.order)>0);assert.notDeepEqual(await order(page),beforeOrder);
   await page.getByRole('button',{name:'Ändra bredd för Dagens briefing',exact:true}).focus();for(let i=0;i<16;i++)await page.keyboard.press('ArrowRight');assert.equal((await size(page,'summary')).width,12);
   for(let i=0;i<16;i++)await page.keyboard.press('ArrowLeft');assert.equal((await size(page,'summary')).width,4);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
   await page.getByRole('button',{name:'Återställ',exact:true}).click();await save(page);assert.equal((await saved(page)).sizes.summary.width,8);
  }
 });
 await check('The editor preserves older size preferences, supports touch tablets and stays hidden on phones',async()=>{
  const legacy={order:['weather','summary','schedule','focus','stats','tips','agenda','nutrition','birthdays'],sizes:{weather:{width:4,height:240},summary:{width:8,height:360}}};
  const {page}=await open({layout:legacy});assert.deepEqual(await size(page,'weather'),legacy.sizes.weather);await edit(page);assert.deepEqual(await size(page,'summary'),legacy.sizes.summary);await save(page);assert.deepEqual((await saved(page)).sizes.weather,legacy.sizes.weather);
  for(const [width,height] of [[390,844],[1366,1024]]){const {page,errors}=await open({width,height,touch:true});await page.getByRole('button',{name:'Edit Home',exact:true}).waitFor({state:width>=700?'visible':'detached'});assert.equal(await page.getByRole('button',{name:'Edit Home',exact:true}).count(),width>=700?1:0);assert.equal(await page.locator('.home-module-resize').count(),0);if(width>=700){await edit(page);assert.ok(await page.locator('.home-module-resize').count()>0);assert.equal(await page.locator('.app-shell.is-desktop').count(),0)}assert.deepEqual(errors,[])}
 });
}finally{await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2))}
console.log(`${results.filter(x=>x.passed).length}/${results.length} Home layout gesture scenarios passed (${engine}).`);process.exitCode=results.every(x=>x.passed)?0:1;
})().catch(error=>{console.error(error);process.exitCode=1});
