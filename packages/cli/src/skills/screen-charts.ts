import type { Registry } from '@polymorph/registry'

import { DEFAULT_SYSTEM } from '../plan'
import { all, commands, either, Facts, SkillFactError } from './facts'

/** The tier the chart members are in, as the registry names it. */
const TIER = 'charts'

/** The vocabulary package the chart grammar's types are imported from in React. */
const VOCABULARY = '@polymorph/react-ui'

/**
 * The question each chart member answers, in the words a person asks it. A
 * member of the tier this list lacks is described by its purpose, so a new
 * chart member reaches the table with no edit here. A member this list names
 * that the tier lacks stops the texts being written.
 */
const QUESTIONS: [member: string, question: string][] = [
  [
    'BarChart',
    'Compare amounts across named categories: which is bigger, grouped, stacked or signed',
  ],
  ['LineChart', 'A trend over time, or change along any ordered or measured x'],
  ['AreaChart', 'What a total is made of, and how that changes over time'],
  ['DonutChart', 'Part of a whole, at most six parts, read roughly'],
  ['Treemap', 'Part of a whole with many parts, or a hierarchy of two levels sized by value'],
  ['Histogram', 'How one sample of numbers is spread (a distribution)'],
  ['ScatterChart', 'Whether two measures move together, one mark per observation'],
  ['Heatmap', 'One measure over a grid of two categories (a matrix), such as weekday by hour'],
  ['RadarChart', 'A profile over three to six axes that share one unit'],
  ['FunnelChart', 'Loss between the ordered stages of a process'],
  ['Sparkline', 'A small inline trend beside a number, with no axes'],
]

/** The data each family of chart members takes, and the props that carry it. */
const FAMILIES: { members: string[]; props: string[]; shape: string }[] = [
  {
    members: ['BarChart', 'LineChart', 'AreaChart', 'ScatterChart'],
    props: ['data', 'series', 'x'],
    shape: 'rows; one series per value field; `x` names the row field along the x axis',
  },
  {
    members: ['Heatmap'],
    props: ['data', 'x', 'y', 'value'],
    shape: 'one row per cell; `x` and `y` name the two category fields, `value` the measure',
  },
  {
    members: ['RadarChart'],
    props: ['axes', 'data', 'series'],
    shape: "one row per axis, in the axes' order, with one field per series",
  },
  {
    members: ['Histogram', 'Sparkline'],
    props: ['data'],
    shape: 'plain numbers: the raw sample, or the trend in order',
  },
  {
    members: ['DonutChart', 'FunnelChart', 'Treemap'],
    props: [],
    shape: 'a list of parts, each `{ key, label, value }`',
  },
]

/**
 * How a model in a consumer's app draws data: which chart member answers which
 * question, the data each takes, the props the members share, what the theme
 * decides that no prop can, and what to do for a chart no member draws. The
 * screen skill sends a model here for any chart.
 */
