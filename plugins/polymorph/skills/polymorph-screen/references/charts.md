# Charts

A chart is a member of the `charts` tier. The app passes it data and literal settings, and the
theme decides every colour, font and motion.

```sh
npx -y @metamorph-labs/polymorph@1.0.18 search --tier charts --framework <framework>
npx -y @metamorph-labs/polymorph@1.0.18 component LineChart --framework <framework>
```

The examples are React. Vue, Svelte, Solid and Angular members take the same props and the same
data. A callback such as `onSelect` is the event `@select` in Vue and the
output `(select)` in Angular.

## 1. Choose the member

| The data answers | Member |
| --- | --- |
| Compare amounts across named categories: which is bigger, grouped, stacked or signed | `BarChart` |
| A trend over time, or change along any ordered or measured x | `LineChart` |
| What a total is made of, and how that changes over time | `AreaChart` |
| Part of a whole, at most six parts, read roughly | `DonutChart` |
| Part of a whole with many parts, or a hierarchy of two levels sized by value | `Treemap` |
| How one sample of numbers is spread (a distribution) | `Histogram` |
| Whether two measures move together, one mark per observation | `ScatterChart` |
| One measure over a grid of two categories (a matrix), such as weekday by hour | `Heatmap` |
| A profile over three to six axes that share one unit | `RadarChart` |
| Loss between the ordered stages of a process | `FunnelChart` |
| A small inline trend beside a number, with no axes | `Sparkline` |
| One key number and its change, with its trend | `Stat` with `spark` |
| One value against a target or a known range | `Meter`; how much of a task is done, `Progress` |
| Exact values to look up, sort or copy | `Table` or `DataTable` |
| A hierarchy to browse, not to size | `Tree` |
| Events in the order they happened | `Timeline` |

No member draws two value axes, a pie or a gauge. A second series in the bars' own unit (a moving
average, last period) is `BarChart`'s `lines`. A second measure in
another unit is a second chart over the same rows and `x`: a `BarChart` above a
`LineChart` in one panel.

## 2. Give it data

| Members | What they take |
| --- | --- |
| `BarChart`, `LineChart`, `AreaChart` and `ScatterChart` | rows; one series per value field; `x` names the row field along the x axis |
| `Heatmap` | one row per cell; `x` and `y` name the two category fields, `value` the measure |
| `RadarChart` | one row per axis, in the axes' order, with one field per series |
| `Histogram` and `Sparkline` | plain numbers: the raw sample, or the trend in order |
| `DonutChart`, `FunnelChart` and `Treemap` | a list of parts, each `{ key, label, value }` |

A row is a `ChartDatum`: an object of strings, numbers and `null`. `null` is a gap: a line breaks
and a bar is absent. It is never drawn as zero. Rows draw in the order given, so sort them in the
app. A `Heatmap` sorts nothing either: its columns and its rows, from the top, are the
`x` and `y` values in the order each first appears in the rows. A pair the rows lack draws as
the surface, and a second row for a pair is ignored. A time is an ISO 8601 string, and a date-only
string (`2026-07-01`) never shifts by time zone. Values are numbers: the chart formats them with a
`format`. Only `DonutChart`'s `center` is a string the app formats.
`component <Name>` prints the fields of each data type the member's props take.

```tsx
import { DonutChart, Heatmap, Histogram, LineChart } from '@polymorph/react-ui'

<LineChart
  data={[
    { day: '2026-07-01', opened: 28, resolved: 25 },
    { day: '2026-07-02', opened: 35, resolved: 31 },
  ]}
  series={[
    { key: 'opened', label: 'Opened' },
    { key: 'resolved', label: 'Resolved' },
  ]}
  x={{ key: 'day', scale: 'time', label: 'Day' }}
  y={{ label: 'Tickets' }}
  label="Tickets opened and resolved by day"
/>

<Heatmap
  data={[
    { day: 'Mon', band: '08–12', tickets: 34 },
    { day: 'Mon', band: '12–16', tickets: 38 },
  ]}
  x={{ key: 'band', label: 'Hour' }}
  y={{ key: 'day', label: 'Day' }}
  value={{ key: 'tickets' }}
  label="Ticket volume by weekday and hour"
/>

<Histogram data={firstResponseMinutes} x={{ label: 'Minutes to first response' }} label="First response time, this week" />

<DonutChart
  segments={[
    { key: 'email', label: 'Email', value: 214 },
    { key: 'chat', label: 'Chat', value: 96 },
  ]}
  center={{ value: '310', label: 'Open tickets' }}
  label="Open tickets by channel"
/>
```

