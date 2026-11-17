# Layout, responsiveness and performance

This page covers how polymorph's components lay themselves out and adapt to the space they
are given: the layout primitives, the container-first approach to responsiveness, what changes on a
phone (sheets, safe areas, the focus-zoom floor, touch targets), the stacking order, and
the performance budgets that are enforced.

Terms: the *vocabulary* is the closed set of components every renderer ships, and a
*member* is one of them. A *red rule* is a lint rule that fails `pnpm lint`; a *law* is a test
that enforces a design claim. See [concepts.md](concepts.md) for the full glossary.

This page describes the web renderers (React, Vue, Svelte, Solid and Angular). Their layout is
in the shared recipes (`packages/recipes/src/<tier>/`), which every web framework's members
import, so the breakpoints, sheets and stacking order below hold in all five. The SwiftUI and
Compose members use their platform's own layout and presentation, which each platform map
records per member (`design/platforms/ios.json`, `design/platforms/android.json`): for example,
`Dialog` is a modal sheet on iPhone and a full-screen dialog on Android phones.
[native.md](native.md) covers those renderers.

## Why adaptation is the vocabulary's job

Applications built on polymorph do not write CSS. The red rules forbid raw styles and
values in app code ([rules.md](rules.md)), so an app cannot add a breakpoint to make a
screen work on a phone. Every member has to adapt itself, and none of them takes a
breakpoint prop. Layout across many instances is decided once, in the member or archetype
that owns it, rather than at each call site.

## Layout primitives

The members of the `layout` tier arrange space without drawing anything: no background, border
or radius. Surfaces are `Card`'s job.

| Member | Use | Key props | Spec |
| --- | --- | --- | --- |
| `Stack` | vertical rhythm | `gap`, `p`/`px`/`py`, `align`, `justify`, `as` (`div`, `section`, `ul`, `ol`, `form`) | [stack.md](../design/components/stack.md) |
| `Inline` | rows of controls, meta lines, tag lists | the same spacing props, `align` (default `center`, plus `baseline`), `justify`, `wrap`, `as` (`div`, `section`, `ul`, `ol`, `nav`) | [inline.md](../design/components/inline.md) |
| `Grid` | equal-track grids: card fields, stat rows, form pairs | `columns` (`1 \| 2 \| 3 \| 4 \| 6 \| 12`, default `2`), the spacing props, `align`, `as` (`div`, `section`, `ul`) | [grid.md](../design/components/grid.md) |
| `SplitPane` | two permanent panes on one axis with a draggable, keyboard-steppable divider | `start`, `end`, `label`, `orientation`, `ratio`/`defaultRatio`/`onRatioChange`, `onCommit`, `startMin`/`endMin` | [split-pane.md](../design/components/split-pane.md) |

- **Spacing uses the space scale and nothing else.** `gap`, `p`, `px` and `py` take a space
  step `0`–`10`; `gap={5}` resolves to `var(--pm-space-5)` and `gap="17px"` is a type
  error. The values resolve through `data-gap` / `data-p` / … attributes in
  [`layout.module.css`](../packages/recipes/src/layout/layout.module.css), so every token
  reference sits where the Stylelint token rule can read it. `px`/`py` override `p` per
  axis. `p={0}` is an explicit reset, which differs from omitting `p`.
- **`patch`** re-assigns a spacing prop to another space step on one instance. This is an
  *instance patch*, one rung of the exception ladder ([rules.md](rules.md)).
- **Grid has equal tracks and no spans.** Weighted layouts (a `2fr 1fr` body) belong to
  the archetype that needs them, which is why `Dashboard` writes its own.
- **SplitPane's unit is a ratio** (0–1), because a proportion works at any container size.
  Pixel floors (`startMin`, `endMin`) are enforced by both CSS `minmax()` and the keyboard
  clamp. Arrow keys step 2%, Page keys 10%. There is no collapse. A pane that the reader can
  hide should be a `Drawer`.

