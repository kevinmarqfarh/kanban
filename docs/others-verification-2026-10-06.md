# Oberoende verifiering · Home, Planner, Projects och Others

**153 av 153 browser-scenarier är godkända** i den lokala revisionen den 6 oktober 2026. Nya träningspass, kosthistorik och recept bevarar sitt innehåll efter omladdning, lagringsfel och arbete i två flikar. Födelsedagar visas nu i Home och notiser utan att skapa nya kanbankort. Inga blockerande lokala fynd återstår.

Den första verifieringen utfördes av en separat domaragent som endast ändrade tester och denna rapport. Huvudagenten avslutade de samlade kontrollerna efter de parallella projektändringarna. Produktionskoden skrevs av andra agenter. Testerna använder isolerade webbläsarprofiler och syntetiska data; användarens sparade arbetsyta påverkas inte.

## Resultat

| Sviter | Chromium | WebKit |
| --- | ---: | ---: |
| Planner, projekt, sökning, teman, lagring och export | 19 / 19 | 18 / 18 |
| Födelsedagar och Home-notiser | 14 / 14 | 14 / 14 |
| AI-debriefingar, läsvy, historik och import | 14 / 14 | 14 / 14 |
| Fördjupad kärnrevision: gamla flikar, tio kort, återförsök och smala vyer | 11 / 11 | 11 / 11 |
| Nya Others och Home-flöden | 19 / 19 | 19 / 19 |
| **Totalt** | **77 / 77** | **76 / 76** |

Slutkontrollen kördes även från en ren, isolerad kopia på `http://127.0.0.1:4183`, utan privata miljöfiler och utan att ändra användarens cache. De samlade 153 scenarierna passerar med den nya separationen mellan Planner och Projects. Slutbygget för denna kontroll använder `index-B0SUUZI2.js` och `index-BJ1pTLii.css`. Efter sista förtydligandet av minut-/kg-enheterna kördes Others-svitens 38 scenarier om. Separata samtidiga ändringar för Finalized/offline hanteras i andra chattar och ingår inte i denna rapports slutbygge.

## Krav som faktiskt verifierades

- **Navigation:** Home är standard. Footern har exakt Home, Planner, Projects och Others. Profile finns inte där. Kugghjulet uppe till vänster öppnar Inställningar med tema, lokal lagring och säkerhetskopia. Others visar endast sina fyra tydliga ingångar: Födelsedagar, Träning, Kost och Recept.
- **Födelsedagar:** namn, fullständigt födelsedatum, aktuell ålder och ålder vid nästa födelsedag. Tre oberoende påminnelseval: exakt 7, 14 och 30 dagar. För en födelsedag 4 november skapades ingen 30-dagarsnotis den 4 oktober; den skapades den 5 oktober. Nästa notiser kom den 21 och 28 oktober. Samma gamla uppgifter, inklusive tidigare födelsedagskort, bevarades under alla steg.
- **Notiser:** rätt person, datum och ålder; separata läs-/döljmarkeringar; inga dubbletter efter aktivitet eller omladdning; en enda aktuell notis vid sen återkomst. Gamla `birthday:`-ledgerposter hindrar inte den nya Home-modellen. Avstängda eller ändrade påminnelser tar bort inaktuella olästa notiser samtidigt som läst/dold historik bevaras. Ett äldre sparat födelsedagsval på själva dagen kan fortfarande läsas utan att nya kanbankort skapas.
- **Träning:** datum, valfri passtittel, övningsnamn, mängd, set/min, tid/vikt, minuter/kg och BPM. Lägg till och ta bort övningsrader, spara, redigera och radera ett pass. Råkopiering innehåller exakt de sparade raderna. Om clipboard-åtkomst saknas visas samma text för manuell kopiering. Svensk tangentbordsinmatning `2,5` bevaras i formulär, sparad modell, omladdning och kopierad text som `2,5 min`; decimal med punkt fungerar också.
- **Kost:** namn, mängd och enhet; dagens checklista; grön kant och avklarad rad; samma tillstånd i Home och Others. Veckosummeringen använder rätt datum. ISO-vecka 53 år 2026 verifierades för 28 december–3 januari, nästa vecka var vecka 1 år 2027, och 31 december 2025 låg i vecka 1 år 2026. Exakt datumval och historiska markeringar bevaras efter omladdning. Radering av en vana lämnar inga föräldralösa avklarandeposter.
- **Recept:** egen titel, manuella steg, sparad valfri källa, Frukost/Snacks/Middag och egna unika etiketter. Markup i stegen förblir vanlig text. Giltiga http-/https-länkar visas med säkra öppningsattribut; javascript, data, ftp, credentials och felaktiga adresser skapar ingen post. Recept från URL betyder sparad källa med egna steg, inte automatisk hämtning från webbplatsen.
- **Databevarande:** kvotfel i alla tre nya redigerare behåller utkastet och visar inget falskt sparmeddelande. Nytt försök skapar exakt en post. Kostens checklista får ett stabilt ID per vana och datum. Äldre flikar bevarar nya pass/recept och andra flikars ändrade fält eller kostdagar. Äldre öppna tränings-, kost- och receptformulär återupplivar inte avsiktligt borttagna poster.
- **Kärnregression:** alla uppgiftsfält, checklistor, kommentarer, projektets huvuduppgift/deluppgifter, kolumner, mus- och tangentbordsflytt, touchflytt i Chromium, sökning, fristående projektuppgifter och ljust/mörkt/systemtema. Tio kort redigerades efter varandra och jämfördes med exakt sparat innehåll. AI-debriefingarnas läsvy, importer, dubblettregler och historik finns kvar under Home.
- **Backup:** nedladdningen innehåller samtliga gamla arbetsytefält, födelsedagar, notiser, träningspass, kostvanor, daghistorik, recept och debriefhistorik. Exportens innehåll jämfördes med den sparade arbetsytan.

