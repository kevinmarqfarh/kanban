# Dagens briefing

Överst på **Home** visar Forma en briefing för dagen. Den bygger på kort i Planner och födelsedagar och ska svara på tre frågor: *hur ser dagen ut, vad gör jag först och hur tar jag mig an resten?*

Briefingen räknas fram på enheten varje gång arbetsytan ändras och varje minut medan appen är öppen. Den använder ingen AI och hittar inte på något. Varje mening hänvisar till ett verkligt kort, en deadline eller en födelsedag, och samma underlag ger alltid samma briefing. Briefingen är fristående från **Daglig sammanfattning** (importerade och automatiska debriefingar). Den kan dock sparas dit som historik.

Koden finns i `src/lib/briefing.ts` (regler, ren funktion) och `src/components/Briefing.tsx` (vy). Stilarna finns i `src/briefing.css`.

## Innehåll

| Del | Innehåll |
| --- | --- |
| Hälsning och rubrik | *God morgon* (05–10), *Hej* (10–17), *God kväll* (17–) och *God natt* (00–05). Rubriken beskriver dagens läge, se nedan. |
| Sammanfattning | Fakta först, till exempel ”2 uppgifter har deadline idag och 1 är försenad. Mira fyller 7 på lördag.” |
| Siffror | Försenat (rödmarkerat när det finns något), Idag, Kommande 7 dagar, Pågår och Födelsedagar inom 7 dagar. |
| Gör först | De tre viktigaste öppna korten med skäl: deadline, prioritet, pågår och checklistans läge. Tryck för att öppna kortet i Planner. |
| Förslag | Konkreta råd, max sex, varav tre visas innan *Visa alla förslag*. |
| Kommande 7 dagar | Deadlines (i tidsordning) och födelsedagar per dag. Endast dagar med innehåll visas. |

Kort i kolumnerna *Klart* och *Finalized* räknas aldrig med.

## Dagens läge

| Läge | Villkor | Rubrik |
| --- | --- | --- |
| `overloaded` | Fler än 5 kort är försenade eller har deadline idag | Mer än en dag rymmer |
| `busy` | Något är försenat, eller minst 3 deadlines idag | En dag för fokus |
| `steady` | Någon deadline idag eller i morgon, eller ett kort med hög prioritet | En hanterbar dag |
| `calm` | Inget av ovanstående | En lugn dag |

En tom Planner utan födelsedagar får rubriken *Ett tomt blad*.

## Rangordning för Gör först

Varje öppet kort får en poäng. Högst poäng hamnar först. Vid lika poäng kommer det äldsta kortet först.

1. **Deadline** avgör mest:
   - försenat: 1 100 + 5 per dag, högst 30 dagar
   - idag med klockslag: 905–1 000, tidigast först
   - idag utan klockslag: 800
   - i morgon: 500
   - om 2–3 dagar: cirka 300
   - inom en vecka: cirka 130
   - längre fram: 40

   Ett klockslag som har passerat räknas som försenat (”Försenad sedan 10:30”).
2. **Prioritet**: hög +260, medel +80 och låg −20.
3. **Momentum**: kort i *Pågår* +60 och en checklista som är minst halvklar upp till +40. Momentum räknas inte för kort med klockslag idag. En tid man ska passa går alltid före något som bara råkar vara påbörjat.

## Förslag

Förslagen visas i den här ordningen. De som inte gäller hoppas över.

| Förslag | När | Råd |
| --- | --- | --- |
| Födelsedag idag | Någon fyller år idag | Hör av dig redan på förmiddagen. |
| Välj tre, flytta resten | Läget `overloaded` | Gör de tre under *Gör först* och ge resten ett realistiskt datum. |
| Ta hand om det försenade | Något är försenat | Börja med det äldsta. Gör klart det eller sätt ett ärligt nytt datum. |
| Passa tiderna | Deadlines med klockslag idag | Listar tiderna i ordning och föreslår att annat arbete läggs runt dem. |
| Födelsedag snart | 1–3 dagar kvar | Ordna present idag. Presentkort, upplevelser och blommor går att fixa samma dag. |
| | 4–6 dagar kvar | Ordna present eller hälsning nu, och skicka det som ska med post inom ett par dagar. |
| | 7–14 dagar kvar | Skriv ner en presentidé nu. |
| Avsluta innan du börjar nytt | Fler än 3 kort i *Pågår* | Gör klart minst ett innan du drar in något nytt. |
| Välj en sak att starta | Inget i *Pågår* (inte när dagen är överfull) | Flytta det översta kortet i *Gör först* till *Pågår*. |
| Snabb vinst | Ett kort med 1–2 punkter kvar av en minst halvklar checklista | Bra att ta när energin är låg. |
| Förbered morgondagen | Efter kl 17 och deadlines i morgon | Fem minuter i kväll. |
| Något har legat länge | Lugn dag och ett kort utan deadline som är äldre än 21 dagar | Gör det, ge det ett datum eller ta bort det. |
| Använd lugnet | Lugn dag | Lägg en fokuserad stund på det viktigaste som saknar deadline. |
| Tom Planner / allt klart | Inga öppna kort | Leder till Planner. |

Kolumnen *Pågår* känns igen på id `doing`, eller på titeln *Pågår*, *Pågående*, *Doing* eller *In progress*. Saknas en sådan kolumn utelämnas de två förslagen om att avsluta och starta.

## Åtgärder

- **Öppna uppgiften**: öppnar kortet i Planner.
- **Lägg till i Planner** (födelsedagar 1–14 dagar bort): skapar kortet *Present till <namn>* i *Att göra* (eller i första kolumnen som varken är pågående eller klar). Kortet får etiketten *Födelsedag*, prioritet Medium och deadline dagen före födelsedagen, men aldrig ett datum som redan har passerat. Kortets id är `briefing-gift:<födelsedags-id>:<datum>`, så knappen kan inte skapa dubbletter. Den byts mot *Finns i Planner* som öppnar kortet. Födelsedagspåminnelser skapar fortfarande aldrig kort på egen hand; kortet skapas bara när du trycker på knappen.
- **Kopiera** (ikon uppe till höger): kopierar briefingen som vanlig text.
- **Spara i historiken** (ikon uppe till höger): sparar briefingen som dagens post under *Daglig sammanfattning*, med titeln ”Dagens briefing – <rubrik>”. Posten följer det vanliga debriefformatet och samma regler för lokal lagring och molnsynk. Finns det redan en sammanfattning för dagen är knappen avstängd, så att en importerad eller automatisk debriefing aldrig skrivs över.

## Tester

- `tests/briefing.mjs` ingår i `npm test` och täcker:
  - deadlines med och utan klockslag, inklusive sommartidens slut
  - rangordning, läge och överbelastning
  - pågående kort, snabba vinster, lugna dagar, gamla kort och kvällsläge
  - födelsedagar (idag, snart, planera och skottdagen 29 februari)
  - presentkort och agenda
  - att samma underlag ger samma resultat och att arbetsytan inte ändras
  - att exporten godkänns av debriefvalideringen
- `tests/briefing-acceptance.cjs` (`npm run test:briefing`, med `npm run preview` igång på port 4173) kör i Chromium och WebKit med fast klocka och kontrollerar:
  - innehåll och ordning
  - att man kommer till rätt kort i Planner
  - att presentkortet bara skapas en gång och finns kvar efter omladdning
  - att sparning och kopiering fungerar
  - att briefingen följer klockan och hanterar en tom Planner
  - mobil- och desktoplayout i ljust och mörkt tema med 44 px tryckytor

  Skärmbilderna hamnar i `tests/artifacts/<motor>/briefing/`.