Page-scale layout belongs to the page *archetypes*: `AppShell`, `ListPage`, `FormPage`,
`DetailPage`, `SettingsPage`, `Dashboard`, `AuthPage`, `MasterDetailPage`, `SearchPage`,
`ConversationPage` (specs in [`design/archetypes/`](../design/archetypes/)). They own the
pattern-scoped `--pm-shell-*` and `--pm-page-*` tokens (page padding, maximum width, the
`--pm-content-gutter` between regions). Only the files listed in
[`packages/rules/scoped-token-owners.json`](../packages/rules/scoped-token-owners.json) may
declare or read them. Inside `AppShell`, the content region is the only scroll container:
the frame stays fixed and the page scrolls. The topbar and the banner are rows of the frame
above that region, not layers over it, so nothing covers the top of the page, and a section a
fragment link jumps to needs no `scroll-margin`. `ConversationPage` and `MasterDetailPage`
fill the region instead of flowing down it, and their panes scroll on their own: the thread, and
the list and the detail.

A column that stays in view while the page scrolls belongs to the archetype that owns the
page's columns. `DetailPage` takes `stickyAside`: from a `44rem` page, where the aside is beside
the main column, the aside stays `--pm-page-padding-y` below the top of the box that scrolls, is
never taller than that box, and scrolls inside itself when it is longer. A TableOfContents
beside a long page goes there. The box's height is `100cqb`: the content region is a size
container for that reason, and when the document scrolls `cqb` is the small viewport height.
Below `44rem` the aside is under the main column and scrolls with the page.

## Container-first responsiveness

Four rules govern how members adapt.

1. **Members adapt to their container, never to the viewport.** A `Grid` inside a drawer
   and a `Grid` on a page have different widths at the same moment, and only each
   container knows its own width. An adaptive member declares `container-type: inline-size` on the
   box it measures and branches with `@container (width < …)`.
