# RadarChart

A radar chart showing the profile of up to three series over three to six axes that share one
unit and one scale. Use it to show the shape of something, not to compare magnitudes (that is
BarChart's job; see below).

Readers ask for this form, but the charts method has a standing reservation about it
(`docs/charts.md`), so it ships with **guardrails**. The guardrails are part of the design, and
this spec states them as construction rules, not advice. It is an **any-neighbour form**: polygons
can cross anywhere, so the series limit is the palette's cap, as for ScatterChart. It uses the
shared `ChartFrame` without cartesian axes, and its grammar types are the tier's
(`docs/charts.md`).

## What it is not

- **Not per-axis scales.** There is **one shared zero-based radial scale across all axes**.
  Mixed per-axis scales are the classic way a radar chart misleads. Per-axis domains are
  rejected, there is no API to express them, and an axis with a different unit belongs on a
  different chart.
- **Not an area comparison.** A polygon's area grows with the square of its values and depends
  on the arbitrary order of the axes. The form invites this distortion and the marks cannot
  remove it. The twin (the axes × series grid) corrects for it, and it is mandatory anatomy.
- **Not a dumbbell.** Fewer than three axes gives a dev warning. A two-axis radar is a dumbbell,
  and two numbers are easier to read side by side (a bar, a Stat pair).

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `axes` | `readonly RadarAxis[]` | required | **3–6**, drawn clockwise from 12 o'clock in the given order. Fewer than 3 gives a dev warning (see the dumbbell point above); more than 6 gives a dev warning (beyond six the polygon is hard to read). In both cases the chart still draws what it was given: warnings name the law but never hide data |
| `data` | `readonly ChartDatum[]` | required | **one row per axis, in the axes' order**. Rows render in the given order (the grammar's law), and the member binds row *i* to `axes[i]`; a row/axes count mismatch gives a dev warning naming both lengths. Each row has one field per series key; `null` is a **gap**: the polygon breaks at that vertex instead of dropping to zero |
| `series` | `readonly ChartSeries[]` | required | **≤ the palette's cap**. This is an any-neighbour form, so `--pm-chart-cap` limits it exactly as it limits Scatter. The member reads the token (emitted by the theme at the mode minimum) and dev-warns beyond it (3 canonical; carmine and orchid cap at 2 in dark, the measured caps) |
| `format` | `ValueFormat` | — | formats values in the tooltip and twin. The radar has no `y` prop: the one shared scale runs from zero to the nice'd maximum across **all** series and axes, and nothing per-axis can be configured |
| `size` | `ChartSize` | `'md'` | frame heights per `bar-chart.md`'s recipe; the polygon's outer radius fits the plot's shorter side (DonutChart's rule) |
| `label` | `string` | required | the accessible name |
| `locale` | `string` | — | `Intl` formats |
| `tooltip` | `ChartTooltipConfig \| false` | on, `'dot'` | **vertex mark-as-target**: each vertex has its own readout: axis label header (`hideLabel` removes it), then [series key glyph · series label · formatted value] |
| `onSelect` | `(selection: { axis: string; key: string; value: number }) => void` | — | reports activation at the reading position: the axis key, the series key and the value. Enter/Space activate too, so it is never pointer-only |
| `loading` | `boolean` | `false` | refetch holds the previous frame at reduced opacity |
| `messages` | `ChartMessages` | English | the tier's catalog, the localization seam (`docs/charts.md`). This member uses `radarSummary` (axes, series and the shared scale's formatted maximum), `activationHint` (with `onSelect`), `empty`, `noData` (a gap at a vertex) and the twin's three (`showTable`, `hideTable`, `tableLabel`). Pass all keys or none, and pass the same object to every chart on the screen; omitting it keeps the generic English |

```ts
interface RadarAxis {
  key: string
  label: string // never derived from the key — naming is a decision (the ChartSeries.label doctrine, applied to axes)
}
```

Attributes: `data-size`, `data-state="loading" | "empty"` on the frame;
`data-active` on the vertex under the reading position.

No `emphasis`: an identity form capped at three series never needs it (as ScatterChart states).
Legend toggle-to-isolate (`docs/charts.md`) applies at ≥ 2 series: keys are real buttons, the
shared scale refits its maximum to the remaining series, and the twin never hides data.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| polygon stroke | the series `paint` (`var(--pm-chart-N)`) · **2px**, round join; the line stroke, drawn radially |
| polygon wash | the series `paint` at opacity 0.1, light enough not to read as a solid block |
| vertex markers | r 4 (8px) filled with `paint` · **2px ring in `--pm-bg-surface`**; always on, and legible where polygons cross. A vertex is a reading position, and radial position is harder to judge than cartesian position |
| spokes | `--pm-chart-grid` · 1px solid hairline, center to each axis |
| rings | `--pm-chart-grid` · 1px solid hairline · **~4** concentric steps (the y-tick default, applied radially), the outermost at the domain maximum. Rings are **polygons through the spokes, not circles**, because a circle implies a continuous scale between axes that does not exist; the scale exists only on the spokes |
| axis labels | outside the plot at each spoke's end · `text.xs` quartet · `--pm-text-muted`; text uses text tokens, never series colour. Rings carry no figures (never a number on every point); the domain maximum is in the summary sentence and the twin |
| hover/active lift | the transient emphasis mechanism: the active vertex's polygon stays at full strength, and other polygons ease to opacity 0.8 over `--pm-motion-duration-control` × `--pm-motion-easing-standard`. The active vertex's surface ring thickens 2 → 3px (`[data-active]`, a selector the selectors law checks) |
| hit area | per vertex, using the engine's naive 2D nearest scan, clamped at `HIT_TARGET_MIN` (24px). At most 18 vertices is well within the scan's declared range |
| empty state | copy: **"No data yet"**, the English default of `messages.empty`; a localized host's catalog replaces it |

