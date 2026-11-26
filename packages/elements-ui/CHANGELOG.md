# @polymorph/elements-ui

## 1.0.18

### Patch Changes

- 773a671: **The no-build stylesheet writes each repeated rule once.** `polymorph.css` held one copy of the
  focus and motion conventions for every recipe that composes them. It now keeps the last copy of
  each repeated rule, which is the one that decided the cascade, so no element's style changes and
  the file is about 30% smaller before compression.
- de4a5d4: **FormPage takes a leading action.** `leadingAction` is one optional action drawn at the start of
  the actions row, apart from `actions`, which stay at its end: the destructive tertiary action
  FormPage's spec places leftmost, such as "Delete…". The row wraps as it did, and the actions stay
  at the end of whichever line they land on, in either direction. Without it, FormPage renders as
  before. A Vue, Svelte, Solid or Angular page passes it as the `leadingAction` slot, and an element
  as a child with `slot="leadingAction"`. The SwiftUI and Compose FormPage take it too
  (`PMFormPageProps.leadingAction`), at the start of the row they already draw. `danger-last` reads
  the slot as a group of its own, so a danger Button there comes before the actions lawfully.
- ee95409: **Every icon-only Button shows its label on hover and keyboard focus.** A Button with `iconOnly`
  shows its `label` in a bubble that looks like a Tooltip's: after the Tooltip's delay when the mouse
  rests on it, and at once when the reader moves focus to it with Tab or an arrow key. Touch, pen and
  focus a script gives after Enter or a press do not open it, so a Dialog that focuses its icon-only
  close button shows no tip there. It is a name tip, not a Tooltip: the bubble is hidden from
  assistive technology, adds no `aria-describedby`, and the button's name is unchanged. It is drawn
  in the top layer, so it shows over a Dialog, Drawer, Popover or Menu, takes no pointer events, and
  adds nothing inside or around the button. Escape closes the tip and nothing else, so a Dialog
  around the button stays open until the next Escape.

  SplitButton's chevron, CopyButton, AvatarButton and Pagination's arrows drawn as links show their
  names the same way. CopyButton shows none while its confirmation shows.

  A Button already inside a `<Tooltip>` is unchanged: it shows the Tooltip and no tip. A Tooltip
  around an icon-only Button that repeats only its label can be removed.

  The engine exports `nameTip(control, label, className)`, and each foundation re-exports it, for
  the members that call it. Button's recipe adds the `tip` class, which composes the Tooltip's
  `bubble`, and the Tooltip's trigger anchor carries `data-tooltip-part="trigger"`.

- 4571e3b: Keyboard and focus fixes for overlays and for members that leave the page.

  - **Toast.** In React the viewport no longer uses `@radix-ui/react-toast`: it draws the same
    region, list, cards and live regions as every other framework, so `@polymorph/react-ui`
    drops that dependency. What a reader notices:
    - Tab moves through the toasts in document order, oldest first, as in every other
      framework. Radix moved newest first.
    - A toast with an `action` whose call sets neither `durationMs` nor `retained` stays until it
      is dismissed, whatever its tone, so a reader has the time to reach the action. Set
      `durationMs` to keep a timer. The SwiftUI and Compose Toast follow the same rule.
    - When a toast that holds focus leaves, by any route (its close control, its action,
      Escape, `toast.dismiss`, its owner removing it, or a newer toast evicting it), focus moves
      to the next toast, else the previous one, else back to the element focus came from as it
      entered the notifications (F8 or Tab), else to the list.
    - Escape reaches a toast only while focus is in it, so a toast raised while a Dialog is open
      no longer takes Escape from the dialog. An Escape that closed a Select, Menu or Tooltip in
      a toast's content, or that an input method was handling, leaves the toast open.
    - The live regions say a toast when it is raised, and again when an update in place changes
      its words, and say nothing when one leaves. Only a danger toast interrupts a screen reader
      (the assertive region); a warning toast now waits its turn in the polite region, as the
      SwiftUI and Compose Toast and Banner already did. They read the content's text and the action's
      label too, and two toasts with the same words in a row are each said.
    - The timers wait while the window is in the background (its page is hidden, or another
      window or application has focus), as well as while the reader is on the notifications.
      Focus in a frame on the page does not hold them. When the hold ends, a toast resumes with
      the time that was left in every framework, as React's did; Vue, Svelte, Solid, Angular and
      the elements started a whole new window.
    - A toast raised again under the id of one whose card is still playing its exit stays: the
      card takes out its own record only (`removeToast(id, raised)`).
  - **Focus return when the trigger is gone.** Dialog, ConfirmDialog, Drawer, Lightbox, Command
    and Tour return focus to the focusable element nearest where their trigger was when the
    trigger has left the page while they were open (a confirm that deletes its row), instead of
    dropping it to the body. The rule is the engine's `focusReturnTarget`.
  - **Alert, Banner and ArtifactPane.** When one of them leaves the page while it holds focus,
    after its own close control for one, focus moves to the focusable element nearest where it
    was (`focusAfterRemoval`), also when the framework removes it only after a leave animation
    (Vue's `Transition`, Angular's animations).
  - **The phone-width sheet inside a Dialog (React).** Select, Menu and the other members that
    draw the bottom sheet below `30rem` keep focus in the sheet when they open inside a Dialog
    or a Drawer, and Escape and a press on the sheet's scrim close the sheet and leave the Dialog
    open. An Escape that closes a Tooltip or a Menu inside the sheet leaves the sheet open. While
    a sheet that holds focus is open, the rest of the page is hidden from assistive software.
    `@polymorph/react-ui` adds `@radix-ui/react-focus-scope` and
    `@radix-ui/react-dismissable-layer` as dependencies; both already came with
    `@radix-ui/react-dialog`.
  - **Solid's `watchEffect`.** It reads the watched value as the member is set up, as Vue's
    `watch` does, so a change made between setup and the mount runs the effect again after the
    mount, once Solid has drawn it. With it, the Solid and elements Toast viewport says a toast
    raised in the same render as the viewport.
  - The engine exports `focusPlace`, `nearestFocusable`, `focusReturnTarget`, `returnFocusTo`,
    `focusAfterRemoval`, `focusAfterToast`, `followToastFocus`, `holdToastTimers`,
    `toastClock`, `toastTimeLeft`, `announceToasts` and `TOAST_QUIET`, and a toast record carries `raised`, which a toast raised
    again under the same id renews.

