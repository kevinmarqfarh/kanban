# Home layout editor verification

PC Home uses a 12-column grid. Widths: 4/6/8/12 columns. Heights: content-driven or 240/360/520 px with internal scrolling. Settings are device-local under forma-home-layout-v1 and shared between visual themes.

Browser checks (in-app browser, 1440 × 1000):
- Edit Home exposes per-module drag handles, move buttons and width/height controls.
- Weather changed from 12 to 4 columns and 240px height; narrow weather uses a four-column day grid rather than overlapping seven columns.
- Move-later button changed module order.
- Save and reload preserved changed order and size.
- Changing width then Cancel restored saved size.
- Keyboard drag (Space, ArrowRight, Space) moved weather over briefing.
- Mouse drag moved weather from order 2 to order 1.
- Reset and Save restored defaults after testing.
- At 390 × 844, no Edit Home button and no desktop module wrappers were rendered.
- No browser console errors in inspected log.

Production build and complete npm test suite passed.
React review: hooks remain unconditional, updates use immutable functional setters, storage values are validated, storage failures leave the draft editable, and drag activation is confined to named handles. Keyboard alternatives remain available through explicit move buttons. Existing mobile content markup is returned without module wrappers.

Screenshot: edit-desktop.png.
