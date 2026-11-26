# Button

Button is the action primitive: one visual grammar for every clickable command. Links
that look like buttons use Link's `variant="button"` (`link.md`). Navigation keeps
Link's element, and Button lends it the whole recipe.

## Anatomy

```
[root <button>]
  [leading icon?]  [label]  [trailing icon?]  [count?]
  — loading: [spinner] replaces leading icon (or precedes label if none)
  — icon-only with a count: [count] from the inline centre of the top edge toward the end
```

The root is a native `<button type="button">`. The label is required. Icon-only buttons
exist only through `iconOnly` (below) and stay square. An icon-only button shows its label as a
name tip on hover and keyboard focus, in a bubble outside the button (below).

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `variant` | `'solid' \| 'soft' \| 'outline' \| 'ghost'` | `'solid'` | |
| `tone` | `'neutral' \| 'accent' \| 'danger'` | `'accent'` | allowed grid below; `neutral` exists only for `outline`/`ghost` |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | conventions §2 |
| `icon` | `IconRole` | — | leading |
| `trailingIcon` | `IconRole` | — | a direction or a disclosure only: a role `design/icons.json` marks `trailing` (`collapse`, `down`, `expand`, `forward`, `next`, `open-external`). Any other role leads, in `icon` (`polymorph/trailing-icon`) |
| `iconOnly` | `boolean` | `false` | square (width = control height); requires `label` |
| `label` | `string` | — | **required.** Visible text, or the accessible name and the name tip when `iconOnly` |
| `loading` | `boolean` | `false` | conventions §5 |
| `disabled` | `boolean` | `false` | |
| `type` | `'button' \| 'submit'` | `'button'` | |
| `onClick` | `(e) => void` | — | detached while `loading`. A loading button that still fires on Enter causes a double submit, so the handler is removed instead of relying on it to check |
| `current` | `boolean` | `false` | `aria-current="page"`, for a Button standing where a link would; promoted by Pagination |
| `aria-labelledby` | `string` | — | external label association; promoted by SettingsRow's action slot |
| `aria-label` | `string` | — | contextual accessible-name override; visible `label` remains unchanged |
| `aria-describedby` | `string` | — | associates supporting help, cooldown, or status copy with the action |
| `pressed` | `boolean` | — | makes the button a toggle: `aria-pressed` mirrors it, and `data-state="on\|off"` exposes it to CSS. Omitted means not a toggle, and neither attribute renders *(so a toolbar toggle never writes `aria-pressed` by hand)* |
| `expanded` | `boolean` | — | makes the button a disclosure's trigger: `aria-expanded` mirrors it. Omitted means the button discloses nothing, and the attribute does not render; promoted by DataTable's row disclosure |
| `aria-controls` | `string` | — | the id of the region the button shows and hides. Set it only while the region is in the document, because an id that names nothing is a broken reference |
| `count` | `ButtonCount` | — | a count the button carries, such as the unread items behind a bell, and the name that says it (below). Above zero, a Badge draws the count and `count.label` is the accessible name. At zero, neither shows and `label` names the button |

```ts
interface ButtonCount {
  value: number // the number; past 99 it draws as "99+"; zero or less draws nothing
  label: string // the accessible name while value > 0, in the app's words: "Notifications, 3 unread"
}
```

**The count's words are the app's.** "Unread", "new" and "pending" are the app's words, and
their plural rules are the app's catalog's, so the member writes none. `count.label` is the
whole name, which says the whole number: a reader hears "128 unread" where the eye sees
"99+". The value and the name come in one object, so a count cannot be drawn without the words
that say it, and the two cannot disagree. The visible label stays `label`. On a Button with a
visible label, `count.label` begins with that label, so a person who speaks the visible text to
a voice control still names the button (WCAG 2.5.3).

The count is a Badge (`badge.md`), `solid`/`accent`, in its count form, and is hidden from
assistive technology, because the name already says it. On a Button with a visible label it
follows the label. On an icon-only Button its start edge is fixed at the button's inline centre
(`inset-inline-start: calc(100% / 2)`), against the top edge, inside the box on the block axis,
and it grows toward the inline end, which is the left in a right-to-left document. One figure
covers the glyph's top end corner and stays inside the box. A wider count reaches past the end
edge instead of across the glyph, so a capped count still reads as the glyph with a count.

