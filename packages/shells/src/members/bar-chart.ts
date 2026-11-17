import {
  chartAnnotationInk,
  chartAnnotationWash,
  chartAxis,
  chartEffects,
  chartFrame,
  chartLegend,
  chartMarkSource,
  chartState,
  chartTooltip,
  chartTwin,
  FRAME_RECIPES,
} from '../chart-frame'
import { cond, describeMember, each, el, flag, lit, run, type FixtureValue } from '../dsl'

/** The React fixture's data: Relay's, because `foo / bar / baz` says nothing about what a chart is for. */
const BY_CHANNEL = [
  { channel: 'Email', tickets: 214 },
  { channel: 'Chat', tickets: 96 },
  { channel: 'Phone', tickets: 41 },
  { channel: 'Social', tickets: 18 },
]

const BY_WEEKDAY = [
  { day: 'Mon', opened: 32, resolved: 28 },
  { day: 'Tue', opened: 41, resolved: 39 },
  { day: 'Wed', opened: 37, resolved: 40 },
  { day: 'Thu', opened: 29, resolved: 31 },
  { day: 'Fri', opened: 22, resolved: 25 },
]

const BY_PRIORITY = [
  { day: 'Mon', urgent: 4, high: 11, normal: 17 },
  { day: 'Tue', urgent: 6, high: 14, normal: 21 },
  { day: 'Wed', urgent: 3, high: 12, normal: 22 },
  { day: 'Thu', urgent: 5, high: 9, normal: 15 },
  { day: 'Fri', urgent: 2, high: 8, normal: 12 },
]

const BY_AGENT = [
  { agent: 'Priya Raghunathan-Iyer', tickets: 88 },
  { agent: 'Tomás Oyelaran', tickets: 74 },
  { agent: 'Wei Zhang', tickets: 61 },
  { agent: 'Amara Okonkwo-Bell', tickets: 52 },
  { agent: 'Sam Ferreira', tickets: 39 },
]

const BACKLOG_DELTA = [
  { week: 'W31', delta: 12 },
  { week: 'W32', delta: -8 },
  { week: 'W33', delta: 3 },
  { week: 'W34', delta: -15 },
]

const PAIR = [
  { key: 'opened', label: 'Opened' },
  { key: 'resolved', label: 'Resolved' },
]

const FOUR = [
  { key: 'opened', label: 'Opened' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'reopened', label: 'Reopened' },
  { key: 'escalated', label: 'Escalated' },
]

const FOUR_ROWS = BY_WEEKDAY.map((row, index) => ({
  ...row,
  reopened: [4, 6, 3, 5, 2][index] ?? 0,
  escalated: [2, 3, 1, 4, 1][index] ?? 0,
}))

const EIGHT = ['Email', 'Chat', 'Phone', 'Social', 'Portal', 'API', 'Partner', 'Walk-in'].map(
  (label) => ({ key: label.toLowerCase().replace(/[^a-z]/g, ''), label }),
)

const EIGHT_ROWS = [
  Object.fromEntries([['day', 'Mon'], ...EIGHT.map((entry, index) => [entry.key, 40 - index * 4])]),
] as FixtureValue

const THOUSANDS = [
  { month: 'May', tickets: 18_400 },
  { month: 'Jun', tickets: 21_900 },
  { month: 'Jul', tickets: 24_100 },
  { month: 'Aug', tickets: 22_700 },
]

/** Survey agreement, pre-signed by the app, which handles the neutral split (`bar-chart.md`). */
const LIKERT = [
  { question: 'Response speed', strongDisagree: -9, disagree: -16, agree: 31, strongAgree: 14 },
  { question: 'Ease of contact', strongDisagree: -4, disagree: -11, agree: 38, strongAgree: 17 },
  { question: 'Issue resolved', strongDisagree: -12, disagree: -19, agree: 26, strongAgree: 13 },
]

