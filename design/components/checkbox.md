# Checkbox

Checkbox is a boolean (or indeterminate) choice, with behaviour from Radix
`@radix-ui/react-checkbox`. It has a single size: checkboxes do not scale with control
size classes, and density scales their row.

## Anatomy

```
[root <label> row]
  [box (Radix root)]
    [indicator: Icon "confirm" | Icon "indeterminate"]
  [label text?]  [description? — use FormField for messages; this is inline label only]
```

The whole row is the hit target (min-height `--pm-control-height-sm`, conventions §2).

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `label` | `string` | — | visible inline label; omit only inside Table selection cells, where `aria-label` is required |
| `checked` / `defaultChecked` / `onCheckedChange` | `boolean \| 'indeterminate'` | — | Radix contract |
| `disabled` | `boolean` | `false` | |
| `invalid` | `boolean` | `false` | set by FormField |
| `name`, `value`, `id` | native passthrough | — | |

Attributes on box: `data-state="checked|unchecked|indeterminate"`, `data-disabled?`,
`data-invalid?`, `data-required?` (mirrored from the `aria-required` that FormField
injects).

**Required marker:** when `data-required` is set, the row label appends the marker
through CSS generated content, `content: " *" / ""`, in `--pm-danger-text`. The empty
alternative text hides it from assistive tech, where `aria-required` already announces
it. It is the same recipe as FormField's own marker. It renders here because a
row-labelled field has no field-level label row to hold it.

## Dimensions

Box: `--pm-icon-size-md` square (16, stable across mode and density, aligned to text).
Radius `--pm-radius-sm`. Border `1px solid`. Indicator glyph: `--pm-icon-size-sm`,
centred. Gap from box to label: `--pm-space-3`. Label: `text.sm`, `--pm-text-primary`.
The box is baseline-aligned to the label's first line (top-aligned row, box offset by
`calc((var(--pm-text-sm-line-height) * var(--pm-text-sm-size) - var(--pm-icon-size-md)) / 2)`).

## Recipe (exact tokens)

Transitions: `background-color, border-color` over `--pm-motion-duration-control` ×
`--pm-motion-easing-standard`.

| State | Tokens |
| --- | --- |
| unchecked rest | bg `--pm-bg-surface` · border `--pm-border-strong` |
| unchecked hover | border `--pm-border-strong` · bg `--pm-bg-subtle` |
| checked / indeterminate rest | bg `--pm-accent-bg` · border `--pm-accent-bg` · glyph `--pm-accent-contrast` |
| checked hover | bg `--pm-accent-bg-hover` · border `--pm-accent-bg-hover` |
| invalid (any) | border `--pm-danger-border` |
| disabled unchecked | bg `--pm-bg-subtle` · border `--pm-border-subtle` |
| disabled checked | bg `--pm-border-subtle` · border `--pm-border-subtle` · glyph `--pm-text-disabled` |
| disabled label | `--pm-text-disabled` |
| focus | ring on the **box** per conventions §4 |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| unchecked | `<Checkbox label="…" />` | `data-state="unchecked"` |
| checked | `defaultChecked` | `data-state="checked"` |
| indeterminate | `checked="indeterminate"` | `data-state="indeterminate"` |
| invalid | `invalid` | `data-invalid` |
| required | via FormField `required` | `data-required`, marker visible |
| disabled | `disabled` | `data-disabled` |
| disabled checked | both | both |
| no label (table cell) | `aria-label="Select row"` | `aria-label` present |

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-state="checked"]`,
`[data-state="indeterminate"]`, `[data-disabled]`, `[data-invalid]`,
`[data-required]`.

## Motion

Indicator glyph enters with `spring-pop` (scale from ~0.5, spring `snappy`) and exits
with `fade` at `--pm-motion-duration-control-exit`. The checked-state colour changes
over the control duration. At `none`: the glyph appears and disappears instantly.

## Icons

`confirm` (checked), `indeterminate`. Decorative, because `aria-checked` carries the
state.

## A11y

Radix checkbox semantics (`role="checkbox"`, `aria-checked`, Space toggles). The label
is a real `<label>` associated with the control, so a click anywhere in the row toggles
it. `invalid` is mirrored to `aria-invalid`. Indeterminate is set only programmatically;
tri-state cycling is not offered.

```contract
role box checkbox
name box from label when unchecked
key Space selects on box when unchecked
attr box aria-invalid=true when invalid
```

## Agent

An agent reads whether the box is checked and sets it. Indeterminate is read as `mixed` and is
not set by an agent, as a person cannot set it either.

```agent
state checked tristate as box aria-checked
state disabled boolean
action check sets checked calls onCheckedChange
action uncheck sets checked calls onCheckedChange
```