**How far a capped count reaches.** A count reaches past the end edge by its width less half
the button. "99+" is the widest a count gets at the default cap: in the default pairing it is
28px wide, and reaches 12px past an `sm` button, 10px past `md` and 8px past `lg`, under
`--pm-space-4`. What is beside it must leave that room, and the count draws over whatever does
not. In AppShell's topbar the trailing slot's gap (`--pm-space-3`) and the next icon-only
Button's own inset hold it: the count covers the gap and at most the first few pixels of the
neighbour's box, never its glyph. The bar's inline padding (`--pm-space-6`) holds it at the
window's edge. The count takes no press, so a press on the neighbour under it is the
neighbour's. The layout measure (`apps/workbench/src/screen/measure.ts`) finds no fault in the
Button gallery or in AppShell's topbar fixture with two capped counts side by side, at a phone's
width and a desktop's, in either direction. It takes no press of its own. On a disabled Button it is desaturated and faded, as
AvatarButton's face is, because its fill would otherwise be the only part at full strength.

An `aria-label` the caller passes names the button over `count.label`, as it does over `label`.

No `className`/`style`/`css` (red rules). Attributes: `data-variant`, `data-tone`,
`data-size`, `data-state="loading|on|off"?`, `data-disabled?`, `data-icon-only?`.
`loading` takes precedence over the toggle in `data-state`, so a busy toggle reports
busy. `aria-pressed` still reports the toggle's value.
`expanded` sets `aria-expanded` and no `data-state`: the recipe draws no expanded cell,
and the icon the caller passes shows the state.

**No alignment prop (considered and rejected).** Button centres its content. Alignment
only matters when a container stretches a Button, and a stretched Button is always some
*other* component: a nav item, a menu row, a settings row. Those components get their
own anatomy (start alignment, current state, end slots). See `archetypes/app-shell.md` →
`AppShell.NavItem` for the nav case. Adding `align` here would make every call site
re-decide layout.

## Name tip

An icon-only Button shows its `label` in a bubble while the pointer rests on it or keyboard focus
is on it, so a sighted reader sees the name a screen reader hears. The tip is the web renderers':
each one's Button calls the engine's `nameTip` on its `<button>`. The SwiftUI and Compose members
follow their platforms' own controls and show none.

- **What it shows.** `label`, always: not `aria-label`, and not `count.label`. A Button with a
  visible label shows none, and so does a disabled one.
- **When it opens.** A mouse rests on the button for `TOOLTIP_DELAY_MS`, or enters it while
  another tip shows or within `TOOLTIP_SKIP_DELAY_MS` of one closing, when it opens at once. These
  are Tooltip's delays. Touch and pen contact do not open it. Focus opens it when the reader
  moved focus to the button with the keyboard: the last key pressed was Tab, an arrow key, Home
  or End, with no press since, the focus came with that key or within two frames of its release,
  and the button matches `:focus-visible`. So a Tab and the roving focus a member gives on an
  arrow key open it. Focus a script gives after Enter, Space or a pointer press, or some time
  after a key that moves focus, does not: a Dialog opened with Enter that puts focus on its
  icon-only close button shows no tip there, and the first Escape closes the Dialog.
- **When it closes.** The pointer leaves the button, the bubble and the gap between them; the
  button loses focus; Escape; a press anywhere; a scroll of anything that holds the button; or
  the button leaves the document, is disabled or loses `iconOnly`.
- **Escape.** While a tip shows, Escape closes the tip and nothing else, however the tip opened.
  The key reaches no other listener, so a Dialog or Menu around the button stays open and focus
  stays where it is, as when Escape closes the React Tooltip's bubble. The next Escape is the
  Dialog's.
- **WCAG 1.4.13.** Escape dismisses it without moving the pointer, the pointer may cross the gap
  onto the bubble without closing it, and it stays until one of the above closes it.
- **Inside a Tooltip.** A Button inside a Tooltip's trigger (`data-tooltip-part="trigger"`) shows
  the Tooltip and no tip. This is decided from the document when a tip would open, so it holds in
  every renderer and for the elements.
- **Heard once.** The bubble is `aria-hidden`, has no role and adds no `aria-describedby`. The
  name stays the button's own, and an `aria-describedby` the app passes is untouched.
- **How it looks.** It is the Tooltip's bubble: the recipe's `.tip` composes `bubble` from
  `overlays/tooltip.module.css`, so the inverse pair, the type, the radius, the padding, the
  shadow, the maximum width and the `--pm-space-2` gap are the Tooltip's own. It sits centred above
  the button, and below it when it would cross the window's top edge and the window has more room
  below. It stays inside the window's width, in either direction.
