# ChoiceCard

ChoiceCard is a choice the reader can weigh before making it: radio or checkbox
semantics on a card with room for an icon, a label and a line of copy that sells the
option. Substrates: `@radix-ui/react-radio-group` (`mode="single"`) and
`@radix-ui/react-checkbox` (`mode="multiple"`).

How it differs from its nearest neighbours:

- **Not Card.** `card.md` says this itself: selection cards are ChoiceCard's, because
  choosing is not navigating. ChoiceCard borrows Card's *geometry* (border, radius,
  padding) and deliberately not its elevation. A choice sits in the page and is not
  raised above it. Its hover is §11's ghost wash, never Card's lift, because elevation
  on hover is the navigation grammar and would suggest a destination.
- **Not RadioGroup / CheckboxGroup.** Same semantics, bigger canvas. When the answers
  need describing (plan tiers, channel options) and the layout is a grid, use this
  member. A plain question with short answers stays a list.
- **Not a button grid.** A ChoiceCard holds state and performs no action.

## Anatomy

```
[root — radiogroup | group; the option grid]
  [option — Card-register surface; the WHOLE area is one <label>]*
    [control — radio | checkbox, visually hidden but real]
    [icon?]
    [label]
    [description?]
    [confirm glyph — checked only, top-right]
```

## API

One component with two prop shapes, discriminated on `mode`: a union, not two members
and not a loose `string | string[]` everywhere. The canvas, recipe and grid are
identical in both modes; only the kind of choosing differs. Disallowed pairings
(`mode: 'single'` returning `string[]`) must not type-check, following Card's
`href`/`label` pairing and Button's disallowed-grid precedent. `mode` is required, not
defaulted, because the call site must state which kind of choice it offers the reader,
and a default would hide that.

