# Heatmap

A grid of cells coloured by magnitude on the sequential ramp. Use it to show where values are
concentrated.

It is **not** a comparison chart, because adjacent cells become hard to tell apart beyond about
7 bins; comparison is BarChart's job. Signed data switches to diverging colour automatically,
using the multi-step arms (`--pm-chart-neg-1..3` / `--pm-chart-pos-1..3` around
`--pm-chart-mid`, below). It never builds a scale from three single poles, which cannot bin a
grid accurately. It uses the shared `ChartFrame`. It has no `series` and no `emphasis`, because
a heatmap has one measure, not several series.

## Anatomy

```
[ChartFrame]
  [plot: cell rects on a band × band grid · 2px surface gaps · no gridlines
         (the gaps are the grid)]
  [y axis] [x axis]  [scale legend: 7 swatches + min/max]  [twin + toggle]  [tooltip]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `data` | `readonly ChartDatum[]` | required | one row per cell. A missing x×y combination shows the surface. A `null` value is an **absent** cell (shown as — in the twin), never a zero |
| `x` | `ChartXAxis` | required | `band` or `time`-labeled band |
| `y` | `HeatmapYAxis` | required | band rows, top-down in first-seen order |
| `value` | `HeatmapValue` | required | the measure: key + optional format |
| `size` | `ChartSize` | `'md'` | frame heights per `bar-chart.md`'s recipe |
| `label` | `string` | required | |
| `locale` | `string` | — | |
| `tooltip` | `ChartTooltipConfig \| false` | on, `'dot'` | per-cell: x, y, formatted value |
| `onSelect` | `(selection: { x: string \| number; y: string \| number; value: number }) => void` | — | reports activation at the reading position, with the member's payload. Enter/Space activate, so it is never pointer-only |
| `loading` | `boolean` | `false` | |
| `messages` | `ChartMessages` | English | the tier's string catalog (`docs/charts.md`). This member uses `heatmapSummary` (the grid's shape, omitted until there is a grid to count), `activationHint` (with `onSelect`), `empty`, `noData` (an absent cell), `quarter` (the label of a dated x column at quarter granularity, such as `Q3`, or `T3` for a French host, used on the column ticks, the twin's headings, the tooltip header and the live region) and the twin's three (`showTable`, `hideTable`, `tableLabel`). All keys or none, and the same object goes to every chart on the screen. Omitting it keeps the generic English |

```ts
interface HeatmapYAxis {
  key: string
  label?: string
}

