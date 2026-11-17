# SettingsRow

A row for settings screens: a label and description on the left and one control on the
right, with rows grouped and separated by rules. `SettingsRow.Group`'s title is the
lawful section heading for Settings screens.

## Anatomy

```
[SettingsRow.Group]
  [title — the overline heading]
  [Card]
    [SettingsRow]*
      [text column: [label] [description?]]  [control]
```

## API

| Component | Prop | Type | Notes |
| --- | --- | --- | --- |
| `SettingsRow.Group` | `title` | `string` required | the section heading |
| | `children` | SettingsRows | |
| `SettingsRow` | `label` | `string` required | |
| | `description` | `string` | |
| | `control` | `ReactNode` required | exactly one governed control (Switch, Select, Checkbox, Button…) |

No error surface: settings apply instantly and report failure through a toast (Relay's
pattern, and the rule here). A settings screen that needs validation is a FormPage.

Attributes: none on rows beyond composition.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| group title | `text.xs` quartet + uppercase · `--pm-text-secondary` · padding-bottom `--pm-space-2`; the overline style (conventions §6). **This is the section-heading recipe**, and other surfaces may not invent their own |
| group card | Card unchanged; the rows container cancels Card's padding (`margin: calc(var(--pm-space-6) * -1)`) so the row rules reach the card's edges and the rows set their own padding. This is the group's own CSS, not a `patch`, because the exception ladder is for screens, not for a component laying out its own parts |
| row | row layout · padding `--pm-space-4` `--pm-space-6` · text column gap `--pm-space-1` · control right, vertically centered, never grows (text column takes the space) |
| row, narrow group | the row wraps: the text column grows from a basis of `calc(var(--pm-space-9) * 2)`, and a control that cannot share the line with that basis moves under the text, at the start of its own line, row-gap `--pm-space-3`. The control is at most the row's width *(a Switch stays beside its label in a 320px window; an Input or a NumberInput moves under it in a phone-width group. Without the wrap the wide control takes the row and the text column is left no width)* |
| row rule | rows separated by `1px solid --pm-border-subtle`; first/last none (the Card border is the outer boundary) |
| label | `text.sm` quartet · `--pm-text-primary` |
| description | `text.xs` · `--pm-text-secondary` · max-width `calc(var(--pm-space-10) * 5)` (measure) |

## States

Entries: group of three rows (Switch, Select, Button control), row without
description, two groups stacked (gap `--pm-space-6` between groups via page Stack).
`requiredSelectors`: —.

## Motion — none of its own. Icons — none. A11y — the control is labelled by the row:
SettingsRow assigns ids and sets `aria-labelledby` (label) and `aria-describedby`
(description) on the control it renders. This does FormField's job for the row layout.
FormField is **not** used inside, because two labelling systems on one control would
announce it twice. The group title is a real heading (`h2`/`h3` per the page outline; the
archetype states the level).
