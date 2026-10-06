const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.BROWSER_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const baseURL = process.env.APP_URL || 'http://127.0.0.1:4189';
const key = 'forma:workspace:v1:guest';
const out = path.join(__dirname, 'artifacts', 'notes', engine);
fs.mkdirSync(out, { recursive: true });
const stamp = '2026-10-06T12:00:00.000Z';
const fixture = {
  columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }, { id: 'done', title: 'Klart', color: 'gray' }, { id: 'finalized', title: 'Finalized', color: 'gray' }],
  tasks: [{ id: 'task-demo', title: 'Planera läshörnan', description: 'Min uppgift', columnId: 'todo', labels: [], checklist: [], deadline: null, comments: [], projectId: null, createdAt: stamp }],
  projects: [{ id: 'project-demo', title: 'Mitt hem', description: '', tasks: [], icon: 'home', color: 'gray', deadline: null, createdAt: stamp }],
  birthdays: [], birthdayNotifications: [], nutritionCompletions: [],
  workouts: [{ id: 'workout-demo', date: '2026-10-06', title: 'Styrkepass', rows: [{ id: 'row-demo', title: 'Knäböj', amount: '3', amountUnit: 'sets', load: '50', loadUnit: 'kg', bpm: '120' }], createdAt: stamp }],
  recipes: [{ id: 'recipe-demo', title: 'Min frukost', url: '', steps: 'Blanda ingredienserna.', labels: ['frukost'], createdAt: stamp }],
  nutritionHabits: [{ id: 'habit-demo', title: 'Vatten', amount: '2', unit: 'l', createdAt: stamp }], notes: [],
};
const results = [], errors = [];
const check = async (name, fn) => { try { await fn(); results.push({ name, passed: true }); console.log('PASS '+name); } catch (error) { results.push({ name, passed: false, error: error.message }); console.log('FAIL '+name+': '+error.message); } };
const cache = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).workspace, key);
const navNotes = async page => {
  await page.locator('.bottom-nav').getByRole('button', { name: 'Others', exact: true }).click();
  await page.getByRole('button', { name: /^Notes(?:\s|$)/ }).click();
};
const text = page => page.getByRole('textbox', { name: 'Anteckningens text', exact: true });
const openNote = async (page, title) => { await navNotes(page); await page.getByRole('button', { name: `Öppna anteckning ${title}`, exact: true }).click(); };
const newNote = async (page, title, body) => {
  await navNotes(page); await page.getByRole('button', { name: 'Ny', exact: true }).click();
  await page.getByLabel('Anteckningens titel', { exact: true }).fill(title);
  await text(page).fill(body);
};
const insert = async (page, title) => {
  await text(page).click(); await text(page).press('ControlOrMeta+End');
  await page.getByRole('button', { name: 'Lägg till länk', exact: true }).click();
  const picker = page.getByRole('dialog');
  await picker.getByRole('searchbox').fill(title);
  await picker.getByRole('button', { name: new RegExp(title) }).click();
  await picker.waitFor({ state: 'hidden' });
  await text(page).locator('a').filter({ hasText: title }).waitFor();
};