## Fynd och rättningar

Ett konkret fokusfel reproducerades i båda motorerna: när Födelsedagar öppnades med Enter från Others ersattes menyraden innan dialogen hann spara sin fokuspunkt. Escape kunde därför inte återföra fokus. Slutbygget behåller den bakomliggande vyn och utlösarknappen; samma test passerar nu i båda motorerna.

Träningens tidsenhet förtydligades efter användarens besked till minuter. Decimalfält använder en explicit regel som accepterar komma eller punkt, så `2,5` inte beror på webbläsarens behandling av ett numeriskt fält. Detta verifierades med faktisk tangentbordsinmatning, inte enbart programmatisk ifyllning.

Två testanpassningar räknas inte som produktfel: inställningsdialogens fokusprov öppnas nu från en uttryckligen fokuserad knapp med Enter, eftersom WebKit inte alltid fokuserar en knapp vid musklick; kostens inbyggda select söks med sin etikettprefix eftersom den beräknade etiketten även kan innehålla dess alternativ. Alla spar-/innehållsassertioner behölls.

## Visuell dom

Färska bilder togs i båda motorerna för **1512 × 982**, **440 × 956** och **320 × 956**, i ljust och mörkt tema. Bilderna täcker alla fyra huvudvyer, samtliga Others-sidor och redigerarna. Ingen dokumentöverflödning hittades. Alla navigationsval ryms även på 320 px. Träningsformen ryms i bredd, mobilinmatningar använder minst 16 px och dess select-/footerkontroller är minst 44 px höga.

Others håller sig till en kort lista. Home använder relevanta kort för dagens kost och kommande födelsedagar; läsvyn lyfter fram själva rapporten. Inställningar är samlade bakom kugghjulet och lägger inte en femte destination i footern. Den gråvita basen, tunna kanterna och återhållsamma glass-effekten är konsekventa. Grönt används tydligt för kostens avklarade tillstånd. På 320 px rullar kostens dagrad inom sin egen yta; resten av dokumentet håller sig inom skärmen.

Bilderna i denna svit använder testdatumet **30 december 2026** för att visa ISO-årsgränsen. De är verifieringsdata, inte påståenden om dagens faktiska innehåll.

