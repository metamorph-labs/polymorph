# Substrates — the heavy six, and the chart physics

A *substrate* is a third-party library that a member borrows behaviour from: keyboard
semantics, ARIA wiring, collection state or positioning. The vocabulary owns everything
perceivable. Most members use Radix primitives or no substrate. Six members carry enough
behaviour that the substrate is a design decision: **Combobox/Autocomplete, Command
palette, DatePicker + Calendar, Drawer/Sheet, Slider, Accordion**. A wrong choice costs
twice. Recipes get written against the wrong DOM, and two libraries can both try to manage
focus.

This file records the substrate for each of the six and the reasons (§0–§8). It also
records a second kind of borrowed dependency: the **physics** substrate the chart engine
uses (§9). Both are in one file because they answer one question: which dependencies the
system accepts, and why. Every number here was measured, and §2 gives the method so a
reader can re-measure.

---

## 0. Criteria

1. **Borrow behavior, own every perceivable surface.** A substrate may own keyboard
   semantics, ARIA wiring, collection state and positioning. It may not own a colour, a
   length, a duration, or a class name.
2. **`data-state` attributes for CSS keying** (`design/components/README.md` §1). A
   substrate that exposes state as class names, or in its own attribute namespace, needs
   either a translation layer or a law edit. Both costs are counted below.
3. **One focus manager at a time.** Mixing substrates is allowed. Two overlay managers
   over one tree are not (§4).
4. **Cost is proportional to use.** An app that never renders a component should not pay
   for its substrate.

---

## 1. Decisions at a glance

| Component | Substrate | Marginal cost (gzip) | Dependency |
| --- | --- | --- | --- |
| **Accordion** | `@radix-ui/react-accordion` | 8.8 KB | yes |
| **Slider** | `@radix-ui/react-slider` | 9.8 KB | yes |
| **Drawer/Sheet** | **positioned `Dialog` variant** — no substrate | 0 KB | no |
| **Command palette** | **composed** — `Dialog` + the Combobox substrate | 0 KB beyond Combobox | no (`cmdk` **rejected**) |
| **Combobox/Autocomplete** | `react-aria` + `react-stately` hooks | 39.5 KB | yes |
| **DatePicker + Calendar** | same hooks + `@internationalized/date` | 36.3 KB *on top of* Combobox | yes |

Rejected: **`cmdk`** (§3.4) and **`@base-ui-components/react`** (§3.5).

---

## 2. Measured bundle cost

Method: each candidate's public entry points were bundled with esbuild
(`--bundle --minify --format=esm`, `NODE_ENV=production`, with `react`, `react-dom` and
`react/jsx-runtime` external), then compressed with `gzip -9`. React is external, so each
figure is the **marginal** cost of the substrate itself. The versions measured are the
ones pinned in §5, which were the `latest` tags when measured.

| Bundle | gzip | Note |
| --- | --- | --- |
| `@radix-ui/react-dialog` | 13.7 KB | every decision below relies on this figure; Dialog is always installed |
| `@radix-ui/react-accordion` | 8.8 KB | |
| `@radix-ui/react-slider` | 9.8 KB | |
| `cmdk` | 17.4 KB | |
| `cmdk` + `@radix-ui/react-dialog` | 17.8 KB | cmdk's real marginal cost is ≈ **4.2 KB**, because it reuses the installed Dialog |
| `@base-ui-components/react/combobox` | 48.9 KB | |
| react-aria combobox hook set | 39.5 KB | `useComboBox`, `useFilter`, `useListBox`, `useOption`, `useButton` + `useComboBoxState` |
| react-aria combobox **+** datepicker/calendar | 75.8 KB | datepicker's marginal cost ≈ **36.3 KB** |
| react-aria all three (**+** slider) | 79.3 KB | `useSlider` marginal ≈ **3.5 KB** once the other two are in |
| `@internationalized/date` alone | 5.1 KB | |

The table settles two points by itself:

- **cmdk is cheap and React Aria is not.** The command palette costs about 4 KB and the
  date picker about 36 KB. The decisions below go against the byte count in both cases,
  for reasons other than size. The bytes are stated first so that the trade-off is
  visible.
- **`useSlider` is nearly free *if* React Aria is already in the bundle.** It is not free
  for an app that renders a Slider and no Combobox, which is the common case. §3.2 decides
  on proportional cost, not on the best case.

---

## 3. Per component

### 3.1 Accordion — `@radix-ui/react-accordion` (^1.2.20)

