const assert = require('node:assert/strict')
const { chromium, webkit } = require('playwright')
const key = 'forma:workspace:v1:guest'
const stamp = '2026-10-17T08:00:00Z'
const recipe = { id: 'soup', title: 'Linssoppa', url: '', steps: 'Koka linserna.', labels: ['middag'], createdAt: stamp }
const workspace = { columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }, { id: 'done', title: 'Klart', color: 'green' }], tasks: [], projects: [], recipes: [recipe, { ...recipe, id: 'pasta', title: 'Pasta', labels: ['lunch'] }] }
;(async () => {
 const engine = process.env.BROWSER_ENGINE === 'webkit' ? webkit : chromium
 const browser = await engine.launch({ headless: true, ...(engine === chromium ? { channel: 'chrome' } : {}) })
 try {
  for (const width of [1280, 390]) {
   const context = await browser.newContext({ viewport: { width, height: 900 } })
   await context.addInitScript(({key,workspace}) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({version:1,workspace,revision:null,dirty:false})) }, {key,workspace})
   const page = await context.newPage(); const errors=[]
   page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(10000)
   async function openRecipes() {
    await page.getByTestId('home-overview').waitFor()
    await page.locator('.bottom-nav').getByRole('button',{name:'Others',exact:true}).click()
    await page.locator('.others-module-list').getByRole('button',{name:/^Recept/}).click()
   }
   await page.goto(process.env.APP_URL || 'http://127.0.0.1:4187'); await openRecipes()
   const row = () => page.locator('[data-recipe-id="soup"]')
   await row().getByRole('button',{name:'Lägg till Linssoppa bland favoriter'}).click()
   assert.equal(await row().getByRole('button',{name:'Ta bort Linssoppa från favoriter'}).getAttribute('aria-pressed'),'true')
   assert.equal(await page.getByRole('dialog').count(),0,'Heart must not open the recipe')
   const view = () => page.getByRole('group',{name:'Visa recept',exact:true})
   await view().getByRole('button',{name:/Favoriter/}).click()
   assert.equal(await page.locator('[data-recipe-id]').count(),1)
   const labels = () => page.locator('select').filter({has:page.getByRole('option',{name:'Alla kök och etiketter',exact:true})})
   await labels().selectOption('lunch')
   await page.getByText('Inga favoriter med den etiketten.').waitFor()
   await labels().selectOption('')
   await row().getByRole('button',{name:'Öppna recept Linssoppa'}).click()
   const dialog = () => page.getByRole('dialog')
   await dialog().getByRole('button',{name:'Ta bort Linssoppa från favoriter'}).click()
   await dialog().getByRole('button',{name:'Lägg till Linssoppa bland favoriter'}).waitFor()
   await dialog().getByRole('button',{name:'Lägg till Linssoppa bland favoriter'}).click()
   await dialog().getByRole('button',{name:'Redigera',exact:true}).click()
   await dialog().getByLabel('Titel',{exact:true}).fill('God linssoppa')
   await dialog().getByRole('button',{name:'Spara recept',exact:true}).click()
   await dialog().waitFor({state:'hidden'})
   await page.reload(); await openRecipes()
   await view().getByRole('button',{name:/Favoriter/}).click()
   assert.equal(await page.locator('[data-recipe-id]').count(),1)
   assert.equal(await row().getByRole('button',{name:'Ta bort God linssoppa från favoriter'}).getAttribute('aria-pressed'),'true')
   const stored = await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).workspace.recipes,key)
   assert.equal(stored.find(r=>r.id==='soup').favorite,true)
   assert.equal(stored.find(r=>r.id==='soup').steps,recipe.steps)
   await page.evaluate(()=>document.fonts.ready); await page.waitForTimeout(350)
   await page.screenshot({animations:'disabled',path:`/private/tmp/forma-favorites-${width}.png`})
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow')
   // Existing persistence keeps a pending in-memory edit and offers retry on quota failure.
   await page.evaluate(key => { const original = Storage.prototype.setItem; window.restoreStorage=()=>Storage.prototype.setItem=original; Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('Quota exceeded','QuotaExceededError');return original.call(this,k,v)} },key)
   await row().getByRole('button',{name:'Ta bort God linssoppa från favoriter'}).click()
   await page.locator('.others-error[role="alert"]').waitFor()
   assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).workspace.recipes.find(r=>r.id==='soup').favorite,key),true,'Failed write must not alter stored data')
   await page.evaluate(()=>window.restoreStorage())
   await page.locator('.sync-banner').getByRole('button',{name:'Försök igen',exact:true}).click()
   await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).workspace.recipes.find(r=>r.id==='soup').favorite===false,key)
   await page.reload(); await openRecipes()
   await view().getByRole('button',{name:/Favoriter/}).click()
   await page.getByText('Inga favoriter ännu.',{exact:false}).waitFor()
   assert.deepEqual(errors,[])
   console.log(`PASS favorites: ${width}px; list/detail toggle, label filters, edit, reload, failed save, remove and empty state`)
   await context.close()
  }
 } finally { await browser.close() }
})().catch(error=>{console.error(error);process.exitCode=1})
