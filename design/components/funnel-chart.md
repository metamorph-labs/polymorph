# FunnelChart

A funnel chart shows the count that survives each stage of an ordered process, and the share
lost between two stages. Use it to show where a process loses people or items: a signup, a
checkout, a ticket from opened to resolved.

It is **not** a BarChart, which compares categories that have no order and no first stage to
measure against (`bar-chart.md`), and not a Stepper, which shows where one reader is in a flow,
not how many reached each step. It is not a variant of BarChart: a funnel is one series over
stages, measured against its first stage, and it prints its own values and the step between two
stages, which BarChart's `data`, `series` and value axis do not express. It uses the shared
`ChartFrame` without axes, and its grammar types are the tier's (`docs/charts.md`).

## Anatomy

```
[ChartFrame — no axes]
  [plot: one row per stage, top to bottom ·
         label column (inline start) · bar from the column's end, 4px rounded data end ·
         value and share past the bar's end · step rate between two bars · hit row]
  [twin + toggle]  [tooltip]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `stages` | `readonly FunnelStage[]` | required | in order, first to last, one row each. **Drawn as given**: a stage larger than the one before it is drawn at its own length and dev-warns, and nothing is clamped or reordered, because the data is the app's. A stage of zero draws no bar and keeps its row. A negative value draws no bar, has no share and dev-warns; it stays in the twin. `[]` renders the empty state |
| `format` | `ValueFormat` | — | formats each stage's value in the plot, the tooltip and the twin. Shares and step rates are percentages to one decimal place |
| `size` | `ChartSize` | `'md'` | frame heights per `bar-chart.md`'s recipe; the stages share the height |
| `label` | `string` | required | the accessible name |
| `locale` | `string` | — | `Intl` formats; omitted, the runtime's resolved locale |
| `tooltip` | `ChartTooltipConfig \| false` | on, `'dot'` | per stage: label, value and share, with the step rate as its header (`hideLabel` removes the header) |
| `onSelect` | `(selection: { index: number; key: string; label: string; value: number }) => void` | — | reports activation at the reading position. Enter/Space activate, so it is never pointer-only. A stage whose value is not a number reports nothing |
| `loading` | `boolean` | `false` | refetch dims the previous frame; first render is the quiet skeleton |
| `messages` | `ChartMessages` | English | the tier's string catalog (`docs/charts.md`). This member uses `funnelSummary`, `continued` (the step rate, "62% continued", between the bars, in the tooltip and in the live region), `activationHint` (with `onSelect`), `empty`, the twin's three (`showTable`, `hideTable`, `tableLabel`) and its four headings: `stageColumn`, `valueColumn`, `shareColumn`, `continuedColumn`. All keys or none, and the same object goes to every chart on the screen. Omitting it keeps the generic English |

```ts
interface FunnelStage {
  key: string
  label: string
  value: number // a count
}
```

A bar's length is its value against the **largest** stage, so a stage that rises still fits the
plot. With stages that do not rise, the largest is the first. A stage's **share** is its value
over the first stage's. The **step rate** is a stage's value over the stage before it, worded
"62% continued": the share of those who reached the stage above that reached this one. Neither
is stated where it would divide by zero: after a first stage of zero there are no shares, and
after a stage of zero there is no step. The plot, the tooltip and the twin then show nothing
there, never `NaN`.

Attributes: `data-size`, `data-state="loading" | "empty"` on the frame; `data-reading` on the
marks while a stage is read; `data-active` on the read stage's row.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| bar fill | slot 1 (`var(--pm-chart-1)`, from `resolveSeries`): one series, one colour for every stage |
| bar thickness | ≤ `--pm-space-6` (24), the tier's cap. With a step line, the bar takes the row less one line; without, the row less two fifths |
| data end | 4px rounded, square at the start: the engine's `BAR_END_RADIUS`, drawn as a path |
| label column | at the inline start, as wide as the longest label and at most two fifths of the plot. `text.xs` quartet · `--pm-text-secondary` · one line, ellipsis when longer than the column |
| value and share | `text.xs` quartet · `--pm-text-primary` · `--pm-font-numeric`, 8px past the bar's end, as "1,180 · 95.2%" |
| step rate | `text.xs` quartet · `--pm-text-muted` · `--pm-font-numeric`, on the boundary between the two rows it joins, at the bars' start |
| hover/active lift | the active row keeps full ink and the other bars ease to opacity 0.8 over `--pm-motion-duration-control` × `--pm-motion-easing-standard` |
| hit area | the stage's whole row across the plot, at least `HIT_TARGET_MIN` (24px) tall |
| empty state | copy: **"No data yet"**, the English default of `messages.empty` |

No track behind the bars and no value axis. No other chart draws a track, and every stage
prints its value, so an axis would state each number twice. The lost share is the step rate's,
in words.

**What fits.** Every row is one line of text or more, so labels and values are drawn whole or
not at all. When the rows are shorter than a line (`size="sm"` with many stages), whole labels
drop at an even stride, the first and the last kept, and a stage's value goes with its label.
The step rates are drawn only when every row has room for a line and a 4px bar, so they are all
drawn or none are. On a plot too narrow for the values and 48px of bar, the values leave the
plot. Whatever the plot leaves out, the tooltip, the live region and the twin state.

**Right to left.** The engine lays the bars out from the left, and the marks layer turns over
under `:dir(rtl)`. The labels, values and step rates are HTML placed by logical properties, so
the label column is at the inline start in either direction and the bars grow away from it.

## States

1. **lifecycle** — Relay tickets this month: Opened 1,240 · Assigned 1,180 · First reply 1,020 ·
   Resolved 860 · Rated 312
2. **two stages** — the smallest funnel with a step
3. **one stage** — one bar at full length, 100%, no step
4. **first stage zero** — three stages of zero: no bars, no shares, no steps, no `NaN`
5. **zero in the middle** — 46 → 0 → 0: "0% continued" once, then no step
6. **equal stages** — 320 → 320 → 290: equal bars, "100% continued"
7. **rising stage** — 400 → 520 → 180, drawn as given, with the dev warning
8. **long labels** — two labels past the column, each ending in an ellipsis
9. **twelve stages** — at `md`: every label, no step lines
10. **format** — currency values, `{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }`
11. **small** — `size="sm"`
12. **empty** — `stages={[]}` · 13. **loading** · 14. **tooltip off**
15. **selectable** — the lifecycle with `onSelect`: the summary names the activation, and an
    agent can pick a stage (Agent, below)

`requiredSelectors`: `[data-state='empty']`, `[data-state='loading']`, `[data-active]`,
`:focus-visible`.

## Motion

`chart.frame` + `chart.marks`: bars `scaleX` from their start, staggered stage by stage by
`--pm-motion-stagger-step`, capped at the fourth. Value changes re-render, with no draw-on.
Reduced motion and `none`: the bars are drawn at their length at once.

## Icons

`table` (twin toggle).

## A11y

The plot is one focus stop (`tabIndex=0`, `role="img"`, named by `label`). Left/Right move
through the stages, first to last, and Home/End go to the first and the last, as a horizontal
BarChart walks its rows. Each move is said politely: "Assigned: 1,180, 95.2%, 95.2% continued",
the label, the value, the share and the step. Escape clears the reading. With `onSelect`,
Enter/Space activate at the reading position and the summary sentence names the activation. The
summary is `messages.funnelSummary`, given the chart's name and its stage count. The twin is a
`Table` of stage · value · share · continued, so every value and every step rate is reachable
without the plot. The words drawn on the plot are hidden from the tree, because the live region
and the twin say them. Colour carries nothing: every bar is the same series.

## Agent

A FunnelChart with `onSelect` is listed for an agent, named by its `label`; without `onSelect` a
person has nothing to pick, so it registers nothing. `items` lists the stages a person can pick, in
order. A stage's label is what the live region says with the reading on it. Its id is its index
(`2`). A stage whose value is not a number reports nothing, so it is not listed.

A chart with more stages than the engine's `CHART_MARK_CAP` lists a window of them: the whole
stages around the reading position, at most the cap in all, or from the first stage while nothing
is read. `position` is the stage the reading is on, the number a stage's id starts with, or `null`
while nothing is read. The figure shows it as `data-position`, and a person's keys and pointer move
it as an agent's `read` does. `count` is how many stages the chart has. `read` moves the reading to
a stage as Left and Right do, so the tooltip and the live region show it and the window follows. It
calls nothing, and a number that is not the index of a stage throws.

`choose` moves the reading to a listed stage and activates it as Enter does, so `onSelect` receives
what a person's press there reports, and the tooltip and the live region show the stage. The table
twin's toggle is a Button of its own, listed within the chart.

```agent
state items choices when selectable
state position number as root data-position when selectable
state count number when selectable
action read number sets position when selectable
action choose id calls onSelect when selectable
```
