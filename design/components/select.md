# Select

A control for choosing one value from a closed list. For several values use MultiSelect
(`multi-select.md`); for typed filtering use Combobox (`combobox.md`).

Radix `@radix-ui/react-select` supplies the behaviour, and the vocabulary owns everything
visible.

## Anatomy

```
[trigger]   — Input-grammar container: [value | placeholder] [chevron: Icon "expand"]
[content]   — overlay panel: [viewport [item*]]
[item]      — [selected check: Icon "confirm"] [item label]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `options` | `(SelectOption \| { label: string; options: SelectOption[] })[]` | required | flat, grouped, or mixed; group labels use Menu's label recipe. `emptyOption`, when given, stays first and belongs to no group, because "All" covers every group |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | trigger follows conventions §2 |
| `placeholder` | `string` | — | shown in `--pm-text-muted`; mutually exclusive with `emptyOption`. When both are given, `emptyOption` wins and a dev warning fires (see below) |
| `emptyOption` | `string` | — | renders a selectable empty choice as the **first** item, labelled with this string (see "The empty choice") |
| `invalid` / `disabled` | `boolean` | `false` | |
| `value` / `defaultValue` / `onChange(value)` | `string \| null` | — | `null` is nothing chosen: the trigger shows the placeholder, or the empty choice when `emptyOption` is set. An application clears a choice with `null` (see "The value") |
| `name`, `id` | native passthrough | — | for forms/FormField |
| `presentation` | `'auto' \| 'popover'` | `'auto'` | `'auto'` shows the content panel as a sheet below `30rem` (see below; conventions §12). `'popover'` keeps the popper at every width, for pointer-first embeds that need precision. There is no always-`'sheet'` value: a bottom sheet is wrong on a wide pointer screen, and the closed union rules it out (`docs/layout.md`) |

```ts
interface SelectOption {
  value: string
  label: string
  description?: string // the two-line option — Combobox's cell, verbatim
  disabled?: boolean
}
```

Trigger attributes: `data-size`, `data-invalid?`, `data-disabled?`,
`data-state="open|closed"` (Radix), `data-placeholder?`. Items: `data-state`
(`checked|unchecked`), `data-highlighted`, `data-disabled`. Content panel:
`data-presentation="sheet"` while drawn as a sheet (conventions §12's contract).

## The value

One option is chosen, or none. `value` makes the choice the application's: the trigger, the list
and the hidden field show what the application holds, and a pick is reported through `onChange`
and shown only once the application passes it back. Without `value`, the member holds the
choice, starting from `defaultValue`.

`null` is nothing chosen, as it is for Combobox, TreeSelect, DatePicker, NumberInput and
Rating. Without `emptyOption` the trigger then shows the placeholder,
with `data-placeholder`, in the anchored list and in the sheet; with it, the empty choice. An
application clears a choice by setting `null`, as a form does when it resets after a save, and
holds an unchosen Select's value as `string | null`.

`undefined` is not a value. React reads a `value` of `undefined` as no `value` at all, so a
caller that held a value and then passes `undefined` hands the choice back to the member, which
shows its own last pick. The React member warns in development when that happens, and names
`null`. `''` is not a value either: Radix reserves it for nothing selected, so no option may
have it, and nothing chosen is `null`.

## The empty choice

Radix reserves `value=""` for "nothing selected, show the placeholder". A selectable "All
statuses / Anyone / Any" option cannot be expressed on the primitive alone, so every
filter screen would invent its own sentinel string. To keep that decision out of call
sites, the empty choice is built in:

- `emptyOption="All statuses"` always renders it as the **first** item, and screens may
  not reorder it. It behaves like any other item (highlight, check when selected).
- Selecting it calls `onChange(null)`. The public representation is `null`, not a string,
  so apps cannot introduce a sentinel. Internally `null` maps to a private non-empty Radix
  value that **never leaks** through props, DOM data attributes or form serialization
  (`name` submits the empty string).
- With the empty choice selected, the trigger shows the `emptyOption` label styled as a
  **real value** (`--pm-text-primary`, no `data-placeholder`), because "All" is a choice,
  not an absence. This is the difference between `emptyOption` and `placeholder`. A filter
  defaults to `null` and never shows placeholder styling. A form field without
  `emptyOption` shows the muted placeholder until a choice is made.
- FormField: with `required` and `emptyOption`, `null` fails validation. The empty choice
  can be offered and still be rejected on submit.

## Recipes (exact tokens)

**Trigger**: Input's recipe (`input.md`) in every state, plus: value text
`--pm-text-primary`, placeholder `--pm-text-muted`, chevron `--pm-text-muted`. The chevron
rotates 180° while open, a transform over `--pm-motion-duration-control` ×
`--pm-motion-easing-standard`, with no rotation at `none`. The open state keeps the hover
colours (`border --pm-border-strong`). Input's seat row applies too: `--pm-shadow-control`
on the trigger, `none` when disabled.

**Content panel:**

Positioning: `position="popper"`, side `bottom`, align `start`, `sideOffset: 2`.
`sideOffset` is a Radix number prop and an engine-side constant, like the motion distances
in `design/motion/motion.md`. It is not a density-scaled token because it is a hairline
gap, not spacing rhythm.
Popper mode is required. The anchored scale-fade origin reads Radix's side/align data,
which only popper mode emits. The 2px gap stops the panel border and the trigger border
from merging into a double-thickness seam. Item-aligned mode is never used.

| Part | Tokens |
| --- | --- |
| panel | bg `--pm-bg-overlay` · border `1px solid --pm-border-subtle` · radius `--pm-radius-lg` · shadow `--pm-shadow-overlay` · padding `--pm-space-2` · min-width: trigger width (Radix var) |
| item | height `--pm-control-height-sm` · padding-x `--pm-space-3` · radius `--pm-radius-sm` · text step per trigger size (§2) · text `--pm-text-primary` · check column width `--pm-icon-size-sm` + gap `--pm-space-2` |
| item highlighted | bg `--pm-accent-subtle` · text `--pm-accent-text` |
| item selected | check icon `confirm` visible, `--pm-accent-text`; label stays `--pm-text-primary` |
| item disabled | text and check `--pm-text-disabled` · no highlight |
| item description | Combobox's two-line cell verbatim (`combobox.md`): `text.xs` `--pm-text-muted` under the label; two-line items grow to fit, check column unchanged |
| group label | Menu's label-entry recipe verbatim (`menu.md`): `text.xs` uppercase quartet · `--pm-text-muted` · padding `--pm-space-2` `--pm-space-3` *(every anchored list uses the same label recipe)* |

## The sheet, below `30rem`

Under `presentation="auto"` the content panel becomes conventions §12's sheet: attached to
the bottom, full width, with safe-area padding, the `sheet` motion binding, and
`data-presentation="sheet"` on the panel. The popper rows (`sideOffset`, min-width of the
trigger) stop applying, and §12's `dvh` cap replaces the available-height max-height. The
trigger, the `options` shape, the empty choice and every item recipe above stay the same
inside the sheet.

**The lane:** Radix select ties its listbox semantics to its popper, so sheet mode renders
the listbox with react-aria instead (§12; the focus-management boundary,
`README-substrates.md` §4). Command already uses this composed-listbox approach in
production. Typeahead, arrows, `aria-selected`, the value contract and `onChange(null)`
for the empty choice must all keep working in the sheet, or the sheet does not ship.
Dismissal: scrim, Escape, and selection itself (§12's list; picking a single value closes
the sheet, as in the popper form).

## States

| Entry | Render | Expect |
| --- | --- | --- |
| closed rest | options + placeholder | trigger `data-state="closed"` |
| with value | `defaultValue` | — |
| nothing chosen | `value={null}` + placeholder | trigger `data-placeholder`, the placeholder shown |
| sizes | sm/lg | `data-size` |
| open | `defaultOpen` | trigger `data-state="open"`; panel present |
| open with selection | `defaultOpen defaultValue` | selected item `data-state="checked"` |
| empty choice, selected | `emptyOption="All statuses"` (value `null`) | trigger shows label as value, no `data-placeholder` |
| empty choice, open | `emptyOption` + `defaultOpen` | empty item first, `data-state="checked"` |
| disabled option | one option disabled, open | item `data-disabled` |
| grouped, open | two groups + `defaultOpen` | group labels present, options selectable |
| descriptions, open | options with `description` + `defaultOpen` | two-line items |
| invalid | `invalid` | `data-invalid` |
| disabled | `disabled` | `data-disabled` |

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-state="open"]`,
`[data-highlighted]`, `[data-state="checked"]`, `[data-invalid]`, `[data-disabled]`.