- 53294c6: Keyboard and focus fixes for page structure, tooltips, reading direction and the grid, in every
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

- 203668b: Text fields leave the keys an input method is handling to it. In TagInput, MultiSelect,
  InlineEdit, PromptInput, PhoneInput and ColorInput, the Enter that confirms a Japanese or Chinese
  candidate, including the one Safari sends after the composition has ended, no longer commits,
  toggles, saves or sends half-typed text. An Escape that abandons a composition no longer clears
  TagInput's or MultiSelect's text, cancels InlineEdit, or clears the query of the Vue, Svelte,
  Solid, Angular and elements Command. Inside a Dialog, that Escape still closes the Dialog, as it
  did before: the dialog's layer does not ask whether a composition is in progress. The engine
  exports the check as `composingKey`.

  Escape that clears TagInput's uncommitted text, clears a closed MultiSelect's text or cancels an
  open InlineEdit no longer closes a Dialog around the field as well; the next Escape closes it.
  The engine exports the hold as `holdFieldEscape`.

  TagInput's and MultiSelect's arrow keys between the field and the chips follow the writing
  direction: in a right-to-left page → moves back into the chips and ← forward to the field. The
  engine exports the key as `lineStartKey`.

  FileUpload and PromptInput move focus once the app has removed a file or an attachment whose
  remove control was pressed: to the next item's remove control, else the previous one's, else the
  dropzone or the field. Focus no longer falls to the page. The engine exports the rule as
  `focusAfterListRemoval`.

  In RichTextInput, Shift+Tab on an item of a top-level list moves focus out of the field and no
  longer turns the item into a paragraph, and after an Escape with nothing to close, the next Tab or
  Shift+Tab moves focus out from any list item without changing the text.

- Updated dependencies [de4a5d4]
- Updated dependencies [ee95409]
- Updated dependencies [4571e3b]
- Updated dependencies [53294c6]
- Updated dependencies [203668b]
- Updated dependencies [ddbd1d4]
  - @polymorph/solid-ui@1.0.18
  - @polymorph/solid@1.0.18
  - @polymorph/elements@1.0.18
  - @polymorph/screen@1.0.18

## 1.0.17

### Patch Changes

- 740bebf: Accordion and Collapsible take `keepMounted`, an optional prop with the name Tabs uses. In React a
  closed region's content then stays in the document, `hidden`, so a page's server markup carries it
  and state inside the region survives a close: an FAQ's answers are in the HTML a crawler reads
  without running a script. The region is hidden once its close animation ends. Without the prop
  React leaves closed content out, as before. The Vue, Svelte, Solid, Angular and elements members
  already keep a closed region's content in the document, `hidden`, so they accept the prop and it
  changes nothing there. The SwiftUI and Compose contracts gain the field, and neither rendering
  draws it: SwiftUI lays a closed region's content out at no height in every case, and Compose
  leaves it out.
