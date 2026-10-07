# Forma

En enkel, mobilförst kanban- och projektapp för privat bruk. Byggd för iPhone 16 Pro Max och MacBook 14 tum, med svenska texter, neutrala gråtoner, glaspaneler och ljust/mörkt/systemtema.

## Starta lokalt

```sh
npm ci
npm run dev
```

Öppna http://localhost:5173 på din Mac. På din iPhone, anslut till samma Wi-Fi och öppna nätverksadressen som visas när servern startar. Macen behöver vara på och servern igång. I Safari kan du välja Dela → Lägg till på hemskärmen.

## Det som fungerar

- Skapa, redigera och ta bort uppgifter och kolumner. *Ta bort kolumn* finns i kolumnens redigering för alla kolumner utom Finalized; har kolumnen kort väljer du först vart de ska flyttas.
- Dra kort mellan kolumner med mus eller genom att hålla kort i kortets handtag på mobilen. Kortet följer fingret, och luckan visar live var det hamnar, även mellan kort i en annan kolumn. Håll kortet mot skärmkanten så glider tavlan exakt en kolumn i taget (en gång per knappt sekund); flytta bort från kanten för att stanna. Status uppdateras direkt. Tangentbord: fokusera handtaget, tryck mellanslag, använd pilarna och släpp med mellanslag. Status kan också ändras i uppgiften.
- Uppgifter med titel, beskrivning, status, etiketter, checklista, deadline och kommentarer.
- Projects med egna huvuduppgifter, deluppgifter och status. Kanban och Projects är separata funktioner; ändringar eller borttagning i den ena påverkar inte den andra. Tidigare delade uppgifter bevaras som fristående kopior i båda funktionerna.
- Redigera huvuduppgifter och deluppgifter även efter skapandet. Pennan vid en deluppgift öppnar dess textfält direkt; projektvyn använder två kolumner på större skärmar.
- Sökning på kanbantavlan, projektprogress i Projects och export till JSON.
- Fyra huvudvyer i navigationen: **Home, Planner, Projects och Others**. Home är startsidan. Uppe till höger finns notiser och kugghjulet för inställningar, där även synkstatus och färgtema (ljust, mörkt, system) finns.
- Debriefingar med en större läsyta, historik och en diskret markering för nytt innehåll. Läs eller dölj notisen; sammanfattningen finns kvar för att läsas igen.
- Others samlar födelsedagar, träning, kost och recept i en enkel lista. Födelsedagar visar aktuell och kommande ålder, med valbara påminnelser exakt 7, 14 och 30 dagar före.
- **Födelsedagar** kan taggas som Familj, Vänner, Jobb eller en egen tagg (skriv in den under *Lägg till tagg*). Översikten grupperas per tagg och varje person har en nedräkning (”14 dagar”, ”I morgon”, ”Idag”). Nedräkningen får en färgad kantlinje: grön inom 30 dagar, gul inom 14 och röd inom 7 (även på Home). Dra i handtaget ⠿ för att ändra ordning eller flytta någon till en annan tagg — tomma taggar visas som släppytor medan du drar. Fungerar med mus, touch (håll kort på handtaget) och tangentbord (mellanslag, piltangenter, mellanslag; Escape avbryter). *Sortera efter datum* ordnar varje grupp efter nästa födelsedag. Home visar nedräkningen och kan filtreras per tagg.
- Lokal lagring som finns kvar efter omladdning och separat temainställning. Exempeldata visar hur appen fungerar.

Lokal lagring är separat för varje webbläsare och enhet. Rensa inte webbläsarens lagring om du vill behålla tavlan. Ändringar mellan flikar bevaras när du sparar och andra öppna flikar uppdateras. Om lagringen är full visas ett fel och dialogen förblir öppen för ett nytt försök. Exportera gärna en kopia under Profil. JSON-exporten är en kopia av innehållet; appen har ingen importfunktion för backupfiler ännu.

**Daily debriefing:** Under Home kan du läsa in en sammanfattning som JSON-fil, eller flera dagars sammanfattningar i en lista. Lässtatus och dolda notiser sparas lokalt. En identisk fil skapar inga dubbletter. Ingen automatisk AI-summering körs i den lokala versionen. Den förberedda molninkorgen är separat från kanbantavlan och kan fyllas av dina framtida automationer när Supabase är anslutet. Format och anslutning beskrivs i [docs/debriefs.md](docs/debriefs.md). Notiserna visas inne i appen; iOS-push är inte aktiverat.

Födelsedagspåminnelser visas som notiser på **Home**, med namn, ålder och födelsedatum. De kan markeras som lästa eller döljas; kommande födelsedagar visas separat. Appen kontrollerar vid öppning, återkomst och varje minut medan den är aktiv. Vid sen återkomst skapas den senaste aktuella påminnelsen. Tidigare födelsedagskort i Planner bevaras, men nya påminnelser skapar inga kanbankort. För 29 februari används 28 februari under år utan skottdag. Notiserna finns i appen; inga systemnotiser skickas när appen är stängd.

