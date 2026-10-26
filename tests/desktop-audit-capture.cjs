// Isolated, repeatable PC product-review evidence. Never loads the user's browser profile.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { routeWeather } = require('./helpers/weather-mock.cjs');
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const phase = process.env.AUDIT_PHASE || process.argv[2] || 'after';
const out = path.join(__dirname, '..', 'docs', 'desktop-audit', phase);
const key = 'forma:workspace:v1:guest';
const now = '2026-10-26T09:00:00+01:00';
const createdAt = '2026-10-01T09:00:00.000Z';
const task = (id, title, extra = {}) => ({ id, title, description: '', columnId: 'todo', labels: [], checklist: [], deadline: null, comments: [], projectId: null, createdAt, ...extra });
const projectTask = (id, title, completed = false) => ({ id, title, completed, description: 'Samla underlag och fatta ett tydligt beslut.', labels: ['Hem'], checklist: [{ id: id+'-a', title: 'Samla alternativ', completed: true }, { id: id+'-b', title: 'Jämför och välj', completed: false }], deadline: '2026-11-06', comments: [], createdAt });
const fixture = { version: 1, revision: null, dirty: false, workspace: {
  columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }, { id: 'doing', title: 'Pågår', color: 'blue' }, { id: 'done', title: 'Klart', color: 'green' }, { id: 'finalized', title: 'Finalized', color: 'green', collapsed: true }],
  tasks: [
    task('strategy', 'Skriv arbetsplan för november', { priority: 'high', deadline: '2026-10-27', description: 'Avsätt tid för mål, prioriteringar och ett första utkast.', labels: ['Jobb', 'Planering'], checklist: [{ id: 'strategy-a', title: 'Samla underlag', completed: true }, { id: 'strategy-b', title: 'Skriv ett första utkast', completed: false }] }),
    task('dentist', 'Boka tandläkartid', { deadline: '2026-10-23', priority: 'medium', labels: ['Privat'] }),
    task('receipts', 'Gå igenom månadens kvitton', { deadline: '2026-10-30', labels: ['Ekonomi'] }),
    task('paint', 'Välj väggfärg till arbetsrummet', { labels: ['Hem'], checklist: [{ id: 'paint-a', title: 'Beställ färgprover', completed: false }] }),
    task('read', 'Läs rapporten före fredagens möte', { priority: 'high', deadline: '2026-10-30', labels: ['Jobb'] }),
    task('call', 'Ring mamma och planera helgen', { labels: ['Familj'] }),
    task('morning', 'Veckostart med teamet', { columnId: 'doing', schedule: { date: '2026-10-26', startTime: '09:00', endTime: '09:45' }, priority: 'high', labels: ['Jobb'] }),
    task('customer', 'Avstämning med kund', { schedule: { date: '2026-10-26', startTime: '09:30', endTime: '10:15' }, labels: ['Jobb'] }),
    task('focus', 'Färdigställ projektförslaget', { columnId: 'doing', schedule: { date: '2026-10-26', startTime: '10:30', endTime: '12:00' }, priority: 'high', deadline: '2026-10-26', labels: ['Jobb', 'Fokus'] }),
    task('walk', 'Lunchpromenad', { schedule: { date: '2026-10-26', startTime: '12:00', endTime: '12:30' }, labels: ['Hälsa'] }),
    task('groceries', 'Handla till veckans middagar', { schedule: { date: '2026-10-26', startTime: '17:00', endTime: '18:00' }, labels: ['Hem'] }),
    task('review', 'Granska designsystemet', { schedule: { date: '2026-10-27', startTime: '09:00', endTime: '11:00' }, priority: 'medium', labels: ['Jobb'] }),
    task('gym', 'Styrkepass efter jobbet', { schedule: { date: '2026-10-27', startTime: '17:30', endTime: '18:30' }, labels: ['Träning'] }),
    task('budget', 'Gå igenom novemberbudgeten', { schedule: { date: '2026-10-28', startTime: '10:00', endTime: '11:00' }, labels: ['Ekonomi'] }),
    task('planning', 'Planera nästa sprint', { schedule: { date: '2026-10-29', startTime: '13:00', endTime: '14:00' }, priority: 'high', labels: ['Jobb'] }),
    task('report', 'Skicka veckans statusrapport', { schedule: { date: '2026-10-30', startTime: '15:00', endTime: '16:00' }, deadline: '2026-10-30', deadlineTime: '16:30', labels: ['Jobb'] }),
    task('saturday', 'Middag med vänner', { schedule: { date: '2026-10-31', startTime: '18:00', endTime: '21:00' }, labels: ['Vänner'] }),
    task('sunday', 'En lugn söndagspromenad', { schedule: { date: '2026-11-01' }, labels: ['Hälsa'] }),
    task('week-food', 'Planera veckans mat', { schedule: { date: '2026-10-26', scope: 'week' }, labels: ['Hem'] }),
    task('week-paper', 'Sortera papper och avtal', { schedule: { date: '2026-10-26', scope: 'week' }, labels: ['Privat'] }),
    task('week-reading', 'Läs tre kapitel', { schedule: { date: '2026-10-26', scope: 'week' }, labels: ['Personligt'] }),
    task('done-a', 'Betala oktoberfakturorna', { columnId: 'done', labels: ['Ekonomi'] }),
    task('done-b', 'Boka resan till Köpenhamn', { columnId: 'done', labels: ['Resa'] }),
    task('archive', 'Ordna höstens försäkringar', { columnId: 'finalized' }),
  ],
  projects: [
    { id: 'office', title: 'Ett bättre arbetsrum', description: 'Skapa en lugn plats för fokuserat arbete med bra ljus, förvaring och plats för idéer.', icon: 'home', color: 'sage', deadline: '2026-11-20', createdAt, tasks: [projectTask('measure', 'Mät rummet och skissa möbleringen', true), projectTask('light', 'Välj belysning till skrivbordet'), projectTask('storage', 'Planera förvaring och kabeldragning'), projectTask('order', 'Beställ skrivbord och stol')] },
    { id: 'trip', title: 'En helg i Köpenhamn', description: 'Tåg, hotell och några platser att längta till.', icon: 'compass', color: 'sand', deadline: '2026-11-13', createdAt, tasks: [projectTask('train', 'Boka tågbiljetter', true), projectTask('hotel', 'Välj hotell', true), projectTask('places', 'Samla caféer och museer')] },
    { id: 'fitness', title: 'Hållbar träningsrutin', description: 'Tre pass i veckan och tid för återhämtning.', icon: 'dumbbell', color: 'sage', deadline: null, createdAt, tasks: [projectTask('sessions', 'Planera höstens träningspass'), projectTask('equipment', 'Se över utrustningen', true)] },
    { id: 'finance', title: 'Lugnare ekonomi', description: 'En enkel budget med plats för sparande.', icon: 'piggy-bank', color: 'sand', deadline: '2026-12-01', createdAt, tasks: [projectTask('savings', 'Sätt upp ett månadssparande')] },
    { id: 'website', title: 'Uppdatera portfolion', description: 'Välj projekt, skriv texter och publicera.', icon: 'code', color: 'sage', deadline: '2026-11-30', createdAt, tasks: [projectTask('copy', 'Skriv projektbeskrivningar'), projectTask('images', 'Välj bilder')] },
  ],
  birthdays: [{ id: 'birthday-a', name: 'Sofia', birthDate: '1991-10-29', tag: 'Vänner', reminders: ['week'], generatedReminders: [], createdAt }, { id: 'birthday-b', name: 'Pappa', birthDate: '1963-11-02', tag: 'Familj', reminders: ['week'], generatedReminders: [], createdAt }], birthdayNotifications: [],
  nutritionHabits: [{ id: 'water', title: 'Vatten', amount: '2', unit: 'l', time: 'anytime', createdAt }, { id: 'vitamin', title: 'D-vitamin', amount: '1', unit: 'st', time: 'morning', createdAt }, { id: 'magnesium', title: 'Magnesium', amount: '1', unit: 'st', time: 'evening', createdAt }], nutritionCompletions: [{ id: 'nutrition:vitamin:2026-10-26', habitId: 'vitamin', date: '2026-10-26', completed: true }],
  notes: [{ id: 'weekly-note', title: 'Veckans fokus', content: '<p><b>En lugn start på november.</b></p><p>Avsluta projektförslaget och ge arbetsrummet lite mer omtanke. Lägg möten på förmiddagar och skydda tid för koncentration.</p><ul><li>Arbetsplan klar på tisdag.</li><li>Beställ lampan efter att proverna kommit.</li><li>Lämna fredagseftermiddagen fri för efterarbete.</li></ul>', font: 'system', pinned: true, createdAt, updatedAt: createdAt }, { id: 'ideas', title: 'Idéer till arbetsrummet', content: '<p>Varmt ljus, en matta och plats för böcker. Håll färgskalan lugn med ek, grått och grönt.</p>', font: 'serif', createdAt, updatedAt: createdAt }, { id: 'travel', title: 'Köpenhamn – platser att besöka', content: '<p>Designmuseum, en lång promenad i Nørrebro och kaffe på söndagen.</p>', font: 'system', createdAt, updatedAt: createdAt }],
  workouts: [], recipes: [], overtime: [], cookbooks: [],
} };