- 2f0905d: The elements draw a screen a model writes, a `polymorph-screen/1` document, at run time with no
  build. `@polymorph/elements-ui` now depends on `@polymorph/screen`, the run-time core every renderer
  shares. Nothing changes for a page that draws no screen.

  - `<poly-screen>` draws its `spec` property, its `text` property (a model's answer so far) or the
    JSON in its `<script type="application/json">` child, with `data`, `streaming`, `members` and
    `faults` (`hidden` or `inline`). It dispatches `poly-action` (`{ name, args, values, changed }`,
    `changed` naming the controls the person changed; a listener hands the member a promise with
    `event.waitUntil`) and `poly-fault` (`{ path, message, component }`), and has `values`,
    `changed` and `check()`. It draws no box of its own. `streaming` is the page's to set, for `text` as for `spec`:
    set it while the answer arrives and clear it when the answer ends, so a truncated answer reports
    what it lacks. A `members` value that cannot be read (an attribute that is not JSON or names, a
    property that is not a list) allows no member and is a `poly-fault` at the path `members`. A
    document nested too deep to read draws nothing and is a `poly-fault`; setting `text` never throws.
    A swap of the element's children (a new script, a morph that keeps the script, `replaceChildren`)
    draws the document the children hold.
  - `@polymorph/elements-ui/screen`, for an app with a bundler, defines `<poly-screen>` and every
    element, each loading its member's code when it first renders, and exports `drawScreen`,
    `parsePartial`, `checkScreen`, `runtimeCard` and `outputContract`, bound to the members the
    elements draw.
  - `polymorph.js` and `polymorph-all.js` define `<poly-screen>` and export `loadScreen()`, which
    resolves to the same functions. `polymorph.js` holds only the element: the renderer and the
    vocabulary table are a chunk the first `<poly-screen>` fetches, the validator a chunk its
    `check()` fetches, and the card a chunk `loadScreen()` fetches with them. `polymorph init
--framework elements` and `polymorph update` copy the new chunks with the others.

- e761a13: Image takes two optional props that steer the browser's fetch, for a public page whose first
  picture decides how fast it loads:

  ```tsx
  <Image
    src="/harbour-800.jpg"
    srcSet="/harbour-400.jpg 400w, /harbour-800.jpg 800w, /harbour-1600.jpg 1600w"
    alt="A harbour at dusk"
    width={800}
    height={500}
    loading="eager"
    fetchPriority="high"
  />
  ```

  - `srcSet` is the element's `srcset`, passed unchanged. The browser requests the file that suits
    the screen, so a phone does not download a desktop's file. `src` stays required.
  - The element's `sizes` is not a prop, because the red rules refuse a length in application
    code. The member writes it for a set that gives widths, from the frame's box: `width` pixels
    and never more than the viewport's width for a frame with `width` and `height`, wider by the
    crop for a picture that covers a frame of a narrower ratio, and the element's own laid-out
    width first (`auto`) for a lazy picture drawn as wide as its frame. A set that gives widths
    needs a box, from `width` and `height` or from `aspectRatio`: without one the set is ignored,
    with a development warning, because it would stretch the frame to its container.
  - `fetchPriority` is the element's `fetchpriority`: `high` for the one picture that is the largest
    content of the first view, with `loading="eager"`.
  - A change of `srcSet` is a new request, as a change of `src` is: the frame returns to loading,
    and a failure is forgotten.

  An element takes them as `src-set` and `fetch-priority`. Without the props the markup is what it
  was. On iOS and Android neither is honoured: the view requests the `src`.

- 529dfa9: Pagination takes `getPageHref(page)`, and CursorPagination takes `previousHref` and `nextHref`.
  Both are optional. With them, each control that goes to another page is a real `<a href>` with the
  look of the Button it replaces, so a crawler reaches a public list's later pages and a reader can
  open one in a new tab. In the append form, `nextHref` is the "Load more" action's address. A click
  that would navigate the current tab calls the existing handler (`onPageChange`, `onPrevious`,
  `onNext`) with the browser's navigation stopped, so the app changes the page as it does today; a
  click with a modifier key opens the address. The current page, a control with nowhere to go, a
  held pager and a window in flight stay Buttons. A link follows from Enter and not from Space, as
  a link does. Without the props, the markup is unchanged. On a page written in HTML,
  `previous-href` and `next-href` are attributes, and `getPageHref` is a property set from script.
  The pagers' recipes gain the link's classes, which compose Button's.
- b33e18c: Each package's registry listing has `keywords`, which it had none of, and a description that
  names the Polymorph design system. A vocabulary's description says it holds the system's
  components for its framework. A search of the registry for a design system or for components in
  a framework matches the packages by those words. No file a consumer imports changes.
- f525c25: `RichTextContent` in Vue, Svelte, Solid and Angular, and as `<poly-rich-text-content>`, generated
  from one description and held to the React member's contract.

  - Its `entity` function is each framework's slot that takes an argument: a scoped slot in Vue, a
    snippet in Svelte, a function in Solid, an `ng-template` in Angular and a function property on
    the element. Where it draws nothing for an entity, the member draws the entity's token.
  - `@polymorph/engine/rich-text` exports `richTextDrawing`, which reads a document into the blocks
    and inlines each framework's member draws, with the highlights nested and the positions of
    the plain text. It reads no DOM, so it runs on a server. `@polymorph/engine` exports the
    reading of a selection and of a press or key on a highlight (`mapRichTextSelection`,
    `richTextSelectionBox`, `richTextPressedAnnotation`, `richTextKeyedAnnotation`). The React
    member draws from the same functions, and its markup is unchanged.
  - Each foundation exports `slotDraws`, which says whether a slot that takes an argument draws
    anything for one.

- 0619f1f: `RichTextInput` in Vue, Svelte, Solid and Angular, and as `<poly-rich-text-input>`, generated from
  one description and held to the React member's contract.

  - Its `toolbar`, `selectionActions` and `footer` functions are each framework's slot that takes
    an argument: a scoped slot in Vue, a snippet in Svelte, a function in Solid, an `ng-template` in
    Angular and a function property on the element. The argument is the field's handle.
  - An Angular output and an element's event carry one value, so `submit` there carries the
    document and not the handle; the slots receive the handle.
  - `@polymorph/engine` exports the keyboard of a toolbar with one tab stop (`toolbarKeydown`,
    `syncToolbarStop` and the functions beside them) and the places of a bar at the selected text
    and of a list at a token (`placeSelectionBar`, `followSelectionBar`, `placeTokenList`), which
    every framework's member calls. The React member calls the same functions.
  - `@polymorph/engine` also exports what makes a field of several parts behave as one control:
    `followFieldFocus` (focus entering and leaving the field as a whole), `followFormReset` and
    `focusOnLabelPress`.
  - A states fixture entry can select words once they are drawn: the Svelte foundation's `Held`
    takes `selects`, and the Angular foundation exports `selectOnce`.

- Updated dependencies [740bebf]
- Updated dependencies [a0081dc]
- Updated dependencies [e761a13]
- Updated dependencies [529dfa9]
- Updated dependencies [b33e18c]
- Updated dependencies [f525c25]
- Updated dependencies [0619f1f]
- Updated dependencies [14d4d55]
- Updated dependencies [628200f]
- Updated dependencies [e7f8f9c]
- Updated dependencies [f673c3c]
  - @polymorph/solid-ui@1.0.17
  - @polymorph/elements@1.0.17
  - @polymorph/solid@1.0.17
  - @polymorph/screen@1.0.17

## 1.0.16

### Patch Changes

- e774b49: **The Angular members lay out as the other renderers' do.** Every Angular member renders inside a
  host element (`<pm-card>`) that draws no box, and a recipe selector that reads a parent or a
  sibling matched the host instead of the member inside it. A `Grid` drew each cell one column wide
  whatever `columns` said, a `SettingsRow` after the first drew no rule above it, a
  `TableOfContents` column was half its width, and a nested list in `Markdown` lost its spacing.
  The Angular build now compiles each recipe with forms that also match through a host, and each
  host carries `data-pm-host`, the attribute those forms read. A new law holds every Angular member
  to the box it has with the hosts removed. An Angular screen that uses these members changes its
  layout to the one the specs describe.

  The elements' recipes gain one form of the same transform: siblings that one host holds together
  after a child step (`.item > * + *`) now match through it.
  - @polymorph/elements@1.0.16
  - @polymorph/solid@1.0.16
  - @polymorph/solid-ui@1.0.16

## 1.0.15

### Patch Changes

- 57db696: **An `Alert` with nothing to say draws nothing.** An Alert given no title and no content drew an
  empty tinted panel with its tone's glyph. It now renders nothing: no root, no panel and no glyph,
  in every web framework, as an element, in SwiftUI and in Compose. A screen can therefore draw an
  Alert always and bind its `title` to a message that is empty while there is none, as an
  `ErrorSummary` with no errors already renders nothing.

  - A title counts when it is not absent and not empty. An empty title with content draws the
    content alone, where before it drew an empty title line above it.
  - Content counts in React when `children` is a value React draws: not `undefined`, `null`, a
    boolean or `''`. In Vue, Svelte, Solid, Angular and the elements it counts when the default
    slot has content. In SwiftUI and Compose it counts when `children` is not `nil` or `null`.
  - `action`, `secondaryAction` and `onDismiss` are not content: an Alert with only those renders
    nothing too.
  - `children` is optional: `AlertProps.children` in every web framework, and `PMAlertProps.children`
    in the Swift and Kotlin contracts, which now default to `nil` and `null`. A title with no
    content draws the title alone, with no gap under it.
  - An Alert that draws nothing is not listed for an agent. Once its title or content arrives it is
    drawn with its role on its root from that first render, so it is announced as an Alert mounted
    in response to an event is, and it is listed.

  An Alert with content, and a title that is absent or not empty, draws as before.

- Updated dependencies [57db696]
  - @polymorph/solid-ui@1.0.15
  - @polymorph/elements@1.0.15
  - @polymorph/solid@1.0.15

## 1.0.14

### Patch Changes

- 9b60a94: **`ScatterChart` reports nothing where it draws no point.** A row whose x, y or bubble value is
  `null` draws no point for that series. The arrow keys still reach that position, and the live
  region still says it, but Enter, Space and a click there no longer call `onSelect`. Before, they
  called it with `{ index, key, datum }` for a point the plot did not draw. An agent does not list
  such a position among the chart's `items`, and its `choose` refuses one. The engine's
  `scatterChartSelection` returns `null` there, as `heatmapSelection` does at an absent cell.

  **`BarChart` reports nothing at a walked bar that is not drawn.** With the reading walked to one
  series (Up and Down) at a band where that series' value is `null`, Enter, Space or a click called
  `onSelect` for a bar the plot does not draw. `barChartSelection` returns `null` there. A whole-band
  reading reports the band as before.

  **An agent action names the list it chooses among.** The agent fence's grammar has an optional
  clause, `action <name> <id|ids> among <state> …`, which names the `choices` state whose choices
  the argument names. A handle's action may carry it (`{ argument: 'id', among: 'series', run }`),
  and so may a description's `agent` block, which every renderer hands to `agentMember` as written.
  With `among`, the bridge checks the value, and whether a choice is marked destructive, against
  that state's choices only, and refuses an id of another list with `invalid-value`. The snapshot
  lists it beside the argument (`{ name: 'toggle', argument: 'id', among: 'series' }`). Without it
  nothing changes, and no existing fence, handle or description changes meaning.

  - `pnpm registry` fails on `among` on an action that takes no id, on `among` naming a state that
    is not one of the fence's `choices` states, and on an `id` or `ids` action with no `among` in a
    fence that declares more than one `choices` state.
  - The staleness law holds the React member's and the description's `among` to the fence's.
  - The agent conformance law draws an action's probe from the state it chooses among, checks that
    the snapshot lists the same `among`, and checks that an id of another `choices` state is
    refused and changes nothing.

  **An agent hides and shows a chart's series with its legend.** `AreaChart`, `BarChart`,
  `LineChart`, `RadarChart` and `ScatterChart` draw a legend whose keys hide and show a series. An
  agent now reads them as two states and runs one action, in every web framework:

  - `series` lists the legend's keys in the legend's order, each `{ id, label }`: the id is the
    series' `key`, and the label is what its key says. `hidden` lists the ids of the series now
    hidden. A chart with one series draws no legend, so both are empty there.
  - `toggle` takes the id of one of `series` (`among series`) and presses its key with the key's own
    click, as a person does, so the chart refits its domains as it does for a person.
  - `choose` takes the id of one of `items` (`among items`), so a series' id is refused there, and
    a mark's id is refused by `toggle`.
  - Such a chart is listed for an agent while a person has something to operate in it: `onSelect`,
    or a legend. A chart with a legend and no `onSelect` is listed now, with `items` empty and
    `choose` refused, where before it registered nothing. `DonutChart` and `Treemap` draw a legend
    that only labels, so nothing changes for them.

  The engine exports `chartSeries`, `chartHiddenSeries` and `toggleChartSeries`, which read a
  chart's legend keys from its element and press one, for every renderer, and the types
  `ChartSeriesChoice` and `ChartLegendSeries`; each web framework's foundation re-exports them.

  **An agent brushes a range on a `LineChart` or an `AreaChart`.** A chart with `onBrushEnd` on an
  x it brushes (`time` or `linear` for `LineChart`, `time` for `AreaChart`) has a brush, and an agent
  now reads and uses it through the machine a person's keys drive:

  - `range-start` and `range-end` are the range a person sees drawn, in rows, the unit `position`
    uses: the row the range was begun on and the row it ends on, or `null` while there is none.
  - `brush` takes the row the range ends on, presses Shift and the arrow toward it once per row,
    as a person does, and commits with Enter, so `onBrushEnd` receives what a person's committed
    range reports. The range starts where a person's would: at the start of a range a person has
    begun, else at the reading position, which `read` sets, else at an end of the chart.
  - A chart without a brush lists both states as `null`, and `brush` throws, saying why. A number
    that is not a row, and a range of one row, are refused too.
  - A chart with a brush is listed for an agent with no `onSelect` and no legend.

  The engine exports `chartRange` and `brushChartRange`, and the types `ChartRange` and
  `ChartRangeSource`; each web framework's foundation re-exports them. `LineChart` and `AreaChart`
  have a states fixture entry `brushable`.

- Updated dependencies [9b60a94]
  - @polymorph/solid@1.0.14
  - @polymorph/elements@1.0.14
  - @polymorph/solid-ui@1.0.14

## 1.0.13

### Patch Changes

- d84171d: An agent on a running page can read and operate the mounted members through an API, instead of
  clicking or reading screenshots. A member's spec declares what an agent may read and do in an
  `## Agent` section, and nothing else grants access. The bridge is opt-in: a page that does not
  import `@polymorph/engine/agent` does not ship it. `docs/agents.md` describes the bridge for an
  application and the section for a member's author.

  **The bridge.**

  `@polymorph/engine/agent` is a new entry point. `createAgentBridge({ confirm, policy, settleMs })`
  returns a bridge with `snapshot()`, `query({ name, text, member })`, `act(steps)`,
  `subscribe(listener)`, `acting` and `dispose()`.

  - An action the spec does not declare is refused, and the error lists the actions that are
    allowed.
  - A secret value is reported as `{ secret: true }`, and so is any value that holds the text of a
    password field.
  - An action of a destructive instance runs only after `confirm` resolves true. Without a
    `confirm`, it is refused.
  - A policy can hide a member or deny an action. It cannot add either.
  - A member is listed only while its element is in the document, so a closed Dialog, Drawer,
    Popover or ConfirmDialog is not listed, and a step on it answers `unknown-member`. A member in
    content marked `hidden` is not listed either, so a closed panel a renderer keeps in the
    document gives an agent what a removed one does. A step that removes its member's element
    still reports what changed.
  - Each member carries `description`, the text of the elements its control names with
    `aria-describedby`, such as a field's hint and error, when there is any. `query`'s `text`
    matches it. A member that holds a secret, or a password field, gives none.
  - A step that succeeds dispatches `polymorph:agentchange`, bubbling, on the element its member
    names after the step, else on the one it named before if that is still in the document, else
    on the document, with `detail: { id, member, action, changed, source: 'agent' }`, and
    `bridge.acting` is true while its action runs, so a handler can tell an agent's change from a
    person's.
  - `agentTools(bridge)` returns the bridge as three tools, `polymorph_snapshot`,
    `polymorph_query` and `polymorph_act`, for an application's own agent.
    `registerWebMCP(bridge)` registers them with the browser's WebMCP API on
    `document.modelContext` or `navigator.modelContext` and returns the function that unregisters
    them. Where the API is absent it does nothing.

  **Registration.**

  `agentMember(handle)`, `agentFill(element, text)` and `agentPress(element)` are new exports of
  `@polymorph/engine` and of every foundation, with the types `AgentHandle`, `AgentAction`,
  `AgentArgumentType` and `AgentArgumentValues`. A member registers a handle while it is mounted.
  `useAgentMember(handle)` in `@polymorph/react` registers a React member on mount, removes it on
  unmount and calls the latest render's closures; `useAgentMember(handle, { unless })` registers
  nothing while `unless` is true. The engine and every foundation also export
  what several renderers share: `menuChoices`, `chooseMenuEntry`, `menubarChoices` and
  `chooseMenubarEntry`; `railDestinations`, `currentRailDestination` and `goToRailDestination`,
  which read an AppShell's destinations from its navigation in the document and press one, with
  the types `RailClasses` and `RailDestination`; `listItems`, `currentListItem` and
  `chooseListItem`, which read a List's items from its list in the document and press one, with
  the type `ListItemChoice`; `jsonTreeBranches`, `jsonTreeExpanded` and `setJsonTreeBranch`, which
  read a JsonTree's branches from its toggles by their JSON Pointer and press one, with the type
  `JsonTreeBranch`; `chartMarks`, `chartPosition`, `readChartPosition` and `chooseChartMark`,
  which read a window of at most `CHART_MARK_CAP` of a chart's marks through its reading, read and
  move the reading's position, and pick a mark as Enter does, with the types `ChartMarkChoice`,
  `ChartMarkReading` and `ChartMarkSource`; a
  Table's sortable headers and its sort
  (`tableSortColumns`, `tableSort`, `pressTableSort`); the notices of the toast store and an answer to
  one (`toastNotices`, `toastDetails`, `dismissToastNotice`, `actOnToastNotice`); and the readers of
  the text an agent sets on a date or duration field (`agentDate`, `agentDateTime`, `agentTime`,
  `agentMonth`, `agentDateRange`, `agentDuration`).

  A handle may give `withholds`, the element or elements whose registered members are not an
  agent's. The bridge lists, matches and runs none of them, the policy cannot list them, and the
  member is listed in their place. A member that holds a secret withholds its own element.

  A custom element of `@polymorph/elements-ui` renders its Solid member, so the member inside it
  registers too, and a page that builds the elements with a bundler creates a bridge as any
  application does. A page with no build loads the bridge with `loadAgentBridge`, which
  `polymorph.js` and `polymorph-all.js` export: it resolves to `@polymorph/engine/agent`, built with
  the elements so it reads the registry they write to, and `polymorph.js` fetches it as a chunk of
  its own on the first call.

  **Registering before the bridge loads.**

  `@polymorph/engine/webmcp` is a new entry point, an addition that changes no existing one, and
  holds none of the bridge. `registerWebMCPOnCall(load, options)` registers the three tools with the
  browser's WebMCP API at once, and on the first call of any of them calls `load`, a dynamic import
  of `@polymorph/engine/agent`, once, and creates the bridge with `options`. A load that fails
  resolves the call to `{ error: { code: 'failed', message } }`, and the next call loads again.
  `applyAgentSetting(value)` and `AGENT_ATTRIBUTE` (`data-agent`) do what a page's agent setting
  says: nothing without one, `on-call` as `registerWebMCPOnCall`, and `eager`, which loads the
  bridge at once; another value warns, and without a WebMCP API neither registers nor loads
  anything. `agentTools` and the new registration read one list of the tools' names, titles,
  descriptions, schemas and hints.

  One registration of the tools stands on a page at a time. While one does, a second
  `registerWebMCP`, a `registerWebMCPOnCall` or a page's setting registers nothing and warns in the
  console, where before the browser refused the second registration's names without a word.

  A page with no build states `<html data-agent="on-call">` or `data-agent="eager"` and writes no
  script: `polymorph.js` and `polymorph-all.js` read it as they load. `polymorph init --framework
elements` names the setting in the app's `AGENTS.md`, and its example page states none.

  **The members.**

  These members register, in every web vocabulary. Their props, markup and defaults are
  unchanged. The system card lists each one's actions and states.

  - Controls: Button, AvatarButton, ProviderButton, RecordButton, SplitButton, Link, Input,
    Textarea, SearchInput, NumberInput, PhoneInput, PasswordInput, OTPInput, TagInput, InlineEdit,
    ColorInput, Select, Combobox, MultiSelect, TreeSelect, Checkbox, CheckboxGroup, RadioGroup,
    ChoiceCard, SegmentedControl, ModeSwitch, Switch, Slider, Rating, Calendar, DatePicker,
    DateRangePicker, MonthInput, TimeInput, DurationInput, FileUpload and ImageEditor. A Button
    reads `pressed` as `aria-pressed` says it, and as `null` on a Button that is not a toggle, and
    `expanded` as `aria-expanded` says it, and as `null` on a Button that discloses nothing.
  - Overlays: Dialog, ConfirmDialog, Drawer, Popover, Lightbox, Tour, Menu, ContextMenu, Menubar,
    Command, Tabs and Toast. Toast registers on its viewport, which reads the notices on screen
    and dismisses one or runs its action through the toast store.
  - Structure: Accordion, Collapsible, Alert, Banner, Pagination, CursorPagination, Table,
    DataTable, Tree, Stepper, Carousel, FilterBar, SectionNav, TableOfContents, Breadcrumbs, List
    and AudioPlayer. A Table reads its own sortable headers, and its `sort` presses a header's
    control once, so its caller decides the order; the Table a DataTable draws registers nothing. A
    List reads the items that navigate or are picked from its list, with the current one, and its
    `choose` presses an item's link or button, so `onSelect`, `onNavigate` or the browser takes it
    as a person's press; an item that is only read is not a choice.
    A Card with `href` registers its stretched link, which an agent presses as a person clicks
    it, and ErrorSummary lists its errors and follows one to its field with `choose`, reading its
    links with List's `listItems`. A JsonTree reads its open branches and the branches a reader can
    see, each by the JSON Pointer of its value, and its `expand` and `collapse` press a branch's
    toggle.
  - Layout: SplitPane reads its divider's position in percent, as `aria-valuenow` reports it, and
    its `set` moves the divider within the bounds its floors give and commits, as a key press does.
  - Charts: AreaChart, BarChart, DonutChart, FunnelChart, Heatmap, Histogram, LineChart,
    RadarChart, ScatterChart and Treemap, while they have `onSelect`. `items` lists the marks the
    keys reach, labelled with what the live region says there, at most `CHART_MARK_CAP` of them:
    the whole positions around the reading position. `position`, which the figure shows as
    `data-position`, and `count` say where the reading is and how many positions the chart has,
    `read` moves the reading as Left and Right do, and `choose` moves it to a listed mark and
    activates it as Enter does, so `onSelect` receives a person's payload. A chart without
    `onSelect` registers nothing, and Sparkline, which takes none, never does.
  - Conversation: PromptInput, ChatThread, ToolCall, ReasoningDisclosure, AttachmentChip,
    ArtifactPane and ApprovalCard. AppShell registers too: an agent collapses and expands its rail,
    opens and closes its drawer below the breakpoint, reads the application's destinations from
    its navigation, with the current one, and goes to one by pressing its NavItem, so `onNavigate`
    or the browser takes it as a person's press.

  What an agent is not given:

  - A password and a one-time code are secret, and no action writes them. PasswordInput's reveal
    toggle is not an agent's.
  - No action confirms for a person. ConfirmDialog declares `cancel` only and withholds its
    confirm Button, its phrase field and the Dialog it draws. ApprovalCard declares no action and
    withholds its Buttons.
  - A Button with `tone="danger"`, and a `danger`-toned entry of a Menu, ContextMenu, Menubar or
    SplitButton, asks a person to confirm.
  - RecordButton lets an agent stop a recording and never start one. FileUpload lets an agent
    remove or retry a file and never add one. AudioPlayer and ImageEditor are read only.
  - CopyButton, Tooltip, HoverCard and FormField give an agent nothing, and each spec says why.
    Plan and ChatMessage are not registered, so they stay server components.
    Citation and SourceList are not registered either: each of their links opens a new tab,
    which an agent's press cannot open, and their words are on the page.
  - The Popover ColorInput draws for its picker registers nothing, and ColorInput withholds its
    panel, so an agent sees one ColorInput.

  A React member that passed `value` or `defaultValue` straight to its substrate now holds the
  value itself and keeps the substrate controlled, controlled when the prop is given, so an
  agent's action and a person's reach the same handler in both forms: Checkbox, Switch,
  RadioGroup, SegmentedControl, ChoiceCard, Select, Slider, Tabs, ReasoningDisclosure and
  ToolCall. A native `form.reset()` now resets a Checkbox row's state attribute too.

  **The tooling.**

  - `@polymorph/registry`: each member carries an `agent` field, the statements of its spec's
    `agent` fence, or `null` for a member agents cannot see. `@polymorph/registry/agent` exports
    the grammar, in which a `number` state reads `null` while the member holds none, as an `id`
    state does, and an action may say `presses <part>`, the part whose element it presses with the
    element's own click. The coverage law fails on a control or an overlay whose spec has no decided
    `## Agent` section, and the staleness law on a fence the code does not match.
  - `@polymorph/shells`: a description takes an `agent` block (`on` or `element`, `state`,
    `actions`, `secret`, `destructive`, `withholds`), which each renderer writes as a mount effect
    that registers the instance. A compound part may give the block instead, which registers under
    its member's name (Toast's viewport). A member that lends its identity reads the element the member it
    lends to hands back, as `borrowed`; the Solid foundation exports `BORROWED` and
    `BorrowedHolder`, and the Angular foundation `BORROWED`, `BorrowedHolder`, `handBack`,
    `borrowedHolder`, `lenderHolder` and `KEEPS_HOLDER`.
  - `@polymorph/conformance`: the runner executes every statement of an agent fence against every
    renderer, with a bridge installed; `agentConformanceLaw` holds a shell's fences, and
    `conformanceLaw` calls it. `WINDOW_SIZES` lists the fixture entries the runner mounts at a
    window size other than the default, through the harness's new `viewport`, so an action that
    exists only below a breakpoint is checked there.
  - `@polymorph/engine/testing` exports `agentRegistrations()`, every registered member's id, name
    and elements, withheld ones included.
  - `pnpm new:member` writes the `## Agent` section with a placeholder the coverage law refuses.