/** Tickets opened by week, with the app's trailing four-week average on the same axis. */
const BY_WEEK = [
  { week: 'W40', opened: 182, average: 182 },
  { week: 'W41', opened: 205, average: 194 },
  { week: 'W42', opened: 197, average: 195 },
  { week: 'W43', opened: 231, average: 204 },
  { week: 'W44', opened: 214, average: 212 },
  { week: 'W45', opened: 188, average: 208 },
  { week: 'W46', opened: 243, average: 219 },
  { week: 'W47', opened: 226, average: 218 },
  { week: 'W48', opened: 251, average: 227 },
  { week: 'W49', opened: 238, average: 240 },
]

const AVERAGE = [{ key: 'average', label: 'Four-week average' }]

/**
 * BarChart (`design/components/bar-chart.md`): magnitudes compared across
 * categories, with the y domain always including zero. The drawing is the
 * engine's `barChartModel`, which the React member draws too: the stacking and
 * diverging rules, the colours, every bar's path and the dev warnings. The
 * readout at a reading position is `barChartReadout`, and what `onSelect`
 * reports is `barChartSelection`.
 *
 * `lines` draws further series as lines over the bars, on the one value axis.
 *
 * The plot is one focus stop. Left/Right walk the bands and Up/Down the series
 * in a band, bars then lines, through the engine's reading machine; the pointer reads the band
 * nearest its coordinate. Enter, Space and a click report the selection when
 * the caller listens for `select`. The legend toggles a series out of the
 * marks, and the domains refit to the rest.
 */