- `x.scale` is `band` (named categories, the default), `time` or `linear`.
  `LineChart` takes all three, `AreaChart` `band` or `time`,
  `ScatterChart` `linear` (its default) or `time`, and `BarChart` `band`
  only. In a `ScatterChart` each series is a y field of the same rows.
- `RadarChart` takes `axes` and one row per axis. `FunnelChart` takes `stages`, first to last.
  `Treemap` takes `items`, where an item with
  `children` is a group.

In a screen spec, data is bound to an input, and every plain object, a nested one included, is an
`$object`. Import the row type through `types`:

```json
{
  "spec": "polymorph-screen/1",
  "name": "TicketsByChannel",
  "purpose": "Tickets by channel, with a way to open one channel's tickets.",
  "inputs": [
    { "name": "byChannel", "type": "ChartDatum[]" },
    { "name": "onOpenChannel", "type": "(selection: { index: number; key: string; datum: ChartDatum }) => void" }
  ],
  "types": { "@polymorph/react-ui": ["ChartDatum"] },
  "root": {
    "component": "BarChart",
    "props": {
      "label": "Tickets by channel",
      "data": { "$": "byChannel" },
      "series": [{ "$object": { "key": "tickets", "label": "Tickets" } }],
      "x": { "$object": { "key": "channel", "label": "Channel" } },
      "y": { "$object": { "format": { "$object": { "style": "compact" } } } },
      "onSelect": { "$": "onOpenChannel" }
    }
  }
}
```

`render` draws a spec's chart only with rows. Pass them with `--data`: a JSON file of sample
rows beside the spec, an object whose keys are the spec's data inputs, such as
`{ "byChannel": [ … ] }`. The pictures are then `populated-phone.png` and
`populated-desktop.png`. Sampled inputs draw the empty state.

```sh
npx -y @metamorph-labs/polymorph@1.0.18 render src/screens/tickets.json --system plain --data src/screens/tickets.data.json
```

In a page with no build, data is a JSON attribute, the callback is the event `poly-select`, and
`messages` is set as a property from script:

```html
<poly-bar-chart label="Tickets by channel" data='[{"channel":"Email","tickets":214},{"channel":"Chat","tickets":96}]' series='[{"key":"tickets","label":"Tickets"}]' x='{"key":"channel","label":"Channel"}'></poly-bar-chart>
```

## 3. The props charts share

| Prop | What it does | Taken by |
| --- | --- | --- |
| `label` | Required. The chart's accessible name and the start of its summary sentence. It is not drawn: the panel's title names the chart on screen. | every chart |
| `size` | The height, `sm`, `md` or `lg`. The width is always the container's. | every chart |
| `x`, `y` | No axis title is drawn, so a label is read as words. `x.label` heads the first column of the chart's table of values (a `Heatmap`'s is `y.label`). `y.label` names the measure the values are in, such as "Requests" or "Latency (ms)": the summary sentence says it once, and the tooltip and the table name each value by its series. A `ScatterChart`'s summary says its `x.label` too, and a `Histogram`'s `y.label` heads its count column. `format` is `percent`, `compact`, `currency`, `decimal` or `date`: `percent` takes ratios, and `currency` takes a `currency` code. `y.domain: 'zero'` anchors a line at zero. | `BarChart`, `LineChart`, `AreaChart`, `Heatmap`, `ScatterChart` and `Histogram` |
| `series` | A `key` and a `label` for each series; `slot` and `tone` set its colour (section 4). Two or more series draw a legend, whose keys hide and show a series. The legend is not a prop. | `BarChart`, `LineChart`, `AreaChart`, `ScatterChart` and `RadarChart` |
| `tooltip` | How the reading's tooltip looks. `false` removes it for print and keeps the keyboard reading and the table. | every chart but `Sparkline` |
| `onSelect` | Called on Enter, Space or a click at the reading position, with what is there: `{ index, key, datum }` on a bar. `component` prints each member's payload. | every chart but `Sparkline` |
| `onBrushEnd` | A range a person selected with Shift and the arrows or the pointer: ISO strings on a `time` x, numbers on a `linear` one. It does not filter the chart: put the range in app state. | `LineChart` and `AreaChart` |
| `syncId` | The same string on sibling charts moves their reading together, by x value. | `LineChart` and `AreaChart` |
| `annotations` | Marks over the plot, by `kind`: a `line` for a target, a `band` for a window, a `point` for an event. | `BarChart`, `LineChart`, `AreaChart` and `ScatterChart` |
| `baseline` | One target line. | `BarChart`, `LineChart` and `AreaChart` |
| `emphasis` | A series' `key`. That series keeps its colour, and every other series turns grey unless it has a `tone`. | `BarChart`, `LineChart` and `AreaChart` |
| `loading` | A skeleton on the first load, and the previous frame dimmed on a refetch. It wins over the empty state, so pass it with `data={[]}` until the rows arrive. An error is not a chart state: show an `Alert` beside the chart. `data={[]}` alone draws the empty state with its own sentence. | every chart but `Sparkline` |
| `messages`, `locale` | Every sentence a chart says, for another language. Pass every key, and the same object to every chart: spread `DEFAULT_CHART_MESSAGES` and replace keys, `{ ...DEFAULT_CHART_MESSAGES, empty: 'Nothing this week' }`. | every chart but `Sparkline` |

