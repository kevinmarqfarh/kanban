# Väder: SMHI och vädersidan

Forma visar vädret på tre ställen. Alla tre läser samma prognos, och den hämtas en gång.

| Plats | Innehåll |
| --- | --- |
| Home (telefon, dator) | Remsa med måndag–söndag överst. |
| iPadens hemskärm | Samma remsa över hela bredden. |
| **Others → Väder** | Hela prognosen i samma upplägg som Apple Väder. |

I Others-menyn visar raden *Väder* temperaturen just nu, till exempel ”12°”, från den sparade prognosen.

## Källor

**SMHI** är huvudkällan. Forma använder SMHI:s öppna punktprognos, kategori `snow1g` version 1:

```
https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/{lon}/lat/{lat}/data.json
```

- Prognosen är gratis, kräver ingen nyckel och tillåter anrop direkt från webbläsaren (CORS `*`).
- Den ersatte `pmp3g`, som slutade fungera den 31 mars 2026.
- Den sträcker sig cirka tio dagar framåt.
  - De första cirka 2,5 dygnen kommer varje timme.
  - Därefter kommer värden var 2–6:e timme och sist var 12:e timme.
- Tider anges i UTC. Saknade värden är `9999` och visas som ”–”, aldrig som 0.
- Nederbördsmängden gäller hela intervallet `intervalParametersStartTime`–`time`.
- Koordinaterna avrundas till högst sex decimaler, eftersom SMHI kräver det.

**Open-Meteo** kompletterar SMHI. Forma hämtar timvärden från måndag i aktuell vecka till nio dagar fram, med vind i m/s och tider som Unix-sekunder. Open-Meteo används i tre fall:

- **Tidigare timmar:** SMHI börjar vid nästa hela timme, så veckans passerade dagar och natten före SMHI:s första timme kommer från Open-Meteo. Dagens högsta och lägsta temperatur gäller därför hela dygnet.
- **Reserv:** om SMHI inte svarar tar Open-Meteo över helt. Vädersidan skriver då ”Källa: Open-Meteo (SMHI svarade inte eller orten ligger utanför SMHI:s område)”.
- **Utanför Norden:** för orter utanför SMHI:s modellområde (ungefär latitud 52,5–71, longitud 2–38) frågas SMHI inte alls.

Båda källorna anropas samtidigt. De blandas aldrig för samma timme. SMHI gäller från sitt första intervall, och Open-Meteo används bara för timmarna före det. Källorna anges med länk under remsan och längst ned på vädersidan. På vädersidan står även vilken SMHI-körning prognosen bygger på, till exempel ”prognos från 07:30”.

## Från timmar till dagar

Timmarna grupperas i lokala dagar på samma sätt för båda källorna (`buildDays` i `src/lib/forecast.ts`).

- **Högst och lägst:** temperaturen vid stegens tidpunkter under dagen, avrundat till hela grader. Långt fram finns bara två värden per dag, klockan 02 och 14, precis som i SMHI:s egen app.
- **Risk för nederbörd:** dagens högsta risk. **Mängd:** summan för dagen. Ett intervall räknas till den dag där intervallets mitt ligger, så regn 23–00 hör till kvällen.
- **Dagens symbol:** det väder som dominerar dagtid, 06–21. Varje steg väger lika många timmar som det täcker.
  - Är risken för nederbörd minst 50 % visas i stället dagens blötaste väder. Det väder som ger mest nederbörd vinner, så fem timmar regn går före sju timmar duggregn.
  - Regn som bara faller på natten gör inte dagen regnig.
- **Natt:** sol- och nedgång räknas fram på enheten med soluppgångsekvationen (`src/lib/sun.ts`). Efter solnedgången får klart och halvklart väder en måne i stället för en sol. Polarnatt räknas som natt hela dygnet och midnattssol som dag.

**SMHI:s symboler.** SMHI har 27 vädersymboler (Wsymb2), och Forma visar SMHI:s egna svenska ord, till exempel *Växlande molnighet*, *Lätt regn* och *Åskskurar*. Symbolerna ritas med Formas ikoner.

| SMHI-kod | Ikon |
| --- | --- |
| 1 | Sol |
| 2 | Mest sol |
| 3–4 | Sol och moln |
| 5–6 | Moln |
| 7 | Dimma |
| 8–10 | Regnskurar |
| 11 och 21 | Åska |
| 12–14 och 22–24 | Snöblandat |
| 15–17 och 25–27 | Snö |
| 18 | Duggregn |
| 19–20 | Regn |

## Vädersidan (Others → Väder)

Sidan har en himmel som följer vädret just nu: blå när det är klart, grå när det är mulet, mörkare vid regn och mörkblå på natten. Korten ligger frostade ovanpå. Sidan består av fem delar:

1. **Nu:** ort (tryck för att byta), temperaturen i stor stil, SMHI:s beskrivning och dagens H/L.
2. **Timprognos:**
   - En mening i Apples stil, till exempel ”Lätt regn väntas i morgon kring 07:00 (50 % risk). Byar upp till 15 m/s.”
   - Sedan *Nu* och varje timme fram till samma tid i morgon.
   - Varje timme har ikon, risk för nederbörd i blått (från 10 %, avrundat till tiotal) och temperatur.
   - Soluppgång och solnedgång läggs in där de inträffar.
