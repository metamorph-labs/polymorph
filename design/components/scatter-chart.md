# ScatterChart

A scatter chart for the correlation between two measures. Each mark is one observation placed by
its x and y values, and a bubble mode encodes a third value as mark **area**.

Use it to show whether two measures move together. It is **not** a LineChart (nothing is
connected, because the rows are observations, not a sequence) and not a BarChart (nothing is
measured by length from zero). It is an **any-neighbour form**: any two marks can land next to
each other, so the series limit is the palette's all-pairs cap, not the colour wheel's eight
slots. It uses the shared `ChartFrame`, and its grammar types are the tier's
(the engine's `charts/types.ts`, `docs/charts.md`).

## Anatomy

```
[ChartFrame]
  [plot: gridlines (both axes — both are value axes) · zero rules when in
         domain · 8px dots with 2px surface ring · bubble radii (sqrt scale)]
  [y axis] [x axis]  [legend (derived, ≥2 series)]  [twin + toggle]  [tooltip]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `data` | `readonly ChartDatum[]` | required | one row per observation; a `null` x, y or bubble value renders **no mark** at that row for that series (shown as — in the twin), never a zero |
| `series` | `readonly ChartSeries[]` | required | **≤ the palette's cap**. The member reads `--pm-chart-cap` (emitted by the theme at the mode minimum) and dev-warns beyond it, naming the rule: an any-neighbour form holds at most the slots that pass the all-pairs gates (3 canonical; carmine and orchid cap at 2 in dark, the measured caps, readable at runtime) |
| `x` | `ChartXAxis` | required | `linear` or `time`; an omitted `scale` defaults to `'linear'` here, not the grammar's `'band'`, because a scatter's x is a measure. `band` gives a dev warning naming BarChart, and the axis renders linear |
| `y` | `ChartYAxis` | — | `domain` defaults to `'auto'`, so the axis fits the data; `'zero'` anchors the axis at zero |
| `bubble` | `ScatterBubble` | — | bubble mode: mark **area** encodes `datum[bubble.key]` through a sqrt radius scale (`d3-scale`'s `scaleSqrt`, borrowed maths, `README-substrates.md` §9). Named `bubble`, not `size`, so that `size` means the frame on every member |
| `size` | `ChartSize` | `'md'` | frame heights per `bar-chart.md`'s recipe; the tier's single meaning of `size`, which is why the bubble prop is not called `size` |
| `label` | `string` | required | the accessible name |
| `locale` | `string` | — | `Intl` formats |
| `tooltip` | `ChartTooltipConfig \| false` | on, `'dot'` | **mark-as-target**: each mark has its own readout (discrete marks, not a crosshair), with x, y and bubble values formatted by their own `format`s |
| `annotations` | `readonly ChartAnnotation[]` | — | allowed; the tier's closed union per `line-chart.md` and `docs/charts.md` |
| `onSelect` | `(selection: { index: number; key: string; datum: ChartDatum }) => void` | — | reports activation at the reading position: row index, series key and the row itself. Enter/Space activate too, so it is never pointer-only |
| `loading` | `boolean` | `false` | refetch holds the previous frame at reduced opacity |
| `messages` | `ChartMessages` | English | the tier's catalog, the localization seam (`docs/charts.md`). This member uses `summary`, `activationHint` (with `onSelect`), `empty`, `noData` (a null value at the reading position), `quarter` (the quarter label on a quarterly `time` x, e.g. `Q3`, or `T3` for a French host, on the ticks and the twin's first column) and the twin's three (`showTable`, `hideTable`, `tableLabel`). Pass all keys or none, and pass the same object to every chart on the screen; omitting it keeps the generic English |

```ts
interface ScatterBubble {
  key: string
  label?: string // tooltip and twin column name — never derived from the key
  format?: ValueFormat
}
```

Attributes: `data-size`, `data-state="loading" | "empty"` on the frame;
`data-active` on the mark under the reading position.

No `emphasis`: an identity form capped at three series never needs it. The de-emphasis prop
exists for charts where the eye must find one line among eight, and this member cannot lawfully
have eight. Legend toggle-to-isolate (`docs/charts.md`) applies as on other charts: at ≥ 2 series
the keys are real buttons, the domains refit, and the twin never hides data.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| mark | filled circle, r 4 (**8px**, the line grammar's `MARKER_RADIUS`, used as the mark itself) in the series `paint` · **2px ring in `--pm-bg-surface`**, so marks stay legible where they overlap; the ring is part of the mark |
| bubble radius | `scaleSqrt` from the size column's extent, so **area** encodes the value (a linear radius would square the apparent differences). Min mark **8px** (the marker size; a smaller bubble no longer reads as a mark) and max **24px** (`HIT_TARGET_MIN`, so the largest mark is its own minimum hit target). Both diameters are fixed in the mark spec |
| hit area | nearest point in 2D via the engine's **naive scan**, clamped at `HIT_TARGET_MIN` (24px). This is fast enough at the tier's ≤ ~1k-point scale, so d3-delaunay is not added without a measured need |
| gridlines | `--pm-chart-grid` · 1px solid hairline on **both** axes; both are value axes, so this follows the value-axis-only rule (`docs/charts.md`) on each |
| zero rules | `--pm-chart-axis` · 1px solid; drawn per axis only when zero is inside that axis's domain, so with `domain: 'auto'` a plot may correctly have none |
| hover/active lift | the transient emphasis mechanism: the active mark's series stays at full strength, and other series ease to opacity 0.8 over `--pm-motion-duration-control` × `--pm-motion-easing-standard` |
| empty state | copy: **"No data yet"**, the English default of `messages.empty`; a localized host's catalog replaces it |

Legend `keyShape="rect"`, because a dot is a fill. Tick text, legend and tooltip recipes come from
the frame internals.

## States

The example data is Relay's. Entries:

1. **handle time vs CSAT** — one mark per agent (~24), x handle minutes
   (`linear`), y satisfaction; the kind of correlation this chart is for
2. **two teams** — the same measures split by team, slots 1/2 (the case that needs the legend)
3. **bubble** — + `bubble: { key: 'tickets', label: 'Tickets handled' }`; shows the
   sqrt scale between the 8px and 24px bounds
4. **cap warning** — four series (expect the dev warning naming
   `--pm-chart-cap` and the all-pairs rule; the plot still draws what it was
   given)
5. **dense** — ~500 points, one series, within the naive scan's declared range;
   marks stay 8px, and the twin lists every point
6. **time x** — deploys: date (`scale: 'time'`) vs incident minutes
7. **annotations** — a band (the CSAT target zone) + a line
8. **empty** — `data={[]}` · 9. **loading** · 10. **tooltip off**
11. **selectable** — handle time against CSAT with `onSelect`: the summary names the
    activation, and an agent can pick a point (Agent, below)

`requiredSelectors`: `[data-state='empty']`, `[data-state='loading']`,
`[data-active]`, `[aria-pressed='false']` (the hidden legend key; its styles are in the
legend's own sheet, which is in the member's `composes` closure so the selectors law can see
it), `:focus-visible`.

## Motion

`chart.frame` + `chart.marks`: dots enter by opacity and may scale in,
staggered by `--pm-motion-stagger-step/max` (the max limits the dense case).
No draw-on; value changes re-render. Reduced motion and `none`: instant.

## Icons

`table` (twin toggle) · series `icon` beside the legend key.

## A11y

As `bar-chart.md`, with the reading position moving between marks. Left/Right move through rows
in data order within the active series, and Up/Down switch series at the same row. The reading
starts on the first series, Up and Down do nothing until a mark is read, and they stop at the
first and the last series. Each move
announces "x, y (, bubble): series" politely. The twin is a `Table` of x · y (· bubble) per
series, so every point is available without hover. With `onSelect`, Enter/Space activate at the
reading position, and the visually hidden summary describes the activation. A position at which the
plot draws no point (a `null` x, y or bubble value) is still reached and announced, a `null` y with
the catalog's `noData` text, and a press there reports nothing. `role="img"` stays
unless axe reports a problem. Identity never relies on colour alone: the cap keeps adjacent slots
far apart, and the legend and twin carry the names.

## Agent

A ScatterChart is listed for an agent, named by its `label`, while a person has something to operate
in it: `onSelect`, or a legend (two or more series). `items` lists the points a person can pick, and
is empty without `onSelect`, because a person has nothing to pick. It lists them in the order the
keys walk them: row by row, and at a row each series. A point's label is what the live region says
with the reading on it: its x, its y, its size when the chart has `bubble`, and its series. Its id
is its place in the reading: the row's index, and with more than one series the series' index after
a colon (`5:1`). A point the plot does not draw reports nothing, so it is not listed, and a series
hidden from the legend has no points.

A chart with more points than the engine's `CHART_MARK_CAP` lists a window of them: the whole rows
around the reading position, at most the cap in all, or from the first row while nothing is read.
`position` is the row the reading is on, the number a point's id starts with, or `null` while
nothing is read. The figure shows it as `data-position`, and a person's keys and pointer move it as
an agent's `read` does. `count` is how many rows the chart has. `read` moves the reading to a row
as Left and Right do, so the tooltip and the live region show it and the window follows. It calls
nothing, and a number that is not the index of a row throws. A dense chart of five hundred points
lists a window of them, and an agent reads along the rows to reach the rest.

`choose` moves the reading to a listed point and activates it as Enter does, so `onSelect` receives
what a person's press there reports, and the tooltip and the live region show the point.

`series` lists the legend's keys, in the legend's order: a series' id is its `key`, and its label is
what its key says. `hidden` lists the ids of the series now hidden. `toggle` presses the key of the
series an id names with the key's own click, as a person's press does: a shown series is hidden and
a hidden one is shown, and the y axis refits to the series left showing. An agent reads `hidden` to
know which way a press goes. Every series can be hidden, and the table twin keeps them all. A chart
with one series draws no legend, so `series` and `hidden` are empty there. The table twin's toggle
is a Button of its own, listed within the chart.

```agent
state items choices when selectable
state position number as root data-position when selectable
state count number when selectable
state series choices when two teams
state hidden ids when two teams
action read number sets position when selectable
action choose id among items calls onSelect when selectable
action toggle id among series presses key when two teams
```
