# Histogram

A chart of how one sample is distributed: it takes raw observations and draws bars over a
continuous scale. Use it to show how values are spread.

It is **not** a BarChart. A BarChart compares *named* things across a band, while a
histogram's x is a continuous measure and its bars are bins the member computes. This is the
form BarChart's `time`/`linear` warning points to. It is not a Heatmap either (one axis of
magnitude, not a grid). It uses the shared `ChartFrame`, and its grammar types are the tier's
(`docs/charts.md`), except where the input requires otherwise (below).

**The input is a sample, not rows.** `data` is `readonly number[]`. It is the only member whose
input is not `ChartDatum[]`. The rows-and-columns grammar describes data already shaped for
reading, and a histogram's data has no shape yet: the *shape is the result*. So binning is the
member's job, using `d3-array.bin`; the library computes and the member decides
(`README-substrates.md` §9). This does not break "the chart never reorders", because bins are
positions on a scale, not rows, and the sample's order carries no information.

## Anatomy

```
[ChartFrame]
  [plot: gridlines (count axis only) · zero-baseline rule · contiguous bin
         bars, 2px surface gaps, 4px rounded data-end]
  [y axis] [x axis]  [twin + toggle]  [tooltip]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `data` | `readonly number[]` | required | the raw observations, unbinned and in any order; `[]` renders the empty state |
| `bins` | `number` | Sturges | a **target** count. d3's Sturges default (⌈log₂ n⌉ + 1); `d3-array.bin` may adjust it to round thresholds, as with tick counts |
| `x` | `HistogramXAxis` | — | the measure's own axis: `label` names it, `format` formats edges and bin ranges. It is not a `ChartXAxis`: there is no `key` (the sample *is* the column) and no `scale` choice (it is always linear). Ticks sit at bin edges, thinned to round steps |
| `y` | `ChartYAxis` | — | the count axis, **always zero-anchored**, because a truncated bar misrepresents counts too. `domain: 'auto'` triggers a dev warning and is ignored (BarChart's rule) |
| `size` | `ChartSize` | `'md'` | frame heights per `bar-chart.md`'s recipe |
| `label` | `string` | required | the accessible name |
| `locale` | `string` | — | `Intl` formats |
| `tooltip` | `ChartTooltipConfig \| false` | on, `'dot'` | per-bin: the range and its count |
| `onSelect` | `(selection: { bin: { from: number; to: number; count: number } }) => void` | — | reports activation at the reading position, with the bin's edges and count as the member's payload. Enter/Space activate, so it is never pointer-only |
| `loading` | `boolean` | `false` | refetch holds the previous frame at reduced opacity |
| `messages` | `ChartMessages` | English | the tier's string catalog (`docs/charts.md`). This member uses `summary` (with no series list, because a sample has none), `activationHint` (with `onSelect`), `empty`, the twin's three (`showTable`, `hideTable`, `tableLabel`), and the twin's two headings when the axes do not name them: `rangeColumn` as the fallback for `x.label`, `countColumn` for `y.label`. All keys or none, and the same object goes to every chart on the screen. Omitting it keeps the generic English |

```ts
interface HistogramXAxis {
  label?: string
  format?: ValueFormat
}
```

Attributes: `data-size`, `data-state="loading" | "empty"` on the frame;
`data-active` on the bin under the reading position.

No `series`: a histogram has one measure and no series (as in Heatmap). So there is one
paint, **slot 1**, the first slot on the wheel, and no legend; the panel title names the
sample. To compare two samples, use two histograms (small multiples are a layout of members,
not a member).

**Bin labels — the "[a, b)" cell.** A bin is labelled as the en-dash range **"a–b"** (both
edges through `x.format`) in the tooltip and the twin. Every bin is half-open [a, b) except
the last, which is closed [a, b]. These are `d3-array.bin`'s own semantics, kept unchanged, so
the sample's maximum falls in the last bin instead of creating an empty one. The reader does
not need the half-open detail: the drawn bars share edges, the labels share endpoints, and a
value on a shared edge counts once, in the bin to its right.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| bar fill | `--pm-chart-1`, the single-series paint: a slot reference, never a colour |
| bar layout | **contiguous**: no band padding, no ≤ 24px thickness cap. The **2px surface gap is the only separator**, because a bin shares its edges with its neighbours, and space between bins would suggest categories the axis does not have |
| data-end | 4px rounded, **square at the baseline**: the engine's `BAR_END_RADIUS`, following Progress's rule that data ends are rounded in every geometry |
| gridlines | `--pm-chart-grid` · 1px solid hairline · count axis only |
| zero baseline | `--pm-chart-axis` · 1px solid, the only axis stroke |
| hover/active lift | as `bar-chart.md`: the active bin keeps full opacity, other bars ease to opacity 0.8 over `--pm-motion-duration-control` × `--pm-motion-easing-standard` |
| hit area | the bin's full width through the plot, floored at `HIT_TARGET_MIN` (24px) |
| empty state | copy: **"No data yet"**, the English default of `messages.empty`. A localized host's catalog replaces it |

## States

Exemplar data is Relay's. Entries:

1. **first-response minutes** — one week's sample (n ≈ 240, most under 10,
   a shoulder to 45), Sturges bins (the kind of shape this chart is for)
2. **skewed** — resolution hours with a long right tail (most under 4, a tail
   to 72): the asymmetry a mean would hide
3. **few points** — n = 14 (Sturges gives ~5 bins; small samples are shown as they are, not
   smoothed)
4. **bins override** — the first sample at `bins={20}` (a finer view)
5. **format** — order values with
   `x: { format: { style: 'currency', currency: 'USD' } }` (bin ranges as
   "$0–$25")
6. **empty** — `data={[]}` (expect `data-state="empty"`)
7. **loading** — with data (expect `data-state="loading"`)
8. **tooltip off** — `tooltip={false}`
9. **selectable** — the first sample with `onSelect`: the summary names the activation, and an
   agent can pick a bin (Agent, below)

`requiredSelectors`: `[data-state='empty']`, `[data-state='loading']`,
`[data-active]`, `:focus-visible`.

## Motion

`chart.frame` (fade on mount) + `chart.marks`: bars `scaleY` from the zero
line, staggered by `--pm-motion-stagger-step/max`, as in `bar-chart.md`. Value changes
re-render without a draw-on animation. Reduced motion and `none`: no animation.

## Icons

`table` — the twin toggle.

## A11y

As `bar-chart.md`: the plot is one focus stop, and Left/Right move through bins in axis order,
announcing "a–b: count" politely. Up and Down are not the chart's, because a sample has one
series. The twin is a `Table` of range · count with the same bins
and en-dash labels, so every value is reachable without hover. With `onSelect`, Enter/Space
activate at the reading position and the visually hidden summary mentions the activation;
`role="img"` remains. Colour never identifies anything, because there is only one series.
Position carries the meaning, and the twin carries the numbers.

## Agent

A Histogram with `onSelect` is listed for an agent, named by its `label`; without `onSelect` a
person has nothing to pick, so it registers nothing. `items` lists the bins, in order along the x
axis. A bin's label is what the live region says with the reading on it: its range and its count.
Its id is its index (`3`).

A chart with more bins than the engine's `CHART_MARK_CAP` lists a window of them: the whole bins
around the reading position, at most the cap in all, or from the first bin while nothing is read.
`position` is the bin the reading is on, the number a bin's id starts with, or `null` while nothing
is read. The figure shows it as `data-position`, and a person's keys and pointer move it as an
agent's `read` does. `count` is how many bins the chart has. `read` moves the reading to a bin as
Left and Right do, so the tooltip and the live region show it and the window follows. It calls
nothing, and a number that is not the index of a bin throws.

`choose` moves the reading to a listed bin and activates it as Enter does, so `onSelect` receives
what a person's press there reports, and the tooltip and the live region show the bin. The table
twin's toggle is a Button of its own, listed within the chart.

```agent
state items choices when selectable
state position number as root data-position when selectable
state count number when selectable
action read number sets position when selectable
action choose id calls onSelect when selectable
```
