# Oberoende domarrevision · 5 oktober 2026

Den lokala slutrevisionen passerar **109 av 109 webbläsarscenarier**. Fyra reproducerade fel som kunde förlora eller återuppliva innehåll mellan två flikar är åtgärdade. Bedömningen gäller produktionsbygget på `http://127.0.0.1:4173`, med isolerade testdata i Chromium och WebKit.

Domaren ändrade endast testskript och dokumentation. Implementation, design och datalager reviderades av andra agenter. Alla granskningsbilder nedan togs under denna revision; före- och efterbilder ligger i separata mappar.

## Resultat före och efter

| Testsvit | Chromium efter | WebKit efter |
| --- | ---: | ---: |
| Kanban, projekt, sökning, tema, lagring och backup | 18 / 18 | 17 / 17 |
| Födelsedagar | 12 / 12 | 12 / 12 |
| Summary och debriefingar | 14 / 14 | 14 / 14 |
| Fördjupad revision: flikar, snabba ändringar, återförsök och smala vyer | 11 / 11 | 11 / 11 |
| **Totalt** | **55 / 55** | **54 / 54** |

De 87 befintliga normalflödena passerade även före revisionen. Den nya granskningen reproducerade samtidigt fyra fel i vardera motor, medan fyra övriga granskningsscenarier passerade. Efter revisionen tillkom tre scenarier för lagringsfel och återhämtning. Antalet före- och eftertester är därför olika.

Den sista ändringen var en ren mobil CSS-förenkling av Kanbans statistikruta. De sex berörda baslinje-, debriefing- och revisionskörningarna upprepades på det sista bygget. Födelsedagssviternas 24 godkända scenarier behålls från föregående slutbygge; deras kod och Profile-layout ändrades inte av mobiljusteringen.

| Reproducerad brist före revisionen | Verifierat beteende efter revisionen |
| --- | --- |
| Ett nyss sparat kort i flik A försvann när en äldre form i flik B sparade ett annat kort. | Båda korten finns kvar efter sparande och omladdning. |
| En äldre form skrev över en beskrivning som ändrats i en annan flik, trots att användaren bara ändrade titeln. | Titel och beskrivning från respektive flik bevaras. |
| En gammal redigeringsform återupplivade ett kort som avsiktligt raderats i en annan flik. | Kortet förblir borttaget; den äldre formen får inte skapa det igen. |
| En äldre fliks läs-/döljåtgärd förlorade en nyare importerad debriefing. | Nyare rapport, tidigare historik och läs-/döljmarkeringar bevaras mellan flikarna. |

Efter layoutrevisionen saknar redan lästa rapporter en överflödig döljknapp. Eftertestet verifierar därför att en äldre läsvy återgår till uppdaterad historik och döljer den nya olästa rapporten, samtidigt som den tidigare rapportens läsmarkering finns kvar.

## Vad som faktiskt kontrollerades

- Uppgifter: samtliga efterfrågade fält, unika etiketter, checklistor, kommentarer, projektreferenser, datum, skapande, redigering, avsiktlig borttagning och omladdning. Tio kort redigerades direkt efter varandra och kontrollerades mot exakt sparat innehåll.
- Flytt: muspekare och tangentbord i båda motorerna samt inmatade touchhändelser med horisontell autoscroll i Chromium. Ny status sparas. Mobilens statusflikar och valbar status ger också navigering och flytt.
- Kolumner och projekt: skapa, byt namn och ta bort tom kolumn utan att ändra kort; projekt med exakt en huvuduppgift och två deluppgifter; checklistans slutförandemarkering bevaras.
- Lagringsfel: ett avsiktligt kvotfel ändrar inte den tidigare diskkopian och ger ingen falsk sparad toast. Utkastet finns kvar i formen. Nytt försök skapar exakt ett kort, en checklistrad och en kommentar, respektive exakt ett projekt och en huvuduppgift. En ny form som återhämtats vid fokus bevarar dessutom en annan fliks senare ändring av beskrivning och status.
- Födelsedagar: äldre cache utan födelsedagsfält, namn och födelseår, alla fyra oberoende påminnelseval, rätt ålder och födelsedag i uppgiften, datumstyrd skapning, en enda aktuell påminnelse vid sen återkomst, ingen dubblett efter omladdning, ingen återskapning av raderad uppgift samt avstängning och borttagning.
- Debriefingar: tom start utan fabricerad rapport, olästa markeringar, läsning, döljning, historik, återöppning, oförändrade identiska importer, ny version för samma dag, giltig enkel- och flerpostfil, atomisk avvisning av felaktiga filer samt HTML bevarad som vanlig text.
- Backup: nedladdningen bevarar arbetsytans uppgifter, kolumner, projekt och födelsedagar samt all debriefhistorik. Läs-/döljåtgärder ändrar inte arbetsytans innehåll.
- Gränssnitt: fyra exakta navigationsval, sökning och projektfilter, ljust/mörkt/systemtema, fokus in i och tillbaka från modaler/läsvy, Escape, synliga fel och inga oinfångade webbläsarundantag.

