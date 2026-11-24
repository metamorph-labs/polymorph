# Dialog

A modal panel that interrupts the page. Use it for a confirmation, a small focused task, or a
gate before a destructive action.

It uses Radix `@radix-ui/react-dialog`. A modal panel that enters from an edge is Drawer
(`drawer.md`). A non-modal surface anchored to a trigger is Popover (`popover.md`).

## Anatomy

```
[overlay scrim]
[panel]
  [header:  [title]  [close: iconOnly ghost Button "close"]]
  [description?]
  [body slot]
  [footer slot — actions, right-aligned]
```

## Localization

`closeLabel` supplies the accessible name of the close icon. Its generic default is `Close`;
localized applications must pass their catalog value.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `open` / `defaultOpen` / `onOpenChange` | Radix contract | — | |
| `trigger` | `ReactNode` | — | optional; a governed control (usually Button) |
| `title` | `string` | required | renders Radix `Title` |
| `description` | `string` | — | Radix `Description` |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | width class below |
| `children` | body content | — | |
| `footer` | `ReactNode` | — | actions slot |
| `dismissible` | `boolean` | `true` | `false` removes ✕ and disables closing by outside click or Escape. This forces a choice, so use it sparingly |
| `initialFocus` | `'primary' \| 'dismiss'` | — | which footer control has focus on open. Unset means the first tabbable element, per the focus-order rule. `dismiss` is for a panel that asks whether the user meant the action (ConfirmDialog's cancel-first rule) |
| `alert` | `boolean` | `false` | `role="alertdialog"`, for an interruption the user must answer rather than a surface they chose to open. ConfirmDialog sets it for `tone="danger"` |
| `presentation` | `'auto' \| 'sheet'` | `'auto'` | `'auto'` is the card, which fills the screen below `30rem` (the sheet cell below). `'sheet'` keeps the card above `30rem` and becomes a **bottom sheet** (conventions §12) below it. Use it for short confirm or pick dialogs, where full screen is too much. The bottom sheet is opt-in, never the default, and the closed union allows only these two values |
| `closeLabel` | `string` | `'Close'` | the close icon's accessible name; see Localization above. Localized applications pass their catalog value |

Panel attributes: `data-state="open|closed"`, `data-size`;
`data-presentation="sheet"` while the panel is drawn as a sheet. Per conventions §12 it
reflects the resolved state and is absent in card and full-screen form.

## Dimensions

Widths are computed from space tokens, so they scale with density and a comfortable theme gets
wider dialogs:

| Size | Width |
| --- | --- |
| `sm` | `calc(var(--pm-space-10) * 4)` (384) |
| `md` | `calc(var(--pm-space-10) * 5)` (480) |
| `lg` | `calc(var(--pm-space-10) * 7)` (672) |

Panel: `width: min(<size>, calc(100vw - var(--pm-space-7) * 2))`; max-height
`calc(100dvh - var(--pm-space-8) * 2)`, body scrolls (`overflow-y: auto`). Centered both
axes. The body is the part that shrinks, so a long body scrolls while the title and the
footer stay in place. The panel itself scrolls (`overflow-y: auto`) only when the title, the
description and the footer alone are taller than it, as with a long description or large text
in a short window. Every part then stays in reach instead of running past the panel's edge. Padding `--pm-space-6`; header→description gap `--pm-space-2`; description→body
`--pm-space-5`; body→footer `--pm-space-6`; footer actions gap `--pm-space-3`.

The max-height uses `dvh` with a fallback. The `100vh` value is the base, and the `100dvh`
override follows it inside an `@supports (height: 1dvh)` block, so engines without `dvh` keep
the `vh` behaviour. Two declarations of the same property in one rule would be removed by a
deduplicating minifier. On phones `100vh` includes the collapsed browser chrome, so a card
capped by it puts its footer behind the URL bar (`docs/layout.md`). `dvh` tracks the live
viewport.

### The sheet, below `30rem`

| Cell | Value |
| --- | --- |
| trigger | `@media (width < 30rem)` — the **viewport**, not a container |
| selectors | `.panel`, `.panel[data-size='sm']`, `.panel[data-size='lg']` — all three, because `[data-size]` outranks the bare panel rule and would otherwise keep setting a width |
| inline-size | `100%` (the `min(size, …)` width is dropped) |
| block-size / max-block-size | the window's height; the sheet fills the screen on both axes. The positioner has one explicit row, `minmax(0, 1fr)`, and the panel is stretched into it. An implicit `auto` row grows with a long body, and the panel would run past the bottom of the window |
| border-radius | `0`, because in this form every panel edge is a display edge, and a radius would cut a curve out of the screen |
| border | `0`, for the same reason: it would draw a hairline box around the whole window |
| unchanged | padding `--pm-space-6`, the scrolling body, the close control, the footer, `role`/`aria-modal`/focus trap/scroll lock. Full-bleed changes shape, not behaviour. Adaptation changes composition, never content (`docs/layout.md`) |

**Why `@media` here.** Container-first responsiveness (`docs/layout.md`) ties every member to
its container and leaves the viewport to the shell. An overlay counts as shell and gets the
shell's exemption for the same reason. The panel is portalled to the document and positioned
`fixed`, so there is no box between it and the window to measure. Its container is the
viewport. `30rem` is a rem literal with a comment, like the shell's `48rem`, because a
breakpoint is geometry, not theme. If it scaled with density, a dialog would turn into a sheet
for a user who only changed how compact their controls are.

Below the threshold a full-screen panel has no size variants, so `size` has no visible effect.
The attribute stays on the panel, because it still records what the caller asked for.

In the full-bleed form the panel's block padding adds the safe-area insets:
`padding-block-start: calc(var(--pm-space-6) + env(safe-area-inset-top, 0px))` and
`padding-block-end: calc(var(--pm-space-6) + env(safe-area-inset-bottom, 0px))`. The inset is
zero on screens without a notch. Every panel edge is a display edge in this form, and a footer
under the home indicator would be hidden content. Adaptation may degrade composition, never
content (`docs/layout.md`).

### `presentation="sheet"` — the bottom-sheet option

Above `30rem` nothing changes: the card renders at its size. Below that width the panel becomes
conventions §12's sheet verbatim instead of filling the screen: bottom-attached, full-width,
top corners `--pm-radius-lg`, top border only, as tall as its content up to §12's cap,
`padding-block-end` meeting `env(safe-area-inset-bottom, 0px)`, and the `sheet` motion binding
with its reduced-motion snap. It carries `data-presentation="sheet"`. Header, body, footer and
their padding use this spec's rows unchanged. `size` still has no visible effect below the
line, because a sheet is as tall as its content and not as wide as a card. The scrim, focus
trap, `dismissible`, initial focus and return focus are Dialog's own and the same in both
forms. The sheet changes shape, not behaviour (adaptation changes composition, never content),
which is why it can be offered as a prop.

| Part | Tokens |
| --- | --- |
| scrim | bg `--pm-bg-scrim` (depth-tuned alpha is in the token) |
| panel | bg `--pm-bg-overlay` · border `1px solid --pm-border-subtle` · radius `--pm-radius-lg` · shadow `--pm-shadow-overlay` |
| title | `text.xl` quartet · `--pm-text-primary` |
| description | `text.sm` · `--pm-text-secondary` |
| close button | Button `ghost/neutral/sm iconOnly icon="close" label="Close"`, top-right, inset `--pm-space-4` |

Footer convention (hierarchy law): exactly one primary action (`solid`); dismiss/cancel
is `outline/neutral` or `ghost/neutral`; destructive confirm is `solid/danger`. Primary
sits rightmost.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| plain | trigger only; a title and a body | opening focuses the close button |
| described | trigger only; a title, a description and a body | — |
| open md | `defaultOpen`, with a footer | panel `data-state="open"`, `role="dialog"`, `aria-modal` |
| sizes | sm / md / lg triggers | `data-size` |
| with a footer | footer actions, the primary rightmost | opening focuses the primary |
| with a form | a field in the body | opening focuses the field |
| non-dismissible | `dismissible={false}` | no close button |
| scrolling body | long content | body scrollable, header/footer pinned |

`requiredSelectors`: `[data-state="open"]`, `[data-state="closed"]` (exit styling),
`:focus-visible`.

## Motion

- Scrim: `fade` — enter `--pm-motion-duration-overlay` × `--pm-motion-easing-enter`,
  exit `-overlay-exit` × `-exit`.
- Panel: `scale-fade` from the **trigger's origin** (the transform-origin helper,
  `transformOriginFor` / `useProjectedOrigin`; fallback center), scale-from and
  travel per the motion values (`design/motion/motion.md`); exit reverses toward
  origin at the exit ratio. Unmount is presence-managed (`MotionPresence`), and a reversal
  mid-animation must be seamless (interruption law, `design/motion/motion.md` §10).