**Decision: adopt.** This is the simplest of the six.

- It emits `data-state="open|closed"`, `data-disabled` and `data-orientation` on the
  parts. That already matches the attribute contract, so no translation layer is needed.
- It publishes `--radix-accordion-content-height` and `--radix-accordion-content-width`
  for the height animation. Both are allowed in vocabulary CSS, because the Stylelint
  value law allows `--radix-*` measured properties by name
  (`packages/rules/src/stylelint/values.js`, `MEASURED_PROPERTY`). **No law edit.**
- The motion engine already has the pattern, `collapse` (bound by `appshell.sidebar` in
  `design/motion/motion.json`). Accordion adds an `accordion.content` binding, not a new
  pattern.

**Risk.** Radix documents its height animation as a CSS keyframe against its own custom
property. This repo animates through `MotionSurface`/`MotionPresence` instead. Accordion
uses the engine's `collapse` binding, as the sidebar does. It treats the Radix custom
property as a measured input and does not hand-write a keyframe.

### 3.2 Slider — `@radix-ui/react-slider` (^1.4.7)

**Decision: adopt.** The vocabulary adds one attribute that Radix does not emit.

- It is the same substrate family as the other controls, so there is one focus model. The
  parts (`Root`, `Track`, `Range`, `Thumb`) are bare elements that this repo styles
  completely.
- It publishes `--radix-slider-thumb-transform`, which is also allowed.
- Radix Slider emits `data-orientation` and `data-disabled` but **no `data-state`**.
  Dragging is a perceivable state with its own recipe (the thumb grows, the seat deepens),
  so it needs an attribute. The vocabulary emits `data-state="dragging"` itself, from the
  pointer and keyboard interaction it already wraps (`slider.md`). This is criterion 1
  applied, not a gap in Radix. The spec names the attribute, so the recipe never relies on
  a pseudo-class that does not exist.
- **Not React Aria's `useSlider`**, despite the 3.5 KB marginal figure in §2. That figure
  assumes Combobox *and* DatePicker are already in the same bundle. An app with a Slider
  and no Combobox would pay ~79 KB for a slider. See criterion 4.

### 3.3 Drawer / Sheet — a positioned `Dialog` variant, no new substrate

**Decision: no substrate.** A modal drawer is a dialog that enters from an edge.

`Dialog` already provides what a drawer needs:

- `packages/react-ui/src/overlays/Dialog.tsx` keeps a plain **positioner** `div` separate from
  the panel, so that the motion engine owns the panel's transform. A `side` prop changes
  only the positioner and the panel recipe.
- Dialog already owns and tests every behaviour a sheet needs: focus trap, initial-focus
  policy, focus restore to the launching element, Escape, outside-press, scroll lock,
  `aria-modal`, and `role="alertdialog"` when asked.
- Cost: **zero new bytes.** `@radix-ui/react-dialog` is already installed and its 13.7 KB
  is already paid.
- Motion: Drawer has its own binding (`drawer.panel`, edge-anchored, in
  `design/motion/motion.json`). The `slide-fade` pattern is a small nudge, not an edge
  entrance, so Drawer does not reuse it.

**AppShell's drawer is a different component.** `AppShell` ships a small-viewport
navigation drawer. It is a *rail visibility toggle inside the shell* with its own focus
handling, not a modal surface. Do not generalise it into the Drawer, and do not build the
Drawer into AppShell. The two components only share a name.

**Boundaries:**

- **No gesture dismissal.** Drawer dismisses by control, scrim and Escape. Swipe would
  need a gesture model, and the motion system does not have one. A partial gesture (drag
  with no velocity model, no rubber-band, no reduced-motion handling) is worse than none.
- **A non-modal or persistent side panel is not this component.** That is a layout or
  archetype region, not a Dialog variant. A Dialog without a focus trap and without
  `aria-modal` is a different component.

### 3.4 Command palette — composed, not imported. **`cmdk` rejected.**

**Decision: build on `Dialog` + the Combobox substrate (§3.5).** A command palette is a
combobox in a dialog, not a menu: a text input, a filtered listbox, and
`aria-activedescendant`. The repo already owns both halves (§3.5), so a third substrate
would add nothing the repo cannot compose.

`cmdk` is the cheaper option: 4.2 KB marginal over the installed Dialog (§2). It is
rejected for three measured reasons:

1. **It brings its own attribute namespace.** cmdk's structural hooks are `cmdk-root`,
   `cmdk-list`, `cmdk-item`, `cmdk-group-heading`, `cmdk-input`, `cmdk-empty`,
   `cmdk-loading` and others. They are attributes, but not `data-*` and not this system's
   names. Items do carry `data-selected`, `data-disabled` and `data-value`, so the *state*
   attributes are fine. The *structure* attributes would add a second naming system to a
   vocabulary that has one.
2. **It would force a law edit.** cmdk writes `--cmdk-list-height` and styles against it.
   The Stylelint value law allows exactly one foreign custom-property namespace,
   `--radix-*`, and backs it with a written argument about measured geometry. Widening
   that allowlist is a cost this repo keeps visible on purpose.
3. **Maintenance.** When measured, `cmdk@1.1.1` was eleven months past its last publish,
   while Radix's accordion and slider and `react-aria` had all published within the same
   week. For a dependency that owns keyboard semantics, that gap is a bigger risk than the
   bytes.

**What "composed" means:** `Dialog` (modal, focus, Escape, scrim) hosts an `Input` and a
listbox. The listbox uses the same React Aria collection hooks as Combobox, and
`aria-activedescendant` keeps DOM focus in the input. Grouping, empty state and loading
state use the existing vocabulary (`EmptyState`, `Skeleton`), not new parts. The filtering
predicate is application data, not vocabulary.

### 3.5 Combobox / Autocomplete — `react-aria` + `react-stately` hooks

**Decision: adopt React Aria hooks. `@base-ui-components/react` rejected.**

There is no Radix option. `@radix-ui/react-combobox` does not exist: the registry returns
404 for it, and for `react-autocomplete`, `react-calendar` and `react-date-picker`. So the
choice is React Aria hooks or Base UI components.

**Why React Aria:**

- **Hooks return props, not DOM.** This repo writes every element, class and attribute.
  That meets criterion 1 more fully than Radix, which still supplies the elements to
  style.
- **Stable and current** (`react-aria@3.50.0` / `react-stately@3.48.0` when measured).
- **Cheaper than the alternative**: 39.5 KB against Base UI's 48.9 KB (§2).

**Why not Base UI:** when measured, the `latest` tag of `@base-ui-components/react` was
**`1.0.0-rc.0`**, and it had never had a stable release. A pre-1.0 substrate is a risk for
a component whose recipe is written against its DOM, and this file exists to avoid that
risk. The choice is cheap to revisit: swapping hooks for components touches one
component's internals and no call site.

**Packaging caveat (measured).** Do not depend on `@react-aria/combobox` expecting a small
scoped package. From 3.16.1 the scoped packages re-export the monopackage, and their
dependency is `react-aria: ^3.48.0`. The vocabulary depends on `react-aria` and
`react-stately` directly and relies on tree-shaking. The 39.5 KB in §2 **is** the
tree-shaken figure for the hook set, not the package's disk size.

### 3.6 DatePicker + Calendar — the same hooks, plus `@internationalized/date`

**Decision: adopt** `useDatePicker` / `useDateField` / `useDateSegment` / `useCalendar` /
`useCalendarGrid` / `useCalendarCell` with `@internationalized/date` (^3.12.2).

- No alternative is worth surveying. Radix ships none. Base UI is ruled out in §3.5 for
  stability, and that reason is stronger here because a date picker has the most intricate
  DOM in the catalogue.
- Dates in the vocabulary are `Intl`-based, and `@internationalized/date` is the date
  model React Aria uses. It already arrives as a transitive dependency of `react-aria`. It
  is pinned directly because the vocabulary imports it by name.
- Locale and week-start are props, and RTL is supported. Translated strings come from the
  host through each member's `messages` prop. The vocabulary has no translation
  infrastructure of its own.

**Risk: this is the most expensive decision in the file.** It adds 36.3 KB gzip on top of
Combobox, for one component. The only real alternative was not shipping DatePicker, not a
cheaper library. DatePicker ships. §8 explains why the calendar is imported directly and
not behind a lazy boundary.

---

## 4. Focus-management interplay — the one boundary that matters

Mixing Radix components with React Aria hooks is allowed, and these decisions do it. The
specific failure to avoid is **two overlay managers over one tree.**

Radix Dialog contains focus with `@radix-ui/react-focus-scope` and `react-focus-guards`,
hides the rest of the page with the `aria-hidden` package, and locks scroll with
`react-remove-scroll`. React Aria has its own equivalents (`FocusScope`,
`ariaHideOutside`, its own scroll prevention). Each refcounts correctly on its own. When
they are stacked, for example a React Aria overlay opened inside a Radix Dialog, the known
symptoms appear: focus cannot reach the inner popup, or the page stays `aria-hidden` after
the inner overlay closes.