- **Where it is drawn.** It is a manual popover, in the top layer, so it is drawn over a Dialog,
  Drawer, Popover or Menu the button sits in, and over their scrims. It is a child of the
  document's body, where every renderer mounts its portals, so it wears the page's pairing, mode
  and density, as a Tooltip's bubble does.
- **Never in the way.** It takes no pointer events, so a press reaches what is under it. Whether
  the pointer rests on it is read from where the pointer is. Nothing is added inside or around the
  button. No element exists until a tip first opens, and the page's one bubble leaves the
  document when its tip closes.

The members that draw Button's icon-only box without the Button member show their names the same
way: SplitButton's chevron, CopyButton, AvatarButton and Pagination's arrows drawn as links.

A contract statement cannot say any of this: a hover is not a statement, and the tip adds no
attribute a statement could read. `nameTipLaw` (`packages/conformance/src/name-tip.ts`) holds it
instead, and every web renderer's tests run it with that renderer's mount adapter
(`controls/name-tip.test` in each vocabulary). It holds WCAG 1.4.13's four statements in each:
the tip is not announced twice, Escape dismisses it and leaves a Dialog around the button open,
the pointer may cross onto it, and it stays until it is dismissed or the pointer and focus
leave.

## Lawful variant × tone grid

|  | `neutral` | `accent` | `danger` |
| --- | --- | --- | --- |
| `solid` | ✗ | ✓ | ✓ |
| `soft` | ✗ | ✓ | ✓ |
| `outline` | ✓ | ✓ | ✓ |
| `ghost` | ✓ | ✓ | ✓ |

`neutral` with a filled variant is **excluded by law**, not by accident. The catalogue
has no neutral interactive fill with hover/active states, and will not get one, because
a grey filled button competes with every surface role it sits on. This system's neutral
secondary button is `outline`, and the tertiary is `ghost`. Disallowed combinations are
a type error (overload/union typing), not a runtime warning.

## Usage

Three rules about how a screen uses Button are checked, by red rules in application code and by
the validation a screen spec gets (`docs/rules.md`, the usage rules):

- **One main Button.** A `solid`/`accent` Button, which is the default, leads a dialog
  (`Dialog`, `Drawer`, `Popover`) or a section (`Card`, `Dashboard.Panel`), and each holds one.
  Another action there is `outline`/`neutral`, or `ghost`. A dialog's trigger is on the page,
  not in the dialog (`polymorph/one-main-button`).
- **A destructive Button comes last.** Within one group of Buttons placed together, a danger
  Button comes last. A destructive action in a group of its own, apart from the group that holds
  the main Button, may come first. `polymorph/danger-last` checks it. A destructive Button never
  has focus when a dialog or drawer opens (`dialog.md`), and Button takes no `autoFocus`.
- **A trailing icon points onward or opens.** `trailingIcon` takes a role marked `trailing` in
  `design/icons.json`. Every other icon leads its label, in `icon`
  (`polymorph/trailing-icon`).

Two more are guidance that nothing checks: the icon's meaning is the action's, and the label
says what happens ("Delete volume", not "OK").

## Sizes

Conventions §2 exactly. `iconOnly`: width equals the control height token, padding-x 0,
icon per the size table. Label text never wraps. Overflow is a caller bug, made visible
by ellipsis (`text-overflow: ellipsis`).

## Recipes (exact tokens)

All transitions: `background-color, border-color, color, box-shadow` over
`--pm-motion-duration-control` × `--pm-motion-easing-standard`. `box-shadow` is included
because the shared state-feedback class
(`packages/recipes/src/conventions/motion.module.css`) owns this list, and an elevation
change should animate with the colour change it accompanies. Borders, where present, are
`1px solid`. Focus ring per conventions §4 on every cell.

### variant="solid"

