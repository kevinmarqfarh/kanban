// Independent durability and narrow-screen checks for the 2026-10-05 revision.
// Use REVISION_PHASE=before to preserve evidence from the pre-revision build.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.APP_URL || 'http://127.0.0.1:4173';
const engine = process.env.BROWSER_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const phase = process.env.REVISION_PHASE === 'before' ? 'before' : 'after';
const out = path.join(__dirname, 'artifacts', engine, phase === 'before' ? 'revision-2026-10-05' : 'revision-2026-10-06', phase);
const workspaceKey = 'forma:workspace:v1:guest';
const feedKey = 'forma:debriefs:v1:guest';
const results = [];
const errors = [];
fs.mkdirSync(out, { recursive: true });
const fixture = {
  version: 1, revision: null, dirty: false,
  workspace: {
    columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }, { id: 'doing', title: 'Pågår', color: 'blue' }, { id: 'done', title: 'Klart', color: 'green' }],
    projects: [{ id: 'review-project', title: 'En lugnare vardag', description: 'Ett tydligt nästa steg, i mitt eget tempo.', icon: 'home', color: 'sage', deadline: '2026-11-20', createdAt: '2026-10-01T09:00:00.000Z' }],
    tasks: Array.from({ length: 10 }, (_, index) => ({
      id: `rapid-${index + 1}`, title: `Kort ${index + 1} – ett litet nästa steg`, description: `Beskrivning för kort ${index + 1}.`,
      columnId: index < 6 ? 'todo' : index < 9 ? 'doing' : 'done', labels: ['Privat'],
      checklist: [{ id: `initial-${index + 1}`, title: `Första steget ${index + 1}`, completed: false }],
      deadline: '2026-11-10', comments: [], projectId: index % 2 === 0 ? 'review-project' : null,
      createdAt: '2026-10-01T09:00:00.000Z',
    })),
    birthdays: [{ id: 'review-birthday', name: 'Anna', birthDate: '1995-11-04', reminders: [], generatedReminders: [], createdAt: '2026-10-01T09:00:00.000Z' }],
  },
};
const initialReport = { id: '2026-10-05', date: '2026-10-05', title: 'Små steg för en tydligare dag', summary: 'Välj en uppgift att börja med och lämna plats för en paus.', body: 'Börja med det som är viktigast.\n\nEtt litet nästa steg räcker. Se över projektet, slutför en uppgift och låt resten vänta tills du har plats.\n\nDin tavla finns kvar när du vill fortsätta.', createdAt: '2026-10-05T09:00:00.000Z', readAt: null, dismissedAt: null };
const check = async (name, fn) => {
  try { await fn(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
};
const cache = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).workspace, workspaceKey);
const feed = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), feedKey);
const nav = async (page, label) => {
  const settings = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Inställningar', exact: true }) });
  if (label === 'Profile') {
    if (!await settings.count()) await page.getByRole('button', { name: 'Öppna inställningar', exact: true }).click();
    await settings.waitFor();
  } else {
    if (await settings.count()) await settings.getByRole('button', { name: 'Stäng', exact: true }).first().click();
    await page.locator('.bottom-nav').getByRole('button', { name: label, exact: true }).click();
  }
};
const dialog = page => page.getByRole('dialog');
const openTask = async (page, id) => {
  await page.locator(`[data-task-id="${id}"] .task-open`).click();
  await dialog(page).waitFor();
  await dialog(page).evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
};
const saveTask = async page => {
  await dialog(page).getByRole('button', { name: 'Spara ändringar', exact: true }).click();
};
const noOverflow = async page => {
  const sizes = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(sizes.scroll <= sizes.width + 1, `Page overflows: ${sizes.scroll}px > ${sizes.width}px`);
};
const capture = async (page, name) => {
  await page.evaluate(() => document.fonts.ready);
  await new Promise(resolve => setTimeout(resolve, 250));
  await page.screenshot({ path: path.join(out, name), fullPage: false, animations: 'disabled' });
};
const blockWorkspaceStorage = page => page.evaluate(key => {
  const original = Storage.prototype.setItem;
  window.__restoreRevisionStorage = () => { Storage.prototype.setItem = original; };
  Storage.prototype.setItem = function (storageKey, value) {
    if (storageKey === key) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    return original.call(this, storageKey, value);
  };
}, workspaceKey);
const noSuccessToast = async page => assert.doesNotMatch((await page.locator('.toast').allTextContents()).join(' '), /sparad|sparat|sparade|uppdaterad|skapad/i);

