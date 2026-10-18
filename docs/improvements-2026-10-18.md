# Tysta förbättringar, 18 oktober 2026

Sex förbättringar som gör appen smartare utan att lägga till något på skärmen. Ingen ny ruta, knapp eller sida, med ett undantag: Ångra-raden, som ersätter en bekräftelsefråga.

## 1. Hemskärmen blir mörk efter solnedgång

En dockad iPad med tema *System* följer solen på vald väderort i stället för iPadens egen inställning:

- mörkt från solnedgång till soluppgång
- ljust resten av dygnet

Tiderna räknas på enheten med samma soluppgångsekvation som vädret använder (`src/lib/sun.ts`). Temat kontrolleras varje minut och när skärmen vaknar.

- Har du valt *Ljust* eller *Mörkt* gäller det alltid.
- Telefoner och datorer följer sin egen systeminställning som vanligt.
- Under Inställningar → Tema står en rad om detta, men bara på hemskärmen och bara när *System* är valt.

Koden finns i `src/hooks/useSunTheme.ts` och temalogiken i `src/App.tsx`.

## 2. Vädret som en mening i briefingen

Sammanfattningen i dagens briefing, på Home och på hemskärmen, får en mening om vädret i samma stycke:

| När | Exempel |
| --- | --- |
| Torrt | ”Uppehåll resten av dagen, som varmast 15°.” |
| Nederbörd väntas | ”Lätt regn väntas 15–18, ta med paraply.” |
| Nederbörd nu | ”Regn nu, fram till 19, ta med paraply.” |
| Från kl. 18 (om morgondagen) | ”I morgon: regn 06–19, ta med paraply.” eller ”I morgon: klart, 6°–11°.” |
| Minusgrader i natt | Tillägget ”Frost i natt, ner mot −2°.” |

Så tolkas prognosen:

- Nederbörd betyder blött väder med minst 40 % risk.
- En enstaka timme med hög risk men torr symbol delar inte regnet i två perioder.
- Paraply nämns vid regn, duggregn, skurar och åska.

Koden finns i `weatherNote` i `src/lib/forecast.ts`.

## 3. Snabbuppgiften förstår datum

Skriv datumet sist i texten. Chippet bredvid fältet visar direkt vad som lästes, till exempel *Fre 14:00*, i stället för *Idag*. Bekräftelsen skriver ut hela datumet: ”… med deadline fre 16 okt 14:00.”

| Skrivet | Blir |
| --- | --- |
| `Ring tandläkaren fre 14` | Ring tandläkaren, kommande fredag 14:00 |
| `Hämta paket imorgon kl 17.30` | i morgon 17:30 |
| `Betala hyran övermorgon` | i övermorgon |
| `Städa på söndag`, `Handla mån` | kommande söndag eller måndag (dagens veckodag betyder i dag) |
| `Möte 24/10`, `Möte 24/10 13:15` | 24 oktober, eventuellt med tid |
| `Julklappar 24 dec`, `Deklarera 2 maj` | nästa gång datumet kommer |
| `Ansökan 2026-11-01` | det datumet |
| `Ring mamma kl 19`, `Ring mamma 19:30` | i dag med tid |

Bara slutet av texten läses. ”Läs kapitel 14” och ”Fredagsmys” förblir som de är, och omöjliga datum och tider gissas aldrig. Koden finns i `src/lib/quickAdd.ts`.

## 4. Kosttillskotten följer tiden på dygnet

På Home och hemskärmen hamnar dagens aktuella tillskott överst:

- **Från kl. 15 (till kl. 04):** kvällens först.
- **Övrig tid:** morgonens först.

Därefter kommer tillskott utan tid och sist de andra. Sparad ordning och avbockningar ändras aldrig, och Kost visar listan i sparad ordning. Koden finns i `orderHabitsByTime` i `src/lib/nutritionTime.ts`.

## 5. Ångra i stället för ”Ta bort …?”

Att ta bort sker direkt. I stället för en fråga visas ”Uppgiften är borttagen · Ångra” i sju sekunder.

| Område | Var Ångra visas |
| --- | --- |
| Uppgifter, projektuppgifter, projekt, kostvanor, recept | Som en rad längst ned på skärmen |
| Födelsedagar | Inne i födelsedagsfönstret |
| Träning och anteckningar | I listan, som de redan hade |

Ångra lägger tillbaka exakt det som togs bort, på samma plats. Det fungerar även om annat har ändrats under tiden, och följer med det som hör till:

- en kostvanas avbockningar
- en födelsedags påminnelser
- ett projekts uppgifter

Två saker frågar fortfarande först eftersom de inte kan ångras: att radera för alltid i papperskorgen och att ta bort en kolumn, där du väljer vart korten flyttas. Koden finns i `src/lib/undo.ts`, och toasten med `removeWithUndo` i `src/App.tsx`.

## 6. Lugnare väderremsa

- **Tid:** remsan visar en tid bara när den betyder något. Det gäller offline (”Sparat 14:18 · offline”), fel och prognoser äldre än två timmar (”Från 14:18”). En färsk prognos visar ingen tid.
- **Källa:** källan är en liten i-ikon med text för skärmläsare. Hela källhänvisningen och hämtningstiden står längst ned i bladet med dagens timmar.

## Tester

- `tests/improvements.mjs` (i `npm test`) täcker:
  - datumtolkningen med falska vänner som ”Läs kapitel 14”
  - ordningen över dygnet
  - vädermeningen mot SMHI:s riktiga prognos, inklusive morgondagen och frost
  - solgränserna
  - Ångra, även efter andra ändringar, för projektuppgifter, födelsedagar med påminnelser och anteckningar i papperskorgen
- `tests/improvements-acceptance.cjs` (WebKit och Chromium) täcker:
  - iPaden som blir mörk kl. 18.18 och ljus på morgonen
  - att valt tema alltid vinner och att telefonen följer sitt eget system
  - vädermeningen på iPad och telefon
  - snabbuppgiften med chippet och deadline
  - tillskottsordningen morgon och kväll
  - Ångra med toasten som försvinner av sig själv
- De befintliga testerna för uppgifter, projekt, födelsedagar, kost, recept, träning och anteckningar har uppdaterats från bekräftelse till Ångra.
