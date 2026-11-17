# DonutChart

A ring chart that shows how a whole splits into at most six parts, with the total in the
centre. Use it to show roughly how something divides.

It is **not** for comparing close values (use a bar chart) and not a Meter (one value against a
limit is Meter). It is never a solid pie, because the ring reduces the angle comparison
that a solid pie invites. It uses the shared `ChartFrame` without axes, and its grammar types
are the tier's (`docs/charts.md`).

## Anatomy

```
[ChartFrame — no axes]
  [plot: ring of arc segments, 2px surface gaps at both radial edges,
         4px corner rounding · center figure: value over label]
  [legend (derived, ≥2 segments)]  [twin + toggle]  [tooltip]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `segments` | `readonly DonutSegment[]` | required | ≤ 6. A 7th triggers a dev warning that names the fold-to-"Other" rule. Drawn in the given order from 12 o'clock, clockwise. Zero-value segments render nothing but stay in the legend and twin. A negative value triggers a dev warning and its segment is not drawn (it stays in the twin) |
| `center` | `DonutCenter` | — | the figure in the centre, **pre-formatted by the app** (Stat's rule: the app states the total; the member does not compute it) |
| `format` | `ValueFormat` | — | formats segment values in tooltip and twin |
| `size` | `ChartSize` | `'md'` | frame heights per `bar-chart.md`'s recipe; the ring's outer diameter fits the plot's shorter side |
| `label` | `string` | required | |
| `locale` | `string` | — | |
| `tooltip` | `ChartTooltipConfig \| false` | on, `'dot'` | per segment: label, formatted value **and derived share**, the number a part-to-whole reader most needs |
| `onSelect` | `(selection: { key: string; label: string; value: number; share: number }) => void` | — | reports activation at the reading position, with the member's payload including share. Enter/Space activate, so it is never pointer-only |
| `loading` | `boolean` | `false` | |
| `messages` | `ChartMessages` | English | the tier's string catalog (`docs/charts.md`). This member uses `donutSummary`, `activationHint` (with `onSelect`), `empty`, the twin's three (`showTable`, `hideTable`, `tableLabel`), and the twin's column headings, which no prop names: `segmentColumn`, `valueColumn`, `shareColumn`. All keys or none, and the same object goes to every chart on the screen. Omitting it keeps the generic English |

```ts
interface DonutSegment {
  key: string
  label: string
  value: number
  slot?: ChartSlot // default: declaration order — colour follows the entity
}

interface DonutCenter {
  value: string // pre-formatted
  label?: string
}
```

Attributes: `data-size`, `data-state="loading" | "empty"` on the frame;
`data-active` on the hovered/read segment.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| segment fill | the segment's `paint` (`var(--pm-chart-N)`) |
| ring thickness | `--pm-space-6` (24), the bar-thickness cap applied radially, because a donut is a bar chart bent into a ring |
| segment separation | 2px surface gap at **both radial edges** (pad angle from px at the mid-radius), never a stroke |
| corner rounding | 4px via the engine's `BAR_END_RADIUS` (`d3-shape` arc `cornerRadius`), so data ends are rounded in every chart geometry |
| center value | `text.2xl` quartet · `--pm-text-primary` · `font-variant-numeric: var(--pm-font-numeric)` |
| center label | `text.xs` quartet · `--pm-text-muted` |
| hover/active lift | the transient emphasis mechanic: the active segment keeps full opacity, and the others ease to opacity 0.8 over `--pm-motion-duration-control` × `--pm-motion-easing-standard` |
| hit area | the segment's arc, floored at `HIT_TARGET_MIN` along the ring |
| empty state | copy: **"No data yet"**, the English default of `messages.empty`. A localized host's catalog replaces it |

No labels on segments. The legend, tooltip and twin carry names and numbers, and a label inside
an arc would sooner or later be clipped. Legend `keyShape="rect"`.

## States

1. **channels** — Relay tickets by channel: Email 214 · Chat 96 · Phone 41 ·
   Social 18, center `{ value: '369', label: 'Open tickets' }`
2. **six segments** — by team, at the six-segment limit
3. **two segments** — resolved vs open (the smallest meaningful split)
4. **dominant share** — one segment at 88% (the at-a-glance reading this chart is for)
5. **zero segment** — a channel at 0 (legend + twin keep it; the ring doesn't)
6. **no center** — segments alone
7. **format** — currency values, `{ style: 'currency', currency: 'USD' }`
8. **empty** — `segments={[]}` · 9. **loading** · 10. **tooltip off**
11. **selectable** — the channels with `onSelect`: the summary names the activation, and an
    agent can pick a segment (Agent, below)

`requiredSelectors`: `[data-state='empty']`, `[data-state='loading']`,
`[data-active]`, `:focus-visible`.

## Motion

`chart.frame` + `chart.marks`: segments enter by opacity with the series stagger, in draw
order. No sweep-in, because a growing arc reads as a gauge animating, and data display is not
playful.

## Icons

`table` (twin toggle).

No segment `icon` beside the legend key. A segment is not a `ChartSeries`, because it carries
one value rather than a column. So `DonutSegment` is `{ key, label, value, slot? }` (the code
block above) and has no `icon`. Adding one would invent an API the tier's grammar does not
have.

## A11y

The plot is one focus stop. Left/Right move through segments clockwise and announce "label:
value, share" politely. With `onSelect`, Enter/Space activate at the reading position and the
summary sentence mentions the activation; `role="img"` remains. The twin is a `Table` of
label · value · share. The share column exists because angles are the hardest visual quantity
to estimate. The centre figure is real text, so the relief rule does not apply to it. Colour
is never the only channel: the legend and twin name every segment, and ≤ 6 segments keeps
adjacent slots well apart on the colour wheel.

## Agent

A DonutChart with `onSelect` is listed for an agent, named by its `label`; without `onSelect` a
person has nothing to pick, so it registers nothing. `items` lists the segments a person can pick,
in the ring's order. A segment's label is what the live region says with the reading on it: its
label, its value and its share. Its id is its index (`1`). A segment whose value is not a number
reports nothing, so it is not listed.

A chart with more segments than the engine's `CHART_MARK_CAP` lists a window of them: the whole
segments around the reading position, at most the cap in all, or from the first segment while
nothing is read. `position` is the segment the reading is on, the number a segment's id starts
with, or `null` while nothing is read. The figure shows it as `data-position`, and a person's keys
and pointer move it as an agent's `read` does. `count` is how many segments the chart has. `read`
moves the reading to a segment as Left and Right do, so the tooltip and the live region show it and
the window follows. It calls nothing, and a number that is not the index of a segment throws.

`choose` moves the reading to a listed segment and activates it as Enter does, so `onSelect`
receives what a person's press there reports, and the tooltip and the live region show the segment.
The table twin's toggle is a Button of its own, listed within the chart.

```agent
state items choices when selectable
state position number as root data-position when selectable
state count number when selectable
action read number sets position when selectable
action choose id calls onSelect when selectable
```
