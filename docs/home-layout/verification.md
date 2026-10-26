# Home: drag-and-drop och resize

Home kan anpassas på PC under **Edit Home**. De sparade valen är lokala för enheten och delas av appens visuella teman.

## Direkt redigering

- Dra i modulens hela rubrik för att flytta den. En flyttmarkör följer pekaren och målet får en tydlig kant. Att släppa utanför modulerna avbryter flytten.
- Dra i högerkanten för att ändra bredd, underkanten för höjd eller hörnet för båda. Förändringen visas direkt.
- Bredden följer sidans 12-kolumnersrutnät, från 4 till 12 kolumner. Höjden följer 20-pixelssteg, från 160 till 960 px. Breddändring ensam bevarar automatisk höjd.
- Menyer för bredd och höjd finns kvar som alternativ. Tidigare sparade storlekar (4/6/8/12 kolumner, automatisk/240/360/520 px höjd) fungerar fortfarande.
- Markera ett resize-handtag med Tab och använd pilarna för att ändra mått. För flytt med tangentbord: fokusera rubriken, tryck mellanslag, välj tidigare/senare med pilarna och släpp med mellanslag. De separata flyttknapparna finns kvar.
- Escape avbryter den aktuella drag- eller resize-gesten. Vid resize återställs måtten från innan gesten. Avbryt lämnar redigeringsläget och återställer den sparade layouten.
- Spara layout sparar ändringarna. Fel vid sparning visas utan att utkastet stängs.
- Innehållets knappar är inaktiva medan layouten redigeras, så flytt och resize inte oavsiktligt klarmarkerar uppgifter eller öppnar formulär. Appens generella N-/sökgenvägar är också inaktiva under Home-redigering.
- På telefon och touchsurfplatta visas inget PC-redigeringsläge; befintliga vyer behålls.

## Verifiering

Med utvecklingsserver på port 4173:

```sh
npm run test:home-layout
npm test
npm run build
```

`tests/home-layout-gestures.cjs` kontrollerar faktiska mus- och tangentbordshändelser:

1. Dra via modulrubrik, släpp på ny plats, spara och ladda om.
2. Ändra bredd/höjd via hörnet, bevara godtyckliga giltiga mått efter omladdning.
3. Ändra axlarna separat samt återställa med Escape och Avbryt.
4. Tangentbordsresize, tangentbordsflytt, gränsvärden, återställning och fyra teman vid 1280 px.
5. Bevara äldre sparade mått och hålla PC-kontroller borta från telefon och stor touchsurfplatta.

Alla fem scenarier passerade i både Chromium och WebKit (10/10). `npm test` och produktionsbygget passerade också. Den bredare PC-kontrollen passerade 7/7 scenarier i vardera webbläsarmotor (14/14).

Resultat och bilder skrivs till `tests/artifacts/<motor>/home-layout-gestures/`. `edit-desktop.png` visar redigeringsläget med de direkta resize-handtagen.