export default describeMember({
  member: 'BarChart',
  dir: 'charts',
  recipe: 'charts/bar-chart',
  recipes: FRAME_RECIPES,
  defaults: {
    orientation: lit('vertical'),
    mode: lit('grouped'),
    size: lit('md'),
    tooltip: '() => ({})',
    loading: 'false',
    messages: '() => DEFAULT_CHART_MESSAGES',
  },
  state: chartState(),
  derived: {
    input:
      '({ data, series, lines, x, y, orientation, mode, emphasis, baseline, annotations, label, locale, messages, tooltip, loading, selectable: listening.select, hidden, box })',
    model: 'barChartModel(input)',
    view: 'readingView(position, data.length, model.visible.length)',
    readout: 'barChartReadout(input, model, view)',
    activate:
      "() => { const selection = barChartSelection(input, model, reading.now()); if (selection !== null) emit('select', selection) }",
    // A band holds one mark per series, so Up/Down walk between them.
    walk: '({ count: data.length, seriesCount: model.visible.length, walkSeries: true })',
    marks: chartMarkSource('barChart'),
    onKey:
      "(event: KeyboardEvent) => { if (listening.select && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); activate(); return } reading.update(walk); if (reading.key(event.key)) event.preventDefault() }",
    // The reading follows the pointer's coordinates, snapped to the nearest band, as a crosshair does.
    onPointer:
      '(event: PointerEvent) => { if (model.plot === null) return; const rect = (event.currentTarget as Element).getBoundingClientRect(); reading.moveTo(nearestIndex(model.positions, model.vertical ? event.clientX - rect.left : event.clientY - rect.top), reading.now().series) }',
  },
  effects: chartEffects(),
  // The spec's `agent` fence: the marks a chart with `onSelect` gives (`chartMarkSource`), and the
  // legend's keys, read from the figure (`chartSeries`).
  agent: {
    on: 'frame',
    state: {
      items: 'listening.select ? chartMarks(marks, reading) : []',
      position: 'chartPosition(marks, reading)',
      count: 'walk.count',
      series: 'chartSeries(frame, chartLegend.key, model.painted)',
      hidden: 'chartHiddenSeries(frame, chartLegend.key, model.painted)',
    },
    actions: {
      read: { argument: 'number', run: 'readChartPosition(marks, value, reading)' },
      choose: {
        argument: 'id',
        among: 'items',
        run: 'chooseChartMark(marks, value, reading, activate)',
      },
      toggle: {
        argument: 'id',
        among: 'series',
        run: 'toggleChartSeries(frame, chartLegend.key, model.painted, value)',
      },
    },
    unless: '!listening.select && !model.legend',
  },
  template: chartFrame({
    member: 'BarChart',
    state: 'model.state',
    summary: 'model.summary',
    announcement: 'readout.announcement',
    yAxis: [chartAxis('y', 'model.axes?.y')],
    xAxis: [chartAxis('x', 'model.axes?.x')],
    legend: [
      cond('model.legend', [
        chartLegend({
          series: 'model.painted',
          keyShape: 'rect',
          lineKeys: 'model.lineKeys',
          rootClass: 'legend',
          toggles: true,
        }),
      ]),
    ],
    twin: [chartTwin('model.twin.columns', 'model.twin.rows')],
    tooltip: [chartTooltip('readout.tooltip')],
    plot: [
      // One focus stop. Arrow keys walk the bands; Up/Down walk the series in a band.
      el(
        'div',
        {
          part: 'surface',
          class: ['surface'],
          attrs: { tabindex: lit('0'), role: lit('img'), 'aria-label': 'label' },
          on: {
            keydown: run('onKey($event)'),
            click: run('activate()'),
            pointermove: run('onPointer($event)'),
            pointerleave: run('reading.clear()'),
            blur: run('reading.clear()'),
          },
        },
        [
          cond('model.plot !== null', [
            el(
              'svg',
              {
                part: 'marks',
                class: ['marks'],
                attrs: {
                  'data-orientation': 'orientation',
                  'data-mode': 'model.drawn',
                  'data-reading': flag('view.active'),
                  width: 'model.plot?.width',
                  height: 'model.plot?.height',
                  'aria-hidden': lit('true'),
                  focusable: lit('false'),
                },
                // The zero rule's position, which the entrance grows the bars from: geometry, not a decision.
                geometry: { '--pm-chart-zero': '`${model.plot?.zero}px`' },
              },
              [
                el('g', { part: 'grid', class: ['grid'] }, [
                  each('model.plot?.grid ?? []', 'line', 'line.key', [
                    el('path', { attrs: { d: 'line.d' } }),
                  ]),
                ]),
                // A reference band's wash sits under the data it contextualises.
                chartAnnotationWash('model.plot?.wash ?? []'),
                el('g', { part: 'bands', class: ['bands'] }, [
                  each('model.plot?.bands ?? []', 'band', 'band.key', [
                    el('g', { attrs: { 'data-active': flag('view.index === band.index') } }, [
                      el('rect', {
                        class: ['hit'],
                        attrs: {
                          x: 'band.hit.x',
                          y: 'band.hit.y',
                          width: 'band.hit.width',
                          height: 'band.hit.height',
                        },
                        on: {
                          pointerenter: run('reading.moveTo(band.index, reading.now().series)'),
                        },
                      }),
                      each('band.marks', 'mark', 'mark.key', [
                        el('path', {
                          class: ['bar'],
                          geometry: { '--pm-chart-mark': 'mark.paint' },
                          attrs: {
                            // The mark the Up/Down walk selects carries its own flag too.
                            'data-active': flag(
                              'view.index === band.index && view.series === mark.series',
                            ),
                            d: 'mark.d',
                          },
                        }),
                      ]),
                    ]),
                  ]),
                ]),
                // The zero rule, the only axis stroke, over the marks.
                el('path', { part: 'zero', class: ['zero'], attrs: { d: 'model.plot?.zeroRule' } }),
                chartAnnotationInk('model.plot?.ink ?? null'),
                // The lines, over everything else; absent with no lines, so the plot is as before.
                cond('(model.plot?.lines ?? []).length > 0', [
                  el('g', { part: 'lines', class: ['lines'] }, [
                    each('model.plot?.lines ?? []', 'line', 'line.key', [
                      el('g', { geometry: { '--pm-chart-mark': 'line.paint' } }, [
                        el('path', { class: ['line'], attrs: { d: 'line.d' } }),
                        each('line.points', 'point', 'point.key', [
                          el('circle', {
                            class: ['point'],
                            attrs: {
                              cx: 'point.cx',
                              cy: 'point.cy',
                              r: 'point.r',
                              // At the band read, unless the walk is on another series.
                              'data-active': flag(
                                'view.index === point.index && (view.series === null || view.series === line.series)',
                              ),
                            },
                          }),
                        ]),
                      ]),
                    ]),
                  ]),
                ]),
              ],
            ),
          ]),
        ],
      ),
    ],
  }),
  states: [
    {
      name: 'single series',
      props: {
        data: BY_CHANNEL,
        series: [{ key: 'tickets', label: 'Tickets' }],
        x: { key: 'channel', label: 'Channel' },
        label: 'Tickets by channel',
      },
      expect: { 'data-size': 'md' },
    },
    {
      name: 'grouped',
      props: {
        data: BY_WEEKDAY,
        series: PAIR,
        x: { key: 'day', label: 'Day' },
        label: 'Opened and resolved by weekday',
      },
    },
    {
      name: 'stacked',
      props: {
        data: BY_PRIORITY,
        series: [
          { key: 'urgent', label: 'Urgent' },
          { key: 'high', label: 'High' },
          { key: 'normal', label: 'Normal' },
        ],
        x: { key: 'day', label: 'Day' },
        mode: 'stacked',
        label: 'Tickets by priority and weekday',
      },
    },
    {
      name: 'horizontal',
      props: {
        data: BY_AGENT,
        series: [{ key: 'tickets', label: 'Tickets' }],
        x: { key: 'agent', label: 'Agent' },
        orientation: 'horizontal',
        label: 'Tickets by agent',
      },
    },
    {
      // One signed series: sign is what matters, so the bars take the diverging colours.
      name: 'signed single',
      props: {
        data: BACKLOG_DELTA,
        series: [{ key: 'delta', label: 'Backlog change' }],
        x: { key: 'week', label: 'Week' },
        label: 'Backlog change by week',
      },
    },
    {
      name: 'status-toned',
      props: {
        data: BY_WEEKDAY.map((row) => ({ day: row.day, breaches: row.opened / 8 })),
        series: [{ key: 'breaches', label: 'SLA breaches', tone: 'danger' }],
        x: { key: 'day', label: 'Day' },
        label: 'SLA breaches by weekday',
      },
    },
    {
      name: 'baseline',
      props: {
        data: BY_WEEKDAY,
        series: PAIR,
        x: { key: 'day', label: 'Day' },
        baseline: { value: 40, label: 'Target' },
        label: 'Opened and resolved against target',
      },
    },
    {
      name: 'emphasis',
      props: {
        data: FOUR_ROWS,
        series: FOUR,
        x: { key: 'day', label: 'Day' },
        emphasis: 'resolved',
        label: 'Ticket flow, resolved emphasised',
      },
    },
    {
      name: 'max series',
      props: {
        data: EIGHT_ROWS,
        series: EIGHT,
        x: { key: 'day', label: 'Day' },
        label: 'Every channel, one day',
      },
    },
    {
      name: 'y format',
      props: {
        data: THOUSANDS,
        series: [{ key: 'tickets', label: 'Tickets' }],
        x: { key: 'month', label: 'Month' },
        y: { format: { style: 'compact' } },
        label: 'Tickets by month',
      },
    },
    {
      name: 'empty',
      props: {
        data: [],
        series: [{ key: 'tickets', label: 'Tickets' }],
        x: { key: 'channel' },
        label: 'Tickets by channel',
      },
      expect: { 'data-state': 'empty' },
    },
    {
      name: 'loading',
      props: {
        data: BY_WEEKDAY,
        series: PAIR,
        x: { key: 'day' },
        loading: true,
        label: 'Opened and resolved by weekday',
      },
      expect: { 'data-state': 'loading' },
    },
    {
      // `false` removes the visual layer only: the reading, its announcements and the twin stay.
      name: 'tooltip off',
      props: {
        data: BY_WEEKDAY,
        series: PAIR,
        x: { key: 'day' },
        tooltip: false,
        label: 'Opened and resolved, print',
      },
    },
    {
      // The Likert form: pre-signed values, each side declared mild before extreme.
      name: 'diverging (Likert)',
      props: {
        data: LIKERT,
        series: [
          { key: 'disagree', label: 'Disagree' },
          { key: 'strongDisagree', label: 'Strongly disagree' },
          { key: 'agree', label: 'Agree' },
          { key: 'strongAgree', label: 'Strongly agree' },
        ],
        x: { key: 'question', label: 'Question' },
        mode: 'diverging',
        orientation: 'horizontal',
        label: 'Survey agreement by question',
      },
      expect: { 'data-size': 'md' },
    },
    {
      // A line over the bars, on their axis and in their unit.
      name: 'line',
      props: {
        data: BY_WEEK,
        series: [{ key: 'opened', label: 'Opened' }],
        lines: AVERAGE,
        x: { key: 'week', label: 'Week' },
        label: 'Tickets opened by week, with the four-week average',
      },
    },
    {
      name: 'grouped with line',
      props: {
        data: BY_WEEKDAY.map((row, index) => ({
          ...row,
          lastWeek: [30, 38, 35, 31, 20][index] ?? null,
        })),
        series: PAIR,
        lines: [{ key: 'lastWeek', label: 'Opened last week' }],
        x: { key: 'day', label: 'Day' },
        label: 'Opened and resolved by weekday, with last week',
      },
    },
    {
      // The line reads against the stack's total, on the same axis.
      name: 'stacked with line',
      props: {
        data: BY_PRIORITY.map((row, index) => ({
          ...row,
          capacity: [36, 38, 38, 34, 28][index] ?? null,
        })),
        series: [
          { key: 'urgent', label: 'Urgent' },
          { key: 'high', label: 'High' },
          { key: 'normal', label: 'Normal' },
        ],
        lines: [{ key: 'capacity', label: 'Capacity' }],
        x: { key: 'day', label: 'Day' },
        mode: 'stacked',
        label: 'Tickets by priority, against capacity',
      },
    },
    {
      // A week with no average breaks the line and draws no point.
      name: 'line with a gap',
      props: {
        data: BY_WEEK.map((row) => (row.week === 'W45' ? { ...row, average: null } : row)),
        series: [{ key: 'opened', label: 'Opened' }],
        lines: AVERAGE,
        x: { key: 'week', label: 'Week' },
        label: 'Tickets opened by week, one average missing',
      },
    },
    {
      // One signed bar series keeps its polarity colours beside a line.
      name: 'signed with line',
      props: {
        data: BACKLOG_DELTA.map((row, index) => ({
          ...row,
          trend: [6, 2, -1, -5][index] ?? null,
        })),
        series: [{ key: 'delta', label: 'Backlog change' }],
        lines: [{ key: 'trend', label: 'Trend' }],
        x: { key: 'week', label: 'Week' },
        label: 'Backlog change by week, with its trend',
      },
    },
    {
      // Long names on a vertical chart thin out; the tooltip and the twin name every one.
      name: 'long labels with line',
      props: {
        data: BY_AGENT.map((row, index) => ({
          ...row,
          lastMonth: [80, 71, 66, 49, 41][index] ?? null,
        })),
        series: [{ key: 'tickets', label: 'Tickets' }],
        lines: [{ key: 'lastMonth', label: 'Last month' }],
        x: { key: 'agent', label: 'Agent' },
        label: 'Tickets by agent, with last month',
      },
    },
    {
      // With `onSelect`: the summary names the activation, and an agent can pick a bar.
      name: 'selectable',
      props: {
        data: BY_CHANNEL,
        series: [{ key: 'tickets', label: 'Tickets' }],
        x: { key: 'channel', label: 'Channel' },
        label: 'Tickets by channel',
        onSelect: { js: '() => {}' },
      },
    },
  ],
})