Legend `keyShape="line"`, because the polygon is a stroke with a fill, which is the line key.

## States

The example data is Relay's. Entries:

1. **skills matrix** — the 5-axis example: agent coaching over First response · Resolution ·
   CSAT · Escalation judgment · Coverage, on one shared 0–5 rubric (a real shared unit), with
   two series, the agent vs the team median, slots 1/2
2. **three series** — at the cap: three teams on the same rubric
3. **six axes** — at the limit (the polygon at its readable maximum)
4. **gap** — one `null` vertex mid-polygon: the stroke breaks and the twin
   shows the missing value
5. **format** — coverage ratios with `format={{ style: 'percent' }}`
6. **single series** — one team, no legend; the panel title names it
7. **empty** — `data={[]}` · 8. **loading** · 9. **tooltip off**
10. **selectable** — the skills matrix with `onSelect`: the summary names the activation, and
    an agent can pick a vertex (Agent, below)

`requiredSelectors`: `[data-state='empty']`, `[data-state='loading']`,
`[data-active]`, `[aria-pressed='false']` (the hidden legend key; see `scatter-chart.md`'s
note on the legend sheet), `:focus-visible`.

## Motion

`chart.frame` + `chart.marks`: strokes, fills and vertices enter by opacity with the series
stagger. No draw-on and no sweep, because an inflating polygon is decoration, and data should not
look playful. Reduced motion and `none`: instant.

## Icons

`table` (twin toggle) · series `icon` beside the legend key.

## A11y

The plot is one focus stop (`tabIndex=0`). **Vertex navigation**: Left/Right move between axes
around the polygon (clockwise/counter-clockwise), and Up/Down switch series at the same axis.
Each move announces "axis: series, value" politely. Escape dismisses. With `onSelect`,
Enter/Space activate at the reading position, and the visually hidden summary describes the
activation; `role="img"` stays. The twin is the **axes × series grid**: a `Table` with one row
per axis and one column per series. It shows the values without the polygon's distortion (the
correction stated above). Identity never relies on colour alone: the cap keeps the ≤ 3 slots far
apart, keys match the mark, and the twin has every number.

The first Right lands on the axis at 12 o'clock and the first Left on the last axis. Right past
the last axis reads the first, and Left past the first reads the last. Home and End move to the
first and the last axis. The reading starts on the first series, Up and Down do nothing until a
vertex is read, and they stop at the first and the last series. Otherwise the keys are as
`bar-chart.md` states them: Escape and an Escape with nothing read, the defaults the reading
prevents, and Enter and Space with and without `onSelect`.

## Agent

A RadarChart is listed for an agent, named by its `label`, while a person has something to operate
in it: `onSelect`, or a legend (two or more series). `items` lists the vertices a person can pick,
and is empty without `onSelect`, because a person has nothing to pick. It lists them in the order
the keys walk them: axis by axis from the one at 12 o'clock, and at an axis each polygon. A vertex's
label is what the live region says with the reading on it: the axis, the series and the value. Its
id is its place in the reading: the axis's index, and with more than one series the series' index
after a colon (`2:1`). A vertex with no value reports nothing, so it is not listed, and a series
hidden from the legend has no vertices.

A chart with more vertices than the engine's `CHART_MARK_CAP` lists a window of them: the whole
axes around the reading position, at most the cap in all, or from the first axis while nothing is
read. `position` is the axis the reading is on, the number a vertex's id starts with, or `null`
while nothing is read. The figure shows it as `data-position`, and a person's keys and pointer move
it as an agent's `read` does. `count` is how many axes the chart has. `read` moves the reading to
an axis as Left and Right do, so the tooltip and the live region show it and the window follows. It
calls nothing, and a number that is not the index of an axis throws.

`choose` moves the reading to a listed vertex and activates it as Enter does, so `onSelect`
receives what a person's press there reports, and the tooltip and the live region show the vertex.

`series` lists the legend's keys, in the legend's order: a series' id is its `key`, and its label is
what its key says. `hidden` lists the ids of the series now hidden. `toggle` presses the key of the
series an id names with the key's own click, as a person's press does: a shown series is hidden and
a hidden one is shown, and the shared scale refits its maximum to the series left showing. An agent
reads `hidden` to know which way a press goes. Every series can be hidden, and the table twin keeps
them all. A chart with one series draws no legend, so `series` and `hidden` are empty there. The
table twin's toggle is a Button of its own, listed within the chart.

```agent
state items choices when selectable
state position number as root data-position when selectable
state count number when selectable
state series choices when skills matrix
state hidden ids when skills matrix
action read number sets position when selectable
action choose id among items calls onSelect when selectable
action toggle id among series presses key when skills matrix
```
