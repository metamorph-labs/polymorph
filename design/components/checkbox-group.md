# CheckboxGroup

CheckboxGroup shows several independent choices, all visible. It mirrors RadioGroup
for multiple choice, so "pick some" and "pick one" share one grammar, and it has no
Radix substrate of its own: it is Checkboxes composed under a named group.

CheckboxGroup fills a gap in form wiring. Without it, a multi-checkbox question
("Notify the reporter about…") has no member, so screens stack bare Checkboxes with
no group name, no group error target and no fieldset/legend equivalent. FormField
can wire a single control or a radiogroup, and nothing in between. CheckboxGroup is
*not* a RadioGroup with different boxes. A radio group always resolves to one value
and moves selection with arrow keys. Here every option is an independent decision,
every box is its own tab stop, and `[]` is a valid answer, not an error state.

## Anatomy

```
[root — role="group"; Stack gap 3 (vertical) | Inline gap 5 (horizontal)]
  [item <label> row]* — [box (Checkbox)] [label text]
                        [description? — under the label, indented past the box]
```

Row hit target ≥ `--pm-control-height-sm` (conventions §2), as Checkbox.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `options` | `{ value: string; label: string; description?: string; disabled?: boolean }[]` | required | items render from data, because free-form children invite layout invention (Radio's rule). `description` is the two-line item register that Combobox defines and Select shares |
| `value` / `defaultValue` / `onChange(values)` | `string[]` | — | `onChange` reports checked values in **options order**, not click order, so the answer is stable and comparable. An empty array is a valid state, unlike Radio's no-null rule, because "none of these" is a real answer to a multi-choice question |
| `orientation` | `'vertical' \| 'horizontal'` | `'vertical'` | horizontal only for ≤3 short labels without descriptions (Radio's guidance, not enforced) |
| `invalid` / `disabled` | `boolean` | `false` | group-level; per-option `disabled` in `options` |
| `name`, `id` | native passthrough | — | `name` goes on every box and `value` on each option, which gives native multi-value serialisation |

Attributes: root `data-orientation`, `data-invalid?`, `data-disabled?`,
`data-required?` (mirrored from injected `aria-required`, as RadioGroup's root);
items carry Checkbox's own `data-state="checked|unchecked"`, `data-disabled?`.

## FormField integration (the sentence this member exists for)

The group root declares the `group` control kind, so FormField names it by
association. The field label gets an id, the root gets `aria-labelledby`, and
description, error and `aria-required` are injected onto the root. RadioGroup uses
the same path (`form-field.md`, `kind.ts`). This gives fieldset/legend semantics in
the form this system can express. A real `<legend>` must be its `<fieldset>`'s first
child, and FormField's anatomy (the label row with `labelEnd` and the required
marker) belongs to the field, not the group. So `role="group"` + `aria-labelledby`
states the same relationship without distorting the layout. The question is the
field label, the options are the answers, and the error targets the question once
instead of repeating on each box.

## Recipe (deltas from `checkbox.md` — otherwise the box, states and motion are Checkbox's verbatim)

| Part | Tokens |
| --- | --- |
| description | `text.xs` quartet · `--pm-text-muted` (the two-line item recipe, `combobox.md`) · `margin-inline-start: calc(var(--pm-icon-size-md) + var(--pm-space-3))`, so it starts where the label starts and the box column stays clear · top gap `2px` |
| description, disabled option | `--pm-text-disabled` |

Each option's `description` gets an id wired to that box's `aria-describedby`, so
per-option help is announced with its own option and never merged into the group's.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| none checked | options replies / status changes / assignments | root `role="group"`, every box `data-state="unchecked"` |
| two checked | `defaultValue={['replies', 'status']}` | two `data-state="checked"`; `onChange` order = options order |
| descriptions | each option described ("Every public reply on the ticket") | description under label, box aligned |
| horizontal | 3 short options | `data-orientation="horizontal"` |
| invalid | `invalid` | `data-invalid` on root |
| group disabled | `disabled` | every box `data-disabled` |
| one option disabled | per-option | one `data-disabled` |
| via FormField | label "Notify the reporter about" + description + `required` | root `aria-labelledby` → field label; `data-required`; marker per `form-field.md` |

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-state="checked"]`,
`[data-disabled]`, `[data-invalid]`, `[data-required]`. This is RadioGroup's set,
mirrored.

## Motion

Checkbox's motion, per box (indicator `spring-pop` in, `fade` out). Nothing moves at
group level, because a group is an arrangement, not an object.

## Icons

`confirm`, via Checkbox. Never `indeterminate` here: a group of independent choices
has no third state of its own. The select-all pattern with mixed children belongs to
Table's selection column and stays there.

## A11y

`role="group"` named by FormField's label (see the integration section above). **Tab
reaches every box, and arrow keys do nothing.** This deliberately differs from
Radio's roving focus. Arrow-moves-selection is radiogroup semantics for a single
value that is always held. Moving through independent decisions with a key that also
acts makes readers check things they never chose (WAI-APG makes the same split).
Rows are real `<label>`s. Group-level `aria-describedby`/`aria-invalid` go on the
root, and per-option descriptions on their own boxes.

```contract
role root group
key Tab moves-focus-next on box when none checked
key ArrowDown nothing on box when none checked
key Space selects on box when none checked
```

## Agent

An agent reads the checked values, the options, and whether the group is disabled or invalid,
and chooses which options are checked. An option's id is its `value`. `choose` sets the whole
selection of the enabled options, and `onChange` reports it in options order, as it reports a
person's toggle, whether or not the caller controls the value. An empty list unchecks every
enabled option, which is an answer here. A disabled option keeps what it holds, checked or not,
because a person cannot change it either, and a choice that names one is refused. A disabled
group lists no action.

```agent
state value ids
state options choices
state disabled boolean as root data-disabled
state invalid boolean as root data-invalid
action choose ids sets value calls onChange when one option disabled
```
