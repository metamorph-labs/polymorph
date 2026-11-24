# Drawer

A modal sheet that slides in from an edge. Use it for detail panels, filter stacks and
contextual editors.

It is **a positioned Dialog variant** (`README-substrates.md` §3.3): `@radix-ui/react-dialog`
behaviour and Dialog's focus, dismiss and scroll handling, with a different positioner and
panel recipe. It adds no dependencies.

Two boundaries are settled. **No gesture dismissal**: Drawer closes by its control, the scrim
and Escape. A swipe without a real velocity model, rubber-band behaviour and a reduced-motion
fallback is worse than none. **A persistent or non-modal side panel is not this component**:
that is an archetype region, and a Dialog without a focus trap is a different component.

The `side="bottom"` anatomy is shared as conventions §12, the sheet presentation the overlay
family uses below `30rem`. This follows the chart-frame precedent: defined once and reused by
reference. This file still owns the visual definition. §12 cites it, and the members that
render as a sheet cite §12.

## Anatomy

```
[scrim]                       — Dialog's scrim, verbatim
[positioner — edge-pinned]
  [panel]
    [header: [title] [description?] [close: iconOnly ghost "close"]]
    [body — scrolls]
    [footer? — actions row, one primary, rightmost]
```

## API

Dialog's API (`dialog.md`) with the size prop swapped for edge geometry:

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `side` | `'end' \| 'start' \| 'bottom'` | `'end'` | logical: `end` is right in LTR, left in RTL. No `top`, because a top sheet is a notification pattern and Toast owns content arriving from above |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | inline-size for start/end: `calc(var(--pm-space-10) * 4 / 5 / 6)` (384/480/576 std, density-scaled); block-size for bottom: content up to `50dvh / 66dvh / 80dvh`. It uses `dvh` because on phones `100vh` includes collapsed browser chrome, and a half-height sheet measured against it sits behind the URL bar (`docs/layout.md`). Each row has a fallback: the `vh` base, then the `dvh` override in an `@supports (height: 1dvh)` block, so engines without `dvh` keep the `vh` behaviour |
| `open` / `defaultOpen` / `onOpenChange` · `title` (required) · `description` · `footer` · `dismissible` | — | — | exactly Dialog's, same defaults, same forced-choice rule (`dismissible={false}` removes ✕ / scrim-press / Escape together) |
| `initialFocus` | `InitialFocus` | — | exactly Dialog's cell (`dialog.md`): `'primary' \| 'dismiss'`, unset = first tabbable per the focus-order rule, `dismiss` for a panel that asks whether the user meant the action. The variant shares Dialog's implementation, so it has every Dialog behaviour |
| `closeLabel` | `string` | `'Close'` | exactly Dialog's cell (`dialog.md` §Localization): the ✕'s accessible name, shared with Dialog like the rest of the implementation |

Attributes: panel `data-state="open|closed"` (Radix), `data-side`, `data-size`.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| scrim | Dialog's verbatim: bg `--pm-bg-scrim`, covers viewport |
| panel | bg `--pm-bg-overlay` · shadow `--pm-shadow-overlay` (the flat-overlay rule applies: a transient surface keeps its overlay shadow in every system) · start/end: full block-size, border on the *inner* edge only (`1px solid --pm-border-subtle`), radius `--pm-radius-lg` on the two free corners, `0` on the attached edge · bottom: full inline-size, border-top, radius-lg on top corners, plus `padding-block-end: env(safe-area-inset-bottom, 0px)`. The padding clears the home indicator and is zero on screens without a notch. Without it the last row would sit behind the indicator, and adaptation never hides content (`docs/layout.md`) |
| header | padding `--pm-space-5` `--pm-space-5` `--pm-space-3` · title/description/close exactly Dialog's (title `text.xl` `--pm-text-primary`; description `text.sm` `--pm-text-secondary`) |
| body | padding-inline `--pm-space-5` · the only scroll region (`overflow-y: auto`); header and footer stay fixed, per Dialog's scrolling-body rule. The panel itself scrolls (`overflow-y: auto`) only when the header and the footer alone are taller than it, as with a long description, so every part stays in reach, as in Dialog |
| footer | padding `--pm-space-3` `--pm-space-5` `--pm-space-5` · Inline gap `--pm-space-3` justify end · one primary, rightmost |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| open end | `defaultOpen` | panel `data-state="open"`, `data-side="end"` |
| open start / bottom | each side | `data-side` |
| sizes | sm / lg | `data-size` |
| with footer | actions | — |
| forced choice | `dismissible={false}` | no ✕ |
| scrolling body | long content | header/footer fixed |

`requiredSelectors`: `[data-state="open"]`, `[data-state="closed"]`,
`:focus-visible`.

## Motion

`drawer.panel` binding, **with its own values, set here**: the panel slides **in from fully
off-canvas** (`translateX(±100%)` / `translateY(100%)` → 0) at opacity 1 throughout, because
a sheet slides in and does not fade in. `overlay` class: enter `--pm-motion-duration-overlay` ×
`--pm-motion-easing-enter`, exit `-overlay-exit` × `-exit`. **Temperament's distance scale does
not apply**, because 100% is geometry, not a travel distance. The distance is structural, and
scaling it would leave the sheet partly inside the page. Scrim: Dialog's fade binding verbatim.
Interruption follows the interruption laws (`design/motion/motion.md` §10: a reversal
mid-animation continues from the current position). At `none`: instant. Reduced motion: the
panel **fades in place** with no travel. This is the AppShell drawer's projection, for the
same reason: a sheet held off-screen by a transform cannot arrive from nowhere at opacity 0.

## Icons

`close` (labelled "Close").

## A11y

Dialog's, unchanged and tested there: focus trap, initial focus to the panel,
return focus to the launcher, or to the focusable element nearest where it was when the launcher
has left the page, Escape (when dismissible), `aria-modal`,
`aria-labelledby`/`aria-describedby` from title/description. Drawer adds nothing, which is why
it is a Dialog variant.

```contract
role panel dialog when open end
attr panel aria-modal=true when open end
key Enter opens
focus on-open panel
focus on-close trigger
focus on-close nearest
key Escape closes when open end
dismiss both
dismiss none when forced choice
```

## Agent

An agent reads whether the drawer is open and closes it, as it does a Dialog. A close goes
through the member's own open state, so `onOpenChange` reports it as it reports a person's,
whether or not the caller controls it. A forced choice (`dismissible={false}`) refuses a close
and the step fails; an agent answers it with one of its footer Buttons. An agent does not open a
drawer: a drawer has no trigger, and the screen's own control that opens it, usually a Button, is
what an agent presses. The body and the footer are the application's, so their members are
listed `within` the drawer.

```agent
state open boolean as panel present
action close sets open
```