2. **Frames and overlays query the viewport.** `AppShell` and `AuthPage` (which
   renders outside the shell) are the page frame, so their container *is* the window.
   Portalled overlays are positioned `fixed` with no box between them and the window, so
   they may also query the viewport. The only other `@media (width …)` rules in the vocabulary
   are the focus-zoom floor on text fields, because the browser's zoom is keyed to the
   window ([below](#the-focus-zoom-floor)).
3. **Breakpoints are geometry, not theme.** Thresholds are `rem` literals with a comment,
   never tokens. A breakpoint that scaled with density would change the layout for a
   reader who only changed control density.
4. **Adaptation degrades composition, never content.** It can reduce columns, wrap rows
   or let a table scroll sideways, but it never hides data. Tables do not drop
   low-priority columns when space is short. They scroll.

Two facts about container queries affect the code:

- **A container query is answered by the nearest *ancestor* container**, so no element
  can respond to its own width. `Grid` therefore always lays out twelve tracks, and its
  *children* change their span. A page archetype declares itself a container so that the
  page's contents measure its content box (padding already subtracted). The page's own
  padding responds to the region around it.
- **Containment removes intrinsic width.** An inline-size container no longer sizes from its
  contents, so containers set `inline-size: 100%` (a `Grid` in a flex row would otherwise
  collapse to zero), and shrinkable boxes set `min-inline-size: 0`.

No lint rule checks rules 1–3. Review enforces them. Their outcome (nothing scrolls
sideways, nothing is clipped) is checked by browser tests and the phone proof lane
([below](#how-layout-claims-are-checked)).

### Where each member adapts

| Line | Kind | Member | What changes below the line |
| --- | --- | --- | --- |
| `48rem` | viewport | `AppShell` | the rail leaves the grid and becomes an off-canvas drawer (hidden from tab order when closed); the topbar gains a menu button; the collapsed rail only exists at or above the line; with `navigation="top"` the row of destinations along the top becomes the same drawer |
| `48rem` | container (measured) | `ConversationPage` | the aside leaves the split and opens in a `Drawer` from a header control |
| `48rem` | container (measured) | `MasterDetailPage` | the split becomes one pane: the list, or the selected item's detail under a way back |
| `44rem` / `28rem` | container | `Grid` | `columns` is a ceiling: N columns at ≥ 44rem, ⌈N/2⌉ from 28 to 44rem, 1 below 28rem |
| `44rem` / `28rem` | container | `Dashboard` stat row | the same rule as `Grid`, written in the archetype because the row's gap is the page-scoped `--pm-content-gutter` |
| `44rem` | container | `Dashboard` body, `DetailPage` body | two columns stack; the secondary region or aside moves under the main one, and a `DetailPage` aside with `stickyAside` stops staying in view |
| `40rem` | container | `AppShell` page layout, `ListPage`, `FormPage`, `DetailPage`, `SettingsPage`, `Dashboard`, `MasterDetailPage`, `SearchPage`, `ConversationPage` | page padding steps down one space step on each axis |
| `36rem` | container | `Table` | the table keeps its `max-content` width and its wrapper pans (`data-overflowing`) instead of crushing columns |
| `36rem` | container | `FilterBar`, `DataTable` bulk bar | control clusters stop sharing a line and each take a full row |
| `30rem` | viewport | overlays | dialogs go full screen, list-shaped overlays become bottom sheets, the toast viewport goes full width ([The phone register](#the-phone-register)) |
| `30rem` | viewport | text-entry fields | font size steps up to the text-entry floor, the md step or 16px ([The focus-zoom floor](#the-focus-zoom-floor)) |
| `26rem` | container | `Hero` | the title steps from `display-lg` to `display-md` |
| `980px` / `680px` | viewport | `AuthPage` (`layout="illustrated"`) | the illustration column narrows; below 680px the decorative, `aria-hidden` illustration is dropped and the form takes the full width |

`AuthPage`'s illustrated-layout steps are the only thresholds written in `px` rather than
`rem`.

Charts adapt by measurement rather than by breakpoint: the chart frame measures its plot
width with `ResizeObserver`, lays marks out in real pixels, and thins band labels to fit
([charts.md](charts.md#the-frame)). `Inline` wraps when asked (`wrap`). `SplitPane` keeps
its ratio and pixel floors at every width.

## The phone register

Everything in this section uses one threshold, **`30rem`** (480px at the default root
size), measured against the viewport. In CSS it is `@media (width < 30rem)`. In React it is
`usePhoneViewport()` in [`packages/react-ui/src/overlays/sheet.tsx`](../packages/react-ui/src/overlays/sheet.tsx),
a `matchMedia` subscription that reports `false` on the server and during hydration so the
first render matches the server's. In Vue, Svelte, Solid and Angular it is `MEDIA_QUERIES.phone`,
read through `useMediaQuery('phone')`, in each foundation's `src/conventions/media.ts`
(`media.svelte.ts` in Svelte), and it reports `false` where there is no window. Every member uses
this one threshold, because a second one would let two members disagree about what a phone is.

### Sheets

At phone width, an anchored popper ends up under the user's thumb, and the on-screen
keyboard halves the space it can use. List-shaped overlays therefore become **bottom
sheets**: full-width panels attached to the bottom edge, dismissed by tapping the scrim
behind them. Each overlay family has a closed `presentation` prop:

| Members | Below 30rem by default | `presentation` |
| --- | --- | --- |
| `Menu`, `ContextMenu`, `SplitButton` | bottom sheet | `'auto' \| 'popover'` — `'popover'` keeps the popper at every width |
| `Select`, `Combobox`, `MultiSelect`, `DatePicker`, `DateRangePicker` | bottom sheet | `'auto' \| 'popover'` |
| `Dialog`, `ConfirmDialog` | full screen | `'auto' \| 'sheet'` — `'sheet'` keeps the card above 30rem and becomes a bottom sheet below it, for short confirm-or-pick dialogs |
| `Popover` | stays anchored | `'auto' \| 'sheet'` — `'sheet'` becomes a **modal** bottom sheet (`role="dialog"`) below 30rem |
| `Command` | full screen | none — a palette has no compact phone form |
| `Tooltip`, `HoverCard` | unchanged | none — hover surfaces never sheet; HoverCard content is never the only path to anything |
| `Toast` (via `ToastHost`) | full-width stack above the home indicator | none — a toast is not a sheet |

There is no "always a sheet" value for list-shaped overlays, because a bottom sheet has no
benefit on a wide screen used with a pointer.

**The sheet anatomy** is shared, specified once in
[`design/components/README.md`](../design/components/README.md) ("The sheet
presentation") and implemented in
[`sheet.module.css`](../packages/recipes/src/overlays/sheet.module.css):

- The panel carries **`data-presentation="sheet"`** exactly while it is drawn as a sheet.
  CSS selects on it and tests assert it.
- Scrim `--pm-bg-scrim`; panel `--pm-bg-overlay`, full width, top border only, top corners
  `--pm-radius-surface`, as tall as its content up to two thirds of the small viewport.
- Motion is the `sheet` pattern: it rises from the bottom edge. With reduced motion it
  appears in place.
- **No drag-to-dismiss, and so no grabber handle.** A handle that cannot be dragged would
  mislead the reader. A sheet closes by its scrim, Escape, its own close controls, and
  (for menus) by selecting an item.
- **Semantics are the same in the sheet form.** A menu in a sheet is still `role="menu"`
  with roving focus, typeahead and Escape. Submenus flatten into a label followed by their
  items. In React, where a Radix primitive ties its semantics to its popper (dropdown menu,
  select), the sheet form implements them with react-aria instead. In the other web frameworks
  the member's Zag machine is the same at every width, so only the drawing changes
  ([shells.md](shells.md#the-sheet-presentation)).
- **Two focus lanes.** Every sheet locks page scroll while open. Dialog-lane sheets (the
  dialogs, menus, `Select`, the date pickers, `Popover`) trap focus. Combobox-lane sheets
  (`Combobox`, `MultiSelect`) never take focus. DOM focus stays in the field's input, the
  list follows `aria-activedescendant`, and the scrim only dismisses. While its own sheet
  is open, such a field (`data-sheeting`) is raised above the scrim so that tapping it
  still moves the caret.

This anatomy comes from `Drawer` (`side="start" | "end" | "bottom"`). Its bottom side is a
sheet with `size` caps of 50, 66 and 80% of the small viewport.

### Small-viewport units and safe areas

- **`dvh` with a `vh` fallback.** On phones `100vh` includes the browser chrome that
  collapses on scroll, so a `100vh` surface hides its bottom edge behind the address bar.
  Surfaces that size to the viewport (`AppShell`, `AuthPage`, `Dialog`, `Drawer`, the
  sheet, `Command`) write the `vh` value, then the `dvh` override inside an
  `@supports (height: 1dvh)` block. The override is in a separate block rather than a
  second declaration in the same rule, because a minifier that deduplicates properties
  would delete the fallback. (The toast viewport's
  height cap is the exception: it is written in `dvh` alone.)
- **Safe-area insets are additive.** Surfaces fixed to a screen edge add
  `env(safe-area-inset-*, 0px)` to their own edge padding: the full-screen `Dialog`,
  every sheet's list or body, the bottom `Drawer`, the toast viewport, `Command`. The inset is
  zero where there is no notch. The browser only reports non-zero insets when the host
  page's viewport meta tag includes `viewport-fit=cover`.

### The focus-zoom floor

iOS zooms the page when a focused text field's font size is under 16px. The default control
text (`--pm-text-sm-size`) is 14px, and a system may set its steps lower still. So below 30rem,
real `<input>` and `<textarea>` elements step their font size up to `--pm-text-entry-size`,
which the engine derives as the md step or 16px, whichever is larger, and their line height
to `--pm-text-entry-line-height`. Only these metrics change. The members that do this are
`Input` (and so `SearchInput`, `PasswordInput` and `ColorInput`'s hex field, which render it),
`Textarea`, `TagInput`, `Combobox`, `MultiSelect`, `NumberInput`, `OTPInput`, `Command` and
`PromptInput`. Elements that are not text entry (buttons, painted cells, spinbutton date
segments) do not trigger the zoom and do not step up.

The zoom is never prevented with `maximum-scale` or `user-scalable=no` in the viewport meta
tag, because that also disables the reader's own zoom, which harms accessibility.

### Touch targets

Every interactive element's hit area is at least `--pm-control-height-sm` in both
dimensions ([`design/components/README.md`](../design/components/README.md), "Size
system"), and `--pm-control-height-sm` is at least 24px at every density, which meets
WCAG 2.2 target size (2.5.8). Two laws enforce it: `packages/theme/src/derive.test.ts` checks every
density, and the system schema rejects a system whose overrides would break the floor
(`packages/theme/src/systems.test.ts`). Chart marks have 24px hit areas
(`HIT_TARGET_MIN`) and the `SplitPane` divider's hit area is `--pm-control-height-sm`
wide. Targets are not enlarged for coarse pointers, because the floor already holds at
every density. The SwiftUI and Compose members extend each hit area to their platform's
floor (44pt on iOS, 48dp on Android) and keep the density's control height. The
platform-floors law in [`packages/theme/src/laws.test.ts`](../packages/theme/src/laws.test.ts)
holds every pairing's token document to those floors.

### Stacking order

Four emitted tokens set the stacking order:

| Token | Value | Plane |
| --- | --- | --- |
| `--pm-z-raise` | 1 | a lift inside a member (the skip link, the shell's dock) |
| `--pm-z-shell` | 2 | shell chrome, including the drawer-mode rail |
| `--pm-z-overlay` | 100 | every portalled overlay: dialogs, sheets, menus, popovers |
| `--pm-z-toast` | 200 | announcements, above everything |

In vocabulary CSS, `z-index` may only take one of these four: the Stylelint token-values
rule rejects a raw number and any other `--pm-*` token. This is what places a sheet's
scrim above a drawer-mode rail.

### Not part of the phone register

These are not supported: viewport-keyed (fluid) typography, because the type scale belongs
to the theme, not the window; hiding table columns by priority; enlarging targets for
coarse pointers; drag-to-dismiss sheets; and disabling user zoom.

## How layout claims are checked

| Claim | Where |
| --- | --- |
| Grid's column ceiling responds to its container, not the window | [`packages/react-ui/src/layout/layout.test.tsx`](../packages/react-ui/src/layout/layout.test.tsx) |
| Shell, auth page and wide tables fit a 320px viewport without sideways scroll | [`packages/react-ui/src/archetypes/responsive.test.tsx`](../packages/react-ui/src/archetypes/responsive.test.tsx) |
| Sheet anatomy, semantics, `dvh` cap and safe-area padding | [`packages/react-ui/src/overlays/sheet.test.tsx`](../packages/react-ui/src/overlays/sheet.test.tsx) and each overlay's own test; `src/overlays/sheet.test.*` in `packages/vue-ui`, `packages/svelte-ui` and `packages/solid-ui` |
| Touch-target floor at every density | `packages/theme/src/derive.test.ts`, `packages/theme/src/systems.test.ts` |
| Every state of every member, and the sample pages, at 375px and at 1440px: no sideways scroll, no cut text or control, no crowded small target | `pnpm layout` ([`scripts/layout.mjs`](../scripts/layout.mjs)), in `pnpm gate` ([verification.md](verification.md#the-layout-scan)) |
| The whole product at phone size | the phone lane of `pnpm proof` |

**The phone lane** of `pnpm proof` ([`proof/run.mjs`](../proof/run.mjs), `PHONE_SCENES`)
renders scenes at 375×812 and saves them as `proof/shots/phone-*.png`. The scenes are
gallery pages for a control, the table members, `Hero`, `FormPage`, `ListPage`, `Dashboard`,
`AuthPage`, `ConversationPage` and `MasterDetailPage`, and screens of *Relay* (the demo product in the
workbench): two plain screens plus an open dialog, menu sheet, select sheet, date-picker
sheet and toast. Relay covers the behaviour
that depends on the shell. A page's padding step responds to `AppShell`'s content region,
and the drawer topbar belongs to the shell. A bare gallery has neither. Overlays are
captured over a real screen because a gallery renders every open fixture at once. For every
scene the lane checks three things and fails the run if any is false: the document does
not scroll sideways; no visible element crosses either edge of the window; and no scroll
region scrolls sideways unless it is a `Table` marked `data-overflowing`. `pnpm proof` is
run by hand, not by `pnpm gate`. See [verification.md](verification.md). A new member that
adapts should be added to the lane in the same change.

## Performance budgets

### Enforced

| Budget | Limit | Enforced by |
| --- | --- | --- |
| Emitted theme CSS per pairing in the eager set (each system with its own default palette) | ≤ 28,000 bytes, uncompressed | [`packages/theme/src/laws.test.ts`](../packages/theme/src/laws.test.ts), "the emitted stylesheet stays within its size budget" |
| What a consumer ships: fixture apps built against the published packages, the theme compiled at build time | a gzipped JavaScript and CSS ceiling per fixture, in [`scripts/size/budgets.json`](../scripts/size/budgets.json) | `pnpm size` ([`scripts/size.mjs`](../scripts/size.mjs)), in `pnpm gate` ([verification.md](verification.md#size-budgets)) |
| The pre-paint script that sets the theme before first paint (inline, blocks parsing) | ≤ 500 characters | [`packages/theme/src/runtime.test.ts`](../packages/theme/src/runtime.test.ts) |
| `'use client'` exactly where a module needs the browser — and nowhere else | both directions | [`packages/rules/src/client-directive.test.ts`](../packages/rules/src/client-directive.test.ts) |
| Chart scale physics stays inside the chart engine | import boundary | `polymorph/no-external-dataviz` ([charts.md](charts.md#why-charts-are-part-of-the-vocabulary)) |
| The system card — the summary of the system that agents load as context | a character budget | [`packages/registry/src/card.test.ts`](../packages/registry/src/card.test.ts) ([tooling.md](tooling.md)) |

Reasons:

- **The theme sheet is measured uncompressed**, because that is what the browser parses
  and what a consumer downloads. Gzip would make the repetitive blocks look cheaper than
  they are. The ceiling exists so that each new theme capability has to justify its bytes.
  The eager set is the main stylesheet an application's build compiles, and the one the
  workbench and docs apps install before React renders. Any other pairing is its own sheet,
  loaded or emitted when it is selected ([theming.md](theming.md)).
- **The size budgets measure the published builds** the way a consumer's Vite bundles them,
  so they catch what a source-level law cannot: a dependency that stops tree-shaking, or
  the engine ending up in a production bundle. Each fixture's ceiling is a little above
  what it ships. Raising one requires its reason in the same commit. `pnpm size --why`
  attributes the bytes to packages.
- **The client-directive law checks both directions.** A missing `'use client'` breaks a
  React Server Components consumer's build. An unnecessary one pulls a module and everything
  it imports into the client bundle. `Icon` and `Sparkline` stay server components because
  of it. The law reads code with its comments removed, and it does not treat an object key
  named `document` or `window` as the global.
- **Dependencies are scoped per member.** The registry records which packages each member
  imports, so a consumer that vendors a member installs the packages its files import and no
  others. The d3 packages are the chart engine's, in `@polymorph/engine/charts`: every consumer
  installs them with the engine, and a bundle carries them only when it imports a chart (see
  [consuming.md](consuming.md)).

### Measured, not enforced

The cost of each borrowed substrate of the React vocabulary and the chart engine (Radix,
react-aria, d3 and the rest) on its own is recorded in
[`design/components/README-substrates.md`](../design/components/README-substrates.md). Each
figure is a single esbuild-and-gzip measurement. No test re-measures them. `pnpm size` bounds
what the fixture apps ship in total, not each substrate's share.

On the web the chart tier is drawn as SVG and sized for dashboard scale, on the order of a
thousand points per series. `ScatterChart`'s nearest-point lookup is a linear scan for that
reason. For larger data, the app should aggregate in its data logic. A different renderer is
not the answer. This is a stated design target, not a tested limit.

### The development loop

The repository's own commands are tuned for repeat runs. The details are in
[verification.md](verification.md).

- `pnpm typecheck` ([`scripts/typecheck.mjs`](../scripts/typecheck.mjs)) runs every
  project's `tsc --noEmit` concurrently, each with an incremental build-info cache under
  `node_modules/.cache/tsbuildinfo/`, beside `vue-tsc` for the Vue packages, `svelte-check`
  for the Svelte packages and `ngc` for the Angular packages.
- `pnpm lint` ([`scripts/lint.mjs`](../scripts/lint.mjs)) runs ESLint, Stylelint and
  Prettier concurrently. ESLint and Prettier use their caches under `node_modules/.cache/`.
  ESLint's cache does not notice edits to a rule's implementation. After changing a rule
  in `packages/rules/src`, delete `node_modules/.cache/eslint`.
- `pnpm test` caps Vitest at half the machine's cores (`maxWorkers: '50%'` in
  [`vitest.config.ts`](../vitest.config.ts)), because more workers than that make the suite
  slower, not faster.
  The pure-logic project shares module state between files (`isolate: false`). The
  browser projects keep full isolation so pointer state cannot leak between test files.
- A fresh checkout has none of these caches, so its first run is a full one.