## Motion

Panel: `scale-fade`, **origin-aware** from the trigger side (Radix side/align data → the
transform-origin helper, `transformOriginFor`). Enter `--pm-motion-duration-surface` ×
`--pm-motion-easing-enter`, exit `-surface-exit` × `-exit`. It uses the `surface` class,
not `overlay`, because a dropdown is a transient anchored surface, not a modal. 260ms
after a click feels like lag. `overlay` belongs to Dialog (`design/motion/motion.md` §1).
Chevron rotation is described under Trigger. At `none`: instant mount and unmount, static
chevron.

## Icons

`expand` (trigger, decorative), `confirm` (selected item, decorative; the state announces
the selection).

## A11y

Radix defaults (listbox pattern, typeahead, arrow/home/end, Escape, focus return).
Additions: the trigger takes part in FormField wiring (`id`/`aria-describedby`/
`aria-invalid`). The list takes the field's own name, in the popper and in the sheet: the
trigger's `aria-labelledby`, else its `aria-label`, else the labels that name the trigger.
FormField's label names the trigger by `for`, which names the trigger alone, so the list refers
to that label by id, as it does to any label of the trigger, and gives a label with no id one
when the list opens. The label's required mark, hidden from assistive software, is left out of
the name, and a label whose words change is heard with its new words. The panel's max-height is the Radix available-height variable, so
keyboard scrolling never traps. Item text never truncates silently; the panel grows to the
longest label, up to the viewport. Groups are Radix `Group`/`Label`, so a screen reader
names each group's options by its label, and the visible label is the one announced.