- 56e7665: `@polymorph/elements` and `@polymorph/elements-ui` are new packages: the vocabulary as custom
  elements, for a page written in HTML with no build, a server-rendered template, or a page htmx or
  Turbo swaps. Each member is an element, `poly-` and its kebab name (`<poly-button>`,
  `<poly-tabs-content>`), that renders the generated Solid member into itself in the light DOM. The
  elements are a distribution of the Solid rendering, with its recipes and its behaviour, and add no
  decision of their own. They are published as `@metamorph-labs/polymorph-elements` and
  `@metamorph-labs/polymorph-elements-ui`, and `design/frameworks/elements.json` says which members
  they ship.

  A prop is an attribute in kebab case and a property in camel case: a boolean is present or
  `"false"`, data is a JSON attribute, a date or a time is ISO 8601 text, and a function, a render
  prop or a ref is a property set from script. A node prop is a child with `slot="name"`, and
  `<template slot="name">` gives text or several nodes. A child added to the element after it
  renders joins its slot, and `element.removeChild(child)` takes one out of its slot, wherever the
  member drew it; replacing every child renders the member again. A callback is the event `poly-<name>`
  (`poly-change`, `poly-open-change`), whose `detail` is its first argument; it bubbles, and a
  listener can hand the member a promise with `event.waitUntil`. A controlled prop follows the
  reader: after its change event the element sets its own property, unless a listener calls
  `preventDefault()`. A member that asks whether its event is heard learns it from a listener added
  to its element, or from `listens="name"`.

  An element draws no box: while it renders its member it carries the custom state `poly-host`, and
  `:state(poly-host)` is `display: contents`. A table's section, row and cell and a list's item are replaced in the
  document by the element they render. The elements need Chrome 125, Safari 17.4 or Firefox 126.
  Rendering is client-only, and the elements are not form-associated: each member's own input posts.
  `restore()` puts back the markup a page wrote before a page snapshot (`turbo:before-cache`,
  `htmx:beforeHistorySave`).

  A page with no build links `polymorph.css` and a theme sheet, runs `prepaint.js` first in
  `<head>`, and loads `polymorph.js` as a module script: it defines every tag at once and loads each
  member's code, a chunk of its own, the first time one of its elements renders, so a page with one
  Button loads Button and what it composes. `polymorph-all.js` loads every element in one file. Both
  export `restore`, `toast` and `loadAgentBridge` for the page's own module script, and read
  `<html data-agent>` as they load: without it nothing more is fetched; `on-call` registers the agent
  bridge's tools with the browser's WebMCP API and fetches the bridge on the first call, and
  `eager` fetches it at load (`docs/agents.md`). `polymorph.css` holds the base
  layer, every recipe with the forms that reach through an element, Icon's stylesheet, the host rule,
  and rules for an element that has not rendered: a closed overlay's content stays hidden, and a
  table's and a list's parts lay out as the elements they render. The files are in
  `@polymorph/elements-ui/dist/cdn/`, with a theme sheet per house pairing (`themes/<system>.css`).
  No public URL serves them, so `polymorph init --framework elements` copies them into the app's
  static directory with a theme sheet and an example page (`docs/consuming.md`). The files report an
  attribute an element cannot read, and each member's own warnings, in the console on every page,
  because nothing lints a page written in HTML.

  An app with a build imports one element's module (`@polymorph/elements-ui/controls/Button`) or
  every element (`@polymorph/elements-ui`). Each element's module brings its Solid member compiled
  with its recipe, and the base layer, Icon's stylesheet and the host rules through
  `@polymorph/elements`; Solid, Zag and the Solid foundation are dependencies, one copy each.

  A prop named as a method every element inherits has no property, so the method keeps working on
  the element, and its attribute sets it: Diff's `before` and `after` are attributes, and
  `diff.before(node)` is `ChildNode.before()`. A controlled prop the page never set leaves the member
  uncontrolled. `defineLazy` defines a tag before its member's code is loaded, and
  `@polymorph/elements/loader` holds what a page that defines every tag at once loads first.
  `@polymorph/elements/temporal` holds the codecs that read a date or a time, which the module of
  each member with one gives `define`, so the date library loads only with such a member. On a page
  that loads a member's code when one of its elements first renders, the property of a date or a
  time set before that code has loaded reads `undefined` until it has.

