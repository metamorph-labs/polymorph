# AreaChart

AreaChart shows part-to-whole composition over time as stacked bands, with a
percent variant that normalises each x to 100%. Use it to show what a total is
made of and how that changes.

It is **not** a multi-line trend chart (use LineChart, because strokes do not
stack) and not a snapshot share (use DonutChart). It uses the shared `ChartFrame`,
and its grammar types are the tier's (the engine's `charts/types.ts`, `docs/charts.md`).

## Anatomy

```
[ChartFrame]
  [plot: gridlines (value axis) · stacked washes at ~10% alpha ·
         2px band-edge strokes · 2px surface gaps between bands · crosshair]
  [y axis] [x axis]  [legend (derived)]  [twin + toggle]  [tooltip]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `data` | `readonly ChartDatum[]` | required | rows in given order; a `null` renders that series' band **absent** at that x, never as zero |
| `series` | `readonly ChartSeries[]` | required | 2–8. One series is LineChart's `area` variant, and a dev-warning says so |
| `x` | `ChartXAxis` | required | `band` or `time` |
| `y` | `ChartYAxis` | — | stacking anchors at zero; `domain: 'auto'` is a dev-warning and ignored. In `percent` the axis formats as percent automatically. `label` names the measure the values are in, which the summary sentence says once (`docs/charts.md`); no axis title is drawn |
| `variant` | `'stacked' \| 'percent'` | `'stacked'` | `percent` normalizes each x to 100% (`stackOffsetExpand`) |
| `size` | `ChartSize` | `'md'` | frame heights per `bar-chart.md`'s recipe |
| `label` | `string` | required | |
| `locale` | `string` | — | |
| `tooltip` | `ChartTooltipConfig \| false` | on, `'dot'` | every series at the reading position; in `percent` the readout shows value **and** share |
| `emphasis` | `string` | — | one band keeps its slot; the rest use `--pm-chart-other` |
| `baseline` | `ChartBaseline` | — | `stacked` only: a target against the total. It has no meaning in `percent` (dev-warning, not drawn). Shorthand for an `annotations` entry, and their first consumer |
| `annotations` | `readonly ChartAnnotation[]` | — | the tier's closed union per `line-chart.md`: line/band/point literals, band fill `--pm-chart-other` at 0.08 alpha with hairline `--pm-chart-axis` edges. Annotations never re-centre colour, and colliding end-labels are dropped. Values use the member's own y domain, which is ratios in `percent` |
| `onSelect` | `(selection: { index: number; datum: ChartDatum }) => void` | — | reports the reader's activation at the reading position, with the member's own payload shape. Enter/Space also activate, so it is never pointer-only |
| `onBrushEnd` | `(range: [string, string] \| [number, number]) => void` | — | `time`/`linear` x only. Here that means `time`, because this member takes no `linear` x and a band axis has no continuum. The brush is an **input device**: it sends a committed range to app state and never filters the chart itself. `FilterBar` still owns and displays the range. Emits ISO strings, on commit only. Keyboard and paint per `line-chart.md` |
| `syncId` | `string` | — | syncs the reading position across sibling charts. The broadcast is the **x-domain value**, never the row index. `time`/`linear` only, as for the brush. Escape/blur clears the whole group. Registry semantics per `line-chart.md` |
| `loading` | `boolean` | `false` | |
| `messages` | `ChartMessages` | English | the tier's string catalog and its localization point (`docs/charts.md`). This member uses `summary`, `activationHint` (with `onSelect`), `empty`, `noData` (a gap, in the tooltip and the live region), `quarter` (the quarter label on a quarterly date axis, such as `Q3`, or `T3` for a French host, used on the ticks, the twin's first column and the live region) and the twin's three keys (`showTable`, `hideTable`, `tableLabel`). Pass all keys or none, and pass the same object to every chart on the screen. Omitting it keeps the generic English |

Attributes: `data-size`, `data-state="loading" | "empty"` on the frame;
`data-variant` on the marks layer; `data-active` at the reading position.

**Legend toggle-to-isolate** is on by default at ≥ 2 series, with state owned by
the member. Legend keys become real buttons with `aria-pressed`. A series toggled
off leaves the stack, and the bands above it re-stack on the remaining total. The
stack is a sum, so removing a term gives a different sum; redrawing it is
accurate, and leaving a hole would not be. The **twin never hides data**: it
always receives the unfiltered set. The y domain **refits** on isolate. Emphasis
combines with it: hiding removes a series, and `emphasis` greys what remains. A
status-toned series may be *hidden* but never greyed. `docs/charts.md` decides the
hidden key's treatment once, for every member with a legend.

Stacking order is series declaration order, bottom-up, so the first series sits on
the baseline. Negative values cannot stack correctly. A dev-warning points to the
Likert form, BarChart `mode: 'diverging'`, and negative rows render absent from
the stack. They still appear in the twin, so data is never silently clamped, and
the warning says where it went.

**The trigger is *any* negative value, not only mixed signs.** A band runs upward
from the total beneath it, so a negative band runs *down* through the band below
and paints a quantity that does not exist. That is true whether or not the chart
has any positive values. So an all-negative dataset produces a stated reason
instead of a silently empty plot.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| band fill | series `paint` at opacity 0.1, a wash and never a solid block |
| band edge | series `paint` · 2px stroke, monotone-x, round join. The edge is the series' line, so a stacked area reads as weighted lines |
| band separation | 2px surface gap between touching bands (the stack's segments), never a stroke between fills |
| crosshair / gridlines / zero rule / brush selection | as `line-chart.md` |
| hover/active | crosshair sets `data-active`; bands never dim, because the readout shows the composition |
| percent axis | y ticks via `{ style: 'percent' }`. Values are ratios, and the formatter does the ×100 |
| empty state | copy: **"No data in this range"**, the English default of `messages.empty`. A localized host's catalog replaces it |

Legend `keyShape="rect"`, because the band is a fill.

## States

1. **backlog composition** — open tickets by priority (urgent/high/normal) over 8
   ISO weeks, slots 1–3, modelled on Relay's queue
2. **percent** — the same data, `variant="percent"` (the shares view)
3. **absent band** — chat volume `null` for two weeks mid-range (the band drops
   out and returns; the twin shows the gap)
4. **emphasis** — `emphasis="urgent"`
5. **max series** — 8 bands (busy on purpose; the legend and twin make it
   readable)
6. **baseline** — stacked + `baseline={{ value: 120, label: 'Capacity' }}`
7. **time scale** — daily, 30 days, `scale: 'time'`
8. **empty** · 9. **loading** · 10. **tooltip off**
11. **selectable** — the backlog with `onSelect`: the summary names the activation, and an
    agent can pick a week (Agent, below)
12. **brushable** — the daily backlog with `onBrushEnd` on the time x: a person, or an agent,
    brushes a range of days (Agent, below)

`requiredSelectors`: `[data-state='empty']`, `[data-state='loading']`,
`[data-variant='percent']`, `[data-active]`, `[aria-pressed='false']` (the hidden
legend key when a series is isolated, per `line-chart.md`'s note on the legend
sheet), `:focus-visible`.

## Motion

`chart.frame` + `chart.marks`: washes and edges enter by opacity, staggered
bottom-up in stacking order. No draw-on; value changes re-render.

## Icons

`table` (twin toggle) · series `icon` beside the legend key.

## A11y

As `line-chart.md`. The percent variant's twin shows both value and share in each
cell, so the normalised view is never the only one.

## Agent

As `line-chart.md`: an AreaChart is listed for an agent, named by its `label`, while a person has
something to operate in it: `onSelect`, a legend (two or more series) or a brush (`onBrushEnd` on a
`time` x). `items` lists the rows along the x axis, each labelled with what the live region says
with the crosshair on it and identified by its index (`3`), and is empty without `onSelect`. A chart
with more rows than the engine's `CHART_MARK_CAP` lists the rows around the crosshair, at most the
cap, or from the first row while nothing is read. `position` is the crosshair's row, or `null` while
nothing is read, as the figure's `data-position` shows it, and `count` is how many rows the chart
has. `read` moves the crosshair to a row as Left and Right do, calls nothing, and throws for a
number that is not a row's index. `choose` moves the crosshair to a listed row and activates it as
Enter does, so `onSelect` receives what a person's press there reports.

An agent builds a range with the brush through the machine a person's keys drive. `range-start` and
`range-end` are the range a person sees drawn, in rows, the unit `position` uses: the row the range
was begun on and the row it ends on, in the order it was built, committed or not, and `null` while
there is none. `brush` takes the row the range ends on, builds the range with Shift and the arrow
keys as a person does, and commits it as Enter does, so `onBrushEnd` receives what a person's
committed range reports. The range starts where a person's would: where a range a person has begun
and not committed starts, else at the reading position, which an agent sets with `read`. With
nothing read it starts at an end, as a person's first Shift and arrow lands there: the first row for
a range that runs right, the last for one that runs left. `brush` throws for a number that is not a
row and for a range that would start and end on one row, which a person cannot commit. A chart
without `onBrushEnd`, or with an x it does not brush (a band, or a linear x, which this member does
not take), has no brush: both states are `null`, and `brush` throws, saying why. A person clears a
range with Escape, which calls no handler, and the chart draws the range as a wash with no attribute
that names its rows, so a fence could state nothing a clear changes: an agent has no action that
clears a range, and the next range replaces it.

`series` lists the legend's keys, in the legend's order: a series' id is its `key`, and its label is
what its key says. `hidden` lists the ids of the series now hidden. `toggle` presses the key of the
series an id names with the key's own click, as a person's press does: a shown series is hidden and
a hidden one is shown, and the bands above it restack on the total left showing. An agent reads
`hidden` to know which way a press goes. Every series can be hidden, and the table twin keeps them
all. A chart with one series draws no legend, so `series` and `hidden` are empty there. The table
twin's toggle is a Button of its own, listed within the chart.

```agent
state items choices when selectable
state position number as root data-position when selectable
state count number when selectable
state series choices when backlog composition
state hidden ids when backlog composition
state range-start number when brushable
state range-end number when brushable
action read number sets position when selectable
action choose id among items calls onSelect when selectable
action toggle id among series presses key when backlog composition
action brush number sets range-end calls onBrushEnd when brushable
```
