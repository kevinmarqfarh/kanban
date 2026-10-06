# Forma — design rationale

Forma is a quiet personal workspace. The interface should feel useful, settled, and light: little chrome, a few carefully placed controls, clear hierarchy, and generous space around the things a person needs to do.

## Visual system

- White, pearl gray, and charcoal; dark mode reverses these into soft charcoal and off-white. The palette is neutral, without a green or blue tint.
- A restrained glass treatment belongs to the app background, summary cards, and floating footer. Task cards remain visually solid for easy reading.
- DM Sans gives short Swedish labels and task titles a calm, legible rhythm. The system font remains a fallback.
- The four-tile Forma symbol echoes the bento layout without adding an illustration or dashboard clutter.
- Cards use 18–24 px corners, fine low-contrast borders, and subtle shadows. Solid charcoal belongs primarily to the active navigation destination and the primary action.

## Responsive behavior

The main workspace stays centered at 1264 px on a desktop. The board contains three equal columns, each with a distinct status heading, a count, task cards, and a quiet add-task action. Additional columns must remain usable: the app can set the board grid count dynamically or use horizontal overflow when it exceeds three.

At 760 px and below, each board column becomes a horizontally scrollable 86 vw panel with scroll snap. Status tabs should synchronize to the currently visible column and offer a second way to navigate. Drag handles use `touch-action: none` so dragging is possible while the rest of a card can scroll normally. The app should also offer a status select in task details as a reliable alternate move action.

The footer floats above the safe area with four clearly labeled icon destinations: Summary, Kanban, Projects, and Profile. Summary opens first. On mobile each destination places its icon above its label to keep four touch targets comfortable. Forms become bottom sheets on mobile; text inputs use 16 px text to avoid iOS zoom. Normal interactive controls are 44 px tall. Mobile pages reserve generous space below content for the floating footer.

## Content and hierarchy

Use one main heading, “Din plats för framsteg.”, with a short supporting line. Avoid promotional copy, inspirational filler, and extra modules. A slim summary row gives a quick sense of work in progress, upcoming deadlines, and completed tasks.

A task card should display a short title, up to two description lines, pale labels, and a quiet metadata strip for deadline, checklist progress, and comments. Detailed editing belongs in the task sheet. Project cards show the title, description, main task, subtasks, and a restrained progress indicator. Profile contains identity, theme choice, and synchronization information.

Summary gives the daily debriefing a generous report card and an inline reader. History sits beside the report on desktop and below it on mobile. A bell and a small footer badge indicate unread, undismissed reports; Kanban has a quiet reminder strip. Reading or dismissing a report clears its notification while preserving the report in history. Empty states contain no invented AI report. Reports use plain text, so automation content cannot inject HTML.

## Interaction and accessibility

Use semantic headings and named controls. Provide an accessible name for icon-only buttons. Task cards must support keyboard activation; drag handles must also expose a keyboard move interaction. Respect reduced-motion preferences and preserve visible focus rings. Use actual text for statuses and counts, so the neutral palette never needs to carry meaning alone.

## Styling contract

Theme variables are defined on `:root` and overridden by `[data-theme='dark']`. State modifiers supported include `.active`, `.is-over`, `.drag-over`, `.is-dragging`, `.completed`, `.connected`, and `.synced`. The board's column grid can be overridden by a React inline style for the actual column count on desktop; do not set this grid override below the mobile breakpoint.