3. **Tiodagarsprognos:** dag, ikon med risk för nederbörd, lägsta och högsta temperatur.
   - En temperaturstapel visar dagens spann mot hela periodens. Färgen går från blå (kallt) via grön till orange (varmt).
   - På *Idag* visar en punkt temperaturen just nu.
   - Tryck på en dag för dess timmar.
4. **Rutor:**

   | Ruta | Innehåll |
   | --- | --- |
   | Nederbörd | Mängd de kommande 24 timmarna och när risken är störst. |
   | Vind | Medelvind, byar och en kompass med riktningen. |
   | Luftfuktighet | Relativ fuktighet just nu. |
   | Sol | Soluppgång, solnedgång och dagens längd. |
   | Sikt | Sikten i kilometer. |
   | Lufttryck | Trycket i hPa. |

5. **Källa och tidpunkt.**

**En dags timmar** öppnas i ett blad, i helskärm på telefon. Bladet visar:

- dagväljare för de tio dagarna
- dagens symbol, H/L, risk, mängd och byar
- ett diagram med temperaturen som linje och risken för nederbörd som blå staplar på samma tidsaxel
- en tabell med tid, ikon, risk, mängd, temperatur och vind (byar)

För dagar långt fram står det hur ofta SMHI ger värden, till exempel ”Så här långt fram ger SMHI prognos var 12:e timme.” Esc stänger bladet.

Timmarna märks med SMHI:s giltighetstid. Timmen ”07” är alltså intervallet 06–07, som i SMHI:s egen app.

**Layout:**

- Telefon och iPad stående visar en kolumn och rutorna två och två.
- Från 900 punkters bredd ligger tiodagarsprognosen bredvid rutorna, medan Nu och timprognosen går över hela bredden, som Apple Väder på iPad.
- Mörkt tema dämpar himlen.
- Sidan scrollar aldrig i sidled; timmarna och dagväljaren scrollar inuti sina kort.

## Uppdatering och cache

Prognosen hämtas i fem lägen:

- när Home eller vädersidan visas
- var 30:e minut medan sidan syns
- när skärmen vaknar
- när nätet kommer tillbaka
- när orten byts

Samtidiga anrop för samma ort och dag slås ihop till ett.

Hela prognosen sparas per enhet i `forma-weather-forecast`, med timmar från midnatt i dag och dagar från måndag. Den gamla veckocachen `forma-weather-cache` tas bort vid första sparning.

- **Offline med sparad prognos:** den sparade prognosen visas med ”Sparat hh:mm · offline” och *Försök igen*.
- **Offline utan sparad prognos:** sidan visar ”Vädret kunde inte hämtas just nu.” och *Försök igen*.

Orten sparas per enhet i `forma-weather-place`, med Göteborg som standard. Ortsökningen använder Open-Meteos geokodning.

## Kod

| Fil | Innehåll |
| --- | --- |
| `src/lib/smhi.ts` | URL, modellområde, de 27 symbolerna och tolkning av SMHI-svaret |
| `src/lib/forecast.ts` | Open-Meteo-timmar, sammanslagning, dagar, dagens symbol, hämtning med reserv, *nu*, de kommande 24 timmarna, sammanfattningsmeningen och kompass |
| `src/lib/sun.ts` | Sol- och nedgång, polarnatt och midnattssol |
| `src/lib/weather.ts` | Gemensam modell, ikonfamiljer med nattvarianter, ort och cache |
| `src/hooks/useWeather.ts` | Hämtning, cache och synk mellan instanser |
| `src/components/WeatherPage.tsx` och `src/weather.css` | Vädersidan |
| `src/components/WeatherWeek.tsx` | Veckoremsan |
| `src/components/WeatherIcon.tsx` | Ikoner, inklusive måne |

## Tester

- **`tests/forecast.mjs`** (ingår i `npm test`) körs mot SMHI:s riktiga prognos för Göteborg den 15 oktober 2026 (`tests/fixtures/smhi-goteborg-2026-10-15.json`). Testerna täcker:
  - Sol: tider för Göteborg och Stockholm, polarnatt och midnattssol i Kiruna, dagens längd.
  - SMHI: URL med sex decimaler, alla 27 symboler, `9999`, steg som saknar värden och 12-timmarssteg.
  - Dagar: fredagens regn med 87 % risk och 9,7 mm samt dagens symbol.
  - Källor: sammanslagning utan överlapp, reserv åt båda hållen och orter utanför SMHI:s område.
  - Sidans innehåll: *nu*, 24 timmar med sol- och nedgång, sammanfattningsmeningen, en dags timmar och kompassen.
- **`tests/weather-page-acceptance.cjs`** körs i WebKit och Chromium (`npm run test:weather`). Testerna täcker:
  - Telefon: menyraden, Nu, timmar, tio dagar, alla rutor och källan.
  - Dagbladet: diagram, tabell, dagväljare, 12-timmarsnotis och Esc.
  - Navigering: från Home-remsan, och från iPadens hemskärm i båda orienteringarna.
  - Lägen: mörk dator med två kolumner, natt med måne och mörk himmel, SMHI nere, inget nät och ortbyte på sidan.
- **Mockar:** `tests/helpers/weather-mock.cjs` flyttar SMHI-svaret till testets dag och ger en förutsägbar Open-Meteo-vecka, så inget test beror på nätet. Hemskärms- och vädertesterna använder samma mock.