(async () => {
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const fresh = async (options = {}, withFeed = false) => {
    const context = await browser.newContext({ viewport: { width: 1512, height: 982 }, timezoneId: 'Europe/Stockholm', ...options });
    await context.addInitScript(({ workspaceKey, feedKey, fixture, entries }) => {
      if (!localStorage.getItem(workspaceKey)) localStorage.setItem(workspaceKey, JSON.stringify(fixture));
      if (!localStorage.getItem(feedKey)) localStorage.setItem(feedKey, JSON.stringify({ version: 1, entries, pending: {} }));
    }, { workspaceKey, feedKey, fixture, entries: withFeed ? [initialReport] : [] });
    return context;
  };
  const load = async (context, kanban = true) => {
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseURL);
    await page.getByTestId('summary-overview').waitFor();
    if (kanban) { await nav(page, 'Planner'); await page.locator('[data-task-id="rapid-1"]').waitFor(); }
    return page;
  };

  await check('Two tabs preserve a newly saved task when an older tab edits a different task', async () => {
    const context = await fresh();
    try {
      const a = await load(context);
      const b = await load(context);
      await openTask(b, 'rapid-2');
      await a.getByRole('button', { name: 'Ny uppgift', exact: true }).click();
      await dialog(a).getByLabel('Titel', { exact: true }).fill('Ett nytt kort från flik A');
      await dialog(a).getByRole('button', { name: 'Skapa uppgift', exact: true }).click();
      await dialog(b).getByLabel('Titel', { exact: true }).fill('Kort 2 redigerat i den äldre fliken');
      await saveTask(b);
      const workspace = await cache(a);
      assert.ok(workspace.tasks.some(task => task.title === 'Ett nytt kort från flik A'), 'The task saved in tab A was silently lost by tab B');
      assert.equal(workspace.tasks.find(task => task.id === 'rapid-2').title, 'Kort 2 redigerat i den äldre fliken');
      assert.equal(workspace.tasks.length, 11);
      await a.reload(); await nav(a, 'Planner');
      await a.getByRole('button', { name: 'Öppna Ett nytt kort från flik A', exact: true }).waitFor();
      assert.equal((await cache(a)).tasks.length, 11);
    } finally { await context.close(); }
  });

  await check('A stale task form preserves another tab’s change to a different field of the same card', async () => {
    const context = await fresh();
    try {
      const a = await load(context);
      const b = await load(context);
      await openTask(b, 'rapid-3');
      await openTask(a, 'rapid-3');
      await dialog(a).getByLabel(/^Beskrivning/).fill('En ny beskrivning, sparad från flik A.');
      await saveTask(a);
      await dialog(b).getByLabel('Titel', { exact: true }).fill('En ny titel, sparad från flik B');
      await saveTask(b);
      const task = (await cache(a)).tasks.find(task => task.id === 'rapid-3');
      assert.equal(task.description, 'En ny beskrivning, sparad från flik A.', 'The stale form overwrote another tab’s saved description');
      assert.equal(task.title, 'En ny titel, sparad från flik B');
    } finally { await context.close(); }
  });

  await check('A stale task editor does not resurrect a card deliberately deleted in another tab', async () => {
    const context = await fresh();
    try {
      const a = await load(context);
      const b = await load(context);
      await openTask(b, 'rapid-4');
      await openTask(a, 'rapid-4');
      await dialog(a).getByRole('button', { name: 'Ta bort uppgift', exact: true }).click();
      await dialog(a).getByRole('button', { name: 'Ta bort', exact: true }).click();
      if (await dialog(b).count()) {
        await dialog(b).getByLabel('Titel', { exact: true }).fill('En gammal form som inte ska återskapa kortet');
        await saveTask(b);
      }
      assert.ok(!(await cache(a)).tasks.some(task => task.id === 'rapid-4'), 'The deleted card was recreated by its stale editor');
      assert.equal((await cache(a)).tasks.length, 9);
    } finally { await context.close(); }
  });

  await check('Ten consecutive full-field card edits retain all data after refresh', async () => {
    const context = await fresh();
    try {
      const page = await load(context);
      for (let number = 1; number <= 10; number++) {
        await openTask(page, `rapid-${number}`);
        await dialog(page).getByLabel('Titel', { exact: true }).fill(`Reviderat kort ${number}`);
        await dialog(page).getByLabel(/^Beskrivning/).fill(`En tydlig beskrivning för steg ${number}.`);
        await dialog(page).getByLabel('Etiketter').fill('Fokus, Privat, Fokus');
        await dialog(page).getByLabel('Deadline', { exact: true }).fill(`2026-11-${String(number).padStart(2, '0')}`);
        await dialog(page).getByLabel(/^Status/).selectOption(number % 2 ? 'doing' : 'todo');
        await dialog(page).getByLabel(`Första steget ${number}`, { exact: true }).check();
        await dialog(page).getByLabel('Ny deluppgift', { exact: true }).fill(`Nästa steget ${number}`);
        await dialog(page).getByLabel('Ny kommentar', { exact: true }).fill(`Kommentar ${number} ska finnas kvar.`);
        await saveTask(page);
      }
      await page.reload(); await nav(page, 'Planner');
      const workspace = await cache(page);
      assert.equal(workspace.tasks.length, 10);
      assert.equal(new Set(workspace.tasks.map(task => task.id)).size, 10);
      for (let number = 1; number <= 10; number++) {
        const task = workspace.tasks.find(task => task.id === `rapid-${number}`);
        assert.equal(task.title, `Reviderat kort ${number}`);
        assert.equal(task.description, `En tydlig beskrivning för steg ${number}.`);
        assert.deepEqual([...task.labels].sort(), ['Fokus', 'Privat'].sort());
        assert.equal(task.labels.length, 2);
        assert.equal(task.deadline, `2026-11-${String(number).padStart(2, '0')}`);
        assert.equal(task.columnId, number % 2 ? 'doing' : 'todo');
        assert.equal(task.checklist.length, 2);
        assert.equal(task.checklist[0].completed, true);
        assert.equal(task.checklist[1].title, `Nästa steget ${number}`);
        assert.equal(task.comments.length, 1);
        assert.equal(task.comments[0].text, `Kommentar ${number} ska finnas kvar.`);
        assert.equal(task.createdAt, '2026-10-01T09:00:00.000Z');
      }
      assert.deepEqual(workspace.projects.map(({ tasks, ...project }) => project), fixture.workspace.projects);
      assert.equal(workspace.projects[0].tasks.length, fixture.workspace.tasks.filter(task => task.projectId).length);
      assert.ok(workspace.tasks.every(task => task.projectId === null));
      assert.deepEqual(workspace.birthdays, fixture.workspace.birthdays.map(birthday => ({ ...birthday, tag: birthday.tag ?? null })), 'Birthdays load unchanged apart from an explicit empty tag.');
    } finally { await context.close(); }
  });

  await check('Column create, rename and empty-column deletion preserve all saved cards', async () => {
    const context = await fresh();
    try {
      const page = await load(context);
      await page.getByRole('button', { name: 'Ny kolumn', exact: true }).click();
      await dialog(page).getByRole('textbox').fill('Väntar på nästa steg');
      await dialog(page).getByRole('button', { name: /Skapa|Lägg till/ }).click();
      await page.getByRole('button', { name: 'Redigera kolumn Väntar på nästa steg', exact: true }).click();
      await dialog(page).getByRole('textbox').fill('Pausat');
      await dialog(page).getByRole('button', { name: /Spara/ }).click();
      assert.ok((await cache(page)).columns.some(column => column.title === 'Pausat'));
      await page.getByRole('button', { name: 'Redigera kolumn Pausat', exact: true }).click();
      await dialog(page).getByRole('button', { name: 'Ta bort kolumn', exact: true }).click();
      await page.reload(); await nav(page, 'Planner');
      assert.deepEqual((await cache(page)).columns, [...fixture.workspace.columns, { id: 'finalized', title: 'Finalized', color: 'green' }]);
      assert.deepEqual((await cache(page)).tasks, fixture.workspace.tasks.map(task => ({ ...task, projectId: null })));
    } finally { await context.close(); }
  });

  if (phase === 'after') {
    await check('A newly created draft preserves another tab’s fields after quota recovery while its form stays open', async () => {
      const context = await fresh();
      try {
        const a = await load(context);
        const b = await load(context);
        await a.getByRole('button', { name: 'Ny uppgift', exact: true }).click();
        await dialog(a).getByLabel('Titel', { exact: true }).fill('Ett nytt kort som väntar på lagring');
        await dialog(a).getByLabel(/^Beskrivning/).fill('Den ursprungliga beskrivningen.');
        await blockWorkspaceStorage(a);
        await dialog(a).getByRole('button', { name: 'Skapa uppgift', exact: true }).click();
        assert.equal((await cache(a)).tasks.length, 10);
        await noSuccessToast(a);
        await a.evaluate(() => { window.__restoreRevisionStorage(); window.dispatchEvent(new Event('focus')); });
        await a.waitForFunction(key => JSON.parse(localStorage.getItem(key)).workspace.tasks.length === 11, workspaceKey);
        assert.equal(await dialog(a).count(), 1);
        const created = (await cache(a)).tasks.find(task => task.title === 'Ett nytt kort som väntar på lagring');
        await b.reload(); await nav(b, 'Planner');
        await openTask(b, created.id);
        await dialog(b).getByLabel(/^Beskrivning/).fill('Den senaste beskrivningen från flik B.');
        await dialog(b).getByLabel(/^Status/).selectOption('doing');
        await saveTask(b);
        await dialog(a).getByLabel('Titel', { exact: true }).fill('En ändrad titel från den första formen');
        await dialog(a).getByRole('button', { name: 'Skapa uppgift', exact: true }).click();
        const workspace = await cache(a);
        const saved = workspace.tasks.find(task => task.id === created.id);
        assert.equal(workspace.tasks.length, 11);
        assert.equal(saved.title, 'En ändrad titel från den första formen');
        assert.equal(saved.description, 'Den senaste beskrivningen från flik B.');
        assert.equal(saved.columnId, 'doing');
        await a.reload(); await nav(a, 'Planner');
        await a.getByRole('button', { name: 'Öppna En ändrad titel från den första formen', exact: true }).waitFor();
      } finally { await context.close(); }
    });

    await check('Task save retry creates one card, one unsent checklist item and one unsent comment', async () => {
      const context = await fresh();
      try {
        const page = await load(context);
        await page.getByRole('button', { name: 'Ny uppgift', exact: true }).click();
        await dialog(page).getByLabel('Titel', { exact: true }).fill('En uppgift som ska sparas en gång');
        await dialog(page).getByLabel(/^Beskrivning/).fill('Oskickade rader får inte dupliceras när jag försöker igen.');
        await dialog(page).getByLabel('Ny deluppgift', { exact: true }).fill('Ett oskickat checkliststeg');
        await dialog(page).getByLabel('Ny kommentar', { exact: true }).fill('En oskickad kommentar');
        await blockWorkspaceStorage(page);
        await dialog(page).getByRole('button', { name: 'Skapa uppgift', exact: true }).click();
        await page.locator('.sync-banner').getByText(/inte.*spar/i).waitFor();
        assert.equal((await cache(page)).tasks.length, 10);
        assert.equal(await dialog(page).count(), 1, 'A failed save should retain the editable draft');
        assert.equal(await dialog(page).getByLabel('Ett oskickat checkliststeg', { exact: true }).count(), 1);
        assert.equal(await dialog(page).getByText('En oskickad kommentar', { exact: true }).count(), 1);
        await noSuccessToast(page);
        await page.evaluate(() => window.__restoreRevisionStorage());
        await dialog(page).getByRole('button', { name: 'Skapa uppgift', exact: true }).click();
        await page.reload(); await nav(page, 'Planner');
        const workspace = await cache(page);
        const cards = workspace.tasks.filter(task => task.title === 'En uppgift som ska sparas en gång');
        assert.equal(workspace.tasks.length, 11);
        assert.equal(cards.length, 1);
        assert.equal(cards[0].checklist.length, 1);
        assert.equal(cards[0].checklist[0].title, 'Ett oskickat checkliststeg');
        assert.equal(cards[0].comments.length, 1);
        assert.equal(cards[0].comments[0].text, 'En oskickad kommentar');
        await page.getByRole('button', { name: 'Öppna En uppgift som ska sparas en gång', exact: true }).waitFor();
      } finally { await context.close(); }
    });

    await check('Project save retry retains one project, one main task and its exact two subtasks', async () => {
      const context = await fresh();
      try {
        const page = await load(context);
        await nav(page, 'Projects');
        await page.locator('.new-project-card').click();
        await dialog(page).getByLabel('Projektnamn', { exact: true }).fill('Projekt att sparas en gång');
        await dialog(page).getByLabel(/^Beskrivning/).fill('Huvuduppgiften ska inte skapas igen vid ett andra försök.');
        await dialog(page).getByLabel('Huvuduppgift', { exact: true }).fill('En enda huvuduppgift');
        await dialog(page).getByLabel('Deluppgifter').fill('Ett delsteg\nEtt annat delsteg');
        await blockWorkspaceStorage(page);
        await dialog(page).getByRole('button', { name: 'Skapa projekt', exact: true }).click();
        await page.locator('.sync-banner').getByText(/inte.*spar/i).waitFor();
        assert.equal((await cache(page)).projects.length, 1);
        assert.equal((await cache(page)).tasks.length, 10);
        assert.equal(await dialog(page).getByLabel('Huvuduppgift', { exact: true }).inputValue(), 'En enda huvuduppgift');
        await noSuccessToast(page);
        await page.evaluate(() => window.__restoreRevisionStorage());
        await dialog(page).getByRole('button', { name: 'Skapa projekt', exact: true }).click();
        await page.reload(); await nav(page, 'Projects');
        const workspace = await cache(page);
        const projects = workspace.projects.filter(project => project.title === 'Projekt att sparas en gång');
        assert.equal(projects.length, 1);
        assert.equal(workspace.projects.length, 2);
        const tasks = projects[0].tasks;
        assert.equal(tasks.length, 1);
        assert.equal(workspace.tasks.length, 10);
        assert.equal(tasks[0].title, 'En enda huvuduppgift');
        assert.deepEqual(tasks[0].checklist.map(item => item.title), ['Ett delsteg', 'Ett annat delsteg']);
        await page.getByRole('button', { name: 'Öppna projekt Projekt att sparas en gång', exact: true }).click();
        await dialog(page).getByText('En enda huvuduppgift', { exact: true }).waitFor();
        await dialog(page).getByLabel('Ett delsteg', { exact: true }).waitFor();
        await dialog(page).getByLabel('Ett annat delsteg', { exact: true }).waitFor();
      } finally { await context.close(); }
    });
  }

  await check('Two debrief tabs preserve imported history and read/dismiss state', async () => {
    const context = await fresh({}, true);
    try {
      const a = await load(context, false);
      const b = await load(context, false);
      await b.getByTestId('latest-debrief').getByRole('button', { name: 'Läs debriefing', exact: true }).click();
      await b.getByTestId('debrief-reader').waitFor();
      const incoming = { date: '2026-10-06', title: 'En ny dag från flik A', summary: 'Historiken ska växa.', body: 'Äldre läsning ska inte kunna skriva över den nya dagen.' };
      await a.getByLabel('Läs in debriefing', { exact: true }).setInputFiles({ name: 'next-day.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) });
      await a.waitForFunction(key => JSON.parse(localStorage.getItem(key)).entries.length === 2, feedKey);
      if (phase === 'before') {
        await b.getByTestId('debrief-reader').getByRole('button', { name: 'Dölj notis', exact: true }).click();
      } else {
        await b.getByTestId('debrief-reader').getByRole('button', { name: 'Till översikten', exact: true }).click();
        await b.getByTestId('latest-debrief').filter({ has: b.getByText(incoming.title, { exact: true }) }).waitFor();
        await b.getByTestId('latest-debrief').getByRole('button', { name: 'Dölj debriefing', exact: true }).click();
      }
      const entries = (await feed(a)).entries;
      assert.ok(entries.some(entry => entry.date === incoming.date), 'A newer imported report was lost by an older tab');
      const older = entries.find(entry => entry.date === initialReport.date);
      assert.ok(older.readAt, 'Another tab’s read state was lost');
      if (phase === 'before') assert.ok(older.dismissedAt);
      else {
        assert.equal(older.dismissedAt, null);
        assert.ok(entries.find(entry => entry.date === incoming.date).dismissedAt);
      }
      await a.reload();
      assert.equal((await feed(a)).entries.length, 2);
    } finally { await context.close(); }
  });

  await check('Fresh desktop, iPhone and 320 px views fit all four destinations and task forms', async () => {
    for (const width of [1512, 440, 320]) {
      const isPhone = width < 760;
      const context = await fresh({ viewport: { width, height: isPhone ? 956 : 982 }, isMobile: isPhone, hasTouch: isPhone, deviceScaleFactor: isPhone ? 3 : 1 }, true);
      try {
        const page = await load(context, false);
        for (const label of ['Home', 'Planner', 'Projects', 'Others']) {
          await nav(page, label);
          await noOverflow(page);
          const navSize = await page.locator('.bottom-nav').boundingBox();
          assert.ok(navSize.x >= 0 && navSize.x + navSize.width <= width + 1);
          await capture(page, `${width}-${label.toLowerCase()}-light.png`);
        }
        await nav(page, 'Planner');
        await openTask(page, 'rapid-1');
        const box = await dialog(page).boundingBox();
        assert.ok(box.x >= -1 && box.x + box.width <= width + 1, `Task form exceeds ${width}px viewport`);
        if (isPhone) {
          assert.ok(await dialog(page).getByLabel('Titel', { exact: true }).evaluate(input => parseFloat(getComputedStyle(input).fontSize) >= 16));
          const selectSizes = await dialog(page).locator('select').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
          assert.ok(selectSizes.every(height => height >= 44));
        }
        await capture(page, `${width}-task-form-light.png`);
        await dialog(page).getByRole('button', { name: 'Stäng', exact: true }).click();
        await nav(page, 'Home');
        { await page.getByRole('button', { name: 'Öppna inställningar', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Mörkt', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Stäng', exact: true }).last().click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); }
        await noOverflow(page);
        await capture(page, `${width}-summary-dark.png`);
      } finally { await context.close(); }
    }
  });

  await check('No uncaught exceptions during the full revision checks', async () => assert.deepEqual(errors, []));
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ baseURL, engine, phase, results, errors }, null, 2));
  await browser.close();
  process.exitCode = results.some(result => !result.passed) ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
