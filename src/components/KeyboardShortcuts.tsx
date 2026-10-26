export function KeyboardShortcuts() {
  return <>
    <p className="shortcut-scope">Gäller på PC när du inte skriver i ett fält, anpassar Home eller har en dialog öppen.</p>
    <dl className="shortcut-list"><div><dt><kbd>N</kbd></dt><dd>Ny uppgift</dd></div><div><dt><kbd>/</kbd></dt><dd>Sök i Planner</dd></div><div><dt><kbd>?</kbd></dt><dd>Visa kortkommandon</dd></div></dl>
    <p className="shortcut-scope">Tab flyttar mellan kontroller. Enter aktiverar. Escape stänger en dialog och frågar först om du har osparade ändringar.</p>
  </>
}
