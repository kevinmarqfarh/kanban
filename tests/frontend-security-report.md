# Frontend-säkerhetsgranskning 2026-10-28

Arbete utfört uttryckligen i `/Users/kevinmarquez/Desktop/Repos/FORMA`. Pågående användarändringar har bevarats. Denna agent har ändrat endast `src/lib/notes.ts` och nya `tests/frontend-security*`. Main har integrerat ändringarna i `App.tsx` och drop-skyddet i `Notes.tsx`.

## F1 — Medel: Ångra flyttade privat innehåll över kontogränsen

- Plats: `src/App.tsx:122`, `src/App.tsx:303`, samt återställning av UI vid kontobyte. Regel: REACT-AUTHZ-001, klientens kontogräns.
- Före fixen innehöll `undo` arbetsytans före/efter-bilder utan ägaridentitet. `undoRemoval` körde `restoreRemoved(before, after, current)` mot den då aktiva arbetsytan. Kontobytet rensade inte Ångra.
- Reproduktion: ta bort en syntetisk privat uppgift som inloggad, invänta molnkvittens, logga ut inom Ångra-fönstret på sju sekunder och klicka Ångra. Uppgiften hamnade i `forma:workspace:v1:guest`. Bekräftat i Chromium och WebKit med helt mockad auth/databas.
- Före: `undoSurvivedSignOut=true`, `privateTaskCopiedToGuest=true`. Efter mains ägarscopade snapshots, handlerkontroller och UI-reset: båda värdena `false` i båda motorerna.
- Status: mains fix verifierad med `tests/frontend-security-account-boundary.cjs`. Testet täcker konto → gäst och uppgiftsborttagning; det är inte bevis för samtliga möjliga kontobyten eller statusåterställningar.

## F2 — Låg: HTML-drop laddade extern bild före sanering

- Plats: `src/components/Notes.tsx:200`, `src/components/Notes.tsx:106`. Regel: REACT-XSS-002, osanerad HTML i levande DOM; verifierad effekt gäller externa resurser.
- Före fixen tillät redigeraren webbläsarens vanliga HTML-drop. `persist` sanerade endast det sparade innehållet. En bild kunde därför stanna i redigerarens DOM och göra ett externt anropsförsök trots att den saknades i den sparade anteckningen.
- Payload: `<img src="https://example.invalid/frontend-security-drop-pixel" onerror="window.frontendSecurityDropAttack=true"><p>Synthetic dropped text</p>`, överförd som `text/html` med riktig musdragning från en test-iframe.
- Chromium och WebKit före fixen: en bild i DOM redan i en fångande `input`-lyssnare före Reacts `persist`, ett bildanropsförsök, ingen bild i sparat innehåll. Båda motorerna tog bort `onerror`; ingen JavaScript-exekvering visades. Detta är ett verifierat integritetsproblem, inte verifierad drop-XSS. Externa anrop blockerades av testet.
- Minimal fix, integrerad av main: stoppa standard-drop med `preventDefault`, välj `text/plain` eller sanerad `notePlainText(text/html)` och infoga med `insertText`. Placera markören vid släppet och spara som tidigare.
- Efter fixen: `externalImageRequests=0`, `liveImageElements=0`, `imageBeforePersist=false`, `handlerBeforePersist=false`, `attack=false`; släppt text sparas. Verifierat med enbart `text/html` i båda motorerna via `tests/frontend-security-note-drop.cjs`.

## F3 — Låg: felaktig UTF-16 i lagrat länkmål kraschade saneraren

- Plats: `src/lib/notes.ts:35`, `src/lib/notes.ts:38`; anropas även av `notePlainText` och listfiltreringen i `src/components/Notes.tsx:248`.
- Före: ett `data-note-target` med en ensam hög/låg UTF-16-surrogat passerade länkmålets längd-/strängkontroll men `encodeURIComponent` kastade `URIError`. Anteckningsinnehållets validering i `src/lib/workspaceValidation.ts:73` kontrollerar strängtyp/längd, inte sådana tecken.
- Bekräftat med faktiska surrogatkodpunkter från JavaScript-strängar, inte den bokstavliga texten `\\ud800`. Påverkan gäller hantering av manipulerat/lokalt lagrat innehåll. En fjärrangreppsväg via Postgres har inte visats.
- Fix av denna agent: försök URL-koda innan ankaret skapas; vid ogiltig UTF-16 bevaras länkens text och inline-formatering utan klickbar länk. Giltiga interna länkar bevaras.
- Regressionstestet misslyckades på tre surrogatfall före fixen och klarar dem efter fixen i Chromium/WebKit. `tests/frontend-security-notes.cjs` kontrollerar också HTML-/SVG-/MathML-payloads, URL-scheman, attribut, externa resurser och bibehållen formatering.

## Verifiering och avgränsning

Alla tre nya browserregressioner klarar Chromium och WebKit mot lokal main på port 4189 efter integrerade fixar. TypeScript-kontroll utan emit och befintliga `notes.mjs`, `data-integrity.mjs`, `others.mjs`, `debriefs.mjs` klarar också.

Import av debriefingar, URL-/bildvalidering, auth-formulär och lokal kontocache har lästs. Inga ytterligare exploaterbara fynd fastställs här. Produktionsheaders, backend/RLS och andra agenters ändringar omfattas inte av något generellt säkerhetsgodkännande.