**The boundary:**

> React Aria owns the **collection**: input semantics, filtering, selection state, and the
> listbox's roles and keys. Radix owns every **overlay**: modality, focus containment,
> dismissal and scroll lock. The vocabulary uses no React Aria overlay hook (`useOverlay`,
> `useModal`, `usePopover`).

This boundary costs nothing because of how combobox keyboard interaction works.
`useComboBox` drives its listbox with **`aria-activedescendant`** (verified in the built
bundle). DOM focus never leaves the input, so the listbox popup needs no focus scope. The
Combobox popup is positioned by the repo's Radix-based `Popover`, or rendered inline. The
Command palette's popup is inside `Dialog`. In both cases exactly one library manages
focus, and it is Radix.

**React Aria contains focus in one place**: the shared bottom sheet
(`packages/react-ui/src/overlays/sheet.tsx`, conventions §12). This follows the same rule. The
sheet renders only on lanes where no Radix overlay root is mounted (the phone forms of
Menu, ContextMenu, SplitButton, Popover and the list-shaped fields). There it takes
`FocusScope` and `usePreventScroll` from React Aria, never an overlay hook, so each tree
still has exactly one focus manager. A combobox-lane sheet takes no focus scope at all,
for the `aria-activedescendant` reason above.

Consequence: a spec may not describe a Combobox popup that traps focus. A review treats
any `useOverlay`/`useModal`/`usePopover` import in `packages/react-ui` as a defect.

---

## 5. Dependencies

Each dependency is added with the first member that imports it, so `package.json` never
lists an unused one.

| Package | Version | For |
| --- | --- | --- |
| `@radix-ui/react-accordion` | ^1.2.20 | Accordion |
| `@radix-ui/react-slider` | ^1.4.7 | Slider |
| `react-aria` | ^3.50.0 | Combobox, Command, DatePicker/Calendar, and the other React Aria–lane fields |
| `react-stately` | ^3.48.0 | the same |
| `@internationalized/date` | ^3.12.2 | DatePicker/Calendar |

**Rejected, with the reason recorded so it is not proposed again:** `cmdk` (a foreign
attribute namespace, a Stylelint allowlist edit, and a stalled release cadence; §3.4);
`@base-ui-components/react` (no stable release; §3.5).

Everything else is composed from packages that are already installed.

---

## 6. Risk register

| # | Risk | Mitigation |
| --- | --- | --- |
| 1 | React Aria is 39.5 KB before the first date is rendered, 75.8 KB after. | Stated openly. §8 weighs a lazy calendar. DatePicker ships (§3.6). |
| 2 | Two focus managers in one tree. | Prevented by design: Radix owns every overlay, the vocabulary uses no React Aria overlay hook, and the bottom sheet uses React Aria containment only where no Radix root exists (§4). |
| 3 | Radix Slider emits no `data-state`. | The vocabulary emits `data-state="dragging"` itself, and `slider.md` specifies it (§3.2). |
| 4 | Base UI becomes stable after recipes are written against React Aria's DOM. | Reversible: switching hooks to components changes one component's internals and no call site (§3.5). |
| 5 | Accordion's height animation moves to hand-written keyframes. | It uses the `collapse` binding, as `appshell.sidebar` does (§3.1). |
| 6 | "Drawer" grows into a persistent side panel. | That is not a Dialog variant. It is a layout or archetype region (§3.3). |
| 7 | This repo writes the DOM around React Aria's hooks, so it also owns any accessibility mistakes there. | The states fixture and the axe law run over every entry. These members meet the same completeness bar as the rest. |

---

## 7. Where the specs take over

This file decides substrates. The member specs decide everything a reader perceives on top
of them:

1. **Motion bindings** for the six live in `design/motion/motion.json`: `drawer.panel`
   (edge-anchored entrance), `accordion.content` (`collapse`), `combobox.popup`,
   `slider.thumb`.
2. **Slider's `data-state="dragging"` recipe**, meaning what changes while dragging, is in
   `slider.md`.