```ts
type ChoiceCardProps = {
  options: ChoiceCardOption[]
  label: string // the group's accessible name
  columns?: 1 | 2 | 3 // default 1 — a ceiling, not a promise (grid.md's law)
  disabled?: boolean
} & (
  | { mode: 'single'; value?: string; defaultValue?: string; onChange?: (value: string) => void }
  | {
      mode: 'multiple'
      value?: string[]
      defaultValue?: string[]
      onChange?: (values: string[]) => void
    }
)

interface ChoiceCardOption {
  value: string
  label: string
  description?: string
  icon?: IconRole
  disabled?: boolean
}
```

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `mode` | `'single' \| 'multiple'` | required | the discriminant: radio substrate vs checkbox substrate |
| `options` | `ChoiceCardOption[]` | required | items render from data (Radio's rule); `description` is the two-line register that Combobox defines |
| `value` / `defaultValue` / `onChange` | `string` shapes at `'single'`, `string[]` at `'multiple'` | — | single mirrors RadioGroup: it may render with nothing chosen, and cannot be cleared once chosen. Multiple mirrors CheckboxGroup: `[]` is an answer, and `onChange` reports checked values in **options order** |
| `columns` | `1 \| 2 \| 3` | `1` | the card grid, container-first. The count is a ceiling that the container resolves on Grid's own ladder (N ≥ `44rem`, `ceil(N/2)` in the middle band, 1 below; `grid.md`) |
| `label` | `string` | required | the group's accessible name (`aria-label` on the root) |
| `disabled` | `boolean` | `false` | group-level; per-option `disabled` in `options` |

Attributes: root `data-disabled?`, `data-columns` *(Grid's published mechanism,
exposed by composing Grid's ladder instead of restating it; the spec names what the
root carries)*; options `data-state="checked|unchecked"`, `data-disabled?`.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| option grid | gap `--pm-space-4` · columns per the API's ceiling, on Grid's responsive rule |
| option card | bg `--pm-bg-surface` · border `1px solid --pm-border-subtle` · radius `--pm-radius-lg` · padding `--pm-space-6` (Card's surface geometry; no shadow, see "Not Card") · `cursor: pointer` |
| icon | `--pm-icon-size-md` · `--pm-text-secondary` · top, gap `--pm-space-3` to label · decorative |
| label | `text.sm` quartet · `--pm-text-primary` |
| description | `text.xs` quartet · `--pm-text-muted` · top gap `2px` (the two-line item register from `combobox.md`, as CheckboxGroup uses it) |
| hover (unchecked) | bg `--pm-bg-subtle`, §11's ghost wash, and nothing else: border and elevation do not change |
| **checked** | conventions §11's selection treatment for this anatomy: the accent wash on the surface, the border *colour* changed to the accent at the same `1px` (the colour changes, the width never does), and the `confirm` glyph in `--pm-accent-text` at the top right (`--pm-icon-size-md`, inset `--pm-space-4` from the top and right edges). Label, description and icon colours do not change, because §11's channels are the whole change |
| checked hover | nothing changes (§11) |
| glyph lane | the copy column reserves `padding-inline-end: calc(var(--pm-icon-size-md) + var(--pm-space-2))` in **both** states. The glyph appears in space that was always reserved, so nothing shifts and no first line runs under it |
| disabled option | text and icon `--pm-text-disabled` · bg `--pm-bg-subtle` · border `--pm-border-subtle` (§5's collapse) · `cursor: not-allowed` · no hover |
| checked + disabled | the collapse above, with the glyph kept in `--pm-text-disabled`, so the state stays legible while the emphasis drops |
| focus | the shared focus ring (conventions §4) drawn **on the card** via `:has(:focus-visible)`. The hidden control takes focus, but the card is what the eye tracks (this mirrors `card.md`'s interactive contract) |

**Selection is never colour alone: the glyph carries it.** A monochrome reader, or any
reader on a palette where the wash is close to the paper, sees the check where a tint
may disappear. The wash and border agree with the glyph and do not replace it.

The control element is visually hidden but **real**: a true form control that the card
wraps as its `<label>`, never a painted `div` with `aria-checked` set by hand. State,
keyboard and serialisation stay with the substrate.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| single 3-up | plan tiers Starter "For side projects and solo queues" · Team "Shared inboxes for up to 20 agents" · Scale "SSO, audit log, unlimited agents", `columns={3}`, `defaultValue="team"` | root radiogroup semantics, one `data-state="checked"`, glyph on it |
| multiple 2 selected | notification channels, `defaultValue={['email', 'inapp']}` | two `data-state="checked"` |
| descriptions + icons | Email `inbox` "Every public reply, in your inbox" · In-app `notification` "Badges in the sidebar as it happens" · Chat `comment` "Mirror threads to your chat tool" · Webhook `link` "POST every event to your endpoint" | icon top, two-line copy |
| disabled option | Webhook disabled ("available on Scale") | `data-disabled` on the card |
| disabled | `disabled`, single | `data-disabled` on the root and every card |
| 2-column | `columns={2}` | the ceiling, container-resolved |

`requiredSelectors`: `:hover`, `:has(:focus-visible)`, `[data-state="checked"]`,
`[data-disabled]`.

## Motion

The glyph enters with `spring-pop` and exits with `fade` at `controlExit`. This is
Checkbox's own indicator binding, unchanged, because this is the same control on a
larger canvas, not a new temperament. Wash and border colours use §7's shared
state-feedback list. At `none`: the glyph appears and the colours snap.

## Icons

`confirm` is the selection channel, in `--pm-accent-text` (decorative to assistive
tech, because the control carries the state). Per-option `icon`, top, decorative.
Relay uses `inbox` for email, `notification` for in-app, `comment` for chat and `link`
for webhooks.

## A11y

`mode="single"` is a radiogroup named by `label`: one tab stop, and arrows move focus
*and* selection (Radix's roving focus), and Space selects the focused card. `mode="multiple"`
is `role="group"` over real checkboxes: **Tab reaches every card, and arrows do nothing.**
This is CheckboxGroup's rule, unchanged: moving through independent decisions with a key that
also acts makes readers check things they never chose (WAI-APG's own split). Each card is a real
`<label>` for its hidden but real control, so the whole surface toggles. A
`description` gets an id wired to its own control's `aria-describedby`, so per-option
help is announced with its option and never merged. Wash, border and glyph are visual
channels only. State is `aria-checked`, and the group name comes from `label`, not
from reading the card aloud as one string.

```contract
role root radiogroup when single 3-up
name root from label when single 3-up
key ArrowRight moves-focus-next on card when single 3-up
key Space selects on card when single 3-up
role root group when multiple, 2 selected
key Tab moves-focus-next on card when multiple, 2 selected
key ArrowDown nothing on card when multiple, 2 selected
```

## Agent

An agent reads the chosen values, the options, the mode and whether the group is disabled, and
chooses. The value is a list of ids in both modes, so one fence serves both: in `single` it holds
at most one id, and in `multiple` the checked ones in options order. An option's id is its
`value`. In `single`, `choose` takes exactly one id, because a single choice cannot be cleared,
and `onChange` reports it as a person's press does. In `multiple`, `choose` sets the whole
selection of the enabled options, as CheckboxGroup's does, and a disabled option keeps what it
holds, because a person cannot change it either. In both modes the choice goes through the
member's own value, whether or not the caller controls it. A disabled option is refused, and a
disabled group lists no action.

```agent
state value ids
state options choices
state mode text
state disabled boolean as root data-disabled
action choose ids sets value calls onChange when disabled option
```
