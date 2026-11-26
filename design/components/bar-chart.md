# BarChart

BarChart compares magnitudes, grouped, stacked or diverging, vertical or
horizontal. Use it to show which value is bigger. A vertical chart can also draw
`lines`: further series as lines over the bars, on the same value axis and in the
same unit, such as a moving average of the bars' own measure.

It is **not** a Histogram (bars over a continuum are that member's own bins,
`histogram.md`), not a Progress (one ratio against a limit), and not a Timeline (a
sequence, not sizes). It uses the shared `ChartFrame`. The grammar types
(`ChartSeries`, `ChartXAxis`, `ChartYAxis`, `ValueFormat`) are the tier's, in
the engine's `charts/types.ts`, and mean what `docs/charts.md` says.

## Anatomy

```
[ChartFrame]
  [plot: gridlines (value axis only) · zero-baseline rule · bar rects,
         4px rounded data-end, square at the baseline · hit areas ·
         lines: 2px strokes with a ringed point per value, over everything]
  [y axis] [x axis]  [legend (derived, ≥2 series)]  [twin + toggle]  [tooltip]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `data` | `readonly ChartDatum[]` | required | rows render in given order; `null` is an absent bar/segment, never a zero; `[]` renders the empty state |
| `series` | `readonly ChartSeries[]` | required | 1–8, slots by declaration order; a 9th is a dev-warning naming the fold rule |
| `lines` | `readonly ChartSeries[]` | — | series drawn as lines over the bars, on the bars' one value axis, in their `y.format` (below). They take the slots after the bars', count toward the eight, and join the legend (a line key), the tooltip, the walk, `onSelect`, the twin and the summary after the bar series. `mode` stacks the bars only; a line reads against the stack's total. Vertical only: on a horizontal chart a dev-warning says so and no line is drawn |
| `x` | `ChartXAxis` | required | **band only**. `time`/`linear` triggers a dev-warning naming `Histogram` (the member that bins, `histogram.md`), and the axis renders as band |
| `y` | `ChartYAxis` | — | `domain` is always `'zero'`, because a truncated bar misrepresents the value; `'auto'` is a dev-warning and ignored. `label` names the measure the values are in, which the summary sentence says once (`docs/charts.md`); no axis title is drawn |
| `orientation` | `'vertical' \| 'horizontal'` | `'vertical'` | horizontal for long category names; never rotate a label |
| `mode` | `'grouped' \| 'stacked' \| 'diverging'` | `'grouped'` | applies at ≥ 2 series. `stacked` with mixed-sign data is a dev-warning and renders grouped, so nothing is silently clamped (the Likert form is `diverging`, below). `diverging` is the Likert form, on `stackOffsetDiverging` (installed). **The neutral split is data logic**: the app pre-signs the values, and the member never derives a neutral key. Paint uses the arms by distance from zero on each side, an ordinal scale around a centre, which is what the arms are for. **The mixed-sign dev-warning inverts for this mode**: signed data is expected, and an all-positive or all-negative dataset is what warns |
| `size` | `ChartSize` | `'md'` | frame heights below |
| `label` | `string` | required | the accessible name |
| `locale` | `string` | — | `Intl` formats; omitted, the runtime's resolved locale |
| `tooltip` | `ChartTooltipConfig \| false` | on, `'dot'` | `false` removes the visual layer only |
| `emphasis` | `string` | — | the named series keeps its slot and the rest use `--pm-chart-other`; status-toned series never turn grey |
| `baseline` | `ChartBaseline` | — | a drawn target line. It never re-centres colour, because polarity paint is anchored at zero. Shorthand for an `annotations` entry, and their first consumer |
| `annotations` | `readonly ChartAnnotation[]` | — | the tier's closed union per `line-chart.md`: line/band/point literals, band fill `--pm-chart-other` at 0.08 alpha with hairline `--pm-chart-axis` edges. Annotations never re-centre colour, and colliding end-labels are dropped |
| `onSelect` | `(selection: { index: number; key: string; datum: ChartDatum }) => void` | — | reports the reader's activation at the reading position with the member's payload: row index, series key and the row itself. Enter/Space also activate, so it is never pointer-only |
| `loading` | `boolean` | `false` | refetch dims the previous frame; first render is the quiet skeleton |
| `messages` | `ChartMessages` | English | the tier's string catalog and its localization point (`docs/charts.md`). This member uses `summary`, `activationHint` (with `onSelect`), `empty`, `noData` (a gap, in the tooltip and the live region), `quarter` (the quarter label on a quarterly date axis, such as `Q3`, or `T3` for a French host, used on the ticks, the twin's first column and the live region) and the twin's three keys (`showTable`, `hideTable`, `tableLabel`). Pass all keys or none, and pass the same object to every chart on the screen. Omitting it keeps the generic English |

Attributes: `data-size`, `data-state="loading" | "empty"` on the frame;
`data-orientation`, `data-mode` on the marks layer; `data-active` on the mark
under the reading position.

**One value axis.** `lines` share the bars' axis, which starts at zero and reaches
every bar and every line value. There is no second value axis (`docs/charts.md`):
two scales on one plot relate two measures by a ratio the author picked, so where a
line crosses a bar means nothing. The three needs a combined chart is asked for
are answered apart:

- **a constant reference** over the bars (a target, a budget, a limit) is
  `baseline` or an `annotations` line or band;
- **a second series in the same unit** (a moving average, last period, capacity)
  is a `lines` entry;
- **a second measure in another unit** (a rate beside counts, latency beside
  requests) is a second chart: a `LineChart` under the `BarChart` over the same
  rows and the same `x`, in the same panel (`docs/charts.md`), or one chart of
  the measure indexed to a common base.

A line joins the categories in their order, so it suits ordered categories
(weeks, days). The app computes what a line shows, such as a trailing average,
and passes it as a field of each row. A `null` breaks the line, as on
`LineChart`.

Single-series signed data automatically uses `--pm-chart-pos-3`/`--pm-chart-neg-3`
(arm 3, the outermost step of each diverging arm), centred on zero, because
polarity matters when values carry sign. Multi-series signed data keeps series
hues. The exception is `mode: 'diverging'`, where each side's segments use the
arms outward from zero (`--pm-chart-neg-1..3` / `--pm-chart-pos-1..3`; arm 1
nearest the centre, arm 3 at the extremes).

**Legend toggle-to-isolate** is on by default at ≥ 2 series, with state owned by
the member. Legend keys become real buttons with `aria-pressed`. The **twin never
hides data**: it always receives the unfiltered set, and the palette laws rely on
that. The y domain **refits** on isolate, because changing the view is the
purpose. Emphasis combines with it: hiding removes a series, and `emphasis` greys
what remains. A status-toned series may be *hidden* but never greyed, because
removing it is not ambiguous the way greying is. `docs/charts.md` decides the
hidden key's treatment once, for every member with a legend.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| frame heights | `--pm-chart-height-{sm,md,lg}` — **144 / 224 / 336px** at standard density, derived from the space ladder (`space-10 + space-8` · `space-10 × 2 + space-7` · `space-10 × 3 + space-8`) so density scales them; declared only in `chart-frame.module.css` |
| bar fill | the series `paint`: a `var(--pm-chart-N)` reference from `resolveSeries`, never a colour value |
| bar thickness | ≤ `--pm-space-6` (24). This is a cap; bars never fill the band, and the rest of the band stays empty |
| data-end | 4px rounded, **square at the baseline**: the engine's `BAR_END_RADIUS` constant, drawn as a path. Progress's rule applies: rounded data-ends stay at every geometry, because a square-ended mark looks like a rendering artifact |
| mark separation | 2px gap in the layout, for touching bars and stacked segments alike. **Never a stroke**, because a border adds data-weight ink that is not data |
| gridlines | `--pm-chart-grid` · 1px solid hairline · value axis only (horizontal lines when vertical, vertical when horizontal) |
| zero baseline | `--pm-chart-axis` · 1px solid; the only axis stroke |
| baseline (target) | `--pm-chart-axis` · 1px dashed (4 4). It is a reference, not an axis: a solid line in axis ink mid-plot would read as a second axis, and the dash marks it as a line about the data. The annotation family inherits the dash. The tooltip's rejected `dashed` indicator is a different problem, because it implies data between points · label `text.xs` quartet · `--pm-text-muted`, inline-end aligned above the rule, and below it where the plot has no room above |
| hover/active lift | a transient form of emphasis: the active band keeps full ink, and other marks ease to opacity 0.8 over `--pm-motion-duration-control` × `--pm-motion-easing-standard` |
| line | `lines` only: the series `paint` · **2px** · round join and cap · monotone-x through each category's centre (`line-chart.md`'s stroke), drawn over the bars, the zero rule and the annotation ink · never dims on hover |
| line point | r 4 (8px) filled with `paint` · **2px ring in `--pm-bg-surface`**, at every value, so a line is told from the bars by shape as well as colour; the ring thickens 2 → 3px with `data-active` at the band read, unless the walk is on another series |
| hit area | ≥ `HIT_TARGET_MIN` (24px) across the band, never only the painted pixels |
| empty state | frame's `.empty` slot; copy: **"No data yet"**, the English default of `messages.empty`. A localized host's catalog replaces it |

Tick text, legend and tooltip recipes belong to the frame internals (`chart-axis`,
`chart-legend`, `chart-tooltip` sheets); legend `keyShape="rect"`, and a line
series' item `data-key-shape="line"`, so its key is a line.

## States

Example data comes from Relay. Entries:

1. **single series** — tickets by channel: `[{ channel: 'Email', tickets: 214 }, { Chat: 96 }, { Phone: 41 }, { Social: 18 }]`, series `[{ key: 'tickets', label: 'Tickets' }]`
2. **grouped** — opened vs resolved by weekday (Mon–Fri: 32/28 · 41/39 · 37/40 · 29/31 · 22/25), slots 1/2
3. **stacked** — by priority per weekday, three series (urgent/high/normal)
4. **horizontal** — tickets by agent, five agents with long names ("Priya
   Raghunathan-Iyer" fits here without rotation)
5. **signed single** — backlog delta by week `[+12, −8, +3, −15]` → auto `pos`/`neg`
6. **status-toned** — SLA breaches, one series `tone="danger"`
7. **baseline** — grouped + `baseline={{ value: 40, label: 'Target' }}`
8. **emphasis** — grouped ×4 series, `emphasis="resolved"`
9. **max series** — 8 series, one bar band (the case the legend is for)
10. **y format** — compact (`{ style: 'compact' }`) on thousands-scale data
11. **empty** — `data={[]}` (expect `data-state="empty"`)
12. **loading** — with data (expect `data-state="loading"`)
13. **tooltip off** — `tooltip={false}`
14. **diverging (Likert)** — survey agreement by question, `mode="diverging"`,
    horizontal: pre-signed values per question (Disagree −16 · Strongly disagree
    −9 · Agree +31 · Strongly agree +14), **declared mild before extreme per
    side**. Stacking never reorders, so declaration order is how the app controls
    placement: the mild answers sit nearest zero in arm 1, and the strong answers
    stack outermost in the stronger arm, which is the reading a diverging Likert
    chart exists for
15. **line** — tickets opened over ten weeks as bars, with the app's trailing
    four-week average as a `lines` entry
16. **grouped with line** — the grouped pair, with opened last week as a line
17. **stacked with line** — the priority stack, with the team's capacity as a line
    read against each stack's total
18. **line with a gap** — the weekly chart with one week's average `null`: the line
    breaks there and the twin shows the missing value
19. **signed with line** — the signed single series (arm 3 by sign) with its trend
    as a line, below zero at the end
20. **long labels with line** — tickets by agent, vertical, with last month as a
    line: the band labels thin to fit, and the tooltip and the twin name every agent
21. **selectable** — the single series with `onSelect`: the summary names the activation, and
    an agent can pick a bar (Agent, below)

`requiredSelectors`: `[data-state='empty']`, `[data-state='loading']`,
`[data-orientation='horizontal']`, `[data-active]`, `[aria-pressed='false']` (the
hidden legend key when a series is isolated; its paint is in the legend's own
sheet, which joins the member's `composes` closure so the selectors law can see
it), `:focus-visible`.

`[data-mode='stacked']` is not on the list, on purpose. The field means "a
selector the stylesheet must style". Stacking changes **geometry the component
computes** (where a segment starts, which end gets the radius, where the surface
gap goes), not paint that a CSS rule applies. The attribute ships, and
`bar-chart.test.tsx` asserts it. Listing it here would mean writing CSS only to
satisfy the list.

## Motion

`chart.frame` (fade on mount) + `chart.marks`: bars `scaleY` from the zero line,
with the transform origin at the baseline (the Progress inline-transform
precedent), staggered by `--pm-motion-stagger-step/max`. Lines enter by opacity
only, as `LineChart`'s strokes do, because a line's position is its value at every
point. Value changes re-render, with no draw-on and no springs. Reduced motion and
`none`: snaps.

## Icons

`table` for the twin toggle: the chart tier's shared role, used by every member
with a twin. A series `icon` renders beside the legend key, never instead of it.

## A11y

The plot is one focus stop (`tabIndex=0`, focus ring via the shared convention).
Arrow keys move between bands, and Up/Down moves between series within a band:
the bar series, then the lines. The readout at a band lists every series, a line
in the same format as a bar, and the summary names every series.
This drives the tooltip and the polite live region. `role="img"` + `aria-label`
from `label`. The visually hidden summary is `messages.summary`, given the chart's
name, its series' names, its row count and the measure `y.label` names, which it says once
for every series. The sentence comes from the host's
catalog, and the English default is in the engine's `charts/messages.ts`. The table
twin (the `Table` member behind the ghost `table` toggle) is mandatory anatomy:
tooltips add to it and never replace it. Identity is never colour alone: legend,
selective direct labels and the twin. With `onSelect`, Enter/Space activate at the
reading position, and the summary sentence names the activation. `role="img"`
stays, and is reconsidered only if axe reports a violation.

Nothing is read until a key or the pointer moves the reading. The first Right lands
on the first band and the first Left on the last. Right and Left stop at the ends,
and Home and End move to the first and the last band. Up and Down do nothing until a
band is read. From a whole band the first Down lands on the first series and the
first Up on the last, the walk stops at the ends, and the walked series leads the
sentence (`Opened: 32 — Mon`) and stays walked as Right and Left move. Escape clears
the reading, the walked series with it. An Escape with nothing read is not the
chart's, and its default is left to the page. Every key the reading takes has its
default prevented, so an arrow does not scroll the page. Enter on a
whole band reports the first series, and with nothing read Enter and Space report
nothing. Without `onSelect`, Enter and Space are not the chart's.

## Agent

A BarChart is listed for an agent, named by its `label`, while a person has something to operate in
it: `onSelect`, or a legend (two or more series). `items` lists the bars a person can pick, and is
empty without `onSelect`, because a person has nothing to pick. It lists them in the order the keys
walk them: band by band, and in a band each series Up and Down walk, bars then lines. A bar's label
is what the live region says with the reading on it. Its id is its place in the reading: the band's
index (`2`), and with more than one series the series' index after a colon (`2:1`). A series hidden
from the legend has no bars. A series whose value at a band is `null` has no bar there, so it is not
listed, and a person's press with the reading walked to it reports nothing.

A chart with more bars than the engine's `CHART_MARK_CAP` lists a window of them: the whole bands
around the reading position, at most the cap in all, or from the first band while nothing is read.
`position` is the band the reading is on, the number a bar's id starts with, or `null` while
nothing is read. The figure shows it as `data-position`, and a person's keys and pointer move it as
an agent's `read` does. `count` is how many bands the chart has. `read` moves the reading to a band
as Left and Right do, so the tooltip and the live region show it and the window follows. It calls
nothing, and a number that is not the index of a band throws.

`choose` moves the reading to a listed bar and activates it as Enter does, so `onSelect` receives
what a person's press there reports, and the tooltip and the live region show the bar.

`series` lists the legend's keys, in the legend's order: a series' id is its `key`, and its label is
what its key says. `hidden` lists the ids of the series now hidden. `toggle` presses the key of the
series an id names with the key's own click, as a person's press does: a shown series is hidden and
a hidden one is shown, and the value axis refits to the series left showing. A series `lines` draws
has a key of its own. An agent reads `hidden` to know which way a press goes. Every series can be
hidden, and the table twin keeps them all. A chart with one series draws no legend, so `series` and
`hidden` are empty there. The table twin's toggle is a Button of its own, listed within the chart.

```agent
state items choices when selectable
state position number as root data-position when selectable
state count number when selectable
state series choices when grouped
state hidden ids when grouped
action read number sets position when selectable
action choose id among items calls onSelect when selectable
action toggle id among series presses key when grouped
```
