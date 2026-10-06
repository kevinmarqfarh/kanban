# Notes

Notes ligger i Others. Anteckningar sparas vid ändringar i text, titel och typsnitt. Listan visar en kort förhandsvisning och kan sökas. På mindre skärmar växlar användaren mellan listan och anteckningen; på större skärmar visas båda samtidigt.

Verktygsraden innehåller Standard, Serif och Monospace, punktlista, numrerad lista och + för textlänkar. Länkvalet söker bland Planner-kort, projekt, träningspass, kostvanor, recept och födelsedagar. Länkarna visas som understruken text. De öppnar rätt innehåll och erbjuder återgång till anteckningen.

Anteckningarna använder arbetsytans befintliga lagring och export. Äldre arbetsytor utan `notes` fortsätter fungera. Sparfel behåller texten och visar Inte sparat samt Försök igen. Uppdateringar i olika fält från flera flikar slås samman; ett gammalt formulär återskapar inte en raderad anteckning.

Text från urklipp klistras in som vanlig text. Lagrad formatering begränsas till text, stycken och listor. Skript, bilder, händelseattribut och externa HTML-länkar tas bort vid visning. Interna textlänkar valideras innan navigering.

Kontroller: typkontroll och separat produktionsbygge passerade. Datatester för bakåtkompatibilitet, validering och ändringar mellan flikar passerade. I en isolerad lokal förhandsvisning verifierades skrivning, sökning, typsnitt, punktlista, numrerad lista, omladdning och länkar till Planner, Projects och träning samt återgång till anteckningen. Den automatiska webbläsarsviten kunde inte starta inom den tillgängliga sandlådan och rapporteras därför inte som godkänd.

Tester finns i `tests/notes.mjs` och `tests/notes-acceptance.cjs`. `npm run test:notes` kör båda när Chromium/WebKit kan startas. Ingen publicering eller ändring av Git-historiken gjordes i denna sidokonversation.
