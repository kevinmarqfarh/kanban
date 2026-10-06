# Independent acceptance review

This review prioritizes the requested simple, private, mobile-first workflow.

## Acceptance scenarios

1. **Kanban:** create a column, create a task beneath that column, fill title/description/labels/checklist/deadline/comment, reopen the task, edit it, and confirm all changes survive reload.
2. **Move tasks:** move a task between columns and confirm the task status matches its column; check pointer dragging, a practical touch route, and a keyboard-accessible status control.
3. **Projects:** create a project with title and description, associate a main task and subtasks, and verify checklist/subtask progress survives navigation and reload.
4. **Navigation:** the footer reaches Kanban, Project and Profile; content and controls remain usable at 440 × 956 and 1512 × 982, with no unintended page overflow.
5. **Appearance:** light/dark preference persists; typography, subtle glass surfaces, spacing and control contrast stay readable in both themes.
6. **Dialogs:** fields are labelled, focus enters the dialog, Escape closes it, focus returns to its trigger, and destructive actions are reversible or deliberately confirmed.
7. **Private persistence:** local/demo behavior is clearly distinguished from a connected Supabase account; cloud data is scoped to the authenticated user; unavailable cloud writes do not falsely report success or silently discard local work.

## Evidence

Verified the production build at `http://127.0.0.1:4173` on 4 October 2026.

| Browser engine | Desktop | Mobile viewport | Acceptance result |
| --- | --- | --- | --- |
| Chromium | 1512 × 982 | 440 × 956, touch enabled | 18 of 18 scenarios passed |
| WebKit / Safari engine | 1512 × 982 | 440 × 956, touch enabled | 17 of 17 scenarios passed |

Chromium additionally received native touch events through its browser protocol: a long press on the grip activates dragging, holding the card near the right edge scrolls the board, and dropping it changes its persisted status. Both engines passed pointer and keyboard movement. Keyboard tests wait for the announced active column before sending the next key, so sensor activation and a prior card's drop animation cannot race the test.

The verified flows include every task field, duplicate-label normalization, unsent checklist/comment drafts being included on save, reload persistence, an accessible status select, column creation/renaming, project main tasks and subtasks, subtask completion, deliberate task deletion, required-title validation and Enter submission, search/project filtering, and JSON backup contents.

Additional regressions passed in both engines:

- Removing `crypto.randomUUID` still allows valid task IDs on a local HTTP preview.
- A simulated storage-quota failure shows a saving error without a false “saved” toast. Restoring storage and pressing Retry preserves the in-memory edit, writes it, and survives reload.
- Mobile search and form text use at least 16 px. Project filters and task status/project selects measure at least 44 px high in WebKit as well as Chromium.
- Escape closes the native dialog, focus returns to its trigger, the footer navigates all three destinations, and the page has no unintended horizontal overflow.
- Dark preference survives reload and System follows changes to the browser's preferred appearance.
- No uncaught browser exceptions occurred.

The data-integrity checks also pass, covering independent seed copies, a valid empty account, malformed nested data, duplicate IDs and orphaned task references. Build/type checking was completed by the implementation agent.

Settled light/dark, desktop/mobile and task-dialog screenshots were visually reviewed. The neutral grayscale palette, restrained glass footer, bento summary tiles and task hierarchy are consistent and readable. Screenshots and machine-readable results are generated under `tests/artifacts/chromium/` and `tests/artifacts/webkit/`, which are intentionally excluded from version control.

## Judge's verdict

**Ready for local personal use. Local v1 quality: 9/10.** The requested daily workflows work, and the UI remains simple and coherent across the two requested screen sizes. The score describes the reviewed local app; it is not a claim of perfection.

The requested Supabase project is inaccessible to the connected account. Its public client configuration, account-separated caches, owner-scoped database policies and revision-conflict handling are prepared, but live login, cross-device synchronization and database policies could not be executed against that project. Cloud work is deliberately deferred until access is available, and the app clearly identifies its current local-only storage.

The mobile browser engine and touch behavior were verified in automation. A physical iPhone, its on-screen keyboard and Add to Home Screen installation were not exercised. Existing device/browser data is separate from the fresh isolated test contexts.

## Run the checks

Start the app or production preview, then use `APP_URL=http://127.0.0.1:4173 npm run test:e2e` for Chromium and `APP_URL=http://127.0.0.1:4173 BROWSER_ENGINE=webkit npm run test:e2e` for WebKit. Install the corresponding Playwright browsers first if they are not already available. `PLAYWRIGHT_MODULE` may point to an existing bundled Playwright installation.

`npm test` runs the separate data-integrity checks.

## Birthday feature acceptance — 2026-10-04

**Ready for local personal use. No blocking findings.** The birthday feature was independently checked at the existing MacBook and iPhone viewport sizes. The new Profile card opens one dialog for adding, editing and deleting people, keeping the three-destination footer unchanged.

| Engine | Birthday scenarios | Existing regression scenarios |
| --- | --- | --- |
| Chromium | 12 of 12 passed | 18 of 18 passed |
| WebKit / Safari engine | 12 of 12 passed | 17 of 17 passed |

All 59 browser scenarios passed with no uncaught exceptions against both the development app at `http://127.0.0.1:5173` and the final production preview at `http://127.0.0.1:4173`. Birthday checks use isolated local caches and a controlled calendar in the Europe/Stockholm time zone; they do not modify the user's saved browser workspace.

The checks cover:

- A valid older cache without a birthday field still loads its existing columns, tasks and projects, without being classified as corrupt.
- Required name and birth date, rejection of future birth dates, name trimming, editing and saving multiple reminder choices across reloads.
- The reminder switch defaults off. One month, two weeks, one week and the birthday itself can each be selected independently.
- A birthday on 4 November produces its selected reminders on 4 October, 21 October, 28 October and 4 November. Each task contains the name and turning age, an explicit birthday date and reminder interval, the birthday label, and the birthday as its deadline.
- Active-app time checks, focus/visibility checks and reopening do not duplicate tasks. A manually deleted reminder stays deleted. Turning reminders off or deleting the birthday retains existing tasks and prevents new ones.
- A late reopening creates only the latest due reminder and records the earlier due reminders, avoiding a burst of old cards.
- Mobile text fields measure at least 16 px; date fields, footer buttons, reminder toggles and option rows measure at least 44 px. The page has no unintended horizontal overflow. Save and Cancel keep focus in the dialog; Escape returns focus to its Profile trigger.

Viewport screenshots of the light mobile form, light/dark mobile list and desktop list were reviewed. The birthday screen follows the existing neutral surfaces, rounded cards and bottom-sheet dialog, with visible labels and simple options. Screenshots and results are generated under `tests/artifacts/chromium/birthdays/` and `tests/artifacts/webkit/birthdays/`. Mobile dialogs use viewport captures because a full-page capture can reposition native dialogs against the document height in WebKit.

The calendar unit suite also covers month-end clamping, leap-day birthdays, year rollover, daylight-saving changes and persistent reminder history. A 29 February birthday is observed on 28 February in years without a leap day, and the form explains this convention when relevant.

This local version creates tasks while the app is open, or checks due reminders when it opens or regains focus. It does not deliver iOS push notifications or run a background reminder service. Physical iPhone keyboard and native date-picker behavior remain outside automated browser coverage.

Run the birthday browser suite with `APP_URL=http://127.0.0.1:4173 npm run test:birthdays`, adding `BROWSER_ENGINE=webkit` for WebKit. `PLAYWRIGHT_MODULE` can point to an existing bundled Playwright installation. `npm test` includes the calendar unit suite.

## Summary and daily debrief acceptance — 2026-10-05

**Ready for local Summary use. No blocking findings.** Summary is now the default view, with the four requested footer destinations: **Summary, Kanban, Projects and Profile**. Its latest-report card and history open an inline reader. Kanban, projects and birthdays continue to work with the new navigation.

The final production preview at `http://127.0.0.1:4173` passed all 87 browser scenarios:

| Engine | Summary/debrief scenarios | Kanban/project regression | Birthday regression | Total |
| --- | --- | --- | --- | --- |
| Chromium | 14 of 14 | 18 of 18 | 12 of 12 | 44 of 44 |
| WebKit / Safari engine | 14 of 14 | 17 of 17 | 12 of 12 | 43 of 43 |

No uncaught browser exceptions occurred. Existing regression assertions remain in place, with navigation selectors updated for the four destinations and the backup assertion extended to include the new report history. Birthday target measurements wait for the native sheet animation to finish, avoiding transient scale measurements from a paused JavaScript clock.

The new checks cover:

- An empty feed shows no invented AI report, unread badge or Kanban notice. Summary is the default, and all four footer destinations have their exact accessible names.
- Single-object and array JSON imports populate the latest card, history and unread indicators. Cached entries may be unordered; the newest unread report still wins.
- Dismissing a Kanban notice sets only its dismissed timestamp, keeps its unread state and stored content, and immediately reveals the next eligible report. Reading, rereading, dismissing and reopening history retain their state across reloads.
- The full inline reader preserves body paragraphs, focuses its heading when opened, and returns focus to the original read button when closing. Older reports remain available without automatic deletion.
- Reimporting identical content preserves read, dismissed and creation timestamps. Revised content for the same day replaces that report and becomes unread again.
- Malformed JSON, invalid dates, partially invalid arrays, duplicate days within an array, empty arrays and arrays above the 100-report limit fail without changing the feed. Client-supplied read state and owner metadata do not override local state.
- Imported HTML stays literal text; it creates no report images, headings or scripts. A long unbroken body string does not cause horizontal overflow.
- Debriefing operations leave every existing task, column, project, checklist, comment and birthday field identical. Reports use a separate cache. The JSON backup includes both the unchanged workspace fields and the complete report history.
- A simulated report-cache quota failure remains visible, makes no false import-success claim, and retains the in-memory report. Retry writes it successfully and the report survives reload.
- Mobile footer, bell, read/import/history controls and Kanban notice targets meet the 44 px minimum. Summary and all four destinations avoid unintended horizontal overflow; touch reading, dismissal, reload and dark appearance work in both engines.

Desktop overview/reader and mobile light/dark overview/reader screenshots were reviewed. The latest-report card, compact history and calm text hierarchy follow the existing grayscale bento surfaces and glass footer. No clear visual defects were found. Screenshots, exported test backups and results are generated under `tests/artifacts/chromium/debriefs/` and `tests/artifacts/webkit/debriefs/`.

The local feed and JSON import are verified. Its separate cloud table, owner checks, pending read/dismiss overlays and polling are prepared in code, but live Supabase permissions, cross-device delivery and automated AI report generation have not been executed against the deferred project. The UI states that automation will connect when cloud sync is ready. These results do not claim physical iPhone or iOS push-notification coverage.

Run the new suite with `APP_URL=http://127.0.0.1:4173 npm run test:debriefs`, adding `BROWSER_ENGINE=webkit` for WebKit. `npm test` includes the debrief domain unit suite; `npm run test:e2e` and `npm run test:birthdays` run the retained regression suites. `PLAYWRIGHT_MODULE` can point to an existing bundled Playwright installation.
