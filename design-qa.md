# Bento blå — design QA

Source visual truth: `/tmp/codex-remote-attachments/01a15d2e-de57-7941-bede-f87bac23895c/43889633-1E1F-4CBE-A6D7-A9CED2E19FD7/1-Foto-1.jpg`.
Implementation screenshots: `docs/bento/desktop.png` and `docs/bento/mobile.png`.
Browser: Codex in-app browser, local production build at port 4184.

## Scope and normalization

A selectable theme for the existing Forma app, carrying over its actual content and interactions. The reference's HR content, employee portraits and black presentation frame are not app content and are not recreated.
Source: 1280 × 845 raster pixels. Desktop implementation: 1280 × 845 CSS/pixel screenshot, 1× density. Mobile implementation: 390 × 844, 1× density. Compare the application surfaces rather than the source's black outer frame. State: Home with Bento blå enabled and actual local Planner tasks; mobile Planner and Settings also inspected.

## Design breakdown

- Canvas: paper blue `#acd8e9`, with a generated fine paper texture in `public/bento-paper.png`.
- Cards: opaque slate `#536871`, nested surfaces `#43565f`, 28–30px main radii, 24px task radii, no glass blur or decorative shadows.
- Type: bundled DM Sans for UI; Georgia italic for the welcome phrase. Desktop welcome up to 46px, mobile 32px, card headings 30px desktop. Cream `#fffdf5` on cards; dark `#17272e` directly over the blue canvas.
- Layout: 24px visible canvas gaps; independent bento modules on desktop, stacked modules on mobile. Content-driven height and responsive wrapping.
- Navigation: slate buttons inside a lighter blue rail; cream selected item. Desktop left rail, mobile bottom bar. Original navigation actions and accessible names retained.
- Controls: black primary buttons, quiet slate secondary buttons, dark input wells, visible selected theme and keyboard focus.

## Comparison history

1. Initial desktop pass: P2 — briefing remained a single wide surface, concealing the canvas between modules. Fixed by making the desktop briefing header, metrics, focus, tips and agenda separate bento boxes. Rechecked desktop screenshot: visible 24px canvas gaps and coherent card geometry.
2. P2 — docked tablet uses a fixed height budget; theme header could exceed it. Added a 56px header override for docked mode. Existing docked navigation layout retained.
3. P3 — welcome text differed from the briefing before dawn. Corrected the greeting to use God natt before 05:00.

## Verification

- Full-view comparison: reference and final desktop screenshot opened and visually compared. Palette, solid cards, background exposure, serif/sans contrast, radius, header and compact rail follow the supplied design.
- Focused checks: mobile card padding, text wrapping, bottom navigation, Planner columns/cards, Settings controls and selected state inspected in browser.
- Theme selected through Settings; reload retains Bento blå.
- Switching to Ljust removes the texture and restores the original palette; returning to Bento blå works.
- Mobile DOM width check: no document-level horizontal overflow.
- Browser console: no errors reported in the inspected tab.
- Production TypeScript/Vite build: passed.

## Remaining limits

No claim of a pixel-identical HR dashboard: this is its visual language applied to Forma's existing product. Physical iPad hardware was not used. No actionable P0/P1/P2 findings remain in the inspected views.



## Second inspiration — pastoral canvas refinement

Additional visual truth: `/tmp/codex-remote-attachments/01a15d2e-de57-7941-bede-f87bac23895c/695946FD-01DC-4F57-B8EF-E5121DA75875/1-Foto-1.jpg`.
Latest screenshots: `docs/bento/desktop-landscape.png` (1280 × 845 CSS pixels, 1×) and `docs/bento/mobile-landscape.png` (390 × 844, 1×).

Full view compared against the second reference: clear blue sky, textured green hills in the lower canvas, compact sidebar and small/wide card rhythm. The existing content remains Forma's own rather than copying HR UI. New raster landscape is saved at `public/bento-landscape.png`. Flat slate cards use 96% opacity; darker inset controls and pill actions maintain contrast. Desktop overview now uses a small introductory card beside wide metrics, matching the second image's proportions.

Browser verification in IAB: Home rendered in desktop and phone sizes, saved theme still Bento blå, no document-level horizontal overflow, no console errors. Both screenshots visually checked for wrapping, clear canvas gaps, imagery behind rather than over content, and readable text. Previous themes remain outside the new CSS selector. Production build passed. No actionable P0/P1/P2 findings in inspected views.

final result: passed
