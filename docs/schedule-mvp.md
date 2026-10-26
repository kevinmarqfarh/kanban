# Dagschema MVP

Schema är en egen huvudsida med kalenderikon i navigationen och delar tasks med Planner. Sidan har veckans datumknappar och en scrollande dygnslinje med 30-minuters intervall. Håll 350 ms och dra i tom tid; snabb rörelse scrollar som vanligt. Timknappar och + Planera är alternativ. Inget skapas innan Spara.

Nya och befintliga tasks kan planeras för en dag med eller utan tid, eller för en vecka utan bestämd dag. Ett valfritt `Task.schedule` lagras genom samma workspace-persistens som tavlan. Datumet för veckoplanering är veckans måndag. Deadline ändras inte. Home-länken Planera dagen öppnar Schema. Uppgifter öppnas i en editor ovanpå Schema, så sidan ligger kvar efter redigering. Home visar dagens planering först och högst tre uppgifter. Klara och avslutade uppgifter visas inte i schemat. Ta bort planering i taskeditorn behåller uppgiften.

Exportera kalender hämtar aktiva tidsatta tasks som en .ics-fil med stabila task-UID:n och lokala klockslag. Import är en ögonblicksbild; det är ingen prenumeration eller automatisk synk med Apple/Google. Omtolkning av upprepade importer beror på kalenderappen. Google OAuth, EventKit och tvåvägssynk ingår inte.

Verifiering: npm test, npm run build och npm run test:schedule med devserver på 5173. ENGINE=webkit node tests/schedule-acceptance.cjs testar Safari-motorn. Touchtestet använder Chromiums emulerade touchhändelser; fysisk iPhone-verifiering återstår.


## PC: klicka och dra med mus

I ledig tid kan du klicka för ett nytt 30-minutersblock eller trycka ner musknappen och dra direkt för att välja tidslängd. Ingen långtryckning behövs. Sluttiden följer närmaste halvtimmesgräns; det går att dra både framåt och bakåt. Släpp för att namnge uppgiften och spara. Titel får fokus direkt.

Escape avbryter en pågående markering, och högerklick skapar inget. Befintliga uppgifter öppnas som tidigare, och timknapparna fungerar med tangentbordet. Dagens sista halvtimme kan sluta vid 24:00. Musgesterna gäller också smala datorfönster. På faktisk touch behålls håll-och-dra och vanlig svepscrollning.

Med server på port 4173: `npm run test:schedule-desktop`. Webbläsartesterna kontrollerar snabbt klick, omedelbar dragning åt båda håll, sparning/omladdning, Escape, befintliga uppgifter, tangentbord och midnatt i Chromium och WebKit. `APP_URL=http://127.0.0.1:4173 node tests/schedule-touch.cjs` verifierar fortsatt touchval och scrollning.
