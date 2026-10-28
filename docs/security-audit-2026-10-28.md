# Säkerhetsgranskning av FORMA, 28 oktober 2026

## Resultat och omfattning

Granskning av bildens 18 punkter, med separata agenter för frontend, push och SQL samt en oberoende slutdomare. Verifierade brister har åtgärdats i huvudprojektet. Andra pågående användarändringar har bevarats.

**Ändringarna är lokala och inte driftsatta.** Livekontrollerna var läsningar av Supabase-metadata och advisors. Ingen produktionsdata eller gemensam Auth-konfiguration ändrades. En förberedd kvotmigration behöver körtestas före tillämpning. Detta är en källkodsgranskning med riktade regressionstester, inte ett fullständigt penetrationstest eller en garanti om frånvaro av fel.

## Åtgärdade fynd

### 1. Hög: lagrade push-adresser kunde styra serveranrop

Ägaren kunde skriva en valfri endpoint direkt genom Data API. Ägar-RLS begränsade raden men inte adressen som Edge Function använde för utskick. En inloggad angripare kunde därmed få servern att försöka anropa andra värdar (SSRF).

Åtgärd: `supabase/functions/forma-push/security.ts:39` tillåter endast HTTPS till stödda pushleverantörer, nekar alternativa portar, användarinfo och tvetydiga adresser. `index.ts:24` och `index.ts:38` validerar även redan lagrade prenumerationer, inklusive nyckelformat. Utskick har tidsgräns och följer inte omdirigeringar. Testerna använder simulerade gränssnitt; ingen intern adress eller riktig pushleverantör anropas.

### 2. Hög vid felkonfiguration: klientkontroll stoppade inte bundling av servernycklar

Den tidigare kontrollen i webbläsaren avvisade fel nyckeltyp först efter att Vite redan kunde ha lagt nyckeln i ett publikt skript. Ingen faktisk läckt nyckel påvisades.

Åtgärd: `src/lib/publicKey.ts:13` och `vite.config.ts:12` avbryter bygget före generering av webbfiler om den publika nyckelvariabeln innehåller en secret/service-role-nyckel eller annan ogiltig nyckeltyp. Ett riktigt Vite-bygge med en syntetisk servernyckel verifierar avbrottet och att värdet inte loggas. Nyckeltypkontrollen ersätter inte Supabases verifiering av signaturer och användarbehörighet.

### 3. Medel: Ångra kunde föra kontodata till gästarbetsytan

`App` behöll före-/efterbilder för borttagningar över utloggning. En kvarvarande Ångra-åtgärd kunde återställa tidigare kontoinnehåll i den nya arbetsytan.

Åtgärd: `src/App.tsx:118`, `src/App.tsx:148` och `src/App.tsx:303` knyter både borttagnings- och statusånger till ägaren, rensar privata redigeringsbilder vid kontobyte och avvisar ånger under laddning eller från fel konto. Test med syntetiskt konto och simulerad Supabase-trafik passerar i Chromium och WebKit: ingen kvarvarande ånger, ingen privat uppgift i gästens cache.

### 4. Låg: indragen HTML kunde nå den levande anteckningseditorn

Sanering vid sparande skyddar inte mot resurser som webbläsaren redan hunnit lägga in vid en HTML-drop.

Verifierad effekt var extern resursladdning och otillåtna element i editorn. JavaScript-exekvering genom denna drop-väg har inte påvisats.

Åtgärd: `src/components/Notes.tsx:200` stoppar webbläsarens standardinmatning och infogar endast text, liksom inklistring. Regressionstestet använder webbläsarens riktiga drag/drop-väg och verifierar noll externa bildanrop samt noll bildelement både i editorn och sparad anteckning. Befintlig formatering inne i anteckningen bevaras.

### 5. Medel: testnotiser saknade anropsbegränsning

Åtgärd: `supabase/functions/forma-push/index.ts:85` reserverar en beständig plats i den interna leveranstabellen. Unik nyckel och villkorad UPDATE ger högst en testnotis per prenumeration och 60 sekunder även mellan workers. Misslyckade försök behåller platsen; överträdelser ger 429 och Retry-After. Begäranden begränsas även till 4 KiB faktisk strömstorlek. Det finns fortfarande ingen övergripande kontobaserad frekvensgräns; se kvarvarande arbete.

### 6. Medel: dokumenterad HTTP-policy för webbläsarskydd saknades

Åtgärd: `vercel.json:7` sätter CSP, frame-ancestors, X-Frame-Options, nosniff, Referrer-Policy och Permissions-Policy. `index.html:15` laddar starten från `public/boot.js`; inline onclick ersattes med en event listener. `vite.config.ts:23` lägger även boot.js i offline-cachen.

