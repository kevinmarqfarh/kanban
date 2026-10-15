# Väder: SMHI och dagens timmar

Vädret visas som en remsa med måndag–söndag, på Home (telefon, dator) och över hela bredden på iPadens hemskärm. Båda läser samma prognos, och den hämtas en gång.

**Tryck på en dag** (i dag eller senare) för att se dess timmar i ett blad, i helskärm på telefon. Tryck på ortnamnet för dagens timmar. X eller Esc stänger bladet, och du är kvar där du var. Någon separat vädersida finns inte, och Others har ingen väderrad.

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
- **Reserv:** om SMHI inte svarar tar Open-Meteo över helt, och remsan visar då ”Källa: Open-Meteo”.
- **Utanför Norden:** för orter utanför SMHI:s modellområde (ungefär latitud 52,5–71, longitud 2–38) frågas SMHI inte alls.

Båda källorna anropas samtidigt. De blandas aldrig för samma timme. SMHI gäller från sitt första intervall, och Open-Meteo används bara för timmarna före det. Källorna anges med länk under remsan.

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

## Dagens timmar

Bladet visar fyra delar:

- **Dagväljare:** de tio dagarna.
- **Sammanfattning:** dagens symbol och SMHI:s ord, H/L, risk för nederbörd, mängd och byar.
- **Diagram:** temperaturen som linje och risken för nederbörd som blå staplar på samma tidsaxel.
- **Tabell:** tid, ikon, risk, mängd, temperatur och vind (byar).

Dagens tabell börjar vid den aktuella timmen. För dagar långt fram står det hur ofta SMHI ger värden, till exempel ”Så här långt fram ger SMHI prognos var 12:e timme.” Efter mörkrets inbrott visas månen i stället för solen.

Timmarna märks med SMHI:s giltighetstid. Raden ”07:00” gäller alltså intervallet 06–07, som i SMHI:s egen app. Bladet följer appens ljusa eller mörka tema.

## Uppdatering och cache

Prognosen hämtas i fem lägen:

- när Home eller hemskärmen visas
- var 30:e minut medan sidan syns
- när skärmen vaknar
- när nätet kommer tillbaka
- när orten byts

Samtidiga anrop för samma ort och dag slås ihop till ett.

Hela prognosen sparas per enhet i `forma-weather-forecast`, med timmar från midnatt i dag och dagar från måndag. Den gamla veckocachen `forma-weather-cache` tas bort vid första sparning.

- **Offline med sparad prognos:** den sparade prognosen visas med ”Sparat hh:mm · offline” och *Försök igen*.
- **Offline utan sparad prognos:** remsan visar ”Vädret kunde inte hämtas” och *Försök igen*.

Orten sparas per enhet i `forma-weather-place`, med Göteborg som standard. Ortsökningen använder Open-Meteos geokodning.

## Kod

| Fil | Innehåll |
| --- | --- |
| `src/lib/smhi.ts` | URL, modellområde, de 27 symbolerna och tolkning av SMHI-svaret |
| `src/lib/forecast.ts` | Open-Meteo-timmar, sammanslagning, dagar, dagens symbol, hämtning med reserv, aktuell timme och en dags timmar |
| `src/lib/sun.ts` | Sol- och nedgång, polarnatt och midnattssol |
| `src/lib/weather.ts` | Gemensam modell, ikonfamiljer med nattvarianter, ort och cache |
| `src/hooks/useWeather.ts` | Hämtning, cache och synk mellan instanser |
| `src/components/WeatherDaySheet.tsx` och `src/weather.css` | Bladet med dagens timmar |
| `src/components/WeatherWeek.tsx` | Veckoremsan |
| `src/components/WeatherIcon.tsx` | Ikoner, inklusive måne |

## Tester

- **`tests/forecast.mjs`** (ingår i `npm test`) körs mot SMHI:s riktiga prognos för Göteborg den 15 oktober 2026 (`tests/fixtures/smhi-goteborg-2026-10-15.json`). Testerna täcker:
  - Sol: tider för Göteborg och Stockholm, polarnatt och midnattssol i Kiruna.
  - SMHI: URL med sex decimaler, alla 27 symboler, `9999`, steg som saknar värden och 12-timmarssteg.
  - Dagar: fredagens regn med 87 % risk och 9,7 mm samt dagens symbol.
  - Källor: sammanslagning utan överlapp, reserv åt båda hållen och orter utanför SMHI:s område.
  - Aktuell timme och en dags timmar, där i dag börjar vid den aktuella timmen.
- **`tests/weather-day-acceptance.cjs`** körs i WebKit och Chromium (`npm run test:weather`). Testerna täcker:
  - Telefon: torsdagens timmar med diagram och tabell, samt dagväljaren med 12-timmarsnotis och i dag från aktuell timme.
  - Stängning: X och Esc tar dig tillbaka till Home, ingen vädersida öppnas bakom och Others har ingen väderrad.
  - iPad: båda orienteringarna, och hemskärmen ryms fortfarande på en skärm efter stängning.
  - Natt med måne i mörkt tema, och Open-Meteo när SMHI är nere.
- **Mockar:** `tests/helpers/weather-mock.cjs` flyttar SMHI-svaret till testets dag och ger en förutsägbar Open-Meteo-vecka, så inget test beror på nätet. Hemskärms- och vädertesterna använder samma mock.
