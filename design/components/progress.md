# Progress

A bar for determinate progress: how much of a task is done. Use Spinner when the duration is
unknown; one component for both would make each less clear. A measured value against a limit,
which can go down as well as up, is Meter: its role is `meter`, and a prop here would change
this member's role and what its value means.

`shape="ring"` draws the same value as a ring at Spinner's sizes. It is for the place a
Spinner sits (a file row, a chip, a line of text) once the task knows how far it has got,
where a bar would be wider than the room it has.

## Anatomy

```
bar:  [track] [fill]
ring: [ring [dial: [groove] [arc]]]
```

Labelling is done by composition: pair it with FormField-style text or Stat. Progress renders no
text, as a bar or as a ring.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `value` | `number` (0–100) | required | clamped |
| `label` | `string` | required | `aria-label`; a bar with no name tells the user nothing |
| `tone` | `'accent' \| 'danger'` | `'accent'` | `danger` for a task that failed or ran past its budget only; a usage figure against a quota is Meter |
| `shape` | `'bar' \| 'ring'` | `'bar'` | a bar as wide as its container, or a ring at an icon's size |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | the ring's box, Spinner's sizes (`--pm-icon-size-*`). A bar takes its container's width and no size |

Attributes: `data-tone`; `role="progressbar"` + `aria-valuenow/min/max`. The ring adds
`data-shape="ring"` and `data-size`. The bar carries neither, so a Progress that passes no
`shape` renders as it always has.

**No indeterminate ring.** A ring with no value is what Spinner is. `value` stays required, so
`shape="ring"` cannot be indeterminate, and a wait of unknown length is a Spinner at the same
size, which a ring then replaces in place.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| track | height `--pm-space-2` (4) · bg `--pm-bg-subtle` · radius `--pm-radius-pill` · overflow hidden |
| fill | bg `--pm-accent-gradient` *(a theme with no partner hue and no pinned second stop resolves this to the same solid as `accent.bg`, so nothing changes for it; in a gradient system the fill runs across its two hues)* (`danger` → `--pm-danger-solid`) · full track height · width 100% scaled by `transform: scaleX(value/100)`, from the inline start: the left, and the right where the document runs right to left |
| ring | inline-flex · box `--pm-icon-size-{sm,md,lg}` square · padding half of `--pm-space-1`, so the stroke ends at the box's edge |
| dial | SVG filling the ring's content box · overflow visible · `transform: rotate(-90deg)`, so the arc starts at 12 o'clock and runs clockwise |
| groove | a circle on the dial's own radius · stroke `--pm-border-default` · stroke width `--pm-space-1` (2) · no fill |
| arc | the same circle · stroke `--pm-accent-bg` (`danger` → `--pm-danger-solid`) · stroke width `--pm-space-1` · `pathLength` 100 · dash array 100 · dash offset `100 − value`, inline · butt ends |

The fill is scaled with a transform, not by animating width (the compositor-only law). At 4px
the pill radius looks like a line with soft ends in every geometry. Sharp geometry keeps it,
because a 4px bar with square ends looks like a rendering artefact.

The groove is a line, so it takes the line role `border.default`, not the track's wash. The
contrast law holds `border.default` at least the hairline floor (ΔL 0.04) from every surface the
ring can sit on (`bg.app`, `bg.subtle`, `bg.surface`, `bg.raised`, `bg.overlay`), in every
pairing and both modes. `bg.subtle` is within ΔL 0.03 of `bg.app` and `bg.surface` in both
modes. The bar's track still shows at that distance, because it is a 4px band as wide as its
container, as Meter's track and Slider's rail are. A 2px line around a dial an icon's size does
not, and on a dark page it all but disappears. The groove shows where the whole is, which the
arc is read against, so it must be seen wherever the ring is put.

A stroke takes no gradient, so the ring's accent is `accent.bg`, the gradient's first stop and
the solid it resolves to in a theme with no partner hue and no pinned second stop. A gradient
system's ring is that system's solid accent. The arc's ends are butt, because a round cap draws a
dot at 0 and overlaps itself at 100.

**Direction.** The bar runs the way text runs, so in a right-to-left document it fills from
the right. The ring is a clock face, which no reading direction mirrors: it fills clockwise
from the top in both.

## States

Entries: 0, 33, 100, `tone="danger"` at 80, clamped, the bar beside its caption. The ring at
`sm`, `md` and `lg` (complete), the ring `danger`, and the ring beside its caption.
`requiredSelectors`: `[data-tone="danger"]`, `[dir="rtl"]`.

## Motion

Fill: `transform` over `--pm-motion-duration-surface` × `--pm-motion-easing-standard`
(value changes ease and never spring, because data should not look playful). At `none`: instant.

Arc: `stroke-dashoffset` over the same duration and easing. No transform can lengthen an arc,
and the offset repaints only the ring's own box and moves no layout. Reduced motion and `none`:
instant, as the fill.

## Icons — none. A11y — `progressbar` semantics per API, the same for the ring, whose SVG is
`aria-hidden`; changes are not live-announced (announcing each polled update is noise; the app
announces completion with a toast).