| State | `tone="accent"` | `tone="danger"` |
| --- | --- | --- |
| rest | `background-color --pm-accent-bg` + `background-image --pm-accent-gradient` *(the primary action uses the theme's gradient where one exists. CSS itself provides the theme-neutral fallback: a partnerless theme (no partner hue and no pinned second stop) resolves the token to a plain colour, a colour is not an image, and an invalid image layer computes to `none`, which leaves the solid fill and its colour ladder unchanged)* · text `--pm-accent-contrast` · shadow `var(--pm-shadow-control), var(--pm-shadow-inset-top)` *(the lit fill: seat + top-light, both `none` together under flat)* | bg `--pm-danger-solid` · text `--pm-danger-contrast` · same shadow |
| hover | `background-color --pm-accent-bg-hover` (longhand, so the gradient layer stays; partnerless themes get the colour step, and gradient themes get the glow as feedback) · shadow `--pm-glow-hover` *(the glow replaces the lit shadow list; accent only, because the glow shapes use the accent's colour)* | bg `--pm-danger-solid-hover` |
| active | `background-color --pm-accent-bg-active` + press | bg `--pm-danger-solid-active` + press |
| disabled | bg `--pm-bg-subtle` · text `--pm-text-disabled` · shadow none *(a seat signals "pressable", and a disabled button must not)* | same |
| loading | rest colors · spinner + `aria-busy` | same |

Focus: the ring from conventions §4 on every cell, inside the button's edge. On `solid`
the ring lies inside the fill with a gap: in the label colour (`--pm-accent-contrast`,
`--pm-danger-contrast`), which the contrast law holds on the fill at rest, hovered, pressed
and on, one width in from the edge, so the fill shows on both sides of the line. The
recipe sets `--pm-focus-mark: currentcolor` and `--pm-focus-inset: var(--pm-focus-width)`
on the solid cells' `:focus-visible` state. At the fill's edge the label colour would sit
against the page, which it is not held to. Every other variant takes the focus colour
inside the edge. No cell draws a glow on focus.

### variant="soft"

| State | `tone="accent"` | `tone="danger"` |
| --- | --- | --- |
| rest | bg `--pm-accent-subtle` · text `--pm-accent-text` | bg `--pm-danger-subtle` · text `--pm-danger-text` |
| hover | bg `--pm-accent-subtle-hover` | bg `--pm-danger-subtle-hover` |
| active | bg `--pm-accent-subtle-active` + press *(the wash uses its full ladder 3→4→5)* | bg `--pm-danger-subtle-active` + press |
| disabled | bg `--pm-bg-subtle` · text `--pm-text-disabled` | same |
| loading | rest colors · spinner + `aria-busy` | same |

### variant="outline"

| State | `tone="neutral"` | `tone="accent"` | `tone="danger"` |
| --- | --- | --- | --- |
| rest | border `--pm-border-default` · text `--pm-text-primary` · bg transparent | border `--pm-accent-bg` · text `--pm-accent-text` | border `--pm-danger-border` · text `--pm-danger-text` |
| hover | bg `--pm-bg-subtle` · border `--pm-border-strong` | bg `--pm-accent-subtle` | bg `--pm-danger-subtle` |
| active | hover colors + press | bg `--pm-accent-subtle-hover` + press *(hover enters the ladder and press goes one step deeper; neutral has no wash ladder and keeps the hover colours)* | bg `--pm-danger-subtle-hover` + press |
| disabled | border `--pm-border-subtle` · text `--pm-text-disabled` · bg transparent | same | same |
| loading | rest colors · spinner | same | same |

### variant="ghost"

| State | `tone="neutral"` | `tone="accent"` | `tone="danger"` |
| --- | --- | --- | --- |
| rest | text `--pm-text-secondary` · bg transparent | text `--pm-accent-text` | text `--pm-danger-text` |
| hover | bg `--pm-bg-subtle` · text `--pm-text-primary` | bg `--pm-accent-subtle` | bg `--pm-danger-subtle` |
| active | hover colors + press | bg `--pm-accent-subtle-hover` + press *(same ladder step as outline)* | bg `--pm-danger-subtle-hover` + press |
| disabled | text `--pm-text-disabled` · bg transparent | same | same |
| loading | rest colors · spinner | same | same |

Under a system that sets `overrides.hover.unfilled: none` (the flag `--pm-hover-unfilled`),
the `outline` and `ghost` hover cells above have no background. Their border and text changes
stay, and the active and on cells keep their wash, so a press still answers and an on toggle
still looks on (`docs/theming.md`).

### The toggle's on state

`data-state="on"` uses the variant's own `active` cell, held: pressed is the state the
active rows already draw. Hover while on keeps those colours, because the wash ladder's
last step is already in use; the cursor still responds. `off` is the variant's rest row,
distinguished only by the attributes, because a toggle at rest must still look like a
command. There are no new cells. Every allowed variant × tone already defines its
`active` row, so the on state needs nothing extra.

## States

Entries: every renderable cell of the grid at `md`, plus:

| Entry | Render | Expect |
| --- | --- | --- |
| each lawful variant/tone, rest | `<Button variant tone label="Save" />` | `data-variant`, `data-tone` |
| sizes | `sm`/`md`/`lg` solid/accent | `data-size` |
| leading icon | `icon="add"` | — |
| trailing icon | `trailingIcon="next"` | — |
| icon-only | `iconOnly icon="edit" label="Edit"` | `data-icon-only`, `aria-label="Edit"`; on hover after the delay and on keyboard focus, the name tip shows "Edit" |
| loading | `loading` | `data-state="loading"`, `aria-busy="true"` |
| disabled | `disabled` | `data-disabled`, `disabled` |
| loading+disabled | both | both |
| pressed on | `pressed` | `data-state="on"`, `aria-pressed="true"` |
| pressed off | `pressed={false}` | `data-state="off"`, `aria-pressed="false"` |
| expanded | `expanded` | `aria-expanded="true"` |
| collapsed | `expanded={false}` | `aria-expanded="false"` |
| a count | `iconOnly icon="notification"`, `count={{ value: 3, label: "Notifications, 3 unread" }}`, ghost/neutral | `aria-label="Notifications, 3 unread"`; the Badge on the corner |
| a count past its cap | the same with `value: 128` | the Badge reads "99+"; the name says 128 |
| a count of zero | the same with `value: 0` | `aria-label="Notifications"`; no Badge |
| a count beside a label | `label="Inbox"`, `count={{ value: 12, label: "Inbox, 12 unread" }}`, outline/neutral | the Badge after the label |

`requiredSelectors`: `:hover`, `:active`, `:focus-visible`, `[data-state="loading"]`,
`[data-state="on"]`, `[data-disabled]`.

## Motion

- Press: `spring-pop` press-feedback on `:active` (scale per temperament, from the
  motion values in `design/motion/motion.md`), transform only. At `none` the colour
  states carry the feedback alone.
- Colour transitions per the Recipes header.
- Spinner: `spin` (ambient) on the `loading` icon glyph.
- Name tip: it arrives with the motion conventions' `fadeIn`, opacity over
  `--pm-motion-duration-control` × `--pm-motion-easing-enter`, which is instant at `none` and
  off under reduced motion. It leaves at once. The Tooltip's `tooltip.bubble` binding is not
  played, because the motion engine and its values would reach every bundle that draws a Button.

## Icons

`loading` (spinner); any role via `icon`/`trailingIcon`. A count is a Badge, not an icon. Icons take `currentColor` from
the recipe's text colour. They are decorative (`aria-hidden`), because the label names
the action.

## A11y

Native button semantics; `aria-busy` when loading. Loading keeps the accessible name
(the spinner is decorative). A count is heard once, in `count.label`; its Badge is hidden. `iconOnly` renders visually hidden text or `aria-label`
from `label`. Its name tip is for the eye: the bubble is `aria-hidden` and describes nothing, so
the name is heard once (Name tip, above). Disabled uses the native attribute, not `aria-disabled`, because an
unavailable command is not a focus stop. The hit area meets the conventions §2 minimum
at every size.

A Button with `expanded` is a disclosure's trigger: `aria-expanded` says whether the region
it names with `aria-controls` is shown. Without `expanded` the button carries neither
meaning, so a plain command is never announced as collapsed.

```contract
role root button
name root from label
key Enter activates on root
key Space activates on root
announces busy when loading
name root from label when loading
name root from label when icon-only
attr root aria-pressed=true when pressed on
attr root aria-pressed=false when pressed off
attr root aria-expanded=true when expanded
attr root aria-expanded=false when collapsed
```

## Agent

An agent reads whether the button is disabled and whether it is loading, and presses it. A press
is the button's own click, so a submit button submits its form, and a disabled or loading button
does nothing, as it does for a person. A disabled button lists no action. A Button with
`tone="danger"` names a command a person must mean, so each press an agent asks for waits for a
person to confirm it.

A Button with `pressed` is a toggle, and one with `expanded` is a disclosure's trigger. An agent
reads each as its attribute says it: `pressed` as `aria-pressed`, whether the toggle is on, and
`expanded` as `aria-expanded`, whether the region the button controls is shown. A Button without
the prop reads that state as `null`, not `false`, so a plain command is never read as off or as
collapsed. An agent turns a toggle on or off, or shows or hides a region, by pressing the button,
as a person does, and the caller's `onClick` decides.

```agent
state disabled boolean as root data-disabled
state loading boolean as root aria-busy
state pressed boolean as root aria-pressed when pressed on
state expanded boolean as root aria-expanded when expanded
action press calls onClick
destructive when tone=danger
```
