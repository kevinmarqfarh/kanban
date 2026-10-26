# Edit Home på iPad

Standardhemskärmen på iPad har Edit Home i sidhuvudets knapprad. Knappen öppnar samma modulredigerare som på datorn med stora touchkontroller, bibehållen bottennavigation och utan PC-sidomenyn. Avbryt lämnar standardvyn oförändrad. Spara layout aktiverar den anpassade Home-vyn på enheten och behåller modulordning samt storlekar efter omladdning. Standardvy återgår till den ordinarie hemskärmen. Vanliga Home stöder också redigering på större touchskärmar; telefoner får ingen extra layoutredigerare.

Layouten är en enhetspreferens, separat från kontoarbetsytans molnsynk. Preferensen forma-tablet-custom-home-v1 styr standard/custom-valet, medan befintliga forma-home-layout-v1 lagrar modulordning och storlekar.

Verifiering: APP_URL=http://127.0.0.1:4189 npm run test:ipad-home-edit kontrollerar 1024×768, 768×1024 och 1366×1024 med touch i Chromium och WebKit. Testerna omfattar avbryt, ändra storlek och ordning, spara, omladdning, återgång till standardvy samt fortsatt mobil- och bottennavigation.
