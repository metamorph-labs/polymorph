# Component design language — shared conventions

Each `<name>.md` in this directory specifies one *member* of the vocabulary, the closed
set of components every renderer ships: React, Vue, Svelte, Solid and Angular on the web,
and SwiftUI and Compose on phones. Page archetypes are specified the same way in
`design/archetypes/`, and `pnpm new:member` scaffolds a new spec. These conventions apply
to every spec, and each spec states only where it differs.
An implementer who reads a spec and this file makes **zero visual choices**. If a choice
comes up anyway, the spec is defective: stop and flag it.

Px values in specs are at **standard density** and are for orientation only. The token is
always authoritative. The emitted density variants (`compact`/`comfortable`) rescale
automatically.

## 1. Attribute contract

Components expose state only as data attributes. CSS keys off them, tests assert them, and
there is no class-name API:

| Attribute | Values | Notes |
| --- | --- | --- |
| `data-variant` | per component | e.g. Button `solid\|soft\|outline\|ghost` |
| `data-size` | `sm\|md\|lg` | only when the component has sizes |
| `data-tone` | per component | e.g. `neutral\|accent\|danger` |
| `data-state` | per component | Radix-style: `open\|closed\|checked\|unchecked\|indeterminate\|on\|off\|loading\|visible\|hidden` |
| `data-disabled` | present/absent | alongside native `disabled` where the element supports it |
| `data-invalid` | present/absent | alongside `aria-invalid` |
| `data-required` | present/absent | row-labelled controls only (Checkbox, Switch), mirrored from injected `aria-required` so the label can render the required marker (see `form-field.md`) |

The rest state is the *absence* of `data-state`. Hover, active and focus are
pseudo-classes, never attributes. They appear in a spec's `requiredSelectors`, so the
selectors law (`packages/react-ui/src/selectors.test.ts`) can assert them in each member's
stylesheet.

## 2. Size system (all controls)

Every sized control follows this one table. Heights come from `--pm-control-height-*`
(density-scoped). A control never computes its own height.

| Size | Height | Text step | Padding-x | Icon size | Icon–label gap |
| --- | --- | --- | --- | --- | --- |
| `sm` | `--pm-control-height-sm` (32) | `text.xs` | `--pm-space-4` (12) | `--pm-icon-size-sm` | `--pm-space-2` (4) |
| `md` | `--pm-control-height-md` (36) | `text.sm` | `--pm-space-5` (16) | `--pm-icon-size-md` | `--pm-space-3` (8) |
| `lg` | `--pm-control-height-lg` (40) | `text.md` | `--pm-space-6` (24) | `--pm-icon-size-lg` | `--pm-space-3` (8) |

`md` is every component's default size. Text inside controls uses the step's full quartet
(`size`/`line-height`/`weight`/`tracking` + `family: body`).

**Minimum target:** every interactive element's hit area is at least
`--pm-control-height-sm` in both dimensions. That is 28, 32 and 36px at compact, standard
and comfortable density, all at or above WCAG 2.5.8's 24px. Small visuals (Checkbox box,
Switch track) sit centred inside a label row that provides the target floor.

## 3. Radius assignment

**The map is data.** Each class below is an emitted *reference* token (the shell pattern).
The engine derives `--pm-radius-control: var(--pm-radius-md)` and so on. A system may
re-point a class through `overrides.assign.radius` (`docs/theming.md`). The recipes named
here read the class token, not the step. Reads that this table does not assign stay on
step tokens. An unassigned read is a decision this section has not made, not a bug.

| Component class | Class token | Default |
| --- | --- | --- |
| Controls — every interactive control's own box (Button, Input, Textarea, Select/Combobox/MultiSelect/picker triggers, NumberInput, TimeInput, DurationInput, MonthInput, TagInput, OTP cells, SegmentedControl track, FileUpload row, AttachmentChip, ToolCall's row) | `--pm-radius-control` | `--pm-radius-md` |
| Detail furniture — Checkbox box, Badge, Tooltip, Skeleton `text` | `--pm-radius-detail` | `--pm-radius-sm` |
| Surfaces — Card (default; its `data-radius` API stays explicit), Dialog/Drawer/Sheet panels, Select/Combobox/MultiSelect/picker content, Menu, ContextMenu, Popover, HoverCard, Command, SplitButton dropdown, Toast, PromptInput's frame, ArtifactPane, ChatMessage's bubble | `--pm-radius-surface` | `--pm-radius-lg` |
| Switch track/thumb, Skeleton `circle` | `--pm-radius-pill`; the capsule shape is part of the meaning, so it is not assigned | fixed |