fs.mkdirSync(out, { recursive: true });
const manifest = { capturedAt: new Date().toISOString(), base, phase, fixture: { tasks: fixture.workspace.tasks.length, projects: fixture.workspace.projects.length, notes: fixture.workspace.notes.length }, captures: [], errors: [] };
const nav = (page, label) => page.locator('.bottom-nav').getByRole('button', { name: label, exact: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const modes = [
      { width: 1440, height: 900, theme: 'light', all: true },
      { width: 1280, height: 800, theme: 'light', all: true },
      { width: 1920, height: 1080, theme: 'light', all: true },
      { width: 1440, height: 900, theme: 'dark', all: false },
      { width: 1440, height: 900, theme: 'bento', all: false },
      { width: 1440, height: 900, theme: 'bento-aurora', all: false },
    ];
    for (const mode of modes) {
      const context = await browser.newContext({ viewport: { width: mode.width, height: mode.height }, deviceScaleFactor: 1, hasTouch: false, serviceWorkers: 'block', locale: 'sv-SE', timezoneId: 'Europe/Stockholm' });
      await routeWeather(context, {}, now);
      await context.addInitScript(({ key, fixture, theme }) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(fixture));
        localStorage.setItem('forma-theme', theme);
        localStorage.setItem('forma-homescreen', 'off');
        localStorage.removeItem('forma-planner-view');
      }, { key, fixture, theme: mode.theme });
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      page.on('pageerror', error => manifest.errors.push({ mode, error: error.message }));
      await page.clock.install({ time: new Date(now) });
      await page.goto(base);
      await page.locator('.loading-notice').waitFor({ state: 'detached' });
      await page.locator('.app-shell.is-desktop').waitFor();
      const capture = async (name, full = false) => {
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => window.scrollTo(0, 0));
        const file = `${mode.width}x${mode.height}-${mode.theme}-${name}.png`;
        await page.screenshot({ path: path.join(out, file), animations: 'disabled', fullPage: false });
        const measure = await page.evaluate(() => {
          const rect = selector => { const e = document.querySelector(selector); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
          const font = selector => { const e = document.querySelector(selector); return e ? { fontSize: getComputedStyle(e).fontSize, color: getComputedStyle(e).color, lineHeight: getComputedStyle(e).lineHeight } : null; };
          return { viewport: { width: innerWidth, height: innerHeight }, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight, weekGrid: rect('.wp-days'), firstTask: rect('.wp-days .wp-task'), queue: rect('.wp-queue'), main: rect('.main-content'), titleType: font('.wp-task-title'), metadataType: font('.wp-task-meta'), primaryButtons: Array.from(document.querySelectorAll('.button.primary')).filter(e=>e.getBoundingClientRect().height>0).map(e=>e.textContent.trim()), navigation: Array.from(document.querySelectorAll('.bottom-nav .nav-item')).map(e=>e.getAttribute('aria-label')) };
        });
        manifest.captures.push({ file, mode, page: name, measure });
        if (full) await page.screenshot({ path: path.join(out, file.replace('.png', '-full.png')), animations: 'disabled', fullPage: true });
        console.log(`CAPTURE ${file}`);
      };
      await page.getByTestId('home-overview').waitFor();
      await capture('01-home', mode.width === 1440 && mode.theme === 'light');
      await nav(page, 'Planner').click();
      await page.getByRole('button', { name: 'Tavla', exact: true }).click();
      await capture('02-planner-board');
      await page.getByRole('button', { name: 'Veckoplanering', exact: true }).click();
      await page.locator('.week-planner').waitFor();
      await capture('03-planner-week', mode.width === 1440 && mode.theme === 'light');
      if (mode.all) {
        await page.getByRole('button', { name: 'Planera Färdigställ projektförslaget', exact: true }).click();
        await page.getByRole('dialog', { name: 'Planera uppgift', exact: true }).waitFor();
        await capture('04-schedule-modal');
        await page.getByRole('dialog').getByRole('button', { name: 'Avbryt', exact: true }).click();
        await page.getByRole('button', { name: 'Öppna Färdigställ projektförslaget', exact: true }).click();
        await page.getByRole('dialog', { name: 'Uppgift', exact: true }).waitFor();
        await capture('04b-task-editor');
        await page.getByRole('dialog').getByRole('button', { name: 'Avbryt', exact: true }).click();
        await nav(page, 'Schema').click();
        await capture('04c-schema');
        await nav(page, 'Projects').click();
        await capture('05-projects');
        await page.getByRole('button', { name: 'Öppna projekt Ett bättre arbetsrum', exact: true }).click();
        await page.getByTestId('project-page').waitFor();
        await capture('06-project-detail', mode.width === 1440);
        await nav(page, 'Others').click();
        await capture('07-others');
        await page.getByRole('button', { name: /^Anteckningar(?:\s|$)/ }).click();
        await capture('08-notes-list');
        await page.getByRole('button', { name: 'Öppna anteckning Veckans fokus', exact: true }).click();
        await page.locator('.note-editor').waitFor();
        await capture('09-note-editor');
      }
      await context.close();
    }
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`Saved ${manifest.captures.length} viewport captures; ${manifest.errors.length} page errors.`);
  } finally { await browser.close(); }
})().catch(error => { fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2)); console.error(error); process.exitCode = 1; });