Skriptpolicyn tillåter varken unsafe-inline eller unsafe-eval. Inline-stilar är avsiktligt tillåtna eftersom React, drag/drop och positionerade kontroller använder stilattribut. HTTPS-bilder är tillåtna för recept; nätverksanrop begränsas till appen, Supabase och vädertjänsterna. Andra Supabase-domäner kräver uppdatering av policyn. Chromium/WebKit verifierar normal start utan policybrott, blockerade inline-skript/handlers, blockering av inbäddning och fungerande återladdning vid startfel. Vercels verkliga svar måste kontrolleras efter driftsättning.

### 7. Medel för utvecklingsmiljön: sårbart Vite-beroende

Åtgärd: Vite 8.3.2 uppdaterades till 8.3.5 med exakt version och uppdaterad låsfil. npm audit rapporterade först ett direkt sårbart paket med sex advisories och därefter noll kända sårbarheter. Fyndet gäller utvecklingsverktyget; det är inte bevis för exploatering av den publicerade statiska appen. [Vites säkerhetsinformation](https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22).

### 8. Låg: felaktig Unicode i anteckningslänk kunde krascha saneringen

Åtgärd: `src/lib/notes.ts:35` hanterar misslyckad URL-kodning och behåller länkens text utan aktiv länk. Riktade tester i båda webbläsarmotorerna täcker sanering, URL-begränsning och felaktiga UTF-16-sekvenser.

### 9. Medel: utloggning kunde fastna utan service worker

`src/lib/push.ts:8` väntade på serviceWorker.ready även när registrering misslyckades eller blockerades. Detta kunde hindra användaren från att logga ut.

Åtgärd: läs befintlig registrering med getRegistration och returnera ingen prenumeration om registrering saknas. Utloggningstestet kör med blockerade service workers i Chromium och WebKit. Befintligt test för aktivering, inställningar, testnotis och avaktivering passerar också.

## Förberett och kvarvarande arbete