A series takes the next of eight colours in the order it is declared, so filtering the data never
recolours the series that stay. A ninth series and every one after it draws in grey, with a warning
in development: fold the tail into one "Other" series in the data. `ScatterChart` and
`RadarChart` hold fewer, the palette's cap, which `theme validate` prints; above it they
warn and still draw. `DonutChart` takes at most six segments.

Put a chart in a `Dashboard.Panel` or a `Card` whose `title` names it. A
chart draws no title, no surface and no scroll region of its own, and takes its column's width.

## 4. What the theme decides

A chart takes from the theme its eight series colours, a sequential ramp for magnitude
(`Heatmap`), a diverging pair for signed values (signed `Heatmap` cells, one signed
`BarChart` series, `mode="diverging"`), its grid and axis lines, its
fonts and its motion. None of these is a prop, and another palette recolours every chart.

| Asked for | Answer |
| --- | --- |
| Another colour for this series | `slot`, 1 to 8: the palette's colour at that place, not a value. Two series never share one. `DonutChart`'s segments take `slot` too. |
| This series means good or bad | `tone`: `info`, `warning`, `success` or `danger`. It takes the status colour, and is not set with `slot`. |
| Make one series stand out | `emphasis` with its key. Every other series without a `tone` turns grey. |

**An exact colour for one series**, such as "opened in our brand orange #FF6A00", is not available:
no prop and no theme field takes a colour value for a series. Tell the developer so, then offer
what exists. Slot 1, which the first series takes, follows the palette's accent hue; in a palette
with no hue (`chromaBudget` `none` or `ink`, as `neutral` is) it is orange. `render` shows
it. `emphasis` greys every other series: "make resolved stand out" with it
turns opened grey, so ask which of the two matters more before you set it. In a palette with a hue,
moving its `accentHue` to the brand's hue moves slot 1 there, turns the other seven slots with
it, and changes every accent colour in the app, not only the charts. That is the owner's decision
about the whole app: offer it, and make it only when asked, with the `polymorph-theme` skill.

## 5. Keyboard and screen readers

The plot is one tab stop named by `label`: the arrow keys move a reading
position that the tooltip shows and a live region announces, Enter and Space call
`onSelect`, and Escape clears. Every chart but `Sparkline` has a summary
sentence and a table of every value behind a button. Do not wrap a chart in a link, a button or a
handler of its own, and write `label` as the reading itself ("First response,
trending down").

## 6. A chart no member draws

`polymorph/no-external-dataviz` refuses an import of a chart library or of d3 in application
code. It is answered by rung 1, a chart member, or rung 4, a declared zone: a `ThirdParty`
boundary around a library that draws the chart itself, or a `Bespoke` zone whose file draws
SVG by hand, d3's maths included. Give either one the theme's colours (`var(--pm-chart-1)` …
`var(--pm-chart-8)`, or `useThemeValues` for a library that takes
values). The `polymorph-rules` skill has each rung.

```tsx
import { area } from 'd3-shape'
import { Bespoke } from '@polymorph/react-ui'

const ridge = area<number>().x((_, index) => index * 10).y0(40).y1((value) => 40 - value)

<Bespoke reason="Hourly load as a ridgeline: no chart member draws one.">
  <svg viewBox="0 0 240 40" role="img" aria-label="Hourly load">
    <path d={ridge(values) ?? ''} style={{ fill: 'var(--pm-chart-1)' }} />
  </svg>
</Bespoke>
```

## 7. On iOS and Android

A phone platform draws a chart member natively, adapts it, or has it absent and names a substitute.
The card's Platforms section lists each platform's absent members with their substitutes, and
`component <Name>` says where one member renders. The `polymorph-native` skill covers a SwiftUI
or Compose screen.

```sh
npx -y @metamorph-labs/polymorph@1.0.18 card --platform ios --framework <framework>
```