| Bevis | Länk |
| --- | --- |
| Home, desktop | [1512 px, ljust](../tests/artifacts/home-others-final-2026-10-06/webkit/others-2026-10-06/1512-home-light.png) |
| Home, mobil | [440 px, ljust](../tests/artifacts/home-others-final-2026-10-06/webkit/others-2026-10-06/440-home-light.png), [320 px, mörkt](../tests/artifacts/home-others-final-2026-10-06/webkit/others-2026-10-06/320-home-dark.png) |
| Others-menyn | [440 px](../tests/artifacts/home-others-final-2026-10-06/webkit/others-2026-10-06/440-others-light.png) |
| Träningsform | [320 px, mörkt](../tests/artifacts/home-others-final-2026-10-06/webkit/others-2026-10-06/320-workout-form-dark.png) |
| Kost, avklarad dag | [440 px, ljust](../tests/artifacts/home-others-final-2026-10-06/webkit/others-2026-10-06/440-nutrition-light.png), [320 px, mörkt](../tests/artifacts/home-others-final-2026-10-06/webkit/others-2026-10-06/320-nutrition-dark.png) |
| Receptform | [440 px, mörkt](../tests/artifacts/home-others-final-2026-10-06/webkit/others-2026-10-06/440-recipe-form-dark.png) |
| Födelsedagsform | [Mobil](../tests/artifacts/home-others-final-2026-10-06/webkit/birthdays-2026-10-06/mobile-birthday-form.png) |

## Körning och begränsningar

[Others-sviten](../tests/others-acceptance.cjs) körs med `npm run test:others`. [Födelsedagssviten](../tests/birthday-acceptance.cjs) använder `test:birthdays`. [Baslinjen](../tests/acceptance.cjs), [debriefingar](../tests/debrief-acceptance.cjs) och [kärnrevisionen](../tests/revision-acceptance.cjs) körs med `test:e2e`, `test:debriefs` respektive `test:revision`. `BROWSER_ENGINE=webkit` väljer den andra motorn; `APP_URL` väljer previewadressen.

Vid slutkontrollen verifierades även att Home börjar högst upp efter omladdning. Testförväntningarna för gamla projektkopplingar anpassades till den uttryckliga separationen: Planner-kortets metadata finns kvar och en fullständig självständig uppgift finns i projektet. Äldre status bevaras enligt den gamla tavlans slutförandekolumn.

Maskinresultat: [Others Chromium](../tests/artifacts/home-others-final-2026-10-06/chromium/others-2026-10-06/results.json), [Others WebKit](../tests/artifacts/home-others-final-2026-10-06/webkit/others-2026-10-06/results.json), [födelsedagar Chromium](../tests/artifacts/home-others-final-2026-10-06/chromium/birthdays-2026-10-06/results.json), [födelsedagar WebKit](../tests/artifacts/home-others-final-2026-10-06/webkit/birthdays-2026-10-06/results.json), [kärnrevision Chromium](../tests/artifacts/home-others-final-2026-10-06/chromium/revision-2026-10-06/after/results.json), [kärnrevision WebKit](../tests/artifacts/home-others-final-2026-10-06/webkit/revision-2026-10-06/after/results.json).

Detta är lokal verifiering med mobila viewportar och WebKit-emulering. Fysisk iPhone, installerad PWA, Supabase-inloggning, live-RLS, synk mellan fysiska enheter, GPT-automationernas leverans och pushnotiser har inte verifierats. Födelsedagspåminnelser är notiser i appen som uppdateras vid aktivitet. Råkopieringens lyckade clipboard-väg och fallback testades med en isolerad clipboard-stub, inte användarens riktiga urklipp. Backupens export och innehåll är verifierade; en fullständig återställningsfunktion från backup ingår inte i det testade gränssnittet.

## Lokal överlämning

Home och Others slutförs lokalt enligt användarens val. Manuella bilder av aktuell app: [Home](others-artifacts/home-mobile.jpg), [Others](others-artifacts/others-mobile.jpg) och [Kost](others-artifacts/nutrition-mobile.jpg). Den ordinarie lokala förhandsvisningen på localhost:4173 har öppnats och kontrollerats. Den tillfälliga isolerade testservern stängs efter verifieringen; resultat och bilder finns kvar under tests/artifacts/home-others-final-2026-10-06.