1. **Medel – driftsättning:** publicera frontend och den uppdaterade Edge Function; kontrollera sedan faktiska HTTP-headers, cron och push på en testenhet. Inga sådana publiceringar har utförts här.
2. **Medel – prenumerationskvot:** `supabase/migrations/20261028193001_forma_push_device_quota.sql` inför högst tio enheter per konto med transaktionslås, ägarkontroll före låset och stöd för återregistrering vid full kvot. Migrationen skapades via CLI och flyttades efter befintliga migrationer för korrekt ordning. **Inte tillämpad och inte runtime-verifierad.** `tests/push-device-quota.mjs` innehåller isolerade PostgreSQL-tester för samtidighet/upsert/ägare men hoppades över eftersom Docker/PostgreSQL saknas. Äldre överfulla konton rensas inte automatiskt. Dispatch har fortsatt ett globalt urval på 500 enheter; rättvis paginering behövs vid större användning. Kontobaserad rate limit behövs för att hindra kringgående via radering och nyregistrering av enheter.
3. **Medel – lösenordsskydd:** live-advisor visar att skydd mot kända läckta lösenord är avstängt. Aktivera om tillgängligt i projektets Auth-inställningar och verifiera att varningen försvinner. App DB delas med andra appar, så ändringen behöver samordnas. [Supabases vägledning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
4. **Medel – reproducerbar databasdrift:** schema.sql/debriefs.sql ligger utanför migrationskedjan och befintliga push-versioner skiljer sig från livehistoriken. Återskapa därför i ett separat testprojekt före migrering; kör inte en blind db push/reset mot det delade projektet. `supabase/config.toml:387` dokumenterar nu verify_jwt=false för cron-funktionen, vars handler själv kontrollerar användartoken respektive cron-hemlighet.
5. **Låg – gemensamma SQL-rättigheter:** domarens livekontroll visar bredare rättigheter till pg_net-kön där upplösta cron-headers tillfälligt kan finnas. Ingen publik REST/RPC-exponering av den kön har påvisats. Kartlägg exponerade SQL-vägar innan gemensamma rättigheter ändras.
6. **Begränsning – sessioner och lokal lagring:** denna SPA använder Supabases beständiga webbläsarsessioner och kontocacher. Enheter ska betraktas som betrodda; lokal lagring är inte kryptering eller skydd mot en person med tillgång till webbläsarprofilen. Faktiska negativa skrivtester mellan två riktiga konton och verklig pushleverans har inte utförts.
7. **Plattformsunderhåll:** live rapporterar PostgreSQL 17.6. Supabase har annonserat en säkerhetsuppdatering till 17.11; kontrollera projektets uppgraderingsväg och kompatibilitet för alla appar som delar databasen. Ingen automatisk uppgradering eller bedömning av enskilda CVE:ers exploaterbarhet utfördes. [Supabases uppgraderingsinformation](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).

## Bildens 18 punkter

| Punkt | Bedömning och underlag |
| --- | --- |
| Hide API keys | Publika Supabase-värden är tillåtna. Inga kända servernyckelmönster hittades; byggspärr tillagd. |
| Protect admin routes | Cron-dispatch kräver separat privat token; användartoken ger inte cron-behörighet. |
| Users access own data | Live-RLS/grants verifierade för FORMA-tabeller. Lokal Ångra-gräns rättad. |
| Block XSS | JSX-escaping och snäv anteckningsallowlist; sanering och drop testade; CSP tillagd lokalt. |
| Check CORS settings | Push använder explicit Bearer-auth, inga ambienta auth-cookies. Wildcard origin är avsiktligt; cron-header tillåts inte i preflight. CORS är inte auktorisering. |
| Debug mode | Produktionsbygge används; inga publika sourcemaps i dist. Lokala kraschdetaljer är en avsiktlig återhämtningsfunktion. |
| Unused packages | Samtliga åtta runtime-beroenden refereras i src. Verktygsberoenden används för bygge/test/CLI; ingen fullständig dead-code-analys påstås. |
| Secure database | Live-RLS på fem FORMA-tabeller, anon saknar SELECT. Intern config/deliveries saknar avsiktligt klientpolicyer. Kvot och driftarbete kvarstår enligt ovan. |
| Secrets in git history | 53 nåbara commits, 708 textblobbar genomsökta efter server-Supabase/JWT, privata nycklar och GitHub/OpenAI-tokenmönster; inga träffar. Heuristik, inte fullständig secrets-certifiering eller kontroll av borttagna fjärrrefs. |
| Check env variables | Endast de två avsedda VITE_SUPABASE-variablerna i lokal env; filerna ignoreras. Nyckeltypen kontrolleras före bygge. |
| Proper authentication | Supabase Auth och serverns getUser-validering; inga klientbaserade adminbeslut. |
| Sanitize forms | Strukturerad workspace-validering, JSX-escaping, sanerad antecknings-HTML och begränsade push-begäranden. |
| Rate limiting | Auth har plattformsgränser; lokalt push-skydd per enhet tillagt. Ingen bekräftad heltäckande kontokvot/WAF; kvarvarande arbete ovan. |
| Security headers | Konfigurerade och verifierade på lokal HTTP-server med produktionsartefakt; inte verifierade på en ny live-deployment. |
| Update dependencies | Vite säkerhetsuppdaterat; npm audit noll kända sårbarheter. Edge Functions separat Deno-graf ingår inte i npm-resultatet. |
| Check exposed files | public/dist inventerade: inga env-filer, git-data, paketmanifest eller sourcemaps i artefakten. Produktionsserverns övriga filer har inte sonderats. |
| Hash passwords | Supabase Auth hanterar lösenord; SQL-domarens aggregerade livekontroll bekräftade bcrypt för befintliga icke-tomma lösenord och nekad klientåtkomst. |
| Full security audit | Avgränsad granskning och kritisk dom genomförda. Återstående driftkrav och testbegränsningar redovisas uttryckligen. |

## Verifiering och körning

- `npm run build`, `npm test`, `node tests/notes.mjs` och befintliga push-påminnelsetester passerade.
- Nyckelspärr, åtta push-säkerhetsfall, sanering, drop, utloggning och HTTP/CSP kontrollerades med syntetiska data. Appens molnsynk passerade befintligt integrationstest med simulerade HTTP-svar.
- Kör `npm run test:security` för de fristående säkerhetstesterna. Chromium och WebKit behöver vara installerade.
- Starta lokal produktionspreview och kör `APP_URL=http://127.0.0.1:4197 npm run test:security:app` för konto-/drop-regressionerna.
- `npm run test:security:database` behöver Docker och en disponibel PostgreSQL 17-image. Ett SKIP-resultat är inte ett godkänt databastest.
- `git diff --check` passerade. Inga commits, pushar, live-migrationer eller deployments utfördes.

Slutdomaren fann inga blockerande kodfel i de granskade ändringarna och verifierade oberoende att konto- och drop-testerna blir röda när skydden tas bort. Två testluckor i CSP-provet åtgärdades därefter: catch-all-matchningen kontrolleras uttryckligen, och skriptpolicyn verifieras med både tillåtna källor och negativa eval-/externskripttester från en verklig same-origin-skriptfil. Säkerhetstesterna har egna npm-kommandon men behöver kopplas till projektets framtida CI.

## Rättelser av tidigare påståenden

En Supabase-URL och en publishable/anon-nyckel är offentliga identifierare; frånvaro av .env.production säger inget om säkerhetsnivån. [Supabases nyckeldokumentation](https://supabase.com/docs/guides/api/api-keys).

Att headers inte syns i index.html bevisar inte att de saknas på servern. frame-ancestors och X-Frame-Options ska levereras som HTTP-headers. X-XSS-Protection är föråldrat och har inte aktiverats. [CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy), [X-XSS-Protection](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-XSS-Protection).

Supabases Auth-gränser skyddar autentiseringsendpoints och ersätter inte anropsbegränsning i en egen Edge Function. [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).
