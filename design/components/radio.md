# Radio (RadioGroup)

A group of radio buttons for picking one of a few options, all visible. Use Select for more than
~5 options or for options with long labels.

It is built on Radix `@radix-ui/react-radio-group` and matches Checkbox wherever it can, so there
is one pattern to learn.

## Anatomy

```
[RadioGroup root — Stack gap 3 (vertical) | Inline gap 5 (horizontal)]
  [item <label> row]* — [circle (Radix item)] [dot indicator] [label text]
```

Row hit target ≥ `--pm-control-height-sm` (conventions §2), as Checkbox.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| RadioGroup: `options` | `{ value: string; label: string; disabled?: boolean }[]` | required | items render from data, because free-form children invite one-off layouts |
| `value` / `defaultValue` / `onChange(value)` | `string` | — | no null: a radio group has a choice or no choice yet, but can never be cleared (for that, use Select + `emptyOption`) |
| `orientation` | `'vertical' \| 'horizontal'` | `'vertical'` | horizontal only for ≤3 short labels (guidance, not enforced) |
| `invalid` / `disabled` | `boolean` | `false` | group-level; per-option `disabled` in `options` |
| `name`, `id` | native passthrough | — | FormField wires the group (column label = the question) |

Attributes: root `data-orientation`, `data-invalid?`, `data-disabled?`; items
`data-state="checked|unchecked"`, `data-disabled?`.

## Dimensions & recipe (deltas from `checkbox.md` — otherwise identical)

Circle: `--pm-icon-size-md` square, radius `--pm-radius-pill` (a radio is round in
every geometry, by the same affordance rule as Switch). Dot: `calc(var(--pm-icon-size-md) / 2)`
circle, centered.

| State | Tokens |
| --- | --- |
| unchecked rest / hover / disabled / invalid | exactly Checkbox's rows |
| checked | circle bg `--pm-bg-surface` · border `--pm-accent-bg` · dot bg `--pm-accent-bg` |
| checked hover | border + dot `--pm-accent-bg-hover` |
| checked disabled | border `--pm-border-subtle` · dot `--pm-border-subtle` |

Focus ring around the circle with a `--pm-space-1` gap, in `--pm-border-focus-solid`, checked or
not (conventions §4, the around placement), so it leaves an invalid group's danger border
uncovered. The checked style is a ring with a dot, not a filled
disc. At a glance a filled circle looks like a Checkbox; the dot shows that this is one choice of
several.

## States

Entries: unchecked, checked, horizontal, invalid, group-disabled, one-option-disabled,
via-FormField (label + description + `data-required` marker per `form-field.md`).
`requiredSelectors`: `:hover`, `:focus-visible`, `[data-state="checked"]`,
`[data-disabled]`, `[data-invalid]`, `[data-required]`.

## Motion

Dot enters with `spring-pop`, exits `fade` at `controlExit` (same binding as
Checkbox's indicator). Border colour over control × standard.

## Icons — none (the dot is CSS, not a glyph). A11y — Radix radiogroup semantics
(arrows move+select, Space selects the focused option, roving focus); Enter does nothing,
as WAI-ARIA's radio group pattern has it; rows are real
`<label>`s; FormField's group wiring sets `aria-describedby`/`aria-invalid` on the root.

```contract
role root radiogroup
key ArrowDown moves-focus-next on radio when nothing chosen yet
key ArrowUp moves-focus-previous on radio when nothing chosen yet
key ArrowDown selects on radio when nothing chosen yet
key Space selects on radio when nothing chosen yet
key Enter nothing on radio when nothing chosen yet
```

## Agent

An agent reads the chosen value, the options, and whether the group is disabled or invalid, and
chooses an option by its id. An option's id is its `value`, and the value is `null` while nothing
is chosen. A choice goes through the member's own value, so `onChange` reports it as it reports a
person's, whether or not the caller controls the value. A disabled option is refused, and a
disabled group lists no action. No action clears the choice, as a person cannot clear one either.

```agent
state value id
state options choices
state disabled boolean as root data-disabled
state invalid boolean as root data-invalid
action choose id sets value calls onChange when one option disabled
```
