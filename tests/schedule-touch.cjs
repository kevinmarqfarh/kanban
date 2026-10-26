const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch();const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173');await page.locator('.bottom-nav').getByRole('button',{name:'Schema',exact:true}).tap();
 const cdp=await context.newCDPSession(page);const box=await page.locator('.schedule-scroll').boundingBox();const x=box.x+100,y=box.y+20;
 const touch=(type,px,py)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x:px,y:py}]});
 await touch('touchStart',x,y);await page.waitForTimeout(420);await touch('touchMove',x,y+44);await page.waitForTimeout(100);await touch('touchEnd');
 const dialog=page.getByRole('dialog');await dialog.waitFor({timeout:5000});assert.equal(await dialog.getByLabel('Från',{exact:true}).inputValue(),'08:00');assert.equal(await dialog.getByLabel('Till',{exact:true}).inputValue(),'09:30');await dialog.getByRole('button',{name:'Avbryt',exact:true}).tap();
 const before=await page.locator('.schedule-scroll').evaluate(el=>el.scrollTop);
 await touch('touchStart',x,y+70);await page.waitForTimeout(40);await touch('touchMove',x,y+45);await page.waitForTimeout(40);await touch('touchMove',x,y+15);await page.waitForTimeout(40);await touch('touchEnd');await page.waitForTimeout(500);
 console.log('scroll',before,await page.locator('.schedule-scroll').evaluate(el=>el.scrollTop));
 assert.equal(await page.getByRole('dialog').count(),0);assert.ok(await page.locator('.schedule-scroll').evaluate(el=>el.scrollTop)>before);assert.deepEqual(errors,[]);
 console.log('PASS emulated iPhone touch hold+drag and ordinary scroll');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
