---
'@polymorph/engine': patch
'@polymorph/recipes': patch
'@polymorph/react': patch
'@polymorph/react-ui': patch
'@polymorph/vue': patch
'@polymorph/vue-ui': patch
'@polymorph/svelte': patch
'@polymorph/svelte-ui': patch
'@polymorph/solid': patch
'@polymorph/solid-ui': patch
'@polymorph/angular': patch
'@polymorph/angular-ui': patch
'@polymorph/elements-ui': patch
---

Keyboard and focus fixes for page structure, tooltips, reading direction and the grid, in every
web framework and in the elements.

- **Tooltip** stays open while its control holds the focus the keyboard gave it. A Tab to a
  control below the fold scrolls the page, and the scroll used to close the tooltip and take its
  description away. Escape, focus leaving, a press and another tooltip opening still close it, and
  a scroll still closes a tooltip the pointer opened. The engine exports `keyboardHolds` and
  `closeTooltipOnScroll` for it.
- **AppShell's drawer** below the breakpoint: its `menu` button carries `aria-expanded` and
  `aria-controls`, Escape closes the drawer and returns focus to the button, the skip link, the
  banner, the topbar, the content region and the dock are `inert` while it is open, and a window
  that grows past the breakpoint closes it.
- **AppShell on a page change**: a new `transitionKey` moves focus to the new page's `<h1>`, or
  to `<main>` when it has none, and a polite `role="status"` region after the content region says
  the page's title. Nothing happens for the first page, and a `pending` page arrives when it is
  drawn. `<main>` takes `tabindex="-1"`, so the skip link moves focus into it. The engine exports
  `arriveAtPage`. A test that expected focus on the drawer's button after a page change now finds
  it on the new page.
- **Reading direction** is read from the place a member is in: a section that says `dir="rtl"`
  on a left-to-right page turns the members inside it, and a member follows a change to that
  section's `dir`. `readDirection` takes an optional element, `watchDirection` takes a second
  argument to hear `dir` changes on any element, and each foundation's `useDirection` takes the
  member's element (a ref in React, a getter elsewhere). Called with no argument, all three still
  read the document.
- **DataTable and Table's grid** keep focus when the row that holds it leaves the document: focus
  goes to the same column of the row that takes its place, or of the last row.
