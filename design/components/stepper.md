# Stepper

Shows progress through an ordered flow, such as checkout, onboarding or a migration
wizard. It has no substrate: it is a list with three states and a connector.

A Stepper *reports* progress; it is not Tabs. If readers can move freely between any
steps, the flow is not ordered, so use Tabs. Completed steps can optionally be revisited
(`onStepSelect`); upcoming steps never can.

## Anatomy

```
[root — <ol>]
  [step <li>]*
    [indicator: number | Icon "confirm"]  [connector →]
    [copy: [label] [description?]]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `steps` | `{ label: string; description?: string; error?: boolean }[]` | required | 2–5 steps; a flow with six needs a redesign. `error` marks a step whose data failed *(without it, a wizard would flag a failed step with app-side CSS)* |
| `activeIndex` | `number` | required | 0-based; everything before is `completed`, after is `upcoming` |
| `onStepSelect` | `(index: number) => void` | — | renders **completed** steps as buttons; active/upcoming stay static |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | vertical stacks copy beside indicator, connector runs down |
| `spoken` | `(step: { position: number; count: number; state: 'completed' \| 'active' \| 'upcoming' \| 'error' }) => string` | English sentence | the spoken text for a step's position and state: the visually hidden clause after each label (the localization seam). One function rather than four words, because word order is grammar and grammar belongs to the message catalog. Default: `step 2 of 4, current` |

Attributes: steps `data-state="completed|active|upcoming|error"`,
`data-interactive?` (completed + `onStepSelect`); root `data-orientation`. Active
step also carries `aria-current="step"`. `error` replaces the progress state in
`data-state`, because it decides how the step looks now. Position keeps its other jobs:
`aria-current` still marks the active step, the connector fill still follows
`activeIndex`, and an errored *completed* step stays revisitable, because that is the
step the reader needs to return to.

## Recipes (exact tokens)

Progress uses the *accent* family, not the selection family, because a finished step is
not a chosen row (the selection family stays with Calendar/Command/rails; conventions
§11).

| Part | Tokens |
| --- | --- |
| indicator | `--pm-space-6` square · radius `--pm-radius-pill` · centered `text.xs` quartet number, `font-variant-numeric: var(--pm-font-numeric)` |
| indicator completed | bg `--pm-accent-bg` · Icon `confirm` `sm` `--pm-accent-contrast` (number swaps for the check) · shadow `var(--pm-shadow-control), var(--pm-shadow-inset-top)` (a done step uses the lit-object shadow; flat themes derive none) |
| indicator active | bg `--pm-accent-subtle` · border `1px solid --pm-accent-bg` · number `--pm-accent-text` |
| indicator upcoming | bg transparent · border `1px solid --pm-border-default` · number `--pm-text-muted` |
| indicator error | the danger family: bg `--pm-danger-subtle` · border `1px solid --pm-danger-border` · the number is replaced by Icon `error` `sm` `--pm-danger-text`, as the completed check replaces it, in the tone Toast's danger uses. The label keeps its progress colour, as in Timeline: the mark shows the flag and the label carries the text |
| label | `text.sm` quartet · completed/active `--pm-text-primary` · upcoming `--pm-text-secondary` (emphasis by colour, the mono-personality rule) |
| description | `text.xs` · `--pm-text-muted` · top gap `2px` |
| connector | `1px` line `--pm-border-default`; the segment *behind* the active step (i.e. after each completed step) is `--pm-accent-bg`, so the line fills as the reader progresses · horizontal: flex-grow between steps, min length `--pm-space-6`; vertical: block, min height `--pm-space-6`, aligned under the indicator center |
| interactive completed step | cursor pointer · hover: label `--pm-accent-text` · the shared focus ring around the step button with a `--pm-space-1` gap (conventions §4, around), because its marker and label reach its edge |
| copy gap | indicator ↔ copy `--pm-space-3`; horizontal steps gap `--pm-space-4` |
| row, narrow container | the horizontal row wraps: a step is at least as wide as its indicator, the longest word of its copy and its connector's minimum, and the steps that do not fit move to the next line, in order, `--pm-space-4` below. A label of several words takes a second line inside its step first *(container-first, `docs/layout.md`: a narrow container changes where the steps sit and never cuts a label or draws a step over the next. The row needs no breakpoint, because what fits depends on how many steps there are and how long their labels are, which only the row can measure)* |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| mid-flow | 4 steps, `activeIndex={2}` | states `completed×2/active/upcoming`; active `aria-current="step"` |
| start / end | `activeIndex` 0 / last | — |
| descriptions | with descriptions | — |
| revisitable | `onStepSelect` | completed steps `data-interactive`, real buttons |
| vertical | `orientation="vertical"` | `data-orientation="vertical"` |
| errored step | one step `error: true` | `data-state="error"` |

`requiredSelectors`: `[data-state="completed"]`, `[data-state="active"]`,
`[data-state="upcoming"]`, `[data-state="error"]`, `:focus-visible`.

## Motion

`stepper.indicator` binding: when a step *becomes* completed, the check enters with
`spring-pop` (`snappy`). The pop theme's celebratory temperament amplifies it and
terminal's damps it; completing a step is the one moment in a wizard that warrants it.
The connector fill is a background-color change over `--pm-motion-duration-surface` ×
`--pm-motion-easing-standard`. The row itself has no entrance motion. At `none`: states
swap instantly (`spring-pop`'s law: a pop never delays legibility). Reduced motion: the
check fades (spring-pop's projection).

## Icons

`confirm` (completed indicator), `error` (errored indicator), both decorative. The state
is in `data-state` and the accessible name below.

## A11y

`<ol>` with `aria-current="step"`; each step's accessible name is
"`{label}`, step {n} of {total}, {completed|current|not started}" through visually
hidden text, so the visible number or check never carries the meaning. An errored step's
state word is "error"; the glyph and the danger colours only show it visually.
Interactive completed steps are real buttons; upcoming steps are never focusable.

```contract
attr current aria-current=step when mid-flow
role done button when revisitable
key Enter activates on done when revisitable
```

## Agent

An agent reads the active step's index, 0-based as `activeIndex` is, and each step's label and
state (`completed`, `active`, `upcoming` or `error`). It revisits a completed step by its index,
which calls `onStepSelect` as a press on that step does. The flow belongs to the application,
so the active step changes when it passes the new `activeIndex` back. A Stepper with no
`onStepSelect` draws no step as a button, so it refuses, and so does an index that names no
completed step: an upcoming step is never revisited, by a person or an agent. The Stepper has
no name of its own: an agent finds it by the text it shows.

```agent
state active-index number
state steps list
action set number calls onStepSelect
```
