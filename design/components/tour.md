# Tour

A short walk through the parts of a page. Each step points at one part with a few words about
it, and the reader moves through the steps once and can leave at any step. The application
decides when a tour opens and records that it was seen; the member stores nothing.

It is not an onboarding checklist: a list of tasks the reader does is a Card of Checkboxes, and
it stays on the page. It is not the announcement of a feature, which is a Banner or an Alert,
and it is not a hint on one control, which is a Tooltip and holds no controls. A tour whose
steps point at nothing is a Dialog. A position in a flow the reader is completing is a
Stepper.

Each step's panel is a modal dialog: Radix `@radix-ui/react-dialog` in React and Zag's dialog
machine in the other web frameworks, as Dialog's is. The engine finds the target, scrolls it
into view and places the panel (`tourTarget`, `revealTourTarget`, `tourPlacement` in
`@polymorph/engine`), so the panel lands in the same place in every framework.

## Anatomy

```
[Tour.Target]*             display: contents; carries data-tour-target="<name>"
  [the page's own content]
[scrim]                    aria-hidden; the target cut out of it when the step has one
[positioner]               fixed at the corner the engine computed; data-placement
  [panel]                  role="dialog", aria-modal, named by the title, described by the description
    [title]                h2: the step's title
    [description]          display: contents
      [body]               the step's body
      [position]           "Step 2 of 5"
    [actions]              Previous (absent on the first step), then Next (Done on the last)
    [close]                iconOnly ghost Button "Close", top end
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `steps` | `readonly TourStep[]` | required | the steps, in order. With none, nothing is drawn |
| `open` / `defaultOpen` | `boolean` | — | the tour has no trigger: the application opens it |
| `onEnd` | `(reason: TourEnd) => void` | — | called when the reader ends the tour, with why: `finished` from the last step's control, `dismissed` from Escape or the close control. A tour never opens itself, so its end is the one change it reports, and one argument reaches every framework (an Angular output carries one value) |
| `step` / `defaultStep` | `number` | `0` | the current step's index, clamped to the steps. The step is kept when the tour closes, as Lightbox's position is, so a tour opened again resumes where the reader left it. An application that starts again from the first step passes `step` |
| `onStepChange` | `(index: number) => void` | — | called with the new index when Previous or Next is pressed |
| `messages` | `TourMessages` | English | the localization seam: every word the member writes itself. Pass every key, so one tour never mixes two languages |

```ts
interface TourStep {
  id: string // the step's key, unique in the tour
  target?: string // a Tour.Target's name; without one the step is drawn centred
  title: string
  body: string // a sentence or two, as text
  side?: 'top' | 'right' | 'bottom' | 'left' // default 'bottom'; physical, as Popover's
}

type TourEnd = 'finished' | 'dismissed'