- 73837b5: `MasterDetailPage` is a new page archetype: a list of items of one kind beside the detail of the
  selected one, for an inbox, a notifications page, an audit log or a file browser. It takes
  `title`, `description` and `actions` as PageHeader does, the `list` (a List, Table or Tree with its
  FilterBar and pagination, the selected item marked `current`) named by `listLabel`, the selected
  item's `detail`, an `emptyState` for the detail pane while nothing is selected, and `backLabel`
  and `onBack` for the way back on a phone. It fills AppShell's content region, as ConversationPage
  does, and the list and the detail scroll on their own. At or above a 48rem page the two sit side
  by side in a SplitPane; below it the page draws the list, or the detail under the way back, and
  `onBack` is where the application clears its selection. Focus moves only when the element that
  held it is no longer drawn. A page that draws the selected item under a table can move to it.

  The engine and every foundation export `masterDetailFocus`, `masterDetailHolds` and
  `MASTER_DETAIL_PART`, the focus rule every renderer's MasterDetailPage shares. The SwiftUI and
  Compose contracts gain `PMMasterDetailPageProps` and its rendering protocol, and both platforms
  draw the page: two panes from a 48rem page, and below it the list, or the detail under the way
  back. On iOS the way back is the page's own button and no system gesture. The elements vocabulary
  has it as `<poly-master-detail-page>`.

