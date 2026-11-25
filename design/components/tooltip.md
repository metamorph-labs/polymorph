# Tooltip

A short, non-essential text hint shown on hover or focus. Anything interactive or
essential belongs in a Popover or in visible text, because a tooltip is never the only
carrier of meaning (conventions §9).

Radix `@radix-ui/react-tooltip`.

## Anatomy

```
[trigger — the wrapped child, must be focusable]
[content bubble]  — text only, no arrow
```

No arrow, on purpose: an arrow is ornament that does not suit sharp systems, and the
offset and origin-aware motion already connect the bubble to its trigger.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `content` | `string` | required | plain text only, no nodes, to keep tooltips short |
| `side` | `'top' \| 'right' \| 'bottom' \| 'left'` | `'top'` | Radix collision handling may flip |
| `align` | `'start' \| 'center' \| 'end'` | `'center'` | |
| `children` | one focusable element | required | |

A shared `TooltipProvider` sets delays once: open ~500ms, cross-tooltip skip ~250ms
(the design intent; the exact values are `TOOLTIP_DELAY_MS` / `TOOLTIP_SKIP_DELAY_MS`
in `Tooltip.tsx`). Content attributes:
`data-state="delayed-open|instant-open|closed"`, `data-side`.

## Recipe (exact tokens)

An inverse-tone bubble. This is the only place the vocabulary uses the inverse pair
directly:

| Part | Tokens |
| --- | --- |
| bubble | bg `--pm-bg-inverse` · text `--pm-text-inverse` · `text.xs` quartet · radius `--pm-radius-sm` · padding `--pm-space-2` `--pm-space-3` · shadow `--pm-shadow-raised` · max-width `calc(var(--pm-space-10) * 3)` (288) |
| bubble, short of room | max-width is the room on the side the bubble was placed on, less the offset, when that is under 288: the distance from the trigger to the window's edge, which the positioning engine measures (`--radix-tooltip-content-available-width`; the Zag members pass `--available-width` under that name). The text wraps *(the positioner moves a bubble to the other side of its trigger when the first is short, and does nothing more when both are. A bubble opened to the left or right of a centred trigger in a phone-width window would cross the window's edge)* |
| offset | `--pm-space-2` from trigger, on the side the bubble was placed on: a margin on the bubble's edge that faces the trigger *(inside the box the positioner places, so the positioner counts the offset when it checks a side for room. The Zag members pass the positioner a gutter of zero, so the margin is the whole gap in every renderer)* |

No border, because the inverse fill contrasts with the page in both modes.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| closed | trigger only | — |
| open | `defaultOpen` (Radix) on each side ×4 | an open `data-state`, `data-side` |
| long content | wraps at max-width | — |

`requiredSelectors`: `[data-state="delayed-open"]`, `[data-side="top"]`,
`[data-side="bottom"]` (side-dependent motion origins).

## Motion

`scale-fade`, origin-aware from `data-side`, so the bubble grows out of the trigger edge.
Enter `--pm-motion-duration-control` × `--pm-motion-easing-enter` (tooltips use the fast
class), exit `-control-exit` × `-exit`. Travel distance follows the motion values
(`design/motion/motion.md`); it is the small slide component of scale-fade. At `none`:
instant show and hide, and the provider delay still applies, because the delay is
interaction design, not motion.

## Icons

None.

## A11y

The bubble is `role="tooltip"`, and Radix sets `aria-describedby` on the trigger while open.
Escape and a press outside dismiss it. Focus opens it, so keyboard users get the same as hover.
A tooltip stays open while its control holds the focus the keyboard gave it, and closes on Escape,
when focus leaves, on a press on the control or outside it, or when another tooltip opens *(WCAG
1.4.13: the hint stays until its trigger goes or the reader dismisses it. A Tab to a control below
the fold scrolls the page a frame after the focus that opened the tooltip, and the substrates close
a tooltip on a scroll and when the pointer leaves the control, which would take the hint and its
description away with no action of the reader's)*. Neither a scroll nor the pointer leaving closes
it then. The keyboard gave the focus when a key, not a press of the pointer, came before it: a text
field matches `:focus-visible` after a click as well, so `:focus-visible` does not say it. A scroll
and the pointer leaving still close a tooltip on a control the pointer focused.
Never put a tooltip on a disabled element, because it cannot take focus. The wrapper workaround
is not offered; write visible help text instead.

```contract
role bubble tooltip when long content
attr trigger aria-describedby when long content
key Escape closes when long content
dismiss both when long content
```

## Agent

A tooltip has no fence: an agent reads nothing from it and runs nothing on it. Its text describes
the control it wraps, and it is never the only place that meaning appears (conventions §9), so an
agent loses nothing by reading the control instead. The control is a member of its own, usually a
Button, which an agent finds by its name and presses. Opening a tooltip shows a hint and changes
nothing, so it gives an agent no action.