- At `none` / reduced-motion projection: scrim and panel appear/disappear instantly
  (opacity-only per the projection table, `design/motion/motion.md` §7).

## Icons

`close` only.

## A11y

Radix modal semantics: focus trap, initial focus (first tabbable in body, else primary
action, else close), focus return to trigger, scroll lock, `aria-labelledby` = title,
`aria-describedby` = description. Escape and outside click respect `dismissible`. The click
target is the scrim only, so a click on the panel padding does not close the dialog.

The trigger can leave the page while the dialog is open: a confirm that deletes the row the
trigger was in takes the trigger with it. Focus then goes to the first focusable element after
where the trigger was, else the last one before it, else the page's `main`, and not to the body,
where a keyboard reader would start again from the top. The rule is the engine's
(`focusReturnTarget`, `packages/engine/src/conventions/focus-after-removal.ts`), and every modal
surface returns focus by it: Dialog, ConfirmDialog, Drawer, Lightbox, Command and Tour.

```contract
role panel dialog when open md
attr panel aria-modal=true when open md
name panel from title when open md
key Enter opens
focus on-open body when with a form
focus on-open primary when with a footer
focus on-open close when plain
focus on-close trigger
focus on-close nearest
key Escape closes when open md
dismiss both
dismiss none when non-dismissible
```

## Agent

An agent reads whether the dialog is open and closes it. A close goes through the member's own
open state, so `onOpenChange` reports it as it reports a person's, whether or not the caller
controls it. A non-dismissible dialog asks for a choice among its own actions, so it refuses a
close and the step fails; an agent answers it with one of its footer Buttons. An agent does not
open a dialog: a closed dialog has no panel, so it has no name an agent could find it by, and its
trigger is a control of its own, usually a Button, which an agent presses to open it.

```agent
state open boolean as panel present when open md
action close sets open calls onOpenChange when open md
```