```contract
role trigger combobox
role panel listbox when open
key Enter opens
focus on-open option
key ArrowDown moves-focus-next on option when open
key ArrowUp moves-focus-previous on option when open
key Home moves-focus-first on option when open
key End moves-focus-last on option when open
key Enter commits on option when open
key Escape closes when open
focus on-close trigger
attr trigger aria-invalid=true when invalid
attr trigger data-placeholder when nothing chosen
```

The contract reads a fresh mount. What the trigger, the list and the hidden field show after the
application changes the value it holds, `null` after a value in both forms included, is
`selectValueLaw` (`@polymorph/conformance/select-value`), which every web shell's Select test
calls.

## Agent

An agent reads the chosen value, the options, whether the list is open and whether the field is
disabled. It chooses an option by its id without opening the list, and the member reports the
choice through `onChange` as it reports a person's, whether or not the caller controls the value.
It also opens and closes the list. A disabled option is refused, and a disabled field lists no
action. Each option's id is its `value`. The empty choice's id is the empty string, which
`onChange` reports as `null`, and the value reads `null` only while nothing is chosen and no empty
choice is offered.

```agent
state value id
state options choices
state open boolean as panel present
state disabled boolean as trigger data-disabled
action choose id sets value calls onChange when open with a disabled option
action open sets open
action close sets open
```
