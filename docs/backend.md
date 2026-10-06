# Lagring och Supabase

## Status

Appen är färdig för lokal användning. Gästtavlan sparas i webbläsaren efter varje ändring och följer med vid omladdning. Exempelinnehållet kan ändras eller tas bort.

Supabase-klienten pekar på `https://rucwlpzrumxejvhwazat.supabase.co`, men **molnet är inte anslutet**. Ingen klientnyckel har hämtats och `supabase/schema.sql` har inte körts i projektet. Den anslutna Supabase-integrationen saknade behörighet till projektet. Den alternativa CLI-kontrollen väntade på datorns säkra lagring och stoppades när lokal färdigställning valdes.

Appen visar därför lokal sparning och förklarar att molnsynk saknas. Den anger aldrig att något har sparats i molnet när en anslutning saknas eller ett anrop misslyckas.

## Data och synk

- En arbetsyta innehåller kolumner, uppgifter och projekt. En uppgifts kolumn anger dess status. Projektuppgifter är länkade uppgifter; deras checklistor är deluppgifter.
- Gästtavlan sparas under `forma:workspace:v1:guest`. Varje inloggat konto använder en separat nyckel med kontots användar-ID. Inloggning och utloggning raderar inte dessa kopior.
- Ett nytt konto får en tom tavla. Den lokala tavlan kan kopieras frivilligt till ett tomt konto; gästens original ligger kvar.
- Molnet använder en JSON-rad per konto i `public.kanban_workspaces`. Row Level Security begränsar läsning, skapande och uppdatering till radens ägare. Gäster får inga databasrättigheter.
- Varje lyckad serveruppdatering ökar `revision`. En skrivning kräver den senast inlästa revisionen, så att en annan enhets ändringar inte skrivs över automatiskt. Vid konflikt väljer användaren vilken version som ska behållas.
- Vid nätverksfel finns ändringarna kvar lokalt. Återförsök läser serverversionen innan något sparas. Uppdateringar från en annan enhet hämtas när appen åter blir synlig, och konflikter behöver lösas av användaren.
- Felaktiga lokala data bevaras under en nyckel med suffixet `:recovery:<timestamp>` innan en säker arbetsyta används. När molnversionen väljs vid konflikt sparas föregående lokalversion med suffixet `:backup`.

Detta är avsiktligt en liten lösning för privat bruk. Lokal lagring hör till samma webbläsare och adress. Den delas inte automatiskt mellan iPhone och Mac, och kan försvinna om webbläsardata rensas. Molnsynk kräver stegen nedan.

## Anslut det angivna projektet senare

Använd ett Supabase-konto som har åtkomst till projektet `rucwlpzrumxejvhwazat`. CLI 2.119.0 har verifierats via sina hjälpsidor. Kommandona nedan är **instruktioner för senare anslutning**, inte redan utförda ändringar.

1. Logga in och kontrollera att rätt projekt finns:

   ```sh
   npx --yes supabase@2.119.0 login
   npx --yes supabase@2.119.0 projects list --output-format json
   ```

   CLI-inloggningen använder datorns säkra lagring. Datorn behöver vara upplåst för att ge åtkomst. [Officiell CLI-dokumentation](https://supabase.com/docs/reference/cli/supabase-login).

2. Kontrollera befintlig databasstruktur innan något skapas:

   ```sh
   npx --yes supabase@2.119.0 db query --linked --project-ref rucwlpzrumxejvhwazat --output-format json "select table_name from information_schema.tables where table_schema = 'public';"
   ```

   Om `kanban_workspaces` redan finns: granska dess struktur och rättigheter och anpassa anslutningen innan du fortsätter. SQL-filen använder en vanlig `CREATE TABLE` i en transaktion och ersätter inga befintliga tabeller.

3. Om tabellen saknas, kör den förberedda SQL-filen:

   ```sh
   npx --yes supabase@2.119.0 db query --linked --project-ref rucwlpzrumxejvhwazat --file supabase/schema.sql
   ```

   Filen skapar endast appens tabell, ägarpolicyer och versionsräknare. Den inkluderar explicita rättigheter för inloggade användare enligt Supabases [nya regler för API-exponering](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).

4. Hämta projektets **publishable key** i Supabase och skapa en lokal `.env.local` från `.env.example`:

   ```dotenv
   VITE_SUPABASE_URL=https://rucwlpzrumxejvhwazat.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   `.env.local` ignoreras av Git. Använd en publik klientnyckel; servernycklar som `service_role` och `sb_secret_...` hör aldrig hemma i appen. Klienten avvisar dessa nyckeltyper. Starta om utvecklingsservern efter miljöändringen.

5. Kör säkerhetskontrollen:

   ```sh
   npx --yes supabase@2.119.0 db advisors --linked --project-ref rucwlpzrumxejvhwazat --type security --output-format json
   ```

   Kontrollera sedan två separata testkonton: skapa en uppgift, ladda om, logga ut och verifiera att gästens tavla återkommer. Det andra kontot ska aldrig kunna läsa det första kontots arbetsyta. Prova också samtidiga ändringar i två webbläsare och kontrollera att en konflikt visas. [Supabases RLS-dokumentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

E-postbekräftelse följer Supabase-projektets Auth-inställningar. Appen visar ett meddelande när registrering kräver bekräftelse. Kontrollera projektets godkända omdirigeringsadresser för den adress där appen körs.

## Verifierat

- Strikt TypeScript-kontroll av datalagret godkänd.
- `node tests/data-integrity.mjs` godkänd: separata exempelkopior, giltig tom arbetsyta, referenser, unika ID:n och avvisning av felaktiga checklistor och kommentarer.
- Gästdata och kontodata har separata lagringsnycklar.
- Testfråga och säkerhetskontroll mot det angivna Supabase-projektet försöktes via integrationen, men nekades av behörighet. **Live-inloggning, molnlagring och RLS är därför inte verifierade ännu.**
