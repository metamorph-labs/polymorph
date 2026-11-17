# LineChart

A multi-series line chart for change over time, with an area variant that adds a light fill. It
is **not** for part-to-whole over time (use AreaChart's stacking) and not a Sparkline (inline, one
series, no axes).

It uses the shared `ChartFrame`, and its grammar types are the tier's
(the engine's `charts/types.ts`, `docs/charts.md`).

## Anatomy

```
[ChartFrame]
  [plot: gridlines (value axis) · 2px strokes, monotone-x, round join/cap ·
         ~10%-alpha wash (area variant) · ≥8px markers with 2px surface ring ·
         selective end-labels · crosshair]
  [y axis] [x axis]  [legend (derived, ≥2 series)]  [twin + toggle]  [tooltip]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `data` | `readonly ChartDatum[]` | required | rows in the given order; `null` is a **gap**: the line breaks instead of dropping to zero |
| `series` | `readonly ChartSeries[]` | required | 1–8; slots by declaration order |
| `x` | `ChartXAxis` | required | `band`, `time` (ISO strings; date-only strings are calendar dates with no timezone shift) or `linear` |
| `y` | `ChartYAxis` | — | `domain` defaults to `'auto'`, so lines fit the data; `'zero'` anchors the axis at zero |
| `variant` | `'line' \| 'area'` | `'line'` | `area` adds a fill in the series hue at ~10% alpha, light enough not to read as a solid block |
| `markers` | `boolean` | `false` | ≥ 8px point dots with the 2px surface ring; a second channel besides colour, for CVD readers and print |
| `curve` | `'monotone' \| 'step'` | `'monotone'` | step is **`curveStepAfter`**, because a measurement holds until the next one. `'linear'` stays engine-internal |
| `size` | `ChartSize` | `'md'` | frame heights per `bar-chart.md`'s recipe |
| `label` | `string` | required | the accessible name |
| `locale` | `string` | — | `Intl` formats |
| `tooltip` | `ChartTooltipConfig \| false` | on, `'dot'` | the crosshair readout lists **every** series at the reading position |
| `emphasis` | `string` | — | one series keeps its slot colour and the rest use `--pm-chart-other`; the lawful way to make a chart easier to read |
| `baseline` | `ChartBaseline` | — | a drawn reference line; shorthand built on `annotations`, and its first consumer |
| `annotations` | `readonly ChartAnnotation[]` | — | the closed union: `{ kind: 'line'; value; label? }` \| `{ kind: 'band'; from; to; label? }` \| `{ kind: 'point'; x; y; label }`; literals only, so screen specs can express them. Band fill `--pm-chart-other` at 0.08 alpha (a neutral de-emphasis fill with no sentiment) with hairline `--pm-chart-axis` edges; like a baseline, a band never re-centers colour. Colliding end-labels are dropped, because the annotation is what the app explicitly asked for. One shared presentational `frame/ChartAnnotations` layer draws in px space: members map values, and the frame never sees scales |
| `onSelect` | `(selection: { index: number; datum: ChartDatum }) => void` | — | reports activation at the reading position, with the member's own payload shape; Enter/Space activate too, so it is never pointer-only |
| `onBrushEnd` | `(range: [string, string] \| [number, number]) => void` | — | `time`/`linear` x only, because a band scale is not continuous. The brush is an **input device**: it sends a committed range to app state and never filters the chart itself. `FilterBar` still owns and displays the range. Emits ISO strings for `time` and numbers for `linear`; fires on commit only |
| `syncId` | `string` | — | syncs the reading across sibling charts through a module-scope registry (no provider, so the frame stays uncomposable), client-only, with effect-scoped subscriptions. It broadcasts the **x-domain value**, never the row index, and each receiver maps it through its own scale, so positions that do not match exactly stay correct. `time`/`linear` only, like the brush. Escape or blur clears the whole group, because a group shares one reading |
| `loading` | `boolean` | `false` | refetch holds the previous frame at reduced opacity |
| `messages` | `ChartMessages` | English | the tier's catalog, the localization seam (`docs/charts.md`). This member uses `summary`, `activationHint` (with `onSelect`), `empty`, `noData` (a gap, in the tooltip and the live region), `quarter` (the quarter label on a quarterly date axis, e.g. `Q3`, or `T3` for a French host, on the ticks, the twin's first column and the live region) and the twin's three (`showTable`, `hideTable`, `tableLabel`). Pass all keys or none, and pass the same object to every chart on the screen; omitting it keeps the generic English |

Attributes: `data-size`, `data-state="loading" | "empty"` on the frame;
`data-variant` on the marks layer; `data-active` on the marker under the
reading position.

**Legend toggle-to-isolate**: on by default at ≥ 2 series, with state owned by the member. The
legend's keys become real buttons with `aria-pressed`, and pressing one removes its series from
the plot. The **twin never hides data**. The structure guarantees this: the twin receives the
unfiltered set, and the palette laws rely on that. The y domain **refits** when a series is
hidden, because changing the view is the purpose. Emphasis combines with it: hiding removes a
series, and `emphasis` greys what remains. A status-toned series may be *hidden* but never
greyed, because removing it is unambiguous and greying a status colour is not. The hidden key's
styling is defined once, for every member with a legend, in `docs/charts.md`.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| stroke | the series `paint` (`var(--pm-chart-N)`) · **2px** (structural literal) · round join, round cap · monotone-x curve (`d3-shape`, ratified in `README-substrates.md` §9) |
| area wash | the series `paint` at opacity 0.1; its edge is the 2px stroke |
| markers / end-dots | r 4 (8px) filled with `paint` · **2px ring in `--pm-bg-surface`**, so markers stay legible where lines cross; the ring is part of the hit target |
| end-labels | **selective, never a number on every point**: the endpoint value, placed with the engine's `labelCapacity`/`estimateTextWidth`. Colliding end-labels fall back to legend + tooltip; they are never nudged into a stack. The label sits above its endpoint, and below it where the plot has no room above (an endpoint at the top of the domain), because the plot cuts what is drawn past its edge. `text.xs` quartet · `--pm-text-secondary` · `--pm-font-numeric` |
| crosshair | `--pm-chart-axis` · 1px solid hairline, snapped to the nearest x position |
| brush selection | the active/committed range fills `--pm-selection-bg` with 1px `--pm-selection-border` edges, from `SELECTION_ROLES`; no new tokens |
| gridlines / zero rule / baseline | as `bar-chart.md` |
| hover/active lift | the crosshair position sets `data-active` on that x's markers, whose surface ring thickens 2 → 3px. Other marks do not change; lines never dim on hover, because the readout lists all series |
| hit area | the crosshair tracks the whole x axis, so the whole plot is the target |
| empty state | copy: **"No data in this range"**, the English default of `messages.empty`; a localized host's catalog replaces it |

Legend `keyShape="line"`, so the key matches the mark.

## States

1. **the Relay pair** — tickets opened vs resolved by day, 30 days of ISO dates
   (`x: { key: 'day', scale: 'time' }`), slots 1/2. This is the chart on Relay's dashboard, so
   the fixture matches the product screen
2. **single series area** — open backlog, `variant="area"`
3. **markers** — the pair + `markers` (shows the print/CVD channel)
4. **gap** — a `null` week mid-series: the line breaks and the twin shows the missing value
5. **band-of-dates** — monthly totals, `x: { key: 'month', format: { style: 'date', granularity: 'month' } }` ("2026-08-01" → "Aug")
6. **emphasis** — four teams' resolution times, `emphasis="Escalations"`
7. **baseline** — first-response minutes vs `baseline={{ value: 30, label: 'SLA' }}`
8. **max series** — 8 lines (the legend and tooltip name the series)
9. **status-toned** — error-rate series `tone="danger"` beside a categorical
10. **y currency** — `{ style: 'currency', currency: 'USD' }` weekly refunds
11. **empty** · 12. **loading** · 13. **tooltip off** — as `bar-chart.md`
14. **selectable** — the Relay pair with `onSelect`: the summary names the activation, and an
    agent can pick a day (Agent, below)
15. **brushable** — tickets opened by day with `onBrushEnd` on the time x: a person, or an agent,
    brushes a range of days (Agent, below)

`requiredSelectors`: `[data-state='empty']`, `[data-state='loading']`,
`[data-active]`, `[aria-pressed='false']` (the hidden legend key; its styles are in the
legend's own sheet, which is in the member's `composes` closure so the selectors law can see
it), `:focus-visible`.

`[data-variant='area']` is deliberately not on the list, for the reason `bar-chart.md` gives about
`[data-mode]`. It adds a **mark** (the fill path) instead of changing how any mark is painted, so
no rule keys off it. The attribute ships, and `line-chart.test.tsx` asserts it.

## Motion

`chart.frame` + `chart.marks`: strokes and area fills enter by **opacity only**. There is no
draw-on animation, because the restraint law already rules out a `stroke-dashoffset` flourish.
Markers may scale in with the stagger. Value changes re-render.

## Icons

`table` (twin toggle) · series `icon` beside the legend key.

## A11y

As `bar-chart.md`, with the crosshair as the keyboard reading position. Left/Right move along
x, the readout announces politely, and the twin holds the same values. The area fill never
carries meaning alone; the stroke is the mark.

Brush keyboard: **Shift+Arrows** extend a range from the reading position, and **Enter** commits
it (`onBrushEnd` fires on commit only). **Escape is two-stage**: the first press cancels an
active brush, the second clears the reading. With `onSelect`, Enter/Space activate at the reading
position, and the visually hidden summary describes the activation. `role="img"` stays unless axe
reports a problem.

## Agent

A LineChart is listed for an agent, named by its `label`, while a person has something to operate in
it: `onSelect`, a legend (two or more series) or a brush (`onBrushEnd` on a `time` or `linear` x).
`items` lists the rows a person can pick, in order along the x axis, and is empty without
`onSelect`, because a person has nothing to pick. A row's label is what the live region says with
the crosshair on it: the x value and every showing series' value. Its id is the row's index (`3`).

A chart with more rows than the engine's `CHART_MARK_CAP` lists a window of them: the whole rows
around the reading position, at most the cap in all, or from the first row while nothing is read.
`position` is the row the reading is on, the number a row's id starts with, or `null` while nothing
is read. The figure shows it as `data-position`, and a person's keys and pointer move it as an
agent's `read` does. `count` is how many rows the chart has. `read` moves the reading to a row as
Left and Right do, so the tooltip and the live region show it and the window follows. It calls
nothing, and a number that is not the index of a row throws.

`choose` moves the crosshair to a listed row and activates it as Enter does, so `onSelect` receives
what a person's press there reports, and the tooltip and the live region show the row. Charts that
share the `syncId` follow the crosshair after a `read` or a `choose`, as they follow a person's.

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
without `onBrushEnd`, or with an x it does not brush (a band), has no brush: both states are `null`,
and `brush` throws, saying why. A person clears a range with Escape, which calls no handler, and the
chart draws the range as a wash with no attribute that names its rows, so a fence could state
nothing a clear changes: an agent has no action that clears a range, and the next range replaces it.

`series` lists the legend's keys, in the legend's order: a series' id is its `key`, and its label is
what its key says. `hidden` lists the ids of the series now hidden. `toggle` presses the key of the
series an id names with the key's own click, as a person's press does: a shown series is hidden and
a hidden one is shown, and the y domain refits to the series left showing. An agent reads `hidden`
to know which way a press goes. Every series can be hidden, and the table twin keeps them all. A
chart with one series draws no legend, so `series` and `hidden` are empty there. The table twin's
toggle is a Button of its own, listed within the chart.

```agent
state items choices when selectable
state position number as root data-position when selectable
state count number when selectable
state series choices when the Relay pair
state hidden ids when the Relay pair
state range-start number when brushable
state range-end number when brushable
action read number sets position when selectable
action choose id among items calls onSelect when selectable
action toggle id among series presses key when the Relay pair
action brush number sets range-end calls onBrushEnd when brushable
```
