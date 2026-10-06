# Forma

En enkel, mobilförst kanban- och projektapp för privat bruk. Byggd för iPhone 16 Pro Max och MacBook 14 tum, med svenska texter, neutrala gråtoner, glaspaneler och ljust/mörkt/systemtema.

## Starta lokalt

```sh
npm ci
npm run dev
```

Öppna http://localhost:5173 på din Mac. På din iPhone, anslut till samma Wi-Fi och öppna nätverksadressen som visas när servern startar. Macen behöver vara på och servern igång. I Safari kan du välja Dela → Lägg till på hemskärmen.

## Det som fungerar

- Skapa, redigera och ta bort uppgifter och egna kolumner.
- Dra kort mellan kolumner med mus eller genom att hålla i kortets handtag på mobilen. Status uppdateras direkt. Tangentbord: fokusera handtaget, tryck mellanslag, använd pilarna och släpp med mellanslag. Status kan också ändras i uppgiften.
- Uppgifter med titel, beskrivning, status, etiketter, checklista, deadline och kommentarer.
- Projekt med huvuduppgifter och deluppgifter. En huvuduppgift är ett kanbankort; dess deluppgifter är checklistan. Klara huvuduppgifter ligger i kolumnen Klart.
- Sökning, projektfilter, synlig projektprogress och export till JSON.
- Fyra huvudvyer i den flytande navigationen: **Summary, Kanban, Projects och Profile**. Summary är startsidan.
- Debriefingar med en större läsyta, historik och en diskret markering för nytt innehåll. Läs eller dölj notisen; sammanfattningen finns kvar för att läsas igen.
- Födelsedagar under Profil: namn, födelsedatum och valbara, årliga påminnelser en kalendermånad, två veckor, en vecka före eller på födelsedagen. Välj flera tider eller stäng av påminnelser.
- Lokal lagring som finns kvar efter omladdning och separat temainställning. Exempeldata visar hur appen fungerar.

Lokal lagring är separat för varje webbläsare och enhet. Rensa inte webbläsarens lagring om du vill behålla tavlan. Ändringar mellan flikar bevaras när du sparar och andra öppna flikar uppdateras. Om lagringen är full visas ett fel och dialogen förblir öppen för ett nytt försök. Exportera gärna en kopia under Profil. JSON-exporten är en kopia av innehållet; appen har ingen importfunktion för backupfiler ännu.

**Daily debriefing:** Under Summary kan du läsa in en sammanfattning som JSON-fil, eller flera dagars sammanfattningar i en lista. Lässtatus och dolda notiser sparas lokalt. En identisk fil skapar inga dubbletter. Ingen automatisk AI-summering körs i den lokala versionen. Den förberedda molninkorgen är separat från kanbantavlan och kan fyllas av dina framtida automationer när Supabase är anslutet. Format och anslutning beskrivs i [docs/debriefs.md](docs/debriefs.md). Notiserna visas inne i appen; iOS-push är inte aktiverat.

Födelsedagspåminnelser blir vanliga kort i **Att göra**, med namn, ålder och födelsedatum; kortets deadline är födelsedagen. Appen kontrollerar påminnelser när du öppnar den, återvänder till den och varje minut medan den är aktiv. Om flera tider har passerat före en kommande födelsedag skapas bara den senaste påminnelsen. Inga systemnotiser skickas när appen är stängd. Tidigare kort finns kvar om du ändrar eller tar bort en person, och raderade påminnelsekort återskapas inte för samma tillfälle. För födelsedagar den 29 februari används 28 februari under år utan skottdag.

## Supabase, förberett för senare

Appen riktar sig till **https://rucwlpzrumxejvhwazat.supabase.co**. Användaren har valt att slutföra lokalt tills vidare. Molnsynk är därför **inte aktiverad eller verifierad** i detta projekt ännu. Utan en publik API-nyckel visas lokal lagring tydligt och inloggningsformuläret döljs.

