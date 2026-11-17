# Sparkline

A small inline line that shows the trend of one series beside a number, in a Stat or a
table cell. It gives context for the number and is not a chart.

It has no axes, frame, legend, tooltip or twin, and on purpose no numbers of its own; the
Stat or cell it sits in shows the value. It is **not** a small LineChart: a LineChart
shows what happened, and a Sparkline shows only which way the values have been moving.
It is the only chart member without `'use client'`, because it only renders and has no
behaviour.

## Anatomy

```
[span role="img"]
  [svg: 2px stroke in the de-emphasis hue · current-period end dot in accent]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `data` | `readonly number[]` | required | chronological, in the app's order; designed for about 12 points. `[]` or one point renders nothing, because a trend needs two |
| `label` | `string` | required | the accessible name. It should state the direction ("First response, trending down"), because this is the only chart with no twin |
| `size` | `'sm' \| 'md'` | `'sm'` | sm sits on the type scale (Stat label rows, table cells); md for a roomier tile |

Attributes: `data-size`.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| block-size | sm `--pm-icon-size-lg` · md `--pm-control-height-sm`; taken from the icon and control scales so it aligns to the type grid like `Icon` |
| inline-size | `calc(block-size × 4)` — `calc(var(--pm-icon-size-lg) * 4)` / `calc(var(--pm-control-height-sm) * 4)` |
| stroke | `--pm-chart-other` · 2px, round join/cap, monotone-x · `vector-effect: non-scaling-stroke`. It is the only chart allowed to scale by viewBox, because it has no text to distort |
| end dot | r 3 (6px) · `--pm-accent-bg`; marks the current value, while the line is context |
| alignment | `display: inline-block` · `vertical-align: middle` |

No gridlines, no baseline, no hover state. If a trend needs a tooltip, use a LineChart.

## States

1. **down-good** — Relay's 12-week first-response minutes, falling:
   `[42, 40, 41, 38, 35, 36, 33, 31, 32, 29, 27, 26]`
2. **up** — weekly ticket volume climbing: `[180, 195, 190, 210, 220, 216, 240, 251, 248, 262, 270, 284]`
3. **flat with noise** — CSAT holding: `[92, 91, 93, 92, 92, 94, 93, 92, 93, 93, 92, 93]`
4. **two points** — the minimum trend: `[12, 19]`
5. **md** — the up series at `size="md"`
6. **empty** — `data={[]}`, `rendersNothing: true`
7. **single point** — `data={[7]}`, `rendersNothing: true`

`requiredSelectors`: `[data-size='md']`.

## Motion

None. An animated sparkline would be ambient motion in a label row when nothing has
changed. It appears together with the surface that contains it.

## Icons

None.

## A11y

`role="img"` + `aria-label` from `label` on the span; the svg is `aria-hidden`. There is
no twin, because the Sparkline is supporting data only. Its `label` must therefore state
the reading, and data that readers need to inspect belongs in a LineChart with its table.
Colour is never the only channel: the shape carries the information, drawn in the
de-emphasis hue for everyone.