Testernas UI-assertioner anpassades till den reviderade sakliga Profile-texten, frånvarande oanvändbar inloggning och nya Summary-tomtexten. Etiketter jämförs som unika värden: bevarad befintlig ordning räknas inte som dataförlust. Vid misslyckat sparande kontrolleras att tidigare oskickade checklistor och kommentarer finns kvar som synliga formulärrader, inte att deras nu tömda inmatningsfält fortfarande innehåller samma text.

## Visuell bedömning

Färska skärmbilder granskades för **1512 × 982**, **440 × 956** och **320 × 956**. Alla fyra navigationsval får plats utan dokumentöverflöde. Uppgiftsformen håller sig inom bredden, mobilinmatning använder minst 16 px text och selectkontroller är minst 44 px höga. Födelsedags- och läsvyer verifierades dessutom av sina respektive sviter i båda teman.

De funktionella sidrubrikerna ger bättre orientering. Profile prioriterar nu lagring, födelsedagar, tema och säkerhetskopia; en stor profilpresentation och oanvändbar inloggning blockerar inte längre de relevanta funktionerna. Kortens gråvita ytor, kanter och återhållsamma glass-effekt ger en konsekvent stil. Ingen blockerande visuell brist hittades.

Domaren påpekade även att Kanbans tre statistikkort upprepade en del av informationen i statusflikar och kolumner och flyttade första uppgiften långt ned på mobilen. Detta rättades i slutbygget: statistikraden visas nu bara på större skärmar. På mobilen ligger filter och statusflikar direkt före tavlan, vilket ger uppgifterna mer utrymme. De uppdaterade efterbilderna visar denna förenkling.

| Vy | Före | Efter |
| --- | --- | --- |
| Kanban, desktop | [Före](../tests/artifacts/webkit/revision-2026-10-05/before/1512-kanban-light.png) | [Efter](../tests/artifacts/webkit/revision-2026-10-05/after/1512-kanban-light.png) |
| Profile, mobil | [Före](../tests/artifacts/chromium/revision-2026-10-05/before/440-profile-light.png) | [Efter](../tests/artifacts/chromium/revision-2026-10-05/after/440-profile-light.png) |
| Summary, 320 px | [Före](../tests/artifacts/webkit/revision-2026-10-05/before/320-summary-light.png) | [Efter](../tests/artifacts/webkit/revision-2026-10-05/after/320-summary-light.png) |

Ytterligare efterbilder: [Kanban på mobil](../tests/artifacts/webkit/revision-2026-10-05/after/440-kanban-light.png), [Projects på mobil](../tests/artifacts/webkit/revision-2026-10-05/after/440-projects-light.png), [uppgiftsform på 320 px](../tests/artifacts/webkit/revision-2026-10-05/after/320-task-form-light.png), [mörk Summary](../tests/artifacts/webkit/revision-2026-10-05/after/440-summary-dark.png).

## Underlag och gränser

Testskript: [baslinje](../tests/acceptance.cjs), [födelsedagar](../tests/birthday-acceptance.cjs), [debriefingar](../tests/debrief-acceptance.cjs), [fördjupad revision](../tests/revision-acceptance.cjs). De kan köras med respektive `test:e2e`, `test:birthdays`, `test:debriefs` och `test:revision`. `BROWSER_ENGINE=webkit` väljer WebKit; `REVISION_PHASE=before` bevarar separat före-underlag.

Maskinresultat för den fördjupade revisionen: [Chromium före](../tests/artifacts/chromium/revision-2026-10-05/before/results.json), [WebKit före](../tests/artifacts/webkit/revision-2026-10-05/before/results.json), [Chromium efter](../tests/artifacts/chromium/revision-2026-10-05/after/results.json), [WebKit efter](../tests/artifacts/webkit/revision-2026-10-05/after/results.json).

Detta är lokal verifiering med emulerade mobila vyer och WebKit, inte ett prov på en fysisk iPhone eller installerad PWA. Native touch-drag testades bara i Chromium; WebKit saknar samma CDP-inmatningsmöjlighet i denna testmiljö. Molninloggning, Supabase-tabeller, RLS, synk mellan fysiska enheter och verklig leverans från GPT-automationer har inte verifierats. Födelsedagspåminnelser skapas när appen är öppen eller återkommer till aktivitet; push eller serverbakgrund är inte verifierade funktioner. Säkerhetskopians export och innehåll är testade; en återställningsfunktion för hela arbetsytans backup ingår inte i det verifierade gränssnittet.
