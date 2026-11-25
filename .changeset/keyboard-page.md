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

- **Tooltip** stays open while its control holds the focus the keyboard gave it: focus that a key,
  not a press of the pointer, came before. A Tab to a control below the fold scrolls the page, and
  the scroll used to close the tooltip and take its description away. In Vue, Svelte, Solid,
  Angular and the elements the pointer passing over the control and leaving no longer closes it
  then either, as in React. Escape, focus leaving, a press and another tooltip opening still close
  it, and a scroll or the pointer leaving still closes a tooltip on a control the pointer focused,
  a clicked text field included. The engine exports `keyboardHolds`, `trackFocusOrigin`,
  `closeTooltipOnScroll` and `holdTooltipFromPointer` for it.
- **AppShell's drawer** below the breakpoint: its `menu` button carries `aria-expanded` and
  `aria-controls`, Escape closes the drawer and returns focus to the button, the skip link, the
  banner, the topbar, the content region and the dock are `inert` while it is open, and a window
  that grows past the breakpoint closes it.
- **AppShell on a page change**: a new `transitionKey` moves focus to the new page's `<h1>`, or
  to `<main>` when it has none. A screen reader reads the heading that takes focus, so a polite
  `role="status"` region after the content region says the page's title only when focus does not
  land on the `<h1>`: when it moves to `<main>`, or stays where it is. Focus stays where it is when
  it is already inside the new page, and when the reader moved it while a `pending` page loaded.
  Nothing happens for the first page, and a `pending` page arrives when it is drawn. The skip link
  moves focus into `<main>`, which takes `tabindex="-1"` only while it holds that focus, so a click
  on the page's empty space still leaves focus on the body. The engine exports `arriveAtPage` and
  `focusFromScript`. A test that expected focus on the drawer's button after a page change now
  finds it on the new page, and one that reads the status region after a page change finds it
  empty when the new page has an `<h1>`. A Next.js App Router app also hears its router's own
  announcement of the new page's title.
- **Reading direction** is read from the place a member is in: a section that says `dir="rtl"`
  on a left-to-right page turns the members inside it, and a member follows a change to that
  section's `dir`. `readDirection` takes an optional element, `watchDirection` takes a second
  argument to hear `dir` changes on any element, and each foundation's `useDirection` takes the
  member's element (a ref in React, a getter elsewhere). Called with no argument, all three still
  read the document. An element that is a Zag machine's own part is read from its parent, so
  Calendar, whose root is its machine's content part, turns with its section. A member whose
  element is drawn only in some layouts (Menubar's bar, which a phone's width replaces with one
  button) reads its section when the element appears.
- **DataTable and Table's grid** keep focus when the row that holds it leaves the document: focus
  goes to the same column of the row that takes its place, or of the last row.