(async () => {
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true });
  const fresh = async (extra = {}, viewport = { width: 1512, height: 982 }) => {
    const context = await browser.newContext({ viewport, locale: 'sv-SE', timezoneId: 'Europe/Stockholm' });
    await context.addInitScript(({ key, workspace }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, workspace, revision: null, dirty: false })); }, { key, workspace: { ...structuredClone(fixture), ...extra } });
    const page = await context.newPage(); page.setDefaultTimeout(8000); page.on('pageerror', error => errors.push(error.message)); await page.goto(baseURL); await page.getByTestId('home-overview').waitFor();
    return { page, context };
  };
  await check('Notes autosaves title and text, survives reload and supports search and multiple notes', async () => {
    const { page, context } = await fresh();
    try {
      await newNote(page, 'Kvällstankar', 'Min första tanke.');
      assert.equal((await cache(page)).notes[0].title, 'Kvällstankar');
      assert.match((await cache(page)).notes[0].content, /Min första tanke/);
      await page.reload(); await openNote(page, 'Kvällstankar'); assert.match(await text(page).innerText(), /Min första tanke/);
      await newNote(page, 'Matidéer', 'Något gott att laga.'); await page.getByLabel('Sök anteckningar').fill('Kväll');
      assert.equal(await page.getByRole('button', { name: 'Öppna anteckning Kvällstankar', exact: true }).count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Öppna anteckning Matidéer', exact: true }).count(), 0);
      assert.deepEqual((await cache(page)).tasks, fixture.tasks);
    } finally { await context.close(); }
  });
  await check('Font, numbered lists and bullet lists are real editable formatting and persist', async () => {
    const { page, context } = await fresh();
    try {
      await newNote(page, 'Listor', 'Första steget'); await page.getByLabel('Typsnitt').selectOption('mono');
      await text(page).click(); await text(page).press('ControlOrMeta+A'); await page.getByRole('button', { name: 'Punktlista', exact: true }).click();
      await text(page).locator('ul li').waitFor(); assert.match((await cache(page)).notes[0].content, /<ul>/);
      await text(page).click(); await text(page).press('ControlOrMeta+A'); await page.getByRole('button', { name: 'Numrerad lista', exact: true }).click();
      await text(page).locator('ol li').waitFor();
      await page.reload(); await openNote(page, 'Listor'); assert.equal(await page.getByLabel('Typsnitt').inputValue(), 'mono'); await text(page).locator('ol li').waitFor();
    } finally { await context.close(); }
  });
  await check('Text links open the correct Planner card, project, workout and recipe and return to the note', async () => {
    const { page, context } = await fresh();
    try {
      await newNote(page, 'Länkar', 'Att återkomma till: ');
      for (const [title, modalTitle] of [['Planera läshörnan','Uppgift'],['Mitt hem','Mitt hem'],['Styrkepass','Redigera pass'],['Min frukost','Min frukost']]) {
        await insert(page, title); const anchor = text(page).locator('a').filter({ hasText: title });
        assert.equal(await anchor.getAttribute('contenteditable'), 'false'); await anchor.click();
        await page.getByRole('dialog').getByRole('heading', { name: modalTitle, exact: true }).waitFor();
        await page.getByRole('dialog').getByRole('button', { name: 'Stäng', exact: true }).first().click();
        await page.getByRole('button', { name: 'Till anteckningen', exact: true }).click();
        assert.equal(await page.getByLabel('Anteckningens titel').inputValue(), 'Länkar');
      }
      await page.reload(); await openNote(page, 'Länkar'); assert.equal(await text(page).locator('a').count(), 4);
    } finally { await context.close(); }
  });
  await check('Storage failure keeps the draft and retries without duplicate notes or a false saved state', async () => {
    const { page, context } = await fresh();
    try {
      await newNote(page, 'Sparande', 'Första texten');
      await page.evaluate(key => { const original = Storage.prototype.setItem; window.restoreNoteStorage = () => { Storage.prototype.setItem = original }; Storage.prototype.setItem = function (name, value) { if (name === key) throw new Error('Quota'); return original.call(this, name, value) }; }, key);
      await text(page).fill('Min text får inte försvinna.');
      await page.locator('.note-editor .note-error').waitFor(); assert.equal(await page.locator('.note-save-state').innerText(), 'Inte sparat');
      assert.match(await text(page).innerText(), /får inte försvinna/); assert.doesNotMatch((await cache(page)).notes[0].content, /försvinna/);
      await page.evaluate(() => window.restoreNoteStorage()); await page.locator('.note-editor .note-error').getByRole('button', { name: 'Försök igen' }).click();
      await page.reload(); await openNote(page, 'Sparande'); assert.match(await text(page).innerText(), /försvinna/); assert.equal((await cache(page)).notes.length, 1);
    } finally { await context.close(); }
  });
  await check('Stored markup is sanitized and two tabs preserve changes to different fields', async () => {
    const unsafe = { id:'note-unsafe', title:'Säker text', font:'system', createdAt:stamp, updatedAt:stamp, content:'<script>window.noteAttack=true</script><img src="https://example.invalid/notes-attack"><p onclick="window.noteAttack=true">Texten finns kvar.</p><a href="javascript:alert(1)">Vanlig text</a>' };
    const { page, context } = await fresh({ notes: [unsafe] });
    try {
      const requests = []; page.on('request', request => requests.push(request.url())); await openNote(page, 'Säker text');
      assert.equal(await text(page).locator('script,img,[onclick],a[href^="javascript"]').count(), 0); assert.equal(await page.evaluate(() => !!window.noteAttack), false); assert.ok(!requests.some(url => url.includes('notes-attack')));
      const b = await context.newPage(); b.setDefaultTimeout(8000); await b.goto(baseURL); await b.getByTestId('home-overview').waitFor(); await openNote(b,'Säker text');
      await page.getByLabel('Anteckningens titel').fill('Ändrad titel'); await text(b).fill('Texten från den andra fliken.');
      const saved=(await cache(page)).notes[0]; assert.equal(saved.title,'Ändrad titel'); assert.match(saved.content,/andra fliken/);
      await b.close();
    } finally { await context.close(); }
  });
  await check('320 and 440 px editors fit with visible font, lists and plus controls', async () => {
    for (const width of [320,440]) {
      const { page, context } = await fresh({}, { width, height:956 });
      try {
        await newNote(page,'Snabba anteckningar','En idé att spara.');
        const size=await page.evaluate(() => ({ width:innerWidth,scroll:document.documentElement.scrollWidth })); assert.ok(size.scroll<=size.width+1);
        for (const name of ['Punktlista','Numrerad lista','Lägg till länk']) { const box=await page.getByRole('button',{name,exact:true}).boundingBox(); assert.ok(box.width>=44 && box.height>=44) }
        await page.screenshot({path:path.join(out,`notes-${width}.png`),fullPage:false});
        await page.getByRole('button',{name:'Anteckningar',exact:true}).click(); await page.getByRole('button',{name:'Öppna anteckning Snabba anteckningar',exact:true}).click(); assert.match(await text(page).innerText(),/idé att spara/);
      } finally { await context.close(); }
    }
  });
  await check('No browser errors during Notes flows', async () => assert.deepEqual(errors,[]));
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({engine,baseURL,results,errors},null,2));
  await browser.close(); process.exitCode=results.some(result=>!result.passed)?1:0;
})().catch(error=>{console.error(error);process.exitCode=1});
