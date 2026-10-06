# Notes

Notes ligger i Others. Anteckningar sparas vid ändringar i text, titel och typsnitt. Listan visar en kort förhandsvisning och kan sökas. På mindre skärmar växlar användaren mellan listan och anteckningen; på större skärmar visas båda samtidigt.

**Helskärm:** en anteckning öppnas alltid som en ren skrivyta över hela fönstret (det finns inget inbäddat läge). På Mac och iPad går webbläsaren även i riktig helskärm; på iPhone täcker ytan appen. Rubrik, verktygsrad och knappar tonas bort medan du skriver och kommer tillbaka när du rör musen eller trycker utanför texten. Antal ord visas uppe till höger. *Anteckningar* eller Escape stänger och visar listan.

**Fet och kursiv:** knapparna B och *I* i verktygsraden (eller ⌘B/⌘I) formaterar markerad text och visar om markören står i fet/kursiv text. När du markerar text visas en liten formateringsrad vid markeringen med fet, kursiv, punktlista och numrerad lista — ovanför på dator och under markeringen på telefon så att den inte krockar med iOS egen meny.

**Svep för att ta bort:** svep en anteckning i listan från höger till vänster för att visa *Ta bort*. Ett kort svep fjädrar tillbaka, ett tryck på en öppen rad stänger den och vertikal scroll påverkas inte. Fungerar även med musen. Efter borttagning visas *Ångra* i sex sekunder.

Verktygsraden innehåller Standard, Serif och Monospace, fet, kursiv, punktlista, numrerad lista och + för textlänkar. Länkvalet söker bland Planner-kort, projekt, träningspass, kostvanor, recept och födelsedagar. Länkarna visas som understruken text. De öppnar rätt innehåll och erbjuder återgång till anteckningen.

Anteckningarna använder arbetsytans befintliga lagring och export. Äldre arbetsytor utan `notes` fortsätter fungera. Sparfel behåller texten och visar Inte sparat samt Försök igen. Uppdateringar i olika fält från flera flikar slås samman; ett gammalt formulär återskapar inte en raderad anteckning.

Text från urklipp klistras in som vanlig text. Lagrad formatering begränsas till text, stycken och listor. Skript, bilder, händelseattribut och externa HTML-länkar tas bort vid visning. Interna textlänkar valideras innan navigering.

Kontroller: typkontroll och separat produktionsbygge passerade. Datatester för bakåtkompatibilitet, validering och ändringar mellan flikar passerade. I en isolerad lokal förhandsvisning verifierades skrivning, sökning, typsnitt, punktlista, numrerad lista, omladdning och länkar till Planner, Projects och träning samt återgång till anteckningen. Den automatiska webbläsarsviten kunde inte starta inom den tillgängliga sandlådan och rapporteras därför inte som godkänd.

Tester finns i `tests/notes.mjs` och `tests/notes-acceptance.cjs`. `npm run test:notes` kör båda när Chromium/WebKit kan startas. Ingen publicering eller ändring av Git-historiken gjordes i denna sidokonversation.