interface HeatmapValue {
  key: string
  format?: ValueFormat
}
```

Attributes: `data-size`, `data-state="loading" | "empty"` on the frame;
`data-active` on the hovered/read cell.

Values **quantize to the seven emitted steps** (`--pm-chart-seq-1…7`, equal-width bins over
the data's extent). The tokens are the whole palette, because interpolating between them would
create colours no law has checked. Near-zero values fade toward the surface in both modes by
design (the viz ladder's anchor flip).

**Diverging on signed data**: automatic when the measure has a sign, following the BarChart
precedent. Showing polarity is then required, so it is not a prop. The range is **symmetric**,
`[-A, +A]` with `A = max(|lo|, |hi|)`, so equal magnitudes get equal intensity. There are still
seven steps, on the arms: three equal-width magnitude bins per side (`--pm-chart-neg-3..1`
below, `--pm-chart-pos-1..3` above) around `--pm-chart-mid`. **Mid means exactly zero.**
Near-zero values use arm 1, because the mid states a value, not a shade. The scale legend
switches to its diverging variant (recipe below). The axes, gaps, twin and absent-cell rules
are unchanged.

**Neither axis `label` is drawn.** `ChartAxis` places an axis name at the end of the axis,
which on a grid is where a band label already sits, so "Jul 14" and "Date" would overlap.
`ChartAxis`'s own doc also says most charts do not need one, because the panel title does the
job better. The labels are still used: `y.label` heads the twin's first column, which is where
a reader who needs the axis name looks for it.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| cell fill | `--pm-chart-seq-1` … `--pm-chart-seq-7` by bin; signed data: `--pm-chart-neg-3..1` · `--pm-chart-mid` (zero exactly) · `--pm-chart-pos-1..3` by signed bin |
| cell separation | 2px surface gap on both axes. The gaps form the grid; no gridlines, no strokes |
| cell shape | corner radius 4px via the engine's `BAR_END_RADIUS`, the shared mark-spec constant |
| scale legend | a row of the 7 swatches (each `--pm-chart-seq-N`, 2px gaps, same radius) · min and max labels in `text.xs` quartet · `--pm-text-muted` · `--pm-font-numeric`. Replaces the series legend |
| scale legend, diverging | `ChartScaleLegend`'s diverging variant: **two arm strips + a mid swatch** (`--pm-chart-neg-3..1` · `--pm-chart-mid` · `--pm-chart-pos-1..3`, same gaps and radius) · **three labels — min · zero · max** — same quartet and tokens as above |
| hover/active lift | the `[data-active]` cell gets a 2px ring in `--pm-bg-surface` plus a 1px `--pm-chart-axis` outline outside it (the surface-ring mechanic at cell scale) |
| hit area | the cell plus its gaps, floored at `HIT_TARGET_MIN` |
| empty state | copy: **"No activity in this range"**, the English default of `messages.empty`. A localized host's catalog replaces it |

## States

1. **the support week** — Relay ticket volume, weekday × hour-band: y
   `Mon…Sun`, x `00–04 · 04–08 · … · 20–24`, a realistic surge Tue–Thu
   10:00–16:00 (values 0–58)
2. **compact format** — the same grid with thousands-scale values and
   `{ style: 'compact' }`
3. **sparse** — a new product's first fortnight: most cells absent, a few with values
   (absence must look like surface, not bin 1)
4. **time-labeled x** — daily columns, `format: { style: 'date', granularity: 'day' }`
5. **empty** — `data={[]}` · 6. **loading** · 7. **tooltip off**
8. **diverging** — staffing delta vs plan, weekday × shift: signed
   values (−6…+8), the symmetric range, one exact zero using the mid, and
   the diverging scale legend (min · zero · max)
9. **selectable** — the support week with `onSelect`: the summary names the activation, and an
   agent can pick a cell (Agent, below)

`requiredSelectors`: `[data-state='empty']`, `[data-state='loading']`,
`[data-active]`, `:focus-visible`.

## Motion

`chart.frame` only: cells appear with the frame's fade. A cell-by-cell stagger across a grid
would look like an unwanted shimmer. The stagger is for series, and a heatmap has none.

## Icons

`table` (twin toggle).

## A11y

The plot is one focus stop. Arrow keys move through cells in reading order (Left/Right along
x, Up/Down along y) and announce "x, y: value" politely. The twin is the same grid as a real
`Table`, with a row per y and a column per x. It is mandatory because the ramp's light steps
are below 3:1 (the relief rule, applied structurally). Colour is never the only channel:
position shows where, and the twin shows how much. With `onSelect`, Enter/Space activate at the
reading position and the summary sentence mentions the activation; `role="img"` remains.

## Agent

A Heatmap with `onSelect` is listed for an agent, named by its `label`; without `onSelect` a person
has nothing to pick, so it registers nothing. `items` lists the cells a person can pick, in the
order the keys walk them: column by column, and in a column each row. A cell's label is what the
live region says with the reading on it: its column, its row and its value. Its id is its place in
the reading: the column's index, then the row's after a colon (`4:2`), or the column's alone on a
grid of one row. An absent cell reports nothing, so it is not listed.

A chart with more cells than the engine's `CHART_MARK_CAP` lists a window of them: the whole
columns around the reading position, at most the cap in all, or from the first column while nothing
is read. `position` is the column the reading is on, the number a cell's id starts with, or `null`
while nothing is read. The figure shows it as `data-position`, and a person's keys and pointer move
it as an agent's `read` does. `count` is how many columns the chart has. `read` moves the reading
to a column as Left and Right do, so the tooltip and the live region show it and the window
follows. It calls nothing, and a number that is not the index of a column throws. A week of hours
lists whole columns of seven cells. The row a person walked to with Up and Down stays when the
reading moves.

`choose` moves the reading to a listed cell and activates it as Enter does, so `onSelect` receives
what a person's press there reports, and the tooltip and the live region show the cell. The table
twin's toggle is a Button of its own, listed within the chart.

```agent
state items choices when selectable
state position number as root data-position when selectable
state count number when selectable
action read number sets position when selectable
action choose id calls onSelect when selectable
```
