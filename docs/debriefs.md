# Dagliga debriefingar

Debriefingar har en egen inkorg och historik. De ligger separat från tavlans uppgifter, projekt och födelsedagar. Att läsa, dölja eller importera en sammanfattning ändrar aldrig arbetsytans JSON.

## Lokal användning

Importera en JSON-fil i vyn för sammanfattningar. Filen kan innehålla ett objekt eller en array med 1–100 objekt, ett per datum. Exemplet nedan visar formatet; texten är exempeldata.

```json
{
  "date": "2026-10-05",
  "title": "Dagens debriefing",
  "summary": "Prioritera dagens deadline och välj en sak att slutföra.",
  "body": "Dagens fokus\n\nSe över uppgifterna som har deadline idag. Välj därefter en uppgift att slutföra innan du påbörjar något nytt.",
  "createdAt": "2026-10-05T08:00:00.000Z"
}
```

- `date` är ett verkligt kalenderdatum i formatet `YYYY-MM-DD`. Historiska och framtida datum accepteras. Datumet är också postens ID; det finns en sammanfattning per dag.
- `title` och `body` måste innehålla text. `summary` måste vara en sträng och kan vara tom. Gränserna är 120, 20 000 respektive 500 Unicode-tecken. Inledande och avslutande blanksteg tas bort.
- `createdAt` är valfritt. Om det anges krävs en ISO-tid med tidszon, exempelvis `2026-10-05T08:00:00Z`. Annars används importtiden.
- Innehållet visas som vanlig text. Radbrytningar bevaras, medan HTML-liknande text inte körs eller tolkas som HTML. Okända fält ignoreras. Importen tar inte emot läst- eller döljstatus.
- En array får inte innehålla flera poster med samma datum. Det finns inget omslutande `debriefs`-objekt i filformatet.

Identisk lokal import behåller läst- och döljstatus, även om importtiden eller `createdAt` skiljer sig. Ändras rubriken, sammanfattningen eller texten för samma datum ersätts just den dagens innehåll och blir oläst igen. Andra datum påverkas inte.

Att dölja en debriefing tar bort den från olästa poster men behåller historiken. Dölja markerar inte automatiskt posten som läst. Olästa poster saknar både läst- och döljtid.

Inkorgen sparas i en separat webbläsarnyckel: `forma:debriefs:v1:guest` för gästen och `forma:debriefs:v1:<user-id>` för respektive konto. Cacheformatet är `{ "version": 1, "entries": [], "pending": {} }`. `pending` innehåller läst-/döljändringar som behöver skickas till ett anslutet konto. Lokal lagring delas inte mellan enheter.

## Förberedd molnanslutning

`supabase/debriefs.sql` förbereder `public.daily_debriefs` i projektet `rucwlpzrumxejvhwazat`. Filen har inte körts. Den är fristående från `kanban_workspaces` och ersätter inga befintliga tabeller. Om en tabell med samma namn redan finns måste dess struktur granskas före anslutning.