- 2da1598: `SearchPage` is a new page archetype in every web vocabulary: the page whose subject is a query,
  with the field, the filters under it, and what the query found. It takes `title`,
  `description` and `actions` as PageHeader does, the `search` slot for the field, `searchLabel`
  to name its search landmark, `filters`, `empty` with the required `emptyState`, `pending`, and
  the results as `children`. A page that searches as the reader types passes no `onSubmit`. A page
  that submits passes `onSubmit`, and the landmark is then a real form: Enter in the field calls
  it once and the browser does not navigate.

  The results flow down the page with no panel, one group under each Heading. While `pending` the
  results region is `aria-busy` and keeps the last results; while `empty` it holds the EmptyState
  drawn from `emptyState`. The swap moves no focus and plays no motion. The page's measure is nine
  of `--pm-space-10`, between FormPage's and ListPage's.

  `one-opener` knows SearchPage, so a module that renders one and also composes a PageHeader and a
  Hero is told to keep the archetype's title.

  The elements vocabulary has it as `<poly-search-page>`.

  On iOS and Android `SearchPage` is native, drawn in SwiftUI and Compose: the header, the field
  with its filters under it, and the results, with `loadStatus` and `onRetry` as every native page
  takes them.

- Updated dependencies [d84171d]
- Updated dependencies [508275a]
- Updated dependencies [5334be0]
- Updated dependencies [56e7665]
- Updated dependencies [189ef43]
- Updated dependencies [73837b5]
- Updated dependencies [a4dc653]
- Updated dependencies [2da1598]
- Updated dependencies [56e7665]
- Updated dependencies [cbfeef1]
  - @polymorph/solid@1.0.13
  - @polymorph/solid-ui@1.0.13
  - @polymorph/elements@1.0.13
