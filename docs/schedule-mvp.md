# Dagschema MVP

Schema är en egen huvudsida med kalenderikon i navigationen och delar tasks med Planner. Sidan har veckans datumknappar och en scrollande dygnslinje med 30-minuters intervall. Håll 350 ms och dra i tom tid; snabb rörelse scrollar som vanligt. Timknappar och + Planera är alternativ. Inget skapas innan Spara.

Nya och befintliga tasks kan planeras för en dag med eller utan tid, eller för en vecka utan bestämd dag. Ett valfritt `Task.schedule` lagras genom samma workspace-persistens som tavlan. Datumet för veckoplanering är veckans måndag. Deadline ändras inte. Home-länken Planera dagen öppnar Schema. Uppgifter öppnas i en editor ovanpå Schema, så sidan ligger kvar efter redigering. Home visar dagens planering först och högst tre uppgifter. Klara och avslutade uppgifter visas inte i schemat. Ta bort planering i taskeditorn behåller uppgiften.

Exportera kalender hämtar aktiva tidsatta tasks som en .ics-fil med stabila task-UID:n och lokala klockslag. Import är en ögonblicksbild; det är ingen prenumeration eller automatisk synk med Apple/Google. Omtolkning av upprepade importer beror på kalenderappen. Google OAuth, EventKit och tvåvägssynk ingår inte.

Verifiering: npm test, npm run build och npm run test:schedule med devserver på 5173. ENGINE=webkit node tests/schedule-acceptance.cjs testar Safari-motorn. Touchtestet använder Chromiums emulerade touchhändelser; fysisk iPhone-verifiering återstår.
