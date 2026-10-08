# iPad i köket: hemskärm och äldre iPads

Forma fungerar som en dockad hemskärm på en iPad, utformad på iPad mini 4 (A1538) i 1024×768 liggande och 768×1024 stående. Den här sidan beskriver hemskärmsläget och det som krävs för att appen ska fungera på iPads som stannat på iPadOS 15.

## Hemskärm

När läget är aktivt visar Home hela dagen på en enda skärm. Sidan scrollar aldrig; långa listor scrollar inuti sitt eget kort.

| Kort | Innehåll |
| --- | --- |
| Idag | Stor klocka (byter exakt på minuten), datum och vecka, synkstatus, dagens läge och sammanfattning från [briefingen](briefing.md), siffror för Försenat, Idag, Pågår och Fyller år, de tre korten i *Gör först* (tryck öppnar kortet i Planner) och dagens viktigaste råd. En ny daglig sammanfattning visas som en länk. |
| Kost och tillskott | En stor rad per vana (minst 52–60 px hög). Ett tryck bockar av för idag, ett till ångrar. Räknaren blir grön när allt är klart, och veckoremsan visar gröna och orange dagar som i Kost. |
| Kommande 7 dagar | Olästa födelsedagspåminnelser (markera som läst eller dölj direkt), deadlines i tidsordning och födelsedagar per dag, samt **snabbuppgift**: skriv, tryck Enter eller +, så hamnar uppgiften i *Att göra*. *Idag* (förvalt) ger deadline idag. |

Liggande visas tre kolumner. Stående visas Idag överst och de två andra korten bredvid varandra under. Navigeringen i botten fungerar som vanligt, och övriga sidor är oförändrade.

**Passiv skärm**

- Efter **3 minuter** utan beröring på en annan sida går appen tillbaka till Home. Ett öppet formulär stängs aldrig, så inget du håller på att skriva försvinner.
- Inloggad hämtar skärmen ändringar från dina andra enheter **varje minut** medan den är synlig. Bockar du av D-vitamin på telefonen syns det i köket inom en minut. Skrivningar är villkorade på revision, så iPaden kan aldrig skriva över en ändring som gjorts någon annanstans. Vid krock får du välja version som vanligt.

**Inställningar → Hemskärm** (sparas per enhet i `forma-homescreen`):

| Val | Betydelse |
| --- | --- |
| Auto | Standard. På för surfplattor med pekskärm, enligt media query `(pointer: coarse) and (min-width: 700px) and (min-height: 600px)`. Av på datorer och telefoner. Etiketten visar *Auto (på)* eller *Auto (av)*. |
| På | Alltid på den här enheten. |
| Av | Vanliga Home även på iPad. |

**Tips för en dockad iPad** (står även i appen):

- Lägg till Forma på hemskärmen: Dela → Lägg till på hemskärmen. Då öppnas appen i helskärm.
- Ställ Autolås på Aldrig: Inställningar → Skärm och ljusstyrka.
- Lås iPaden till Forma med Guidad åtkomst: Inställningar → Hjälpmedel.

Koden finns i `src/components/HomeScreen.tsx`, `src/hooks/useHomeScreen.ts`, `src/hooks/useNow.ts` och `src/homescreen.css`. Återgången till Home och minuthämtningen ligger i `src/App.tsx`.

## Äldre iPads (iPadOS 15)

iPad mini 4, iPad Air 2 och iPad (5:e generationen) kan inte uppdateras förbi **iPadOS 15.8**, som har Safari 15.6. Forma kräver Safari 15.4 eller senare.

**Inloggningsfelet 2026-10-08.** Supabase-klienten använde `AbortSignal.timeout()`, som kom i Safari 16. På iPadOS 15 kastade varje molnanrop ”AbortSignal.timeout is not a function” innan något skickades. Eftersom meddelandet innehåller ordet *timeout* visade appen ”Molnet svarar inte just nu”. Supabase-loggarna bekräftade att inget anrop från iPaden kom fram, trots att kontot och nycklarna var i ordning.

**Rättelse:**

- **Tidsgräns:** `src/lib/cloud.ts` har `fetchWithTimeout`, som bygger tidsgränsen med `AbortController` och `setTimeout`. Den fungerar i alla webbläsare och respekterar även anroparens egen avbrytsignal. Varken `AbortSignal.timeout` eller `AbortSignal.any` används.
- **Felmeddelanden:** felen klassas ärligt.

  | Fel | Meddelande |
  | --- | --- |
  | Saknad webbläsarfunktion | ”Webbläsaren saknar en funktion …” |
  | Timeout | ”Molnet svarade inte i tid …” |
  | Nätverksfel (Safari ”Load failed”, Chrome ”Failed to fetch” och Firefox ”NetworkError”) | ”Kunde inte nå molnet …” |
  | Fel lösenord | ”E-postadressen eller lösenordet stämmer inte.” |

  Bara nätverksfel och timeout återförsöks automatiskt.

**CSS:** `src/compat.css` laddas sist och gäller bara där modern CSS saknas.

- `color-mix()` (Safari 16.2) används för prioritetsetiketter, briefingens röda ruta och anteckningarnas formatknappar. Ett värde med `var()` i `color-mix()` blir tomt i äldre Safari i stället för att falla tillbaka, så reservfärgerna ligger bakom `@supports not (color: color-mix(...))`.
- I samma block stängs `backdrop-filter` av och ytorna blir solida. Det ger jämnare scroll på A8/A9-grafiken i dessa iPads.
- Containerfrågan i träningsformuläret (Safari 16) har en reservregel med vanlig media query.

**Granskning av JavaScript:** det byggda paketet är genomsökt efter API:er nyare än Safari 15.4. Resultat:

- `AbortSignal.any`/`timeout`, `toSorted`, `Promise.withResolvers`, `Object.groupBy`, statiska klassblock, popover-API och `OffscreenCanvas` används inte.
- `structuredClone`, `Array.prototype.at` och `crypto.randomUUID` kräver 15.4 och fungerar.
- Receptbildernas `createImageBitmap` har funktionsdetektering och en reservväg.

## Tester

- `tests/cloud.mjs` (ingår i `npm test`): tidsgräns utan `AbortSignal.timeout`/`any`, att anroparens avbrott vinner, och felklassning för Safari, Chrome och Firefox.
- `tests/legacy-safari-login.cjs`: tar bort `AbortSignal.timeout` och `AbortSignal.any` som på iPadOS 15 och kontrollerar tre saker. Inloggningen når Supabase och lyckas. Fel lösenord visas som fel lösenord. Ett anrop som aldrig svarar ger ett ärligt timeout-meddelande.
- `tests/homescreen-acceptance.cjs`: 10 scenarier på 1024×768 och 768×1024 med pekskärm.
  - Allt får plats utan sidscroll, och alla tryckytor är minst 44 px.
  - Avbockning, snabbuppgift, öppna uppgift och födelsedagspåminnelse fungerar.
  - Återgång efter 3 minuter, utan att ett öppet formulär stängs.
  - Inställningarna Auto, På och Av.
  - Hämtning varje minut, med kontroll att telefonens ändring aldrig skrivs över.
  - Mörkt tema och tvingad Safari 15-rendering.

Kör testerna med:

```sh
npm run test:ipad
```

Kör `npm run preview` på port 4173 först. Bygg med den publika Supabase-nyckeln för molnscenariot. Skärmbilder sparas i `tests/artifacts/<motor>/homescreen/`.