När du vill ansluta molnet:

1. Kör `supabase/schema.sql` i SQL-editorn för rätt projekt. Schemat skapar `kanban_workspaces` med en privat, versionskontrollerad tavla per användare och ägarbaserad RLS.
   Kör även `supabase/debriefs.sql` för den separata inkorgen med dagliga debriefingar.
2. Kopiera `.env.example` till `.env.local` och fyll i projektets **publishable** API-nyckel. Använd aldrig en secret- eller service-role-nyckel i appen.
3. Starta om appen. I Supabase Auth, lägg till din appadress som Site URL och tillåten redirect URL för e-postbekräftelse.
4. Skapa konto under Profil och bekräfta din e-post om projektet kräver det. Nya konton börjar med en tom molntavla. Du kan frivilligt kopiera den lokala tavlan till ett tomt konto.

Molnkoden har separata användarcacher, återförsök efter frånkoppling och versionskontroll som förhindrar att en gammal tavla skriver över en nyare. Vid konflikt får användaren välja vilken version som ska behållas. Tabellens SQL och liveflödet måste verifieras när projektåtkomst finns.

## Kontrollera och bygga

```sh
npm run check
npm test
npm run build
npx playwright install chromium webkit
# Med lokal server igång:
npm run test:e2e
BROWSER_ENGINE=webkit npm run test:e2e
npm run test:birthdays
BROWSER_ENGINE=webkit npm run test:birthdays
npm run test:debriefs
BROWSER_ENGINE=webkit npm run test:debriefs
npm run test:revision
BROWSER_ENGINE=webkit npm run test:revision
```

`npm test` verifierar dataintegritet, sparande och ändringar mellan flikar, debriefingarnas läs- och notisstatus samt födelsedagarnas kalender- och påminnelselogik. Webbläsartesterna kontrollerar riktiga flöden för uppgifter, projekt, födelsedagar, debriefingar, drag-and-drop, teman, dialoger, filter, export och mobilbredd. Skärmbilder och resultat skrivs till `tests/artifacts/`, som inte checkas in. `PLAYWRIGHT_MODULE` kan peka på en befintlig Playwright-installation. `APP_URL` kan peka på en annan lokal server.

Produktionsbygget hamnar i `dist/`. `npm run preview` visar det lokalt. Appen använder React, TypeScript, Vite, dnd-kit och Supabase. Typsnitt och ikoner följer med appen; inga externa typsnitt behöver hämtas.

## GitHub

GitHub-repot är https://github.com/kevinmarqfarh/kanban och är kopplat som `origin`.

## Vercel

`vercel.json` anger preset **Vite**, installation `npm ci --include=dev`, bygge `npm run build` och output `dist`. Root Directory är repots rot. Appkoden, `package.json` och `package-lock.json` behöver finnas i den GitHub-commit som Vercel bygger.

För Supabase-kopplingen, lägg till dessa i Vercels Environment Variables för Production:

| Namn | Värde |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://rucwlpzrumxejvhwazat.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Projektets publishable key från Supabase Settings → API Keys |

Nyckeln börjar med `sb_publishable_`. Använd aldrig en secret- eller service-role-nyckel i en `VITE_`-variabel, eftersom den följer med till webbläsaren. Utan nyckeln fungerar appen med lokal lagring. För molnsynk behöver databasschemat och Auth-adresserna också konfigureras enligt Supabase-avsnittet ovan. Ändrade miljövariabler kräver ett nytt bygge.

## Senaste revision

[Design- och lagringsrevision 2026-10-05](docs/revision-2026-10-05.md) · [Domarens verifiering](docs/revision-verification-2026-10-05.md). 109 webbläsarscenarier godkända i Chromium och WebKit. Mobilens statistikruta döljs så att korten får mer plats; senaste-cache-läsning och trevägsmerge skyddar vardagliga ändringar mellan flikar.
