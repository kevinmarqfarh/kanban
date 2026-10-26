const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const playwright = require('playwright');
const { routeWeather } = require('./helpers/weather-mock.cjs');
const engine = process.env.BROWSER_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const key = 'forma:workspace:v1:guest', out = path.join(__dirname,'artifacts',engine,'recipe-editing');
fs.mkdirSync(out,{recursive:true});
const catalog = {};
new Function('exports',ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/recipeCatalog.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(catalog);
const recipe = catalog.recipeCatalog[0], image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=';
const fixture = { columns:[{id:'todo',title:'Att göra',color:'gray'},{id:'done',title:'Klart',color:'green'},{id:'finalized',title:'Finalized',color:'green'}],projects:[],tasks:[],birthdays:[],recipes:[],cuisineCookbooksOrganized:true,cookbooks:[{id:'book',title:'Mina middagar',recipeIds:[recipe.id],createdAt:recipe.createdAt}] };
const contexts = new Set(), results = []; let browser;
const cache = page => page.evaluate(key=>JSON.parse(localStorage.getItem(key)).workspace,key);
const dialog = page => page.getByRole('dialog');
async function fresh(extra={},width=1440) {
 const context=await browser.newContext({viewport:{width,height:950},hasTouch:width<1100,locale:'sv-SE',timezoneId:'Europe/Stockholm',serviceWorkers:'block'});contexts.add(context);
 await routeWeather(context,{},'2026-10-26T09:00:00+01:00');
 await context.addInitScript(({key,workspace})=>{const NativeDate=Date,stamp=new NativeDate('2026-10-26T09:00:00+01:00').getTime();class TestDate extends NativeDate{constructor(...args){super(...(args.length?args:[stamp]))}static now(){return stamp}}window.Date=TestDate;if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({version:1,revision:null,dirty:false,workspace}));localStorage.setItem('forma-theme','bento-space-gray')},{key,workspace:{...fixture,...extra}});
 return context;
}
async function load(context,book=false) {
 const page=await context.newPage();page.setDefaultTimeout(10000);page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));
 await page.goto(base);await page.locator('.loading-notice').waitFor({state:'detached'});
 await page.locator('.bottom-nav').getByRole('button',{name:'Others',exact:true}).click();await page.getByRole('button',{name:/^Recept(?:\s|$)/}).click();
 await page.getByRole('button',{name:book?'Öppna kokbok Mina middagar':/^Alla recept/,...(book?{exact:true}:{})}).click();return page;
}
async function open(page,id=recipe.id){await page.locator(`[data-recipe-id="${id}"]`).getByRole('button',{name:/^Öppna recept/}).click();await dialog(page).waitFor()}
async function edit(page,id=recipe.id){await open(page,id);assert.equal(await dialog(page).getByRole('button',{name:'Skapa egen kopia',exact:true}).count(),0);await dialog(page).getByRole('button',{name:'Redigera',exact:true}).click();await page.getByRole('dialog',{name:'Redigera recept',exact:true}).waitFor()}
async function save(page){await dialog(page).getByRole('button',{name:'Spara recept',exact:true}).click();await dialog(page).waitFor({state:'detached'})}
async function check(name,fn){try{await fn();for(const c of contexts)for(const p of c.pages())assert.deepEqual(p.errors,[]);results.push({name,passed:true});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:String(error.stack)});console.log('FAIL '+name+': '+error.stack);for(const c of contexts)for(const p of c.pages())await p.screenshot({path:path.join(out,`failure-${results.length}.png`),animations:'disabled'}).catch(()=>{})}finally{for(const c of contexts)await c.close();contexts.clear()}}
(async()=>{browser=await playwright[engine].launch({headless:true});try{
 await check('Catalog recipes edit in place on PC and mobile, retaining IDs, favorites, images and cookbook membership after reload',async()=>{
  for(const width of [1440,390]){
   const c=await fresh({recipes:[{...recipe,favorite:true,image}]},width),page=await load(c,true);
   const before=await cache(page);await edit(page);
   await dialog(page).getByLabel('Titel',{exact:true}).fill('Min bön- och majsgryta');await dialog(page).getByLabel('Ingredienser',{exact:true}).fill('400 g bönor\n200 g majs');
   await dialog(page).getByLabel('Gör så här',{exact:true}).fill('Sjud bönorna. Tillsätt majsen.');await dialog(page).getByLabel('Övrigt',{exact:true}).fill('Två portioner, 25 minuter.');
   await dialog(page).getByLabel('Inspiration',{exact:true}).fill('https://example.org/min-gryta');
   await dialog(page).getByRole('button',{name:'Lägg till etikett',exact:true}).click();const tag=dialog(page).getByRole('textbox',{name:'Lägg till etikett',exact:true});await tag.fill('Min variant');await tag.press('Enter');
   await save(page);let saved=await cache(page);assert.equal(saved.recipes.length,1);const entry=saved.recipes[0];assert.equal(entry.id,recipe.id);assert.equal(entry.catalogEdited,true);assert.equal(entry.favorite,true);assert.equal(entry.image,image);assert.equal(entry.createdAt,recipe.createdAt);assert.ok(entry.labels.includes('Min variant'));assert.deepEqual(saved.cookbooks,before.cookbooks);
   await page.reload();await page.locator('.loading-notice').waitFor({state:'detached'});await page.locator('.bottom-nav').getByRole('button',{name:'Others',exact:true}).click();await page.getByRole('button',{name:/^Recept(?:\s|$)/}).click();await page.getByRole('button',{name:/^Alla recept/}).click();
   assert.equal(await page.locator('.recipe-list-row').count(),100);await open(page);await page.getByRole('heading',{name:entry.title,exact:true}).waitFor();await dialog(page).getByText('Övrigt och inspiration',{exact:true}).click();assert.match(await dialog(page).innerText(),/400 g bönor/);assert.match(await dialog(page).innerText(),/Sjud bönorna/);assert.match(await dialog(page).innerText(),/Två portioner/);
   assert.equal(await dialog(page).getByRole('link',{name:/Inspiration/}).getAttribute('href'),entry.url);
   await dialog(page).getByRole('button',{name:/^Ta bort .* från favoriter$/}).click();await dialog(page).getByRole('button',{name:'Redigera',exact:true}).click();assert.equal(await dialog(page).getByLabel('Titel',{exact:true}).inputValue(),entry.title);
   await dialog(page).getByRole('button',{name:'Ta bort bild',exact:true}).click();await save(page);saved=await cache(page);assert.equal(saved.recipes[0].favorite,false);assert.equal(saved.recipes[0].image,undefined);assert.equal(saved.recipes[0].ingredients,entry.ingredients);assert.equal(saved.recipes.length,1);
   await page.screenshot({path:path.join(out,`edited-${width}.png`),animations:'disabled'});
  }
 });
 await check('First edits in two tabs merge title and method changes without creating copies or losing a favorite',async()=>{
  const c=await fresh(),a=await load(c),b=await load(c);await edit(a);await edit(b);
  await dialog(a).getByLabel('Gör så här',{exact:true}).fill('Stegen från den första fliken.');await save(a);
  await open(a);await dialog(a).getByRole('button',{name:/^Lägg till .* bland favoriter$/}).click();
  await dialog(b).getByLabel('Titel',{exact:true}).fill('Titeln från den andra fliken');await save(b);
  const entries=(await cache(b)).recipes;assert.equal(entries.length,1);assert.equal(entries[0].id,recipe.id);assert.equal(entries[0].title,'Titeln från den andra fliken');assert.equal(entries[0].steps,'Stegen från den första fliken.');assert.equal(entries[0].favorite,true);
  await b.reload();assert.equal((await cache(b)).recipes.length,1);
 });
 await check('Cancel leaves the catalog untouched and quota retry preserves the edited draft, saving once',async()=>{
  const c=await fresh(),page=await load(c);await edit(page);await dialog(page).getByRole('button',{name:'Avbryt',exact:true}).click();await dialog(page).waitFor({state:'detached'});assert.deepEqual((await cache(page)).recipes,[]);
  await edit(page);await dialog(page).getByLabel('Ingredienser',{exact:true}).fill('Mina nya ingredienser.');
  await page.evaluate(key=>{const original=Storage.prototype.setItem;window.restoreRecipeStorage=()=>{Storage.prototype.setItem=original};Storage.prototype.setItem=function(name,value){if(name===key)throw new DOMException('Quota exceeded','QuotaExceededError');return original.call(this,name,value)}},key);
  await dialog(page).getByRole('button',{name:'Spara recept',exact:true}).click();await dialog(page).getByRole('alert').waitFor();assert.equal(await dialog(page).getByLabel('Ingredienser',{exact:true}).inputValue(),'Mina nya ingredienser.');assert.deepEqual((await cache(page)).recipes,[]);
  await page.evaluate(()=>window.restoreRecipeStorage());await save(page);const entries=(await cache(page)).recipes;assert.equal(entries.length,1);assert.equal(entries[0].id,recipe.id);assert.equal(entries[0].ingredients,'Mina nya ingredienser.');
 });
 await check('Deleting a personal recipe in another tab still prevents a stale editor from recreating it',async()=>{
  const personal={...recipe,id:'my-recipe',title:'Mitt egna recept'},c=await fresh({recipes:[personal]}),a=await load(c),b=await load(c);await open(a,personal.id);await edit(b,personal.id);
  await dialog(a).getByRole('button',{name:'Ta bort recept',exact:true}).click();await dialog(a).waitFor({state:'detached'});
  await dialog(b).getByLabel('Titel',{exact:true}).fill('Ett gammalt utkast');await dialog(b).getByRole('button',{name:'Spara recept',exact:true}).click();await dialog(b).getByRole('alert').filter({hasText:/tagits bort/}).waitFor();assert.deepEqual((await cache(b)).recipes,[]);
 });
}finally{await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2))}console.log(`${results.filter(r=>r.passed).length}/${results.length} recipe editing scenarios passed (${engine}).`);process.exitCode=results.every(r=>r.passed)?0:1})().catch(error=>{console.error(error);process.exitCode=1});