**Träning:** spara datum och övningsrader med set/minuter, vikt i kg, tid i minuter eller nivå (t.ex. motstånd på cykel) och BPM. Klicka i Övning för att se senast använda övningar med senaste värden; skriv för att filtrera eller skriv en ny. Ett val tar över enheterna från förra gången och flyttar fokus till Mängd. Formuläret är kompakt på mobil: enheten väljs i kolumnrubriken (Set/Min, Vikt/Tid/Nivå) så att mängd, belastning och puls ryms bredvid varandra även på en liten telefon, med enheten utskriven i fältet. Decimalfält accepterar både komma och punkt. Kopiera det sparade passet som råtext för att använda det separat. Om urklipp inte är tillgängligt visas texten för manuell kopiering.

**Kost:** återkommande rader med titel, mängd och enhet. Markera per datum; en grön linje bekräftar avklarat. Veckovyn visar måndag–söndag, dagnummer och ISO-veckonummer, med datumval för historik. Dagar där alla vanor är klara blir gröna och dagar där något saknas blir orange (både i Kost och på Home). Framtida dagar och dagar innan vanorna fanns förblir neutrala. Dagens markeringar och veckans översikt finns även på Home.

**Recept:** spara titel, egna steg, valfri http-/https-länk och etiketter för frukost, snacks, middag eller egna kategorier. Nya etiketter skrivs direkt i rutan *Lägg till etikett* bredvid de färdiga; befintliga etiketter återanvänds oavsett versaler. Listan kan filtreras per etikett. Länken sparas som källa; innehåll hämtas inte automatiskt från webbplatsen. Lägg till en bild (kamerarulle eller kamera) som visas på receptkortet och i receptet; bilden förminskas på enheten till högst 1200 px och sparas som en liten JPEG tillsammans med receptet, så att den följer med i synk och säkerhetskopia.

Säkerhetskopian omfattar även alla Others-poster, kostens daghistorik, födelsedagsnotiser och debriefingar.

## Supabase

Appen är lokalt konfigurerad mot **https://rucwlpzrumxejvhwazat.supabase.co** sedan 2026-10-06. CLI-kopplingen, båda tabellerna och den publika klientnyckeln i `.env.local` är klara. Databastester verifierar sparning, versionskontroll, debriefstatus och isolering mellan användare. Gäster sparar lokalt; inloggade konton använder molnsynk. Verklig användarinloggning och synk mellan enheter återstår att verifiera.

Vid installation på en annan dator eller publicering:

1. Tabellerna i `supabase/schema.sql` och `supabase/debriefs.sql` finns redan i det angivna projektet. Kör endast filerna vid anslutning till ett nytt projekt där tabellerna saknas.
2. Kopiera `.env.example` till `.env.local` och fyll i projektets **publishable** API-nyckel. Använd aldrig en secret- eller service-role-nyckel i appen.
3. Starta om appen. I Supabase Auth, lägg till din appadress som Site URL och tillåten redirect URL för e-postbekräftelse.
4. Skapa konto under Profil och bekräfta din e-post om projektet kräver det. Nya konton börjar med en tom molntavla. Du kan frivilligt kopiera den lokala tavlan till ett tomt konto.

Molnkoden har separata användarcacher, återförsök efter frånkoppling och versionskontroll som förhindrar att en gammal tavla skriver över en nyare. Vid konflikt får användaren välja vilken version som ska behållas. Se [verifieringsstatus och installationssteg](docs/backend.md).

Supabase är den enda molnlagringen. Offlineändringar, debriefimport och läst-/döljstatus sparas lokalt och synkas automatiskt vid återanslutning. Tillfälliga nätfel återförsöks medan appen är synlig. Produktionsappen kan öppnas och laddas om offline efter första besöket; utvecklingsservern saknar appfilscache. Inloggning första gången kräver internet. `npm run test:offline` verifierar produktionsflödet mot `npm run preview -- --port 4180` med simulerad Supabase.

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
npm run test:projects
npm run test:revision
BROWSER_ENGINE=webkit npm run test:revision
npm run test:others
BROWSER_ENGINE=webkit npm run test:others
npm run test:organize
BROWSER_ENGINE=webkit npm run test:organize
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

[Verifiering av Home och Others, 6 oktober 2026](docs/others-verification-2026-10-06.md).

[Taggar, nedräkning, helskärmsanteckningar med fet/kursiv och svep för att ta bort, kostfärger, träning på mobil och receptfilter, 6 oktober 2026](docs/organize-2026-10-06.md).
