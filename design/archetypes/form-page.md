# FormPage (archetype)

The create/edit screen: header, fields in Cards, one committing action row. Relay's
NewTicketPage (the new-ticket screen of the workbench's demo product) is built on it.

## Anatomy & API

```
[root — inside AppShell content]
  [PageHeader]
  [children — Card(s) of FormFields]
  [actions row — anchored: rule above, then Inline justify end gap 3]
```

| Prop | Type | Notes |
| --- | --- | --- |
| `title` / `description` | as PageHeader | |
| `children` | Cards / FormFields | |
| `actions` | `ReactNode` required | the committing row |
| `onSubmit` | `() => void` | wraps children in a real `<form>`. Enter submits from fields |

**Actions law:** exactly one `solid` Button: the submit, `solid/accent`, or `solid/danger`
only when the form's whole purpose is deletion. Cancel or back is `ghost`/`outline`
`neutral`. A destructive tertiary action ("Delete…") goes through ConfirmDialog and sits
leftmost, separated by the row's `justify`, so the primary stays rightmost.

**Destructive order** (`polymorph/danger-last`): within one group of Buttons placed together, a
danger Button comes last. A destructive action in a group of its own, apart from the group that
holds the main Button, may come first. The actions row draws `actions` in one `Inline`, so a
tertiary action passed beside the other Buttons is in their group, and the rule reports it.

## Pattern tokens (declared on root)

| Token | Value | (std/compact/comfortable) |
| --- | --- | --- |
| `--pm-page-padding-x` | `var(--pm-space-7)` | 32 / 28 / 36 |
| `--pm-page-padding-y` | `var(--pm-space-6)` | 24 / 20 / 28 |
| `--pm-page-max-width` | `calc(var(--pm-space-10) * 7)` | 672 / 574 / 770. A form is a reading column, and fields wider than the measure are hard to scan |
| `--pm-content-gutter` | `var(--pm-space-6)` | header → cards → actions |

Container-first responsiveness (`docs/layout.md`): in a region narrower than `40rem`
the page steps `--pm-page-padding-x` to `var(--pm-space-6)` and `--pm-page-padding-y`
to `var(--pm-space-5)`, and the root declares `container-type: inline-size`. The rule,
the mechanism and the reasoning are stated once in `list-page.md` §In a narrow region.
It matters most here. A form is already the narrowest page in the set, and a field cannot
respond to less space by rewrapping, so every bit of inset given back becomes input width.
The two-field `Grid columns={2}` rows collapse to one column on Grid's own ladder, with no
edit to this archetype.

The actions row is **anchored**: `border-top 1px solid --pm-border-subtle`,
`padding-top --pm-space-5`, then the Inline. Without the rule, form actions float under the
last card with nothing connecting them to the form. The rule connects the committing row to
the column it commits, under every theme. It lives in the archetype so no screen has to
remember it.

## Recipe

Root as SettingsPage's (with this file's values). Inside Cards, FormFields stack at
gap `--pm-space-5`; two-field rows use `Grid columns={2} gap={5}` and **both cells
carry descriptions or neither** (a description under one cell and not the other sets
the two controls at different heights).

### A flow of steps

A setup flow inside the shell (create a collection, upload a first file, read its served
address) is a FormPage for each step. A `Stepper` is the first child, above the step's Card,
and reports where the reader is. The committing row holds the step's actions: the way back is
`outline`/`neutral` and the way on is the row's one `solid`. A completed step is revisited
through the Stepper's `onStepSelect`. The archetype adds nothing for it: the page's gutter
already separates the progress from the card, and a step's fields are a form like any other. A
flow that runs before the shell exists, such as creating an account, is a step of `AuthPage`
(`auth-page.md`).

## States

Entries: header + one Card + actions; two-column row; with destructive tertiary; a real
form; a step of a flow (a Stepper above the step's Card).
`requiredSelectors`: —.

## Motion / Icons — composition's. A11y — real `<form>`; the actions row is inside
it; Enter-to-submit works from any field; errors surface per FormField (the first
invalid field receives focus on a failed submit, an archetype behaviour stated here so
every form ships it).