interface TourMessages {
  next: string // 'Next'
  previous: string // 'Previous'
  done: string // 'Done'
  close: string // 'Close', the close control's name
  position: (position: number, count: number) => string // 'Step 2 of 5'; counts from 1
}
```

Attributes: the positioner carries `data-placement` (`top`, `right`, `bottom`, `left` or
`center`), the panel `data-state` and `data-step` (the step's `id`), and the scrim, the
position, the actions row and the close control carry `data-tour-part`.

**Who owns "seen".** The member writes no storage. The application holds `open`, learns of the
end through `onEnd(reason)`, and records it, so a tour the reader finished or
dismissed is not shown again. A tour opened at mount uses `defaultOpen`.

**How a step names its target.** A step's `target` is the `name` of a `Tour.Target` the
application puts around the part. A member takes no selector and application code has no
`className`, so a name on a wrapper is the one lawful way to point at a part in every
framework. The wrapper adds no box (`display: contents`): a Card, a grid cell or a Button
inside it lays out as if it were not there. An element with no box has no rectangle, so the
target's rectangle is the one around the boxes of its contents, found through any other
wrapper with no box (a framework's host element). Names are the page's: the first drawn target
with the name is the one a step points at.

**A step whose target is not drawn** (not rendered, hidden, or holding nothing when its step
opens) is drawn centred, as a step with no target is, with the same words and the same
position. Skipping it would change the count under the reader, and a tour whose targets are
all missing would end without the reader ending it. The target is found again whenever the
panel is placed: when its step opens, and when the page scrolls or the window resizes.

**On iOS and Android** the Tour is adapted (`design/platforms/`). `Tour.Target` has no native
contract, so no part of a native screen carries a target's name, and every step is drawn as a
step whose target is not drawn: the same words and position, in the platform's sheet, a
content-high sheet on iOS and a modal bottom sheet on Android, with nothing cut out. The sheet's
swipe, the scrim and the back gesture end the tour with `dismissed`, as Escape does.

## Tour.Target

The part a step points at, put around it by the application.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `name` | `string` | required | the name a step's `target` uses |
| `children` | `ReactNode` | — | the part the step points at, laid out as if the target were not there |

## Placement

The panel opens on the step's `side` of its target, default `bottom`, when its box fits between
the target and the window's edge. Otherwise it takes the opposite side, then either of the
other two. Along that side it is centred on the target and moved back inside the window. The
panel's margin (`--pm-space-3`) is its gap from the target and from the window's edge. With no
target, with a target that leaves no room on any side (a target larger than the window), or with
one scrolled out of the window, the panel is centred in the window. So at every width, a phone's
included, the panel is inside the window, and a target wider than the window still gets a
visible panel.

When a step opens, its target is scrolled into view by the least distance (`block: nearest`),
at once. The scroll plays no motion, so it needs no reduced-motion projection. The page keeps
its scroll while a step is open, and the panel and the cut-out follow the target when the page
scrolls, the window resizes or the panel's size changes.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| target | `display: contents` |
| scrim, no target | Dialog's: bg `--pm-bg-scrim` · `--pm-z-overlay` · takes presses, which end nothing |
| scrim, with a target | the cut-out: the target's rectangle grown by `--pm-space-2` on every side · radius `--pm-radius-control` · `2px solid --pm-border-strong` outline · its shadow `0 0 0 100vmax --pm-bg-scrim` is the scrim, as ImageEditor's rounded mask is · takes no presses |
| positioner | `position: fixed` at the engine's corner · `--pm-z-overlay` · takes no presses |
| panel | Popover's surface: bg `--pm-bg-overlay` · `1px solid --pm-border-subtle` · radius `--pm-radius-surface` · shadow `--pm-shadow-transient` · padding `--pm-inset-pane` · margin `--pm-space-3` · width: content, at most `min(calc(var(--pm-space-10) * 4), 100vw - 2 × --pm-space-3)` · at most the window's height less the margin, then it scrolls |
| title | `text.md` quartet · `--pm-text-primary` · room at the end for the close control (`--pm-space-8`) |
| body | `text.sm` quartet · `--pm-text-secondary` · `--pm-space-2` under the title |
| position | `text.xs` quartet · `--pm-text-secondary` · tabular figures · at the start of the last row, `--pm-space-5` under the body |
| actions | at the end of the last row · gap `--pm-space-2` · Previous `outline/neutral/sm`, Next and Done `solid/sm`: one primary per step |
| close | Button `ghost/neutral/sm iconOnly icon="close"`, at the top end, inset `--pm-space-3` |

The cut-out is a difference of lightness with an edge, not a colour, so it reads in every
system, in both modes and in forced colours. It is decorative: the step's words name what it
points at, because a reader who cannot see the cut-out still reads the step.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| first step | three targets, `defaultOpen` | panel `role="dialog"`, `aria-modal`, below its target; no Previous; position "Step 1 of 3" |
| middle step | `defaultStep={1}` | Previous and Next |
| last step | `defaultStep={2}` | Done in Next's place |
| a step with no target | a step without `target` | panel centred, `data-placement="center"`, full scrim |
| a step whose target is not on the page | `target` names no drawn target | drawn centred, as a step with no target |
| above its target | `side: 'top'` | `data-placement="top"` where it fits |
| beside its target | `side: 'right'` | `data-placement="right"` where it fits |

Every entry is open, because a tour has no trigger. Phone width, a right-to-left page and a
target that starts out of view are conditions of the window and the document, which a fixture
entry cannot set; the shared law sets each (`packages/conformance/src/tour.ts`).

`requiredSelectors`: `:focus-visible` (the panel takes focus when a step opens).

## Motion

The scrim plays `dialog.scrim` and the panel plays `popover.panel`: `scale-fade` from the side
it opens on, from its middle when centred; both exit under presence. A step change is not a
flourish: the panel's words change in place, and the panel and the cut-out move to the next
target at once. At `none` and under reduced motion the projections are Dialog's and Popover's.

## Icons

`close`, on the close control, named by `messages.close`.

## A11y

Modal, as Dialog is. While a step is open the rest of the page is hidden from assistive
technology and takes no presses, and focus stays in the panel (WCAG 2.4.3, focus order; 2.1.2,
no keyboard trap, because Escape and the close control leave). The target is part of the page,
so it is out of reach too: a step shows a part, and the reader uses it after the tour. A panel
that left the page usable would let focus move to a control under the panel (2.4.11, focus not
obscured), and would give the reader no way back to the panel.

When a step opens, the first and every later one, focus moves to the panel. The panel is named
by the step's title and described by the description, which is the body and then the position,
so assistive software reads "Narrow the list, dialog, Filter tickets by status, owner or tag.
Step 2 of 3" once per step. The position is not a live region as well, so it is not said twice.
Tab then reaches Previous, Next or Done, and Close, in reading order. When the tour ends, focus
returns to the element that had it when the tour opened.

Escape from anywhere in the panel and the close control end the tour and report `dismissed`;
the last step's Done reports `finished`. A press on the page ends nothing, because a stray press
would lose the reader's place. No arrow keys move between steps: no overlay in the vocabulary
takes them, and Previous and Next are buttons in the tab order.

```contract
role panel dialog when first step
attr panel aria-modal=true when first step
dismiss escape when first step
click activates on next when first step
click activates on previous when middle step
click activates on close when first step
```

Where focus goes when a step opens and when the tour ends, the position said once, what Next,
Previous, Done and Close report, the missing-target rule, the panel inside the window at phone
width and in a right-to-left page, a target scrolled into view, and the page out of reach are
held by the shared law in `packages/conformance/src/tour.ts`, which every web shell's Tour test
calls.

## Agent

An agent reads whether the tour is open, the current step (`step`, from 0) and every step's
words, moves to the next or the previous step and ends the tour, as a person does with its
controls. A move goes through the member's own step, so `onStepChange` reports it as it reports a
person's, whether or not the caller controls the step, and `dismiss` ends the tour as the close
control does, so `onEnd` reports `dismissed`. A move is refused where its control is absent: on
the first step there is no Previous, and a closed tour has no controls. On the last step `next`
is refused too, because Done reports `finished`, which says the reader went through the tour; an
agent ends a tour with `dismiss`. Previous, Next and Close are the tour's own Buttons, so it
withholds its panel and declares their actions as its own.

```agent
state open boolean as panel present
state step number
state steps list
action next sets step calls onStepChange
action previous sets step calls onStepChange when middle step
action dismiss sets open calls onEnd
withholds contents
```