Tabellens primärnyckel är `(user_id, date)`. RLS tillåter ett inloggat konto att läsa och skapa sina egna poster. Användaren får endast uppdatera `read_at` och `dismissed_at`; rapportens datum, ägare och innehåll kan inte ändras via klientens UPDATE. Dölja använder UPDATE, inte DELETE. Rättigheterna är explicit angivna, vilket också stödjer Supabases ändrade regler för API-exponering. [API-rättigheter](https://supabase.com/docs/guides/api/securing-your-api), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [kolumnrättigheter](https://supabase.com/docs/guides/database/postgres/column-level-security), [relevant ändring](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).

Appen läser `date,title,summary,body,created_at,read_at,dismissed_at` med ett explicit ägarfilter och fallande datumordning. Läst-/döljändringar sparas lokalt och kan återförsökas efter nätverksfel. Uppdateringen filtrerar även på den inlästa `created_at`, så en sen statusändring inte markerar en reviderad rapport som läst.

Import till ett anslutet konto använder INSERT. Ett befintligt datum ger felkod `23505` och meddelandet att det redan finns en debriefing för dagen. Klienten använder inte upsert för att ersätta rapportinnehåll. Kontots inkorg hämtas när appen öppnas, åter blir synlig eller får fokus, samt varje minut medan den är synlig.

## Kontrakt för en framtida serverautomation

Ingen automation eller tidsplan har skapats. Den framtida serverkörningen behöver ett fast ägar-ID, serverlagrad behörighet och en civil dag beräknad i `Europe/Stockholm`.

1. Läs hela ägarens aktuella arbetsyta med GET:

   ```text
   https://rucwlpzrumxejvhwazat.supabase.co/rest/v1/kanban_workspaces?user_id=eq.<OWNER_UUID>&select=data,revision,updated_at
   ```

   `data` omfattar kolumner, uppgifter, projekt och eventuella födelsedagar. Utgå från den inlästa versionen när sammanfattningen skrivs. Vid saknad arbetsyta eller läsfel ska körningen inte hitta på ett innehåll.

2. Validera rapportens datum och text enligt JSON-kontraktet ovan. Spara den med POST till:

   ```text
   https://rucwlpzrumxejvhwazat.supabase.co/rest/v1/daily_debriefs
   ```

   REST-raden använder databasens fältnamn:

   ```json
   {
     "user_id": "<OWNER_UUID>",
     "date": "2026-10-05",
     "title": "Dagens debriefing",
     "summary": "Kort sammanfattning.",
     "body": "Hela debriefingen som vanlig text.",
     "created_at": "2026-10-05T08:00:00.000Z"
   }
   ```

   Skicka JSON med `Content-Type: application/json`. Den nya servernyckeln skickas i `apikey`-headern; den är inte en JWT som ska skickas som `Authorization: Bearer`. Servernyckeln ger Postgres-rollen `service_role` och passerar RLS, så körningen måste själv begränsa alla anrop till rätt ägar-ID. Nyckeln lagras endast i serverns hemlighetslagring. Appen använder en publishable key och användarens session. [Supabases nyckelguide](https://supabase.com/docs/guides/getting-started/api-keys).

3. Primärnyckeln förhindrar flera poster samma dag. Ett återförsök som får `23505` ska läsa dagens befintliga post; identiskt innehåll betyder att körningen redan lyckats. Ett annat innehåll ska inte ersättas av ett vanligt återförsök. En avsiktlig serverrevision kan uppdatera just `(user_id, date)` med nytt innehåll, ny `created_at` och `read_at = dismissed_at = null`, så att rapporten blir oläst igen. Äldre dagar behålls.

Serverautomationens enda skrivmål är `daily_debriefs`. Den ska inte skriva tillbaka `kanban_workspaces.data` eller skapa en Kanban-uppgift för rapporten. Därmed kan användaren fortsätta ändra tavlan samtidigt som debriefingen skapas.

## Verifiering och återstående anslutning

`tests/debriefs.mjs` verifierar riktiga kalenderdatum, ISO-tider, JSON-validering, vanlig text, storleksgränser, importdubbletter, läst-/döljstatus, historik och reviderat innehåll. TypeScript-kontrollen verifierar domänfunktionerna mot appens datatyper.

SQL-filen har granskats mot aktuella officiella Supabase-dokument och changelog men har **inte körts mot en databas**. Molnimport, serverautomation, SQL-rättigheter och RLS är därför inte liveverifierade. Före anslutning behöver tabellen skapas, rättigheterna kontrolleras med två separata testkonton och en testpost läsas/importeras. Kontrollera också att en klient inte kan uppdatera rapportinnehåll, medan läst-/döljstatus fungerar för ägaren. Inga nycklar eller molnändringar behövs för den lokala JSON-importen.