3. **Selection** on Calendar dates and Command items uses the `--pm-selection-*` family
   (conventions §11's content selection), not the hover wash. See `calendar.md` and
   `command.md`.
4. **The bottom-sheet forms** of the overlay and list-shaped members follow conventions
   §12, within the boundary in §4.

---

## 8. The lazy calendar boundary

§3.6 leaves two possible ways to reduce the DatePicker cost: put the calendar grid behind
a lazy boundary, or let an app use the date *field* without the grid. Neither is adopted.
The reason is recorded here next to the number, so the question does not need to be
re-argued on every read.

**What the 36.3 KB pays for.** The marginal cost in §2 is measured against a bundle that
already has the combobox hooks. Split by what each half needs:

- `@internationalized/date` (5.1 KB) is a dependency of the **field**, not the grid. The
  `CalendarDate`, the segment placeholders, the locale-ordered segment list and the
  ISO-8601 form value all come from it. A lazy grid defers none of it.
- `useDateField` / `useDateSegment` / `useDatePickerState` also belong to the field.
- Only `useCalendar` / `useCalendarGrid` / `useCalendarCell` and the calendar state would
  sit behind the boundary. They are a minority of the figure.

So the real saving is smaller than the headline number. It would also cost a `Suspense`
boundary inside a popup: a fallback frame in a panel that already has an entrance
animation, an `await` in every fixture and browser test that opens the grid, and one more
race for the completeness law.

**This repository also cannot measure the saving.** The vocabulary ships as source, not as
a built dist (`docs/consuming.md`). A `React.lazy` in source produces a chunk only in a
consumer's own build. The boundary would be a mitigation whose effect cannot be observed
here, and the project's laws exist to avoid that kind of change.

**The decision:**

1. **No lazy boundary.** `DatePicker` imports `Calendar` directly.
2. **The field-without-the-grid case needs no prop.** `date-picker.md` makes the segments
   the primary input and the calendar an aid, and the build follows that order: the field
   types, steps, validates and serialises without the popup ever opening. An app that
   wants only a field renders `DatePicker` and never opens it. An app that wants only a
   grid renders `Calendar`. Neither needs a flag.
3. **The number to beat**, if a measured consumer build ever argues for the boundary, is
   the calendar hooks' share, not the 36.3 KB.

The decision is easy to reverse: a lazy boundary is one import in one file, and no call
site changes. Because it is easy to reverse, it is cheaper to add it once it can be
measured than to carry it untested.

---

## 9. Chart physics — `d3-scale`, `d3-shape`, `d3-array`

The chart tier (`docs/charts.md`) draws every mark itself. This section covers the one
thing it borrows.

This is a different kind of borrowing from the six above. Those borrow *behaviour*:
keyboard semantics, ARIA wiring, collection state. This borrows **physics**: pure
functions with no DOM, no styles, no animation and no React, in the same class as
`culori`. The rule is: *rendering is owned; scale physics is borrowed.*

### 9.1 The decision

**Adopt three micro-packages, confined to one directory.**

| Package | Version | For |
| --- | --- | --- |
| `d3-scale` | ^4.0.2 | linear / band / time / sqrt scales, `nice()`, tick selection |
| `d3-shape` | ^3.2.0 | line and area path generators (monotone-x and step-after curves), stacking with its offsets (expand, diverging), arcs |
| `d3-array` | ^3.2.4 | `bin`, `extent`, `max`, `min` |

Against §0's criteria:

1. **Owns no perceivable surface.** None of the three can. They take numbers and return
   numbers or a path `d` string, with no colour, length, duration or class name. The
   criterion holds by *construction* rather than by discipline, which makes this the
   cheapest borrow in the repository.
2. **`data-state` attributes.** Not applicable, because there is no DOM to put attributes
   on. This repo writes every element, class and attribute a chart ships.
3. **One focus manager.** Not applicable. Nothing here touches focus.
4. **Cost proportional to use.** Charts are one tier, and the packages are imported only
   through the engine's chart entry (`@polymorph/engine/charts`). They are dependencies of
   the engine, so every consumer installs them, and an application's bundle carries them only
   when it imports a chart: the entry is a subpath the engine's root does not load.

### 9.2 Measured cost

The method is the same as §2: esbuild `--bundle --minify --format=esm`, then `gzip -9`.
Figures are tree-shaken, for the call set named in each row. The engine's current imports
(§9.1) differ from that set by a few functions (`bin`, `scaleSqrt`, `curveStepAfter`,
`stackOffsetDiverging`). Re-measure against `packages/engine/src/charts/` before
relying on a figure to the kilobyte.

| Bundle | gzip | raw |
| --- | --- | --- |
| all three, the engine's call set | **17.8 KB** | 50.6 KB |
| `d3-scale` alone (`scaleLinear`, `scaleBand`, `scaleUtc`) | 13.2 KB | |
| `d3-shape` alone (`line`, `area`, `curveMonotoneX`, `stack`, `stackOffsetExpand`, `arc`, `pie`) | 4.5 KB | |
| `d3-array` alone (`extent`, `max`, `min`, `sum`) | 0.3 KB | |
| **`recharts` 3.10.1**, React externalised — the rejected alternative | **161.6 KB** | |

The scale package is most of the figure. Most of that is the time scale's tick algorithm,
which is the part worth borrowing (§9.4).

### 9.3 The transitive packages, named honestly

`d3-scale` brings four dependencies of its own and `d3-shape` brings one. They are listed
because the dependency rule counts what is installed: a decision that lists three packages
and installs ten understates what it adds.

| Arrives with | Package | Called for display? |
| --- | --- | --- |
| `d3-scale` | `d3-array`, `d3-time`, `d3-interpolate`, `d3-format`, `d3-time-format` | **no** |
| `d3-interpolate` | `d3-color` | **no** |
| `d3-shape` | `d3-path` | **no** |

`d3-format` and `d3-time-format` are the two that matter, and **neither is called**. Tick
*values* come from the scale. Tick and tooltip *labels* come from `Intl`, following the
vocabulary's locale rule, carried in the chart members' `ValueFormat`. Formatting a date
through `d3-time-format` would add a second locale system to a vocabulary that already has
one. `polymorph/no-external-dataviz` would not catch it, because the import is transitive.
So the engine enforces this rule itself, in its `charts/format.ts`, which imports
nothing from `d3`.

### 9.4 Rejected, with the reason recorded

- **`recharts`**: the most widely used React chart library, and the one readers ask about.
  It owns perceivable surfaces: its own DOM tree, inline styles, default paddings and an
  internal animation system. That fails criterion 1 outright and fails
  `polymorph/no-external-motion` by construction. Its compose-your-own-chart JSX is the
  open grammar this vocabulary is closed against. The 161.6 KB in §9.2 is a consequence,
  not the reason.
- **`visx` / `victory` / `nivo`**: rejected for the same reason, to different degrees. All
  of them own DOM or styling.
- **Hand-rolling the scales.** Tick selection and time-tick boundaries (months, DST, year
  ends) need reference-quality algorithms. A home-grown tick algorithm makes a chart
  library look amateur. The engine borrows the physics and owns the decisions.
- **`d3-format` / `d3-time-format` for display**: see §9.3.
- **`d3` (the meta-package)**: it pulls in thirty modules, including `d3-selection`, which
  *is* a DOM library. The decision is cheap only because it uses the micro-packages.

### 9.5 Containment

An accepted dependency needs a boundary before it counts as a substrate. This one comes
with a red rule, in the same single-gateway shape as the icon map and the motion engine:

> **`polymorph/no-external-dataviz`** bans `d3-*`, `recharts`, `visx`, `victory`, `nivo`,
> `chart.js`, `echarts` and `plotly` everywhere except `packages/engine/src/charts/**`, the
> chart engine every framework's chart members draw with. The path is in
> `packages/rules/src/containment.ts` (`CHART_ENGINE`), next to the other two, and
> `repo-laws.test.ts` fails if it stops pointing at a directory that exists.

The rule bans re-export as well as import, for the same reason as the motion rule. Handing
the engine out through the vocabulary leaks it just as an import does, and that leak would
make the substrate impossible to swap.

**Rung 4** of the exception ladder (`docs/rules.md`), in `RULE_CLIMB`. Motion gets the
same answer, for the same reason. A screen cannot express a scale at all. Chart physics
may be hand-written only inside a declared `<Bespoke>` zone.

### 9.6 Dependencies

| Package | Version | Used by |
| --- | --- | --- |
| `d3-scale` | ^4.0.2 | `packages/engine/src/charts/scales.ts` |
| `d3-shape` | ^3.2.0 | `packages/engine/src/charts/series.ts` (stacking) and `paths.ts` (lines, areas, and DonutChart's ring arcs). `pie()`, the *layout*, is not borrowed, because segment order is declaration order. |
| `d3-array` | ^3.2.4 | `packages/engine/src/charts/scales.ts` domains |

All three are dependencies of `@polymorph/engine`. Types are `@types/d3-scale`,
`@types/d3-shape` and `@types/d3-array`, dev dependencies of `@polymorph/engine`.