export function chartsReference(registry: Registry, run: string): string {
  const f = new Facts(registry)
  const tier = f.tier(TIER)
  if (tier.length === 0) throw new SkillFactError(`no member is in the ${TIER} tier`)
  const inTier = (name: string): string => {
    if (!tier.includes(name)) throw new SkillFactError(`${name} is not in the ${TIER} tier`)
    return f.m(name)
  }
  const named = new Set(QUESTIONS.map(([member]) => member))
  const questions = [
    ...QUESTIONS.map(([member, question]) => `| ${question} | ${inTier(member)} |`),
    ...tier
      .filter((member) => !named.has(member))
      .map((member) => `| ${f.purpose(member)} | ${f.m(member)} |`),
  ]
  const families = FAMILIES.map(({ members, props, shape }) => {
    for (const member of members) for (const prop of props) f.p(member, prop)
    return `| ${all(members.map(inTier))} | ${shape} |`
  })
  // The members of the tier that take a prop, read from the registry.
  const having = (prop: string): string => {
    const found = tier.filter((member) =>
      registry.components.some(
        (entry) => entry.name === member && entry.props.some((each) => each.name === prop),
      ),
    )
    if (found.length === 0) throw new SkillFactError(`no chart member takes ${prop}`)
    const without = tier.filter((member) => !found.includes(member))
    if (without.length === 0) return 'every chart'
    if (without.length <= 2) return `every chart but ${all(without.map((name) => f.m(name)))}`
    return all(found.map((name) => f.m(name)))
  }
  const series = (field: string) => f.field('ChartSeries', field)
  const styles = either(f.fieldValues('ValueFormat', 'style').map((value) => `\`${value}\``))
  const tones = either(f.fieldValues('ChartSeries', 'tone').map((value) => `\`${value}\``))
  const datum = f.x('ChartDatum', VOCABULARY)
  const catalog = f.x('DEFAULT_CHART_MESSAGES', VOCABULARY)
  return `
# Charts

A chart is a member of the \`${TIER}\` tier. The app passes it data and literal settings, and the
theme decides every colour, font and motion.

${commands(run, `search --tier ${TIER} --framework <framework>`, 'component LineChart --framework <framework>')}

The examples are React. Vue, Svelte, Solid and Angular members take the same props and the same
data. A callback such as ${f.p('BarChart', 'onSelect')} is the event \`@select\` in Vue and the
output \`(select)\` in Angular.

## 1. Choose the member

| The data answers | Member |
| --- | --- |
${questions.join('\n')}
| One key number and its change, with its trend | ${f.m('Stat')} with ${f.p('Stat', 'spark')} |
| One value against a target or a known range | ${f.m('Meter')}; how much of a task is done, ${f.m('Progress')} |
| Exact values to look up, sort or copy | ${f.m('Table')} or ${f.m('DataTable')} |
| A hierarchy to browse, not to size | ${f.m('Tree')} |
| Events in the order they happened | ${f.m('Timeline')} |

No member draws two value axes, a pie or a gauge. A second series in the bars' own unit (a moving
average, last period) is ${f.m('BarChart')}'s ${f.p('BarChart', 'lines')}. A second measure in
another unit is a second chart over the same rows and \`x\`: a ${f.m('BarChart')} above a
${f.m('LineChart')} in one panel.

## 2. Give it data

| Members | What they take |
| --- | --- |
${families.join('\n')}

A row is a ${datum}: an object of strings, numbers and \`null\`. \`null\` is a gap: a line breaks
and a bar is absent. It is never drawn as zero. Rows draw in the order given, so sort them in the
app. A ${f.m('Heatmap')} sorts nothing either: its columns and its rows, from the top, are the
\`x\` and \`y\` values in the order each first appears in the rows. A pair the rows lack draws as
the surface, and a second row for a pair is ignored. A time is an ISO 8601 string, and a date-only
string (\`2026-07-01\`) never shifts by time zone. Values are numbers: the chart formats them with a
\`format\`. Only ${f.m('DonutChart')}'s ${f.p('DonutChart', 'center')} is a string the app formats.
\`component <Name>\` prints the fields of each data type the member's props take.

\`\`\`tsx
import { DonutChart, Heatmap, Histogram, LineChart } from '${VOCABULARY}'

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
\`\`\`

- \`x.scale\` is \`band\` (named categories, the default), \`time\` or \`linear\`.
  ${f.m('LineChart')} takes all three, ${f.m('AreaChart')} \`band\` or \`time\`,
  ${f.m('ScatterChart')} \`linear\` (its default) or \`time\`, and ${f.m('BarChart')} \`band\`
  only. In a ${f.m('ScatterChart')} each series is a y field of the same rows.
- ${f.m('RadarChart')} takes ${f.p('RadarChart', 'axes')} and one row per axis. ${f.m('FunnelChart')} takes ${f.p('FunnelChart', 'stages')}, first to last.
  ${f.m('Treemap')} takes ${f.p('Treemap', 'items')}, where an item with
  ${f.field('TreemapItem', 'children')} is a group.

In a screen spec, data is bound to an input, and every plain object, a nested one included, is an
\`$object\`. Import the row type through \`types\`:

\`\`\`json
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
\`\`\`

\`render\` draws a spec's chart only with rows. Pass them with \`--data\`: a JSON file of sample
rows beside the spec, an object whose keys are the spec's data inputs, such as
\`{ "byChannel": [ … ] }\`. The pictures are then \`populated-phone.png\` and
\`populated-desktop.png\`. Sampled inputs draw the empty state.

${commands(run, `render src/screens/tickets.json --system ${DEFAULT_SYSTEM} --data src/screens/tickets.data.json`)}

In a page with no build, data is a JSON attribute, the callback is the event \`poly-select\`, and
${f.p('BarChart', 'messages')} is set as a property from script:

\`\`\`html
<poly-bar-chart label="Tickets by channel" data='[{"channel":"Email","tickets":214},{"channel":"Chat","tickets":96}]' series='[{"key":"tickets","label":"Tickets"}]' x='{"key":"channel","label":"Channel"}'></poly-bar-chart>
\`\`\`

## 3. The props charts share

| Prop | What it does | Taken by |
| --- | --- | --- |
| ${f.p('BarChart', 'label')} | Required. The chart's accessible name and the start of its summary sentence. It is not drawn: the panel's title names the chart on screen. | ${having('label')} |
| ${f.p('BarChart', 'size')} | The height, \`sm\`, \`md\` or \`lg\`. The width is always the container's. | ${having('size')} |
| ${f.p('BarChart', 'x')}, ${f.p('LineChart', 'y')} | No axis title is drawn, so a label is read as words. \`x.label\` heads the first column of the chart's table of values (a ${f.m('Heatmap')}'s is \`y.label\`). \`y.label\` names the measure the values are in, such as "Requests" or "Latency (ms)": the summary sentence says it once, and the tooltip and the table name each value by its series. A ${f.m('ScatterChart')}'s summary says its \`x.label\` too, and a ${f.m('Histogram')}'s \`y.label\` heads its count column. \`format\` is ${styles}: \`percent\` takes ratios, and \`currency\` takes a \`currency\` code. \`y.domain: 'zero'\` anchors a line at zero. | ${having('x')} |
| ${f.p('BarChart', 'series')} | A ${series('key')} and a ${series('label')} for each series; ${series('slot')} and ${series('tone')} set its colour (section 4). Two or more series draw a legend, whose keys hide and show a series. The legend is not a prop. | ${having('series')} |
| ${f.p('BarChart', 'tooltip')} | How the reading's tooltip looks. \`false\` removes it for print and keeps the keyboard reading and the table. | ${having('tooltip')} |
| ${f.p('BarChart', 'onSelect')} | Called on Enter, Space or a click at the reading position, with what is there: \`{ index, key, datum }\` on a bar. \`component\` prints each member's payload. | ${having('onSelect')} |
| ${f.p('LineChart', 'onBrushEnd')} | A range a person selected with Shift and the arrows or the pointer: ISO strings on a \`time\` x, numbers on a \`linear\` one. It does not filter the chart: put the range in app state. | ${having('onBrushEnd')} |
| ${f.p('LineChart', 'syncId')} | The same string on sibling charts moves their reading together, by x value. | ${having('syncId')} |
| ${f.p('BarChart', 'annotations')} | Marks over the plot, by \`kind\`: a \`line\` for a target, a \`band\` for a window, a \`point\` for an event. | ${having('annotations')} |
| ${f.p('BarChart', 'baseline')} | One target line. | ${having('baseline')} |
| ${f.p('BarChart', 'emphasis')} | A series' \`key\`. That series keeps its colour, and every other series turns grey unless it has a ${series('tone')}. | ${having('emphasis')} |
| ${f.p('BarChart', 'loading')} | A skeleton on the first load, and the previous frame dimmed on a refetch. It wins over the empty state, so pass it with \`data={[]}\` until the rows arrive. An error is not a chart state: show an ${f.m('Alert')} beside the chart. \`data={[]}\` alone draws the empty state with its own sentence. | ${having('loading')} |
| ${f.p('BarChart', 'messages')}, ${f.p('BarChart', 'locale')} | Every sentence a chart says, for another language. Pass every key, and the same object to every chart: spread ${catalog} and replace keys, \`{ ...DEFAULT_CHART_MESSAGES, empty: 'Nothing this week' }\`. | ${having('messages')} |

A series takes the next of eight colours in the order it is declared, so filtering the data never
recolours the series that stay. A ninth series and every one after it draws in grey, with a warning
in development: fold the tail into one "Other" series in the data. ${f.m('ScatterChart')} and
${f.m('RadarChart')} hold fewer, the palette's cap, which \`theme validate\` prints; above it they
warn and still draw. ${f.m('DonutChart')} takes at most six segments.

Put a chart in a ${f.part('Dashboard', 'Panel')} or a ${f.m('Card')} whose \`title\` names it. A
chart draws no title, no surface and no scroll region of its own, and takes its column's width.

## 4. What the theme decides

A chart takes from the theme its eight series colours, a sequential ramp for magnitude
(${f.m('Heatmap')}), a diverging pair for signed values (signed ${f.m('Heatmap')} cells, one signed
${f.m('BarChart')} series, ${f.v('BarChart', 'mode', 'diverging')}), its grid and axis lines, its
fonts and its motion. None of these is a prop, and another palette recolours every chart.

| Asked for | Answer |
| --- | --- |
| Another colour for this series | ${series('slot')}, 1 to 8: the palette's colour at that place, not a value. Two series never share one. ${f.m('DonutChart')}'s segments take ${f.field('DonutSegment', 'slot')} too. |
| This series means good or bad | ${series('tone')}: ${tones}. It takes the status colour, and is not set with ${series('slot')}. |
| Make one series stand out | ${f.p('LineChart', 'emphasis')} with its key. Every other series without a ${series('tone')} turns grey. |

**An exact colour for one series**, such as "opened in our brand orange #FF6A00", is not available:
no prop and no theme field takes a colour value for a series. Tell the developer so, then offer
what exists. Slot 1, which the first series takes, follows the palette's accent hue; in a palette
with no hue (\`chromaBudget\` \`none\` or \`ink\`, as \`neutral\` is) it is orange. \`render\` shows
it. ${f.p('LineChart', 'emphasis')} greys every other series: "make resolved stand out" with it
turns opened grey, so ask which of the two matters more before you set it. In a palette with a hue,
moving its \`accentHue\` to the brand's hue moves slot 1 there, turns the other seven slots with
it, and changes every accent colour in the app, not only the charts. That is the owner's decision
about the whole app: offer it, and make it only when asked, with the \`polymorph-theme\` skill.

## 5. Keyboard and screen readers

The plot is one tab stop named by ${f.p('BarChart', 'label')}: the arrow keys move a reading
position that the tooltip shows and a live region announces, Enter and Space call
${f.p('BarChart', 'onSelect')}, and Escape clears. Every chart but ${f.m('Sparkline')} has a summary
sentence and a table of every value behind a button. Do not wrap a chart in a link, a button or a
handler of its own, and write ${f.p('Sparkline', 'label')} as the reading itself ("First response,
trending down").

## 6. A chart no member draws

\`polymorph/no-external-dataviz\` refuses an import of a chart library or of d3 in application
code. It is answered by rung 1, a chart member, or rung 4, a declared zone: a ${f.m('ThirdParty')}
boundary around a library that draws the chart itself, or a ${f.m('Bespoke')} zone whose file draws
SVG by hand, d3's maths included. Give either one the theme's colours (\`var(--pm-chart-1)\` …
\`var(--pm-chart-8)\`, or ${f.x('useThemeValues', '@polymorph/react')} for a library that takes
values). The \`polymorph-rules\` skill has each rung.

\`\`\`tsx
import { area } from 'd3-shape'
import { Bespoke } from '${VOCABULARY}'

const ridge = area<number>().x((_, index) => index * 10).y0(40).y1((value) => 40 - value)

<Bespoke reason="Hourly load as a ridgeline: no chart member draws one.">
  <svg viewBox="0 0 240 40" role="img" aria-label="Hourly load">
    <path d={ridge(values) ?? ''} style={{ fill: 'var(--pm-chart-1)' }} />
  </svg>
</Bespoke>
\`\`\`

## 7. On iOS and Android

A phone platform draws a chart member natively, adapts it, or has it absent and names a substitute.
The card's Platforms section lists each platform's absent members with their substitutes, and
\`component <Name>\` says where one member renders. The \`polymorph-native\` skill covers a SwiftUI
or Compose screen.

${commands(run, 'card --platform ios --framework <framework>')}
`.trimStart()
}
