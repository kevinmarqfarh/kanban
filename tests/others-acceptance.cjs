// Independent, isolated checks for Home / Planner / Projects / Others.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.BROWSER_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const baseURL = process.env.APP_URL || 'http://127.0.0.1:4173';
const out = path.join(__dirname, 'artifacts', engine, 'others-2026-10-06');
const key = 'forma:workspace:v1:guest';
const today = '2026-12-30';
const timestamp = '2026-10-06T12:00:00.000Z';
const results = [], errors = [];
fs.mkdirSync(out, { recursive: true });
const core = {
  columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }, { id: 'doing', title: 'Pågår', color: 'blue' }, { id: 'done', title: 'Klart', color: 'green' }],
  projects: [{ id: 'old-project', title: 'Mitt sparade projekt', description: 'Finns kvar även när Others används.', icon: 'home', color: 'sage', deadline: '2027-01-15', createdAt: timestamp }],
  tasks: [{ id: 'old-task', title: 'Min sparade uppgift', description: 'Alla mina ursprungliga fält.', columnId: 'todo', labels: ['Privat'], checklist: [{ id: 'old-step', title: 'Ett tydligt steg', completed: true }], deadline: '2027-01-10', comments: [{ id: 'old-comment', text: 'Bevara kommentaren.', createdAt: timestamp }], projectId: 'old-project', createdAt: timestamp }],
  birthdays: [],
};
const workout = { id: 'workout-one', title: 'Mitt första pass', date: today, rows: [{ id: 'exercise-one', title: 'Knäböj', amount: '3', amountUnit: 'sets', load: '50', loadUnit: 'kg', bpm: '120' }], createdAt: timestamp };
const habit = { id: 'habit-one', title: 'Vatten', amount: '2', unit: 'l', createdAt: timestamp };
const recipe = { id: 'recipe-one', title: 'Min pasta', url: 'https://example.org/recept', steps: 'Koka pasta.\nBlanda med grönsaker.', labels: ['middag'], createdAt: timestamp };
const week53 = ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'];
const completionId = (id, date) => `nutrition:${id}:${date}`;
const check = async (name, fn) => { try { await fn(); results.push({ name, passed: true }); console.log(`PASS ${name}`); } catch (error) { results.push({ name, passed: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`); } };
const cache = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).workspace, key);
const dialog = page => page.getByRole('dialog');
const nav = async (page, name) => {
  const settings = dialog(page).filter({ has: page.getByRole('heading', { name: 'Inställningar', exact: true }) });
  if (await settings.count()) await settings.getByRole('button', { name: 'Stäng', exact: true }).first().click();
  await page.locator('.bottom-nav').getByRole('button', { name, exact: true }).click();
};
const menuNames = { workout: 'Träning', nutrition: 'Kost', recipes: 'Recept' };
const openSection = async (page, name) => { await nav(page, 'Others'); await page.getByRole('button', { name: new RegExp('^' + menuNames[name] + '(?:\\s|$)') }).click(); };
const waitDialog = async page => { await dialog(page).waitFor(); await dialog(page).evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished))); };
const closeDialog = async page => { await dialog(page).getByRole('button', { name: 'Stäng', exact: true }).first().click(); await dialog(page).waitFor({ state: 'hidden' }); };
const fillExercise = async (page, index, row) => {
  await dialog(page).getByLabel(`Övning ${index}`, { exact: true }).fill(row.title);
  await dialog(page).getByLabel(`Mängd övning ${index}`, { exact: true }).fill(row.amount);
  await dialog(page).getByLabel(`Mängdenhet övning ${index}`, { exact: true }).selectOption(row.amountUnit);
  await dialog(page).getByLabel(`Belastning övning ${index}`, { exact: true }).fill(row.load);
  await dialog(page).getByLabel(`Belastningsenhet övning ${index}`, { exact: true }).selectOption(row.loadUnit);
  await dialog(page).getByLabel(`BPM övning ${index}`, { exact: true }).fill(row.bpm);
};
const newWorkout = async (page, title = 'Mitt sparade styrkepass') => {
  await page.getByRole('button', { name: 'Nytt pass', exact: true }).click(); await waitDialog(page);
  await dialog(page).getByLabel(/^Titel/).fill(title); await dialog(page).getByLabel('Datum', { exact: true }).fill(today);
  await fillExercise(page, 1, { title: 'Knäböj', amount: '3', amountUnit: 'sets', load: '52.5', loadUnit: 'kg', bpm: '130' });
};
const saveWorkout = async page => { await dialog(page).getByRole('button', { name: 'Spara pass', exact: true }).click(); await dialog(page).waitFor({ state: 'hidden' }); };
const editWorkout = async (page, id = workout.id) => { await page.locator(`[data-workout-id="${id}"]`).getByRole('button', { name: /^Redigera pass/ }).click(); await waitDialog(page); };
const newHabit = async (page, title = 'Grönsaker', amount = '300', unit = 'g') => {
  await page.getByRole('button', { name: 'Ny kostvana', exact: true }).click(); await waitDialog(page);
  await dialog(page).getByLabel('Titel', { exact: true }).fill(title); await dialog(page).getByLabel('Mängd', { exact: true }).fill(amount); await dialog(page).getByLabel(/^Enhet/).selectOption(unit);
};
const saveHabit = async page => { await dialog(page).getByRole('button', { name: 'Spara', exact: true }).click(); await dialog(page).waitFor({ state: 'hidden' }); };
const editHabit = async (page, title = habit.title) => { await page.getByRole('button', { name: `Redigera kostvana ${title}`, exact: true }).click(); await waitDialog(page); };
const newRecipe = async (page, title = 'Min egna frukost') => {
  await page.getByRole('button', { name: 'Nytt recept', exact: true }).click(); await waitDialog(page); await dialog(page).getByLabel('Titel', { exact: true }).fill(title);
};
const addRecipeLabel = async (page, text) => { await dialog(page).getByRole('button', { name: 'Lägg till etikett', exact: true }).click(); const box = dialog(page).getByRole('textbox', { name: 'Lägg till etikett', exact: true }); await box.fill(text); await box.press('Enter'); };
const saveRecipe = async page => { await dialog(page).getByRole('button', { name: 'Spara recept', exact: true }).click(); await dialog(page).waitFor({ state: 'hidden' }); };
const openRecipe = async (page, id = recipe.id) => { await page.locator(`[data-recipe-id="${id}"]`).click(); await waitDialog(page); };
const editRecipe = async (page, id = recipe.id) => { await openRecipe(page, id); await dialog(page).getByRole('button', { name: 'Redigera', exact: true }).click(); await waitDialog(page); };
const blockStorage = page => page.evaluate(key => {
  const original = Storage.prototype.setItem; window.__restoreOthersStorage = () => { Storage.prototype.setItem = original; };
  Storage.prototype.setItem = function (name, value) { if (name === key) throw new DOMException('Quota exceeded', 'QuotaExceededError'); return original.call(this, name, value); };
}, key);
const noSavedToast = async page => assert.doesNotMatch((await page.locator('.toast').allTextContents()).join(' '), /sparad|sparat|sparade|skapad|uppdaterad/i);
const expectedBoardTasks = core.tasks.map(task => ({ ...task, projectId: null }));
const expectedProjects = core.projects.map(project => ({ ...project, tasks: core.tasks.filter(task => task.projectId === project.id).map(({ columnId, projectId, ...task }) => ({ ...task, completed: columnId === 'done' })) }));
const preserveCore = async page => { const saved = await cache(page); assert.deepEqual(saved.tasks, expectedBoardTasks); assert.deepEqual(saved.projects, expectedProjects); assert.deepEqual(saved.columns, [...core.columns, { id: 'finalized', title: 'Finalized', color: 'green' }]); };
const completed = (workspace, id, date) => workspace.nutritionCompletions?.find(item => item.habitId === id && item.date === date)?.completed ?? false;
const noOverflow = async page => { const sizes = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth })); assert.ok(sizes.scroll <= sizes.width + 1, `Document overflows: ${sizes.scroll} > ${sizes.width}`); };
const screenshot = async (page, name) => { await page.evaluate(() => document.fonts.ready); await new Promise(resolve => setTimeout(resolve, 200)); await page.screenshot({ path: path.join(out, name), fullPage: false, animations: 'disabled' }); };

(async () => {
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true });
  const fresh = async (extra = {}, options = {}) => {
    const workspace = { ...structuredClone(core), workouts: [], nutritionHabits: [], nutritionCompletions: [], recipes: [], ...structuredClone(extra) };
    const context = await browser.newContext({ viewport: { width: 1512, height: 982 }, timezoneId: 'Europe/Stockholm', locale: 'sv-SE', ...options });
    // One context-wide date stub keeps two tabs on the same day without a second
    // Playwright clock installation replacing WebKit's shared clock controller.
    await context.addInitScript(({ key, workspace, now }) => {
      const NativeDate = Date; const millis = new NativeDate(now).getTime();
      class TestDate extends NativeDate { constructor(...args) { super(...(args.length ? args : [millis])); } static now() { return millis; } }
      window.Date = TestDate;
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, workspace, revision: null, dirty: false }));
    }, { key, workspace, now: `${today}T12:00:00+01:00` });
    return context;
  };
  const load = async context => { const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message)); await page.goto(baseURL); await page.getByTestId('home-overview').waitFor(); return page; };
  const withPage = async (extra, fn) => { const context = await fresh(extra); try { const page = await load(context); await fn(page); } finally { await context.close(); } };

  await check('Home is default, the footer has four exact views, and settings, sync status and theme live behind the upper-right gear', async () => {
    await withPage({}, async page => {
      assert.equal(await page.locator('.bottom-nav button').count(), 4);
      for (const name of ['Home', 'Planner', 'Projects', 'Others']) assert.equal(await page.locator('.bottom-nav').getByRole('button', { name, exact: true }).count(), 1);
      assert.equal(await page.locator('.bottom-nav').getByRole('button', { name: 'Home', exact: true }).getAttribute('aria-current'), 'page');
      assert.equal(await page.locator('.bottom-nav').getByRole('button', { name: /Profile/ }).count(), 0);
      const gear = page.getByRole('button', { name: 'Öppna inställningar', exact: true }); const box = await gear.boundingBox(); assert.ok(box.x > 756 && box.y < 90, 'The gear sits in the upper-right corner.'); assert.equal(await page.locator('.topbar .sync-indicator').count(), 0, 'Sync status lives in settings only.'); assert.equal(await page.getByRole('button', { name: /Byt till (mörkt|ljust) tema/ }).count(), 0, 'Theme is chosen in settings only.');
      await gear.focus(); await page.keyboard.press('Enter'); await waitDialog(page); await dialog(page).getByRole('heading', { name: 'Inställningar', exact: true }).waitFor(); await page.keyboard.press('Escape');
      assert.equal(await gear.evaluate(element => element === document.activeElement), true);
      await nav(page, 'Others'); for (const name of ['Födelsedagar', 'Träning', 'Kost', 'Recept']) await page.getByRole('button', { name: new RegExp('^' + name + '(?:\\s|$)') }).waitFor();
      await preserveCore(page);
      await page.setViewportSize({ width: 440, height: 956 });
      await nav(page, 'Home');
      await page.evaluate(() => window.scrollTo(0, 300));
      assert.ok(await page.evaluate(() => scrollY > 0), 'The pre-reload Home page must actually scroll.');
      await page.reload(); await page.getByTestId('home-overview').waitFor();
      assert.equal(await page.evaluate(() => scrollY), 0, 'A reload starts Home at the top instead of carrying over another view’s scroll.');
    });
  });

  await check('Workout row CRUD retains every field, date, units and exact raw copied text after reload', async () => {
    await withPage({}, async page => {
      await openSection(page, 'workout'); await newWorkout(page);
      await dialog(page).getByRole('button', { name: 'Lägg till övning', exact: true }).click();
      await fillExercise(page, 2, { title: 'Löpning', amount: '20', amountUnit: 'min', load: '2.5', loadUnit: 'time', bpm: '145' });
      await dialog(page).getByRole('button', { name: 'Lägg till övning', exact: true }).click(); await dialog(page).getByRole('button', { name: 'Ta bort övning 3', exact: true }).click(); await saveWorkout(page);
      const [saved] = (await cache(page)).workouts; assert.equal(saved.date, today); assert.equal(saved.title, 'Mitt sparade styrkepass'); assert.equal(saved.rows.length, 2);
      const { id: firstId, ...first } = saved.rows[0], { id: secondId, ...second } = saved.rows[1];
      assert.deepEqual(first, { title: 'Knäböj', amount: '3', amountUnit: 'sets', load: '52.5', loadUnit: 'kg', bpm: '130' });
      assert.deepEqual(second, { title: 'Löpning', amount: '20', amountUnit: 'min', load: '2.5', loadUnit: 'time', bpm: '145' }); assert.notEqual(firstId, secondId);
      await page.reload(); await openSection(page, 'workout'); await editWorkout(page, saved.id); assert.equal(await dialog(page).getByLabel('BPM övning 2', { exact: true }).inputValue(), '145'); await closeDialog(page);
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__workoutCopy = text; } } }));
      await page.getByRole('button', { name: 'Kopiera råtext för Mitt sparade styrkepass', exact: true }).click();
      const text = await page.evaluate(() => window.__workoutCopy); assert.equal(text, 'Mitt sparade styrkepass · 2026-12-30\nKnäböj · 3 sets · 52.5 kg · 130 BPM\nLöpning · 20 min · 2.5 min · 145 BPM');
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Unavailable'); } } }));
      await page.getByRole('button', { name: 'Kopiera råtext för Mitt sparade styrkepass', exact: true }).click(); assert.equal(await page.getByLabel('Råtext för träningspass', { exact: true }).inputValue(), text); await preserveCore(page);
    });
  });

  await check('Swedish keyboard decimal minutes retain their numeric value in the saved workout', async () => {
    await withPage({}, async page => {
      await openSection(page, 'workout'); await newWorkout(page, 'Ett pass med decimalminuter');
      await dialog(page).getByLabel('Belastningsenhet övning 1', { exact: true }).selectOption('time');
      const input = dialog(page).getByLabel('Belastning övning 1', { exact: true });
      await input.fill(''); await input.pressSequentially('2,5');
      assert.equal(await input.inputValue(), '2,5', 'Typing decimal minutes must preserve the user’s comma without becoming 25 minutes');
      await saveWorkout(page); await page.reload();
      const [saved] = (await cache(page)).workouts; assert.equal(saved.rows[0].load, '2,5'); assert.equal(saved.rows[0].loadUnit, 'time'); await openSection(page, 'workout'); await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__decimalCopy = text; } } })); await page.getByRole('button', { name: 'Kopiera råtext för Ett pass med decimalminuter', exact: true }).click(); assert.match(await page.evaluate(() => window.__decimalCopy), /2,5 min/);
      await preserveCore(page);
    });
  });

  await check('Workout empty rows are rejected and deliberate deletion removes only the selected pass', async () => {
    await withPage({ workouts: [workout] }, async page => {
      await openSection(page, 'workout'); await page.getByRole('button', { name: 'Nytt pass', exact: true }).click(); await waitDialog(page); await dialog(page).getByRole('button', { name: 'Spara pass', exact: true }).click();
      assert.equal((await cache(page)).workouts.length, 1); assert.equal(await dialog(page).getByLabel('Övning 1', { exact: true }).evaluate(input => input.validity.valueMissing), true); await closeDialog(page);
      await editWorkout(page); await dialog(page).getByRole('button', { name: 'Ta bort pass', exact: true }).click(); assert.equal((await cache(page)).workouts.length, 1); await dialog(page).getByRole('button', { name: 'Behåll', exact: true }).click();
      await dialog(page).getByRole('button', { name: 'Ta bort pass', exact: true }).click(); await dialog(page).getByRole('button', { name: 'Ta bort', exact: true }).click(); await page.reload(); assert.deepEqual((await cache(page)).workouts, []); await preserveCore(page);
    });
  });

  await check('Workout quota failure retains the draft and retry creates exactly one pass', async () => {
    await withPage({}, async page => {
      await openSection(page, 'workout'); await newWorkout(page, 'Ett pass vid lagringsfel'); await blockStorage(page); await dialog(page).getByRole('button', { name: 'Spara pass', exact: true }).click();
      assert.deepEqual((await cache(page)).workouts, []); assert.equal(await dialog(page).getByLabel('Belastning övning 1', { exact: true }).inputValue(), '52.5'); await dialog(page).getByRole('alert').waitFor(); await noSavedToast(page);
      await page.evaluate(() => window.__restoreOthersStorage()); await saveWorkout(page); await page.reload(); const entries = (await cache(page)).workouts; assert.equal(entries.length, 1); assert.equal(entries[0].title, 'Ett pass vid lagringsfel'); assert.equal(entries[0].rows.length, 1); await preserveCore(page);
    });
  });

  await check('Two workout tabs preserve a new pass and another tab’s changed exercise fields', async () => {
    const context = await fresh({ workouts: [workout] });
    try {
      const a = await load(context), b = await load(context); await openSection(a, 'workout'); await openSection(b, 'workout'); await editWorkout(b);
      await editWorkout(a); await dialog(a).getByLabel('Belastning övning 1', { exact: true }).fill('65'); await saveWorkout(a); await newWorkout(a, 'Ett nytt pass från flik A'); await saveWorkout(a);
      await dialog(b).getByLabel(/^Titel/).fill('Titeln från den äldre fliken'); await saveWorkout(b);
      const entries = (await cache(a)).workouts; assert.equal(entries.length, 2); assert.equal(entries.find(entry => entry.id === workout.id).title, 'Titeln från den äldre fliken'); assert.equal(entries.find(entry => entry.id === workout.id).rows[0].load, '65'); await a.reload(); assert.equal((await cache(a)).workouts.length, 2); await preserveCore(a);
    } finally { await context.close(); }
  });

  await check('Nutrition follows ISO weeks across the year boundary and permits exact historical date selection', async () => {
    await withPage({ nutritionHabits: [habit] }, async page => {
      await openSection(page, 'nutrition'); assert.equal(await page.locator('.nutrition-week-heading strong').textContent(), 'Vecka 53 · 2026');
      assert.deepEqual(await page.locator('.nutrition-day').evaluateAll(elements => elements.map(element => element.dataset.date)), week53);
      assert.equal(await page.getByLabel('Välj datum', { exact: true }).inputValue(), today);
      await page.getByRole('button', { name: 'Nästa vecka', exact: true }).click(); assert.equal(await page.locator('.nutrition-week-heading strong').textContent(), 'Vecka 1 · 2027');
      await page.getByRole('button', { name: 'Föregående vecka', exact: true }).click(); assert.equal(await page.getByLabel('Välj datum', { exact: true }).inputValue(), today);
      await page.getByLabel('Välj datum', { exact: true }).fill('2025-12-31'); assert.equal(await page.locator('.nutrition-week-heading strong').textContent(), 'Vecka 1 · 2026');
      await page.getByRole('button', { name: 'Idag', exact: true }).click(); assert.equal(await page.getByLabel('Välj datum', { exact: true }).inputValue(), today); await preserveCore(page);
    });
  });

  await check('Nutrition completion is date-specific, green, shared with Home and persistent with weekly history', async () => {
    await withPage({ nutritionHabits: [habit] }, async page => {
      await openSection(page, 'nutrition'); await page.getByRole('checkbox', { name: 'Klarmarkera Vatten', exact: true }).check();
      const row = page.locator(`[data-habit-id="${habit.id}"]`); assert.match(await row.getAttribute('class'), /completed/); const stripe = await row.evaluate(element => getComputedStyle(element).borderLeftColor); const channels = stripe.match(/\d+/g).map(Number); assert.ok(channels[1] > channels[0] && channels[1] > channels[2], 'Completed nutrition needs its visible green stripe'); assert.equal(completed(await cache(page), habit.id, today), true);
      await page.locator('.nutrition-day[data-date="2026-12-29"]').click(); assert.equal(await page.getByRole('checkbox', { name: 'Klarmarkera Vatten', exact: true }).isChecked(), false); await page.getByRole('checkbox', { name: 'Klarmarkera Vatten', exact: true }).check();
      await nav(page, 'Home'); const home = page.locator(`[data-home-habit-id="${habit.id}"]`); assert.match(await home.getAttribute('class'), /is-complete/); assert.equal(await home.getByRole('checkbox').isChecked(), true);
      assert.equal(await page.locator('.home-week-day[data-date="2026-12-29"]').getAttribute('aria-label'), 'Tis 2026-12-29: 1 av 1 klara, allt klart'); assert.equal(await page.locator('.home-week-day[data-date="2026-12-30"]').getAttribute('aria-label'), 'Ons 2026-12-30: 1 av 1 klara, allt klart');
      await home.getByRole('checkbox').uncheck(); assert.equal(completed(await cache(page), habit.id, today), false); assert.equal(completed(await cache(page), habit.id, '2026-12-29'), true); await home.getByRole('checkbox').check();
      await page.reload(); assert.equal(await page.getByRole('checkbox', { name: 'Klar idag: Vatten', exact: true }).isChecked(), true); await openSection(page, 'nutrition'); await page.getByLabel('Välj datum', { exact: true }).fill('2026-12-29'); assert.equal(await page.getByRole('checkbox', { name: 'Klarmarkera Vatten', exact: true }).isChecked(), true);
      assert.equal(new Set((await cache(page)).nutritionCompletions.map(entry => entry.id)).size, 2); assert.equal((await cache(page)).nutritionCompletions.find(entry => entry.date === today).id, completionId(habit.id, today)); await preserveCore(page);
    });
  });

  await check('Nutrition habit fields edit and delete deliberately without orphaned completions', async () => {
    await withPage({}, async page => {
      await openSection(page, 'nutrition'); await newHabit(page); await saveHabit(page); let [saved] = (await cache(page)).nutritionHabits; assert.equal(saved.amount, '300'); assert.equal(saved.unit, 'g');
      await page.getByRole('checkbox', { name: 'Klarmarkera Grönsaker', exact: true }).check(); await editHabit(page, 'Grönsaker'); await dialog(page).getByLabel('Titel', { exact: true }).fill('Grönsaker varje dag'); await dialog(page).getByLabel('Mängd', { exact: true }).fill('2.5'); await dialog(page).getByLabel(/^Enhet/).selectOption('portion'); await saveHabit(page);
      await page.reload(); await openSection(page, 'nutrition'); [saved] = (await cache(page)).nutritionHabits; assert.equal(saved.title, 'Grönsaker varje dag'); assert.equal(saved.amount, '2.5'); assert.equal(saved.unit, 'portion'); assert.equal(await page.getByRole('checkbox', { name: 'Klarmarkera Grönsaker varje dag', exact: true }).isChecked(), true);
      await editHabit(page, saved.title); await dialog(page).getByRole('button', { name: 'Ta bort kostvana', exact: true }).click(); assert.equal((await cache(page)).nutritionHabits.length, 1); await dialog(page).getByRole('button', { name: 'Ta bort', exact: true }).click(); await page.reload(); assert.deepEqual((await cache(page)).nutritionHabits, []); assert.deepEqual((await cache(page)).nutritionCompletions, []); await preserveCore(page);
    });
  });

  await check('Nutrition quota failure and retry retain one habit and one stable completion', async () => {
    await withPage({}, async page => {
      await openSection(page, 'nutrition'); await newHabit(page, 'Vitamin', '1', 'st'); await blockStorage(page); await dialog(page).getByRole('button', { name: 'Spara', exact: true }).click(); assert.deepEqual((await cache(page)).nutritionHabits, []); await dialog(page).getByRole('alert').waitFor(); await noSavedToast(page);
      await page.evaluate(() => window.__restoreOthersStorage()); await saveHabit(page); const [saved] = (await cache(page)).nutritionHabits; assert.equal((await cache(page)).nutritionHabits.length, 1);
      await blockStorage(page); await page.getByRole('checkbox', { name: 'Klarmarkera Vitamin', exact: true }).check(); assert.equal((await cache(page)).nutritionCompletions.length, 0); await page.locator('.others-error').waitFor(); await noSavedToast(page);
      await page.evaluate(() => window.__restoreOthersStorage()); await page.locator('.sync-banner').getByRole('button', { name: 'Försök igen', exact: true }).click(); await page.reload(); const entries = (await cache(page)).nutritionCompletions; assert.equal(entries.length, 1); assert.equal(entries[0].id, completionId(saved.id, today)); assert.equal(entries[0].completed, true); await preserveCore(page);
    });
  });

  await check('Two nutrition tabs preserve new habits and different dates’ completion history', async () => {
    const context = await fresh({ nutritionHabits: [habit] });
    try {
      const a = await load(context), b = await load(context); await openSection(a, 'nutrition'); await openSection(b, 'nutrition'); await b.getByLabel('Välj datum', { exact: true }).fill('2026-12-29');
      await a.getByRole('checkbox', { name: 'Klarmarkera Vatten', exact: true }).check(); await newHabit(a, 'Frukt', '2', 'st'); await saveHabit(a); await b.getByRole('checkbox', { name: 'Klarmarkera Vatten', exact: true }).check();
      const workspace = await cache(a); assert.equal(workspace.nutritionHabits.length, 2); assert.ok(workspace.nutritionHabits.some(entry => entry.title === 'Frukt')); assert.equal(completed(workspace, habit.id, today), true); assert.equal(completed(workspace, habit.id, '2026-12-29'), true); assert.equal(workspace.nutritionCompletions.length, 2); await a.reload(); assert.equal((await cache(a)).nutritionCompletions.length, 2); await preserveCore(a);
    } finally { await context.close(); }
  });

  await check('Manual and URL recipes preserve steps, predefined and own labels as literal text', async () => {
    await withPage({}, async page => {
      await openSection(page, 'recipes'); await newRecipe(page); const steps = 'Rör ihop havre.\n\n<h1>Vanlig text</h1>\n<img src="x" onerror="window.__recipeExecuted=true">';
      await dialog(page).getByLabel(/^Steg/).fill(steps); await dialog(page).getByRole('button', { name: 'Frukost', exact: true }).click(); await dialog(page).getByRole('button', { name: 'Snacks', exact: true }).click(); for (const label of ['Vegetariskt', 'Snabbt', 'snabbt']) await addRecipeLabel(page, label); await saveRecipe(page);
      const [manual] = (await cache(page)).recipes; assert.equal(manual.url, ''); assert.equal(manual.steps, steps); assert.deepEqual(manual.labels, ['frukost', 'snacks', 'Vegetariskt', 'Snabbt']);
      await newRecipe(page, 'Recept med sparad källa'); await dialog(page).getByLabel('Länk', { exact: true }).fill('https://example.org/recept?portioner=2'); await dialog(page).getByLabel(/^Steg/).fill('Mina egna steg för den sparade källan.'); await dialog(page).getByRole('button', { name: 'Middag', exact: true }).click(); await saveRecipe(page);
      await page.reload(); await openSection(page, 'recipes'); await openRecipe(page, manual.id); assert.equal(await dialog(page).locator('.recipe-steps').textContent(), steps); assert.equal(await dialog(page).locator('.recipe-steps img, .recipe-steps h1, .recipe-steps script').count(), 0); assert.equal(await page.evaluate(() => !!window.__recipeExecuted), false); assert.equal(await dialog(page).getByRole('link').count(), 0); await closeDialog(page);
      const linked = (await cache(page)).recipes.find(entry => entry.title === 'Recept med sparad källa'); await openRecipe(page, linked.id); const link = dialog(page).getByRole('link', { name: 'Öppna länk' }); assert.equal(await link.getAttribute('href'), linked.url); assert.equal(await link.getAttribute('rel'), 'noopener noreferrer'); await closeDialog(page); await preserveCore(page);
    });
  });

  await check('Unsafe or malformed recipe URLs never create a record', async () => {
    await withPage({}, async page => {
      await openSection(page, 'recipes'); await newRecipe(page, 'En länk som måste valideras');
      for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'ftp://example.org/recept', 'https://user:password@example.org/recept', 'inte en länk']) {
        await dialog(page).getByLabel('Länk', { exact: true }).fill(url); await dialog(page).getByRole('button', { name: 'Spara recept', exact: true }).click(); assert.deepEqual((await cache(page)).recipes, []); assert.equal(await dialog(page).count(), 1);
      }
      await dialog(page).getByLabel('Länk', { exact: true }).fill('http://example.org/recept'); await saveRecipe(page); assert.equal((await cache(page)).recipes.length, 1); await preserveCore(page);
    });
  });

  await check('Recipe quota retry retains the typed link, steps and labels and saves exactly once', async () => {
    await withPage({}, async page => {
      await openSection(page, 'recipes'); await newRecipe(page, 'Ett recept vid lagringsfel'); await dialog(page).getByLabel('Länk', { exact: true }).fill('https://example.org/recept'); await dialog(page).getByLabel(/^Steg/).fill('Alla mina egna steg.'); await addRecipeLabel(page, 'Egen'); await blockStorage(page); await dialog(page).getByRole('button', { name: 'Spara recept', exact: true }).click();
      assert.deepEqual((await cache(page)).recipes, []); assert.equal(await dialog(page).getByLabel(/^Steg/).inputValue(), 'Alla mina egna steg.'); await dialog(page).getByRole('alert').waitFor(); await noSavedToast(page); await page.evaluate(() => window.__restoreOthersStorage()); await saveRecipe(page); await page.reload(); const [saved] = (await cache(page)).recipes; assert.equal((await cache(page)).recipes.length, 1); assert.equal(saved.steps, 'Alla mina egna steg.'); assert.equal(saved.url, 'https://example.org/recept'); assert.deepEqual(saved.labels, ['Egen']); await preserveCore(page);
    });
  });

  await check('Two recipe tabs preserve new recipes and another tab’s changed steps', async () => {
    const context = await fresh({ recipes: [recipe] });
    try {
      const a = await load(context), b = await load(context); await openSection(a, 'recipes'); await openSection(b, 'recipes'); await editRecipe(b); await editRecipe(a); await dialog(a).getByLabel(/^Steg/).fill('De senaste stegen från flik A.'); await saveRecipe(a); await newRecipe(a, 'Ett extra recept från flik A'); await saveRecipe(a); await dialog(b).getByLabel('Titel', { exact: true }).fill('Titeln från flik B'); await saveRecipe(b);
      const entries = (await cache(a)).recipes; assert.equal(entries.length, 2); assert.equal(entries.find(entry => entry.id === recipe.id).title, 'Titeln från flik B'); assert.equal(entries.find(entry => entry.id === recipe.id).steps, 'De senaste stegen från flik A.'); await a.reload(); assert.equal((await cache(a)).recipes.length, 2); await preserveCore(a);
    } finally { await context.close(); }
  });

  await check('Stale editors never resurrect a workout, nutrition habit or recipe deleted in another tab', async () => {
    const context = await fresh({ workouts: [workout], nutritionHabits: [habit], recipes: [recipe] });
    try {
      const a = await load(context), b = await load(context);
      await openSection(a, 'workout'); await openSection(b, 'workout'); await editWorkout(b); await editWorkout(a);
      await dialog(a).getByRole('button', { name: 'Ta bort pass', exact: true }).click(); await dialog(a).getByRole('button', { name: 'Ta bort', exact: true }).click();
      await dialog(b).getByLabel(/^Titel/).fill('En gammal passform'); await dialog(b).getByRole('button', { name: 'Spara pass', exact: true }).click(); await dialog(b).getByRole('alert').filter({ hasText: /tagits bort/ }).waitFor(); assert.deepEqual((await cache(a)).workouts, []); await closeDialog(b);
      await openSection(a, 'nutrition'); await openSection(b, 'nutrition'); await editHabit(b); await editHabit(a);
      await dialog(a).getByRole('button', { name: 'Ta bort kostvana', exact: true }).click(); await dialog(a).getByRole('button', { name: 'Ta bort', exact: true }).click();
      await dialog(b).getByLabel('Titel', { exact: true }).fill('En gammal kostform'); await dialog(b).getByRole('button', { name: 'Spara', exact: true }).click(); await dialog(b).getByRole('alert').filter({ hasText: /tagits bort/ }).waitFor(); assert.deepEqual((await cache(a)).nutritionHabits, []); await closeDialog(b);
      await openSection(a, 'recipes'); await openSection(b, 'recipes'); await editRecipe(b); await openRecipe(a);
      await dialog(a).getByRole('button', { name: 'Ta bort recept', exact: true }).click(); await dialog(a).getByRole('button', { name: 'Ta bort', exact: true }).click();
      await dialog(b).getByLabel('Titel', { exact: true }).fill('En gammal receptform'); await dialog(b).getByRole('button', { name: 'Spara recept', exact: true }).click(); await dialog(b).getByRole('alert').filter({ hasText: /tagits bort/ }).waitFor(); assert.deepEqual((await cache(a)).recipes, []); await closeDialog(b);
      await a.reload(); await preserveCore(a); assert.deepEqual((await cache(a)).workouts, []); assert.deepEqual((await cache(a)).nutritionHabits, []); assert.deepEqual((await cache(a)).recipes, []);
    } finally { await context.close(); }
  });

  await check('Recipe deletion is deliberate and backup includes every new collection with original workspace fields', async () => {
    await withPage({ recipes: [recipe], workouts: [workout], nutritionHabits: [habit], nutritionCompletions: [{ id: completionId(habit.id, today), habitId: habit.id, date: today, completed: true }] }, async page => {
      await openSection(page, 'recipes'); await openRecipe(page); await dialog(page).getByRole('button', { name: 'Ta bort recept', exact: true }).click(); assert.equal((await cache(page)).recipes.length, 1); await dialog(page).getByRole('button', { name: 'Behåll', exact: true }).click(); await closeDialog(page);
      await page.getByRole('button', { name: 'Öppna inställningar', exact: true }).click(); await waitDialog(page); const downloadEvent = page.waitForEvent('download'); await dialog(page).getByRole('button', { name: 'Exportera säkerhetskopia', exact: true }).click(); const download = await downloadEvent; await download.saveAs(path.join(out, 'complete-backup.json')); const { debriefs, ...saved } = JSON.parse(fs.readFileSync(path.join(out, 'complete-backup.json'), 'utf8')); assert.deepEqual(saved, await cache(page)); assert.deepEqual(debriefs, []); await closeDialog(page);
      await openRecipe(page); await dialog(page).getByRole('button', { name: 'Ta bort recept', exact: true }).click(); await dialog(page).getByRole('button', { name: 'Ta bort', exact: true }).click(); await page.reload(); assert.deepEqual((await cache(page)).recipes, []); assert.deepEqual((await cache(page)).workouts, [workout]); await preserveCore(page);
    });
  });

  await check('Fresh 1512, 440 and 320 px Home and Others views fit in light and dark themes', async () => {
    for (const width of [1512, 440, 320]) {
      const mobile = width < 760;
      const context = await fresh({ workouts: [workout], nutritionHabits: [habit], nutritionCompletions: [{ id: completionId(habit.id, today), habitId: habit.id, date: today, completed: true }], recipes: [recipe], birthdays: [{ id: 'birthday-one', name: 'Anna', birthDate: '1995-01-15', reminders: ['month'], generatedReminders: [], createdAt: timestamp }] }, { viewport: { width, height: mobile ? 956 : 982 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
      try {
        const page = await load(context);
        for (const theme of ['light', 'dark']) {
          await page.getByRole('button', { name: 'Öppna inställningar', exact: true }).click(); await waitDialog(page); await dialog(page).getByRole('button', { name: theme === 'light' ? 'Ljust' : 'Mörkt', exact: true }).click(); await closeDialog(page);
          for (const name of ['Home', 'Planner', 'Projects', 'Others']) { await nav(page, name); await noOverflow(page); await screenshot(page, `${width}-${name.toLowerCase()}-${theme}.png`); }
          for (const section of ['workout', 'nutrition', 'recipes']) { await openSection(page, section); await noOverflow(page); await screenshot(page, `${width}-${section}-${theme}.png`); }
        }
        await openSection(page, 'workout'); await editWorkout(page); const box = await dialog(page).boundingBox(); assert.ok(box.x >= -1 && box.x + box.width <= width + 1); await noOverflow(page);
        if (mobile) {
          const sizes = await dialog(page).locator('input').evaluateAll(elements => elements.map(element => parseFloat(getComputedStyle(element).fontSize))); assert.ok(sizes.every(size => size >= 16));
          const heights = await dialog(page).locator('select, .modal-footer button').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height)); assert.ok(heights.every(height => height >= 44));
          assert.ok((await page.locator('.bottom-nav button').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height))).every(height => height >= 44));
        }
        await screenshot(page, `${width}-workout-form-dark.png`); await closeDialog(page); await openSection(page, 'recipes'); await editRecipe(page); await noOverflow(page); await screenshot(page, `${width}-recipe-form-dark.png`); await closeDialog(page);
      } finally { await context.close(); }
    }
  });

  await check('No uncaught browser exceptions occur in the new Others and Home flows', async () => assert.deepEqual(errors, []));
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ baseURL, engine, fixedDate: today, results, errors }, null, 2)); await browser.close(); process.exitCode = results.some(result => !result.passed) ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