Two reads sit outside the map. Skeleton `rect` reads the `--pm-radius-md` step directly
(an unassigned read). Table has no row, because `table.module.css` sets no outer radius: a
sticky header has no corners to assign.

Sharp geometry derives sm/md/lg to 0. The assignment above varies radius *between*
components, and the geometry axis varies it between themes. A system may also override the
assignment itself.

### Shadow assignment

The classes are named by *grammar*, not by step, because `control` is already the name of
a shadow step. The class names describe the physical role. Re-pointable via
`overrides.assign.shadow`.

| Class | Token | Default | Wearers |
| --- | --- | --- | --- |
| A control's contact seat | `--pm-shadow-seat` | `--pm-shadow-control` | every control's own box (plus Stepper's lit seat) |
| A resting surface's lift | `--pm-shadow-resting` | `--pm-shadow-raised` | Card (default), list-page panel, shell chrome that seats |
| A transient surface's float | `--pm-shadow-transient` | `--pm-shadow-overlay` | every floating panel: dialogs, menus, pickers' content, toast, the elevated Card variant, the drawer-mode rail |

Switch's thumb and Tooltip are outside the map on purpose. Both use `raised` instead of
their class's token: a thumb rests on its track, and a tooltip is a label, not a surface.

### Container-inset assignment

This map sets which step of the space ladder each container class uses as its inset. The
scale and the density multiplier set the step's value; the map only chooses the step.
Re-pointable via `overrides.assign.inset`. Row and control insets belong to each member's
recipe and stay outside the map.

| Class | Token | Default | Wearers |
| --- | --- | --- | --- |
| The room-sized surface | `--pm-inset-surface` | `--pm-space-6` | Card body, Dialog panel (and its sheet form) |
| The hand-sized floating pane | `--pm-inset-pane` | `--pm-space-5` | Popover (and its sheet form), HoverCard, Toast |
| The row-bearing list | `--pm-inset-list` | `--pm-space-2` | Menu, ContextMenu, Select content (and their sheet forms) |

## 4. Focus ring

Every focusable part composes one class of one shared CSS module
(`packages/recipes/src/conventions/focus.module.css`), chosen by the part's shape:

```css
.focusRing:focus-visible {
  outline: var(--pm-focus-width) solid var(--pm-focus-mark, var(--pm-border-focus-solid));
  outline-offset: calc(var(--pm-focus-offset) - var(--pm-focus-inset));
}
```

Never use `:focus`, because it fires on mouse press and teaches people to ignore the ring.
Never write per-component ring styles: a part picks its placement by composing a class or
setting the module's hooks, and the module draws the ring. Composite fields (Input) put
the class on their styled container, which shows the ring when its direct native-field
child is focused.

The ring is an outline at `--pm-focus-width`: 2px at the `soft` and `standard`
temperaments and 3px at `stark`. It is a thin line, so its colour carries it:
`--pm-border-focus-solid`, which the contrast law holds to 3:1 by the WCAG ratio on every
background and wash a part is drawn on, in both modes (`docs/theming.md`). There is no
halo: the **outline is the accessibility surface**, and forced colours keep it.

**Three placements, by the part's shape.**

| Placement | Shape | How | Parts |
| --- | --- | --- | --- |
| inside the edge | padding around the content | `focusRing`: offset `--pm-focus-offset`, which the theme derives as minus the width, so the line covers the border and the pixels inside it | fields, unfilled Buttons, rows, cards, panels, triggers with padding, and every part not listed below |
| inside a fill, with a gap | a solid fill with room for the line | `focusRing` with both hooks set on the part's own `:focus-visible` state: `--pm-focus-mark: currentcolor` and `--pm-focus-inset: var(--pm-focus-width)`. The line takes the part's label colour, which the label laws hold on the fill, and moves in by one more width, so the fill shows on both sides of it | Button's `solid` tones (and every member that composes Button), Calendar's selected day, DateRangePicker's endpoints, the current item of SectionNav, TableOfContents and AppShell's navigation |
| around, with a gap | a control too small to hold the line, or a box that is its text, with no padding | `focusAround`: offset `--pm-space-1`, or the system's own where it is larger, in the focus colour in every state | Checkbox's box, Radio's circle, Switch's track, Slider's thumb, ColorInput's thumbs, Carousel's dots; Link's `inline` and `standalone`, Tabs' trigger, Accordion's, Collapsible's and ReasoningDisclosure's triggers, Stepper's step button, Table's sort button, the chart legend's key, JsonTree's toggle, a Breadcrumbs crumb, an ErrorSummary link, a SourceList title |

Inside the edge, nothing is drawn outside the part, so a container that clips its content
(a scroll area, a pane, a table's wrapper) does not cut the ring and no member leaves room
around a part for it. A field's border reads as taking the focus colour and thickening
inward, and a button, row or card gets the line just inside its edge.

Inside a fill, the label colour is held on the fill and not on the page. At the fill's
edge the line would sit against the page, and a dark label on a dark page, or a white one
on a white page, would show nothing, so the gap keeps the fill on both sides of the line.
A recipe sets the hooks only on the focused state, never at rest, because a custom
property inherits, and the module gives every part their rest values, so no part takes
them from a part around it.

Around is the one placement that draws outside the part, and it takes two shapes that
cannot hold the line. A checkbox, a radio, a switch, a slider's thumb and a carousel dot
are too small for a 2px line and a gap inside them to sit clear of their glyph or their
thumb. A part whose box is its text, with no padding, has its first and last letters at
its edge: a line inside the box would cross them, and a line on the edge would touch
them, so the line stands `--pm-space-1` clear of the text. A part whose text reaches its
edge takes this placement even if it is not a link. The line is the focus colour in every
state, so a checked control draws focus exactly as an unchecked one does, and it leaves
the control's border, which carries the checked or invalid state, uncovered. A container
that clips such a part leaves room for the ring's reach, `--pm-space-1` plus the width,
as Tabs' list does. The list stays short: a part joins it only when it cannot hold the
line.

**A border that carries state** stays visible: an invalid field (`data-invalid`,
`aria-invalid="true"`) and a selected or range-endpoint cell draw the ring inside that
border, 1px further in, after any fill gap, so the state and the ring both show. Around
the part the ring covers no border and keeps its place.

**A row that shares its edges** (List's item, Tree's row, MasterDetailPage's list pane)
restates the ring with `outline-offset: calc(var(--pm-focus-width) * -1)`, so it stays
inside the edge even where a system moves every other ring outside.

Ring width and offset are tokens: width from contrast temperament, offset derived from the
width. A system file may re-value them: an offset of minus the width states the default,
and 0 to 4px moves the ring outside the part, with that much air (`docs/theming.md`). The
theme writes where the ring sits as the flag `--pm-focus-place`, and the shared module
branches on it. Outside the edge, neither fill hook applies, because the ring is drawn on
the surface behind the part, in the focus colour; a state border is not covered, so the
ring keeps the system's offset; and a bordered part recolours its border to
`--pm-border-focus-solid` while focused, so the edge and the ring match, except a border
that carries state and a control the ring goes around. No component tunes its own width,
offset or colour.

A system may also choose where a focused field draws the ring (`overrides.focus.field`,
the flag `--pm-focus-field`). Under `border`, a field (the composite form, a textarea, a
combobox trigger) draws it inside its edge at the system's width whatever the offset, and
an invalid field inside its danger border. It differs from the default only in a system
that moves the ring outside. The shared module branches on the flag, so no member restates
it, except the members that draw their ring by hand outside it: PromptInput's frame, whose
field is a `<textarea>` child the module's `> input` selector does not reach,
RichTextInput's frame, whose field is a contenteditable surface, and OTPInput's caret
cell, which stands in for an invisible input. Each repeats the branches that apply to it
beside its own ring.

## 5. Disabled, loading, invalid

- **Disabled:** text and icons use `--pm-text-disabled`. Fills collapse to
  `--pm-bg-subtle` and borders to `--pm-border-subtle`. Ghost and soft fills become
  transparent. The root gets `cursor: not-allowed` and has no hover or active response.
- **Disabled and focus:** a disabled control is **never** a tab stop, and takes no key and no
  press, as a platform's own disabled control does on the web, in SwiftUI and in Compose. A
  native control carries the native `disabled` attribute. A part that is not a native control (a
  role on a `div`, a contenteditable surface) carries `aria-disabled="true"` and no tab stop.
  Nothing inside a disabled member is a tab stop either: its parts are disabled with it. No member
  has a mode that keeps a disabled control focusable. The rules that follow from it:
  - In a member with one tab stop that the arrows move in (a menu, a menubar, a listbox, tabs, a
    tree, a radio group, a toolbar), the arrows pass over a disabled item, and it is never the
    tab stop.
  - A position the arrows must cross keeps its place: a day an application's
    `isDateUnavailable` refuses is `aria-disabled` and cannot be chosen, and the arrows still
    reach it, because a calendar's grid is walked by its geometry. A day outside
    `minValue`/`maxValue`, and every day of a disabled calendar, is no stop.
  - A field that takes no more input and must stay labelled and reachable is `readOnly`, not
    disabled: TagInput and MultiSelect at their `max`.
  - The reason a control is disabled is stated in text beside it (FormField's description, an
    Alert), never only in a Tooltip on it, because a disabled control takes no focus and the
    Tooltip could not be reached. Where the person must be able to reach the control to learn
    what is missing, the control stays enabled and says so when it is pressed, as a form's
    submit Button does through its fields' errors and ErrorSummary.
  - A member that disables its own control while that control holds focus moves focus to a
    stated place, because the browser would give it to the page: Pagination and
    CursorPagination to their root, Lightbox to its other direction.

  `disabledLaw` (`packages/conformance/src/disabled.ts`) holds the first paragraph in every web
  shell: in every entry of every states fixture, no tab stop says it is disabled or sits inside a
  member that does.
- **Loading:** `data-state="loading"` + `aria-busy="true"`. Pointer events are off. Layout
  width must not change: the spinner replaces the leading icon slot or joins the label.
  Spinner = `<Icon name="loading" />` bound to the `spin` pattern (§7).
- **Invalid (inputs):** `data-invalid` + `aria-invalid="true"`. The border becomes
  `--pm-danger-border`. FormField wires the message. The ring colour never changes, and
  a focused invalid field draws the ring inside the danger border (§4).

## 6. Type usage

| Context | Step |
| --- | --- |
| Control labels, table cells, toast titles and descriptions | `text.sm` |
| Metadata, badges, table headers, tooltip body, field descriptions/errors | `text.xs` |
| The section-heading recipe: the titles of Card, Dashboard.Panel and SettingsRow.Group, in the overline style below | `text.xs` |
| Body copy, lg-control labels, Heading level 4 | `text.md` |
| Heading level 3, EmptyState titles | `text.lg` |
| Heading level 2, Dialog and Drawer titles | `text.xl` |
| Page titles (PageHeader, DetailPage, AuthPage) | `text.2xl` |
| A Stat's value | `text.3xl` |
| Hero/display moments only | `display.*` |

`text.xs` to `text.md` draw in the body slot, `text.lg` to `text.3xl` in the heading slot (the body
slot in a system that states none) and `display.*` in the display slot, each through its step's
`--pm-text-<step>-family` (`docs/theming.md`, the font slots). A heading or title drawn at a body
size with a heading step's weight takes that step's family too, as Heading's level 4 does. A part
at a heading step that is not a heading or a title takes `text.md`'s family, as Hero's lede and
Avatar's `lg` initials do.

Emphasis at small sizes uses **case and tracking, never an invented weight**.
Overline-style labels (Badge, Table header) use `text.xs` + `text-transform: uppercase` +
the step's own tracking token. `font-weight` may only be `var(--pm-text-*-weight)` /
`var(--pm-display-*-weight)`, because the scale owns weight. Stylelint enforces this.

## 7. Motion bindings

Patterns a spec may bind (`design/motion/motion.md` supplies every number, and
`packages/engine/src/motion/patterns.ts` implements them):
`fade · scale-fade · slide-fade · collapse · spring-pop · shimmer · spin · sheet`, plus
the `press-feedback` micro-pattern (pure CSS, below).

- `spin` and `shimmer` are **ambient** patterns (loading affordances). Button and Input
  loading states bind `spin`. Its reduced-motion projection is a static glyph, and the
  state stays legible through `aria-busy` and the glyph.
- `sheet` is the bottom sheet's edge entrance (§12).
- Duration and easing tokens by element class: controls use `--pm-motion-duration-control`
  (+`-exit`), surfaces `-surface`, overlays `-overlay`. Enters use
  `--pm-motion-easing-enter`, exits `-exit`, and symmetric state changes `-standard`.
- CSS state feedback (hover/press tints, border changes) transitions
  `background-color, border-color, color, box-shadow` over `duration-control` ×
  `easing-standard`. `box-shadow` is in the list so that a seat change animates like a
  border change. The shared state-feedback class in
  `packages/recipes/src/conventions/motion.module.css` owns this list.
- Press feedback: the `press-feedback` micro-pattern, a transform scale to
  `--pm-motion-press-scale` that releases on the `snappy` spring. `design/motion/motion.md`
  ("Press feedback") defines the press scale per temperament. At `none` there is no scale,
  and the state stays legible by colour.
- Every enter has an exit at the exit duration and easing. `data-motion="none"` sets all
  durations to zero at the token layer, and no component may special-case it.

## 8. Iconography

Components reference icon **roles** (meanings, not glyph names) from `design/icons.json`
only, through `<Icon name>`. The role set is closed, so an invented icon name is a type
error, and remapping a glyph changes no call site. Colour is always `currentColor`. Sizes
come from §2's table. Decorative icons are `aria-hidden`; meaningful ones require `label`.
Each spec lists its glyph usage, and `design/icons.md` mirrors it.

## 9. A11y baseline

Each renderer's substrate supplies primitive semantics: React Aria and Radix in React, Zag
machines in Vue, Svelte, Solid and Angular, and the platform's own views in SwiftUI and
Compose. Specs add: visible focus per §4, target sizes per §2, `prefers-reduced-motion`
honoured through pattern projections (`design/motion/motion.md`, "Reduced-motion
projections"), and text content only through props and slots. The vocabulary invents no
`aria-label` when visible text exists. Tooltips are never the only carrier of essential
information. An icon-only control shows its name as a name tip on hover and keyboard focus
(`button.md`, Name tip), so its name is never only heard.

## 10. Fixture derivation

Each spec's **States** table is the source for the member's *states fixture*,
`<name>.states.tsx` in React. The other web frameworks' fixtures are generated from the
member's description (`docs/shells.md`). The gallery renders the fixture and the
completeness law checks it. Each table row becomes one entry (`name`, `render`, `expect`),
and the spec's `requiredSelectors` list is copied verbatim. A state that cannot be
rendered from public props (hover/active/focus) goes in `requiredSelectors` instead of
`entries`.

## 11. Selection treatment

**Selected is a distinct state, not a held hover.** If a member uses the hover wash to
show something permanent, the reader cannot tell "pointing at" from "chosen". So there are
two kinds of selection. *Content* selection (table rows, calendar dates, items picked from
a collection) uses its own `--pm-selection-*` family. That family has two fills. A selected
part that holds one label and nothing else (a day, a nav item, a command) fills with
`--pm-selection-bg` and sets `--pm-selection-text`, the one text colour the contrast law
holds on it. A selected part that holds content of its own (a table row's cells, a list
item with a trailing control, a bar of actions) fills with `--pm-selection-surface`, and
its content keeps its colours: the law holds every text role on that fill, as on a
background. The split exists because an achromatic system draws `--pm-selection-bg` as its
ink, the colour of primary text. That system has no hue to mark the selected surface with,
so the surface is a neutral wash, and a law holds it a lightness step from the hover fill
and from every surface (`docs/theming.md`). The **choice controls**, whose job
is to say "this one is chosen" (SegmentedControl's active segment, ChoiceCard's checked
card, DateRangePicker's in-range cells), all use the recipe below so that no member
improvises one:

- **Surface:** the `--pm-accent-subtle` wash. **Border:** `--pm-accent-bg`, at the
  control's existing border width. The colour changes and the width does not. There is no
  layout shift, so a selected item is not *bigger* either.
- **The second channel is structural, never colour alone:** a `confirm` glyph in
  `--pm-accent-text` where the anatomy has room (ChoiceCard), or the raised position
  itself where it does not (SegmentedControl's raised segment, which carries the whole
  signal alone; its spec explains why the accent pair sits there).
- **Hover on an *unselected* item is the ghost wash (`--pm-bg-subtle`) only.** Demoting
  hover to the ghost wash is what allows the accent wash here. Because hover is neutral,
  `--pm-accent-subtle` can only mean *chosen*, and the wash never means two things.
  **Hover on a *selected* item changes nothing**, because there is nothing to preview.
- **Focus stays the shared ring (§4)**, composed and never restyled per member.
- **Ink budget:** under `chromaBudget: 'none'` the accent family derives from the neutral
  ramp (`design/palettes/README.md`). The accent is then ink, so selection reads as an ink
  wash with an ink border, which is the quiet default's own selected look. The recipe
  degrades to the `plain` house system's register and no further.

## 12. The sheet presentation

**At phone width the popper pattern does not work well for list-shaped overlays**
(`docs/layout.md`). Below `30rem` an anchored panel lands under the thumb, the virtual
keyboard halves the viewport, and available-height maths produces a cramped scroll region
where the reader is aiming. The phone's own pattern for choosing from a list is the bottom
sheet. This section defines that surface once. It is Drawer `side="bottom"` promoted to
shared status: specified once and cited by other members, as the chart frame is, while
`drawer.md` still owns the drawn details. Each member's own `presentation` row says
whether it uses the sheet by default or by opt-in. The anatomy is this one wherever it
appears, cited and never re-derived.

**The breakpoint is `30rem`, the one line for the overlay class.** This is the viewport
exemption that overlays share with the shell, for the reason given in `dialog.md`: an
overlay is portalled and `fixed`, so there is no box between the panel and the window to
query. The viewport is the only container there is. The whole family uses one line,
because a second threshold would let two members disagree about what a phone is. It is a
rem literal because breakpoints are geometry, not theme (`docs/layout.md`).

**The attribute contract: `data-presentation="sheet"` on the panel while the sheet
presentation is active.** It reflects resolved state, not the prop value. It is present
exactly while the surface is drawn as a sheet, and absent in the member's anchored or card
form (§1's rest-is-absence rule). CSS keys the sheet anatomy off it. Fixtures and the
phone proof lane assert it. The member sets it from the same `30rem` line its geometry
already watches. Every member that uses the sheet spells it exactly this way, and no
member adds a second spelling.

**Anatomy — Drawer bottom's, promoted:**

| Part | Tokens |
| --- | --- |
| scrim | Same as Dialog's: bg `--pm-bg-scrim`, `fade` binding. It is the dismiss surface. Focus handling belongs to the member, not the scrim (below) |
| panel | attached to the bottom edge, full-width · bg `--pm-bg-overlay` · shadow `--pm-shadow-transient` (default `--pm-shadow-overlay`; flat systems still give it this shadow, because a transient surface detaches in every system) · border-block-start only, `1px solid --pm-border-subtle` · top corners `--pm-radius-surface` (default `--pm-radius-lg`), bottom corners `0` |
| height | as tall as its content, up to drawer-bottom's own `md` cap: `66vh` → `66dvh`. The `vh` base comes first, then the `dvh` override in an `@supports (height: 1dvh)` gate right after it, so engines without `dvh` keep the `vh` behaviour. The fallback is a `@supports` gate and not a pair of declarations, because a deduplicating minifier (esbuild included) deletes the pair and ships `dvh` alone. On phones `100vh` includes collapsed browser chrome, so a cap measured against it hides the sheet's last row behind the URL bar (`docs/layout.md`) |
| safe area | `padding-block-end` adds `env(safe-area-inset-bottom, 0px)` to the member's own edge padding; it is zero where there is no notch. Without it the home indicator hides the last row, and adaptation may degrade composition but never content (`docs/layout.md`) |
| motion | the `sheet` pattern (`design/motion/motion.md`, Drawer's edge entrance): `translateY(100%)` → 0, opacity 1 throughout, `overlay` class, structural distance. Reduced motion **snaps**: the panel fades in place (Drawer's projection, because a surface held off-screen by a transform cannot appear from nowhere at opacity 0). At `none`: instant |

**No drag-to-dismiss, so no grabber handle.** A handle that cannot be dragged promises
something the surface does not do. Dismissal is the scrim, Escape, the member's own close
controls, and, for menus, selection itself. Velocity-based dragging would need a gesture
dependency and its own design pass, so the sheet does not offer it.

**Semantics must survive re-anchoring, or the sheet does not ship.** A menu in a sheet is
still a menu: `role="menu"`, roving focus, typeahead, Escape. A combobox's listbox is
still driven by `aria-activedescendant` from an input that keeps DOM focus. The focus
boundary in `README-substrates.md` ("Focus-management interplay") still applies, so a
combobox-lane sheet takes no focus scope and its scrim is only a dismiss target, while
Dialog-lane sheets keep their trap. A sheet opened inside a Dialog or a Drawer is a layer above
it: focus stays in the sheet, Escape and a press on its scrim close the sheet and not the
Dialog, and while a Dialog-lane sheet is open the rest of the page, the Dialog included, is
hidden from assistive software. The sheet does not work against the popper primitives. Three things are ruled out:
`:global` overrides, `!important` against popper wrappers, and `fixed` positioning inside
a transformed ancestor (the CSS spec breaks that, not this repo). In React, where a Radix
primitive ties its semantics to its popper (dropdown-menu, select), sheet mode carries the
semantics on the **react-aria lane** instead. The `README-substrates.md` focus boundary
splits this way (react-aria for in-panel semantics, Radix for positioning), and Command
runs the composed-listbox lane. Each member's own cell says whether it changes substrate or
only restyles, based on its actual DOM. The Zag-based frameworks keep one machine at every
width and change only the drawing (`docs/shells.md`, "The sheet presentation").

## 13. The focus-zoom floor

**Text-entry surfaces use the sm step (§2's `md` row), and a system may set its sm step and
its base under 16px. iOS zooms the viewport when a focused field's font-size is under
16px**, so the page jumps on every field focus. The floor is met directly, with a token of
its own:

**Below `30rem`, text-entry elements step their `font-size` to `--pm-text-entry-size` and
their `line-height` to `--pm-text-entry-line-height`. Metrics only.** The engine derives the
size as the md step or 16px, whichever is larger, so no system can put a field under the
floor and no application needs a viewport or CSS zoom to stop one. The colour, weight and
tracking families do not change. This is only a size floor, and nothing outside the focused
element's own metrics moves.

- **Text-entry elements means real `<input>`/`<textarea>` only.** Trigger buttons, painted
  cells and ARIA spinbutton segments do not trigger the UA zoom and do not step. The
  members that apply the floor: Input, Textarea, SearchInput, PasswordInput, TagInput's
  inline input, Combobox's input, MultiSelect's input, Command's input, NumberInput's
  input, OTPInput's one real input (invisible but focused, and the UA reads its computed
  size), and PromptInput's field. Each spec has one line referencing this section and does not restate it.
- **`@media` is allowed here.** The zoom is a UA behaviour keyed to the *window*, so no
  container can detect it, and the window is the only box the UA reads. This is a
  viewport-keyed exception with its reasoning written down, to the same standard as the
  overlay exemption, at the overlay class's `30rem` line.
- **Never via the viewport meta.** `maximum-scale` / `user-scalable=no` also stops the
  zoom, but only by disabling the reader's own zoom, which harms accessibility
  (`docs/layout.md`).
