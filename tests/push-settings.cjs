const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const ref = 'rucwlpzrumxejvhwazat';
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const endpoint = 'https://push.example.invalid/endpoint';
const now = new Date('2026-10-28T10:00:00+01:00');
(async () => {
 const browser = await (process.env.BROWSER_ENGINE === 'webkit' ? webkit : chromium).launch();
 const context = await browser.newContext({ viewport: {width: 390,height:844}, serviceWorkers:'block' });
 let saved=null, testCalls=0;
 await context.addInitScript(({ref,owner,endpoint})=>{
  const expiry=Math.floor(Date.now()/1000)+3600;
  const jwt=btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify({sub:owner,exp:expiry,role:'authenticated'}))+'.test';
  localStorage.setItem(`sb-${ref}-auth-token`,JSON.stringify({access_token:jwt,refresh_token:'test-refresh',token_type:'bearer',expires_at:expiry,expires_in:3600,user:{id:owner,email:'test@example.invalid'}}));
  let current=null;
  const fakeWorker={pushManager:{getSubscription:async()=>current,subscribe:async()=>{current={endpoint,toJSON:()=>({keys:{p256dh:'public-key',auth:'auth-key'}}),unsubscribe:async()=>{current=null;return true}};return current}}};
  Object.defineProperty(navigator.serviceWorker,'ready',{configurable:true,get:()=>Promise.resolve(fakeWorker)});
  Object.defineProperty(Notification,'permission',{configurable:true,get:()=>current?'granted':'default'});
  Notification.requestPermission=async()=>'granted';
 },{ref,owner,endpoint});
 await context.route(`https://${ref}.supabase.co/**`,async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname.includes('/auth/v1/user'))return route.fulfill({json:{id:owner,email:'test@example.invalid'}});
  if(url.pathname.includes('/functions/v1/forma-push')){const body=req.postDataJSON();if(body.action==='public-key')return route.fulfill({json:{publicKey:'B'.repeat(87)}});if(body.action==='test'){testCalls++;return route.fulfill({json:{ok:true}})}}
  if(url.pathname.includes('forma_push_subscriptions')){
   if(req.method()==='GET')return route.fulfill({json:saved});
   if(req.method()==='POST'){saved={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',...req.postDataJSON()};return route.fulfill({json:saved})}
   if(req.method()==='PATCH'){saved={...saved,...req.postDataJSON()};return route.fulfill({json:saved})}
   if(req.method()==='DELETE'){saved=null;return route.fulfill({status:204,body:''})}
  }
  if(url.pathname.includes('kanban_workspaces'))return route.fulfill({json:[]});
  if(url.pathname.includes('daily_debriefs'))return route.fulfill({json:[]});
  return route.fulfill({json:[]});
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:now});await page.goto(base);await page.getByRole('button',{name:'Öppna inställningar'}).click();
 const card=page.locator('section[aria-labelledby="push-settings-title"]');
 await card.getByRole('button',{name:'Aktivera notiser'}).click();
 await card.getByText('Notiser är aktiva på den här enheten.').waitFor();assert(saved && saved.user_id===owner);
 await card.getByRole('checkbox',{name:'Uppgifter med deadline'}).uncheck();assert.equal(saved.tasks,false);
 await card.getByRole('button',{name:'Skicka testnotis'}).click();assert.equal(testCalls,1);
 await card.getByRole('button',{name:'Stäng av på enheten'}).click();assert.equal(saved,null);
 assert.deepEqual(errors,[]);console.log('PASS push settings: activation, save, test, deactivation');
 await browser.close();
})().catch(error=>{console.error(error);process.exitCode=1});
