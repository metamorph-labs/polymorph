# FormField

Wraps one control with a label, an optional description and an error message, and wires all the
ids and ARIA. Screens never wire `aria-describedby` by hand, and validation messages appear the
same way everywhere (how validation is surfaced is a behaviour-layer decision,
`docs/concepts.md`).

## Anatomy

```
Column-labelled (Input, Select):
[root]
  [label row: [label <label>] [required marker?] ..... [labelEnd?]]
  [description?]
  [control slot — exactly one governed control]
  [error?]  — replaces description's row when present (both never show at once)

Row-labelled (Checkbox, Switch):
[root]
  [control row — the control's own label carries the field label]
  [description?]
  [error?]  — same replacement rule
```

For row-labelled fields the messages sit **below** the row. With no field-level label above, a
description placed first would have nothing to attach to until the control appears below it.
The settings-row reading order is control first, explanation below. Messages are full-width
with no indent, because aligning them under the label text would need a per-control offset.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `label` | `string` | required | |
| `labelEnd` | `ReactNode` | — | the far end of the label's row. A Link by convention, such as "Forgot your password?" beside the Password label on a login form. It is a slot rather than a `link` prop, because the field decides that the row **has** two ends, not what goes in the second. Row-labelled fields have no label row and ignore it |
| `description` | `string` | — | help text |
| `error` | `string` | — | non-empty ⇒ field is invalid |
| `errorPresentation` | `'inline' \| 'toast'` | `'inline'` | where the text of a non-empty `error` appears. `'inline'` is the behaviour below: text under the control, referenced by `aria-describedby`. `'toast'` keeps the label, the required marker and the control's invalid treatment, and reports the message through `ToastHost` instead. It renders no inline text and no `aria-describedby` pointing at a notice the user can dismiss (see A11y). `ToastFormField` is FormField with this value preset |
| `required` | `boolean` | `false` | marker + `aria-required` on control |
| `children` | one of Input, Select, Checkbox, Switch | required | see wiring |
| `id` | `string` | auto | base for derived ids |

Attributes on root: `data-invalid?`, `data-disabled?` (mirrored from the control so the
label row can dim).

**Wiring (the reason this component exists):** FormField generates `id` (control),
`id + "-description"` and `id + "-error"`. It injects into the child: `id`,
`aria-describedby` (description and/or error ids, error first), `aria-required`, and
`invalid` (when `error` is present). Checkbox/Switch: the field `label` becomes the row label,
and FormField does not render it twice. The field-level label row, which carries the required
marker, therefore never renders, so **the row-labelled control renders the marker itself**. It
mirrors the injected `aria-required` to `data-required`, and its label shows the marker per its
own spec. Sighted users must see the marker on row-labelled fields too, not only on
column-labelled ones.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| stack | column · gap `--pm-space-2` (8) |
| label row | flex · `justify-content: space-between` · `align-items: center` · gap `--pm-space-3`. Rendered **unconditionally**, so a field's spacing does not depend on whether the slot is filled. A row with one item shows it at its own width, at the start. `space-between` rather than an auto margin on the end, so the row itself places its two ends instead of relying on whichever node comes second |
| labelEnd | `text.sm` quartet · `--pm-text-secondary` · `flex: none`. It uses the label's type step rather than a caption size, because users are meant to find it. On a narrow field the label shrinks instead |
| label | `text.sm` full quartet · `--pm-text-primary` |
| required marker | ` *` appended, `--pm-danger-text`, `aria-hidden` (real signal is `aria-required`) |
| description | `text.xs` · `--pm-text-secondary` |
| error | `text.xs` · `--pm-danger-text` · leading `<Icon name="error" size="sm" />` (decorative) in a glyph seat one `text.xs` line box tall, icon centred (Alert's convention). Without the seat the icon would align to the row's top and sit above the cap height of the smaller text · icon–text gap `--pm-space-2` · row stays `align-items: flex-start` so a wrapped message keeps the icon beside its first line |
| disabled (mirrored) | label `--pm-text-disabled` · description `--pm-text-disabled` |

The error row appears with `slide-fade` (from top, distance = one `--pm-space-2`) over
`--pm-motion-duration-control` × `--pm-motion-easing-enter` and exits with `fade` at
`-control-exit`. At `none`: instant. The layout shift when an error appears is accepted,
because reserving blank space for errors would break the vertical rhythm.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| plain | label + Input | `<label for>` = input id |
| described | + description | input `aria-describedby` = description id |
| required | `required` | input `aria-required` |
| error | `error="…"` | root `data-invalid`; input `aria-invalid`; `aria-describedby` includes error id |
| error + description | both props | describedby lists error id first; description hidden |
| disabled control | disabled Input child | root `data-disabled` |
| with Select / Checkbox / Switch | one entry each | wiring correct for each child kind |
| labelEnd | `labelEnd={<Link variant="standalone" …>}` | link at the row's end, label at its start |
| labelEnd + required + error | all three | the row holds label, marker and slot; the error still sits below the control |
| required Checkbox | `required` + Checkbox child | child `data-required`, `aria-required`; marker visible in the row label |
| described Switch | `description` + Switch child | description rendered **after** the control row; `aria-describedby` intact |

`requiredSelectors`: `[data-invalid]`, `[data-disabled]`.

## Icons

`error` only.

## A11y

Applications that report validation through the toast viewport use `ToastFormField`, which retains the label, required state
and invalid control treatment while reporting the translated validation message in
`ToastHost`. It does not add inline error prose or an `aria-describedby` reference to
a toast that the user can dismiss. The generic `FormField` inline contract below
remains the default.

Error text is associated via `aria-describedby`. There is no `role="alert"` per field, because
form-level announcements belong to the screen and per-field alerts would stack unusably. The
label is a real `<label>`, except for Select, where it binds via `htmlFor` to the Radix trigger
id.

```contract
name control from label when plain
attr control aria-describedby when described
attr control aria-required=true when required
attr control aria-invalid=true when error
```

## Agent

FormField registers nothing, because a person operates the control it wraps and not the field.
The control the application passes registers itself, and FormField's wiring reaches an agent
through it: the control is named by the field's label, and an error makes its `invalid` state
true. An agent reads the field's hint and its error as the control's description: FormField
names both with the control's `aria-describedby`, and the bridge reports the text it names, in
order, as the member's `description`. So an agent that fills a field reads why the field refuses
what it holds. FormField has no element of its own that carries a name, so a handle of its own
would be listed under a name made from its text, beside the control a person uses.
