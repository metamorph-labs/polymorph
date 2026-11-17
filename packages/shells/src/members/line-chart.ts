import {
  chartAnnotationInk,
  chartAnnotationWash,
  chartAxis,
  chartBrush,
  chartEffects,
  chartFrame,
  chartLegend,
  chartMarkSource,
  chartState,
  chartTooltip,
  chartTwin,
  FRAME_RECIPES,
  rangeDerived,
  rangeEffects,
  rangeState,
  rangeSurface,
} from '../chart-frame'
import { cond, describeMember, each, el, flag, lit, text, type FixtureValue } from '../dsl'

/** Thirty days of ISO calendar dates. They are date-only, so no timezone shift applies. */
const DAYS = Array.from({ length: 30 }, (_, index) => {
  const day = String(index + 1).padStart(2, '0')
  const opened = [28, 34, 31, 45, 39, 22, 18][index % 7] ?? 30
  const resolved = [25, 30, 33, 41, 37, 20, 16][index % 7] ?? 28
  return {
    day: `2026-07-${day}`,
    opened: opened + (index % 5),
    resolved: resolved + (index % 4),
  }
})

const PAIR = [
  { key: 'opened', label: 'Opened' },
  { key: 'resolved', label: 'Resolved' },
]

const BACKLOG = DAYS.map((row, index) => ({
  day: row.day,
  backlog: 120 + index * 3 - (index % 6) * 8,
}))

/** A week the exporter missed. `null` is a gap, and the line breaks over it. */
const WITH_GAP = DAYS.map((row, index) =>
  index >= 12 && index <= 16 ? { ...row, resolved: null } : row,
)

const MONTHS = [
  { month: '2026-03-01', tickets: 1840 },
  { month: '2026-04-01', tickets: 2110 },
  { month: '2026-05-01', tickets: 1975 },
  { month: '2026-06-01', tickets: 2260 },
  { month: '2026-07-01', tickets: 2405 },
  { month: '2026-08-01', tickets: 2190 },
]

const TEAMS = [
  { key: 'Frontline', label: 'Frontline' },
  { key: 'Billing', label: 'Billing' },
  { key: 'Technical', label: 'Technical' },
  { key: 'Escalations', label: 'Escalations' },
]

const TEAM_ROWS = ['W27', 'W28', 'W29', 'W30', 'W31', 'W32'].map((week, index) => ({
  week,
  Frontline: 46 - index * 2,
  Billing: 62 - index,
  Technical: 88 - index * 3,
  Escalations: 140 - index * 9,
}))

const RESPONSE = TEAM_ROWS.map((row, index) => ({ week: row.week, minutes: 38 - index * 2 }))

const EIGHT = ['Email', 'Chat', 'Phone', 'Social', 'Portal', 'API', 'Partner', 'Walk-in'].map(
  (label) => ({ key: label.toLowerCase().replace(/[^a-z]/g, ''), label }),
)

const EIGHT_ROWS = ['W29', 'W30', 'W31', 'W32'].map((week, index) =>
  Object.fromEntries([
    ['week', week],
    ...EIGHT.map((entry, at) => [entry.key, 40 - at * 4 + index * 2]),
  ]),
) as FixtureValue

const REFUNDS = ['W29', 'W30', 'W31', 'W32'].map((week, index) => ({
  week,
  refunds: 1240 + index * 310,
}))

/**
 * LineChart (`design/components/line-chart.md`): change over time, where a
 * `null` is a gap and the reading position is a crosshair. The drawing is the
 * engine's `lineChartModel`, which the React member draws too: every stroke,
 * wash, marker and end label, the warnings and each row's x-domain value. The
 * readout at a reading position, with its crosshair, is `lineChartReadout`,
 * what `onSelect` reports is `lineChartSelection`, and the brush's range and
 * committed pair are `brushSpan` and `brushValues`.
 *
 * The plot is one focus stop. Left/Right walk the rows through the engine's
 * reading machine, and the pointer reads the row nearest its coordinate.
 * Enter, Space and a click report the selection when the caller listens for
 * `select`. On a `time` or `linear` x, Shift+Arrows and a drag build a range
 * that Enter or the release commits as `brushEnd`, and `syncId` shares the
 * reading with the charts in its group through the engine's sync registry.
 * The legend toggles a series out of the marks, and the domains refit to the
 * rest.
 */
export default describeMember({
  member: 'LineChart',
  dir: 'charts',
  recipe: 'charts/line-chart',
  recipes: FRAME_RECIPES,
  defaults: {
    variant: lit('line'),
    markers: 'false',
    curve: lit('monotone'),
    size: lit('md'),
    tooltip: '() => ({})',
    loading: 'false',
    messages: '() => DEFAULT_RANGE_MESSAGES',
  },
  state: { ...chartState(), ...rangeState() },
  derived: {
    input:
      '({ data, series, x, y, variant, markers, curve, emphasis, baseline, annotations, label, locale, messages, tooltip, loading, selectable: listening.select, brushable: listening.brushEnd, syncId, hidden, box })',
    model: 'lineChartModel(input)',
    view: 'readingView(position, data.length)',
    readout: 'lineChartReadout(input, model, view)',
    ...rangeDerived('lineChartSelection'),
    marks: chartMarkSource('lineChart'),
  },
  effects: [...chartEffects(), ...rangeEffects()],
  // The spec's `agent` fence: the marks a chart with `onSelect` gives (`chartMarkSource`), the
  // legend's keys, read from the figure (`chartSeries`), and the brush's range (`chartRange`).
  agent: {
    on: 'frame',
    state: {
      items: 'listening.select ? chartMarks(marks, reading) : []',
      position: 'chartPosition(marks, reading)',
      count: 'walk.count',
      series: 'chartSeries(frame, chartLegend.key, model.painted)',
      hidden: 'chartHiddenSeries(frame, chartLegend.key, model.painted)',
      'range-start': 'chartRange(marks, brush).start',
      'range-end': 'chartRange(marks, brush).end',
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
      // The brush reads the rows and the commit at each key, as `onKey` hands them to it first.
      brush: {
        argument: 'number',
        run: '(() => { updateBrush(); brushChartRange(marks, value, brush, reading) })()',
      },
    },
    unless: '!listening.select && !model.legend && !model.brushOn',
  },
  template: chartFrame({
    member: 'LineChart',
    state: 'model.state',
    summary: 'model.summary',
    announcement: 'readout.announcement',
    yAxis: [chartAxis('y', 'model.axes?.y')],
    xAxis: [chartAxis('x', 'model.axes?.x')],
    legend: [
      cond('model.legend', [
        chartLegend({
          series: 'model.painted',
          keyShape: 'line',
          rootClass: 'legend',
          toggles: true,
        }),
      ]),
    ],
    twin: [chartTwin('model.twin.columns', 'model.twin.rows')],
    tooltip: [chartTooltip('readout.tooltip')],
    plot: [
      // One focus stop for the whole plot; the arrow keys walk the rows.
      rangeSurface([
        cond('model.plot !== null', [
          el(
            'svg',
            {
              part: 'marks',
              class: ['marks'],
              attrs: {
                'data-variant': 'variant',
                width: 'model.plot?.width',
                height: 'model.plot?.height',
                'aria-hidden': lit('true'),
                focusable: lit('false'),
              },
            },
            [
              // Gridlines on the value axis only, and no tick lines.
              el('g', { part: 'grid', class: ['grid'] }, [
                each('model.plot?.grid ?? []', 'line', 'line.key', [
                  el('path', { attrs: { d: 'line.d' } }),
                ]),
              ]),
              // The only axis stroke, drawn only when zero is in view.
              cond('(model.plot?.zeroRule ?? null) !== null', [
                el('path', {
                  part: 'zero',
                  class: ['zero'],
                  attrs: { d: 'model.plot?.zeroRule ?? undefined' },
                }),
              ]),
              // The brush selection, drawn under the data.
              chartBrush('rangeDrawing'),
              // The annotation wash under the marks, and the ink in the reference-line slot.
              chartAnnotationWash('model.plot?.wash ?? []'),
              chartAnnotationInk('model.plot?.ink ?? null'),
              // Wrapped so the stylesheet's stagger counts only series.
              el('g', { part: 'strokes', class: ['strokes'] }, [
                each('model.plot?.strokes ?? []', 'stroke', 'stroke.key', [
                  el('g', { geometry: { '--pm-chart-mark': 'stroke.paint' } }, [
                    cond('stroke.wash !== null', [
                      el('path', { class: ['wash'], attrs: { d: 'stroke.wash' } }),
                    ]),
                    el('path', { class: ['line'], attrs: { d: 'stroke.line' } }),
                    each('stroke.markers', 'marker', 'marker.key', [
                      el('circle', {
                        class: ['marker'],
                        attrs: {
                          cx: 'marker.cx',
                          cy: 'marker.cy',
                          r: 'marker.r',
                          'data-active': flag('view.index === marker.index'),
                        },
                      }),
                    ]),
                  ]),
                ]),
              ]),
              // The crosshair snaps to the nearest x position.
              cond('readout.crosshair !== null', [
                el('path', {
                  part: 'crosshair',
                  class: ['crosshair'],
                  attrs: { d: 'readout.crosshair' },
                }),
              ]),
              each('model.plot?.endLabels ?? []', 'end', 'end.key', [
                el(
                  'text',
                  {
                    class: ['endLabel'],
                    attrs: { x: 'end.x', y: 'end.y', 'text-anchor': lit('end') },
                  },
                  [text('end.text')],
                ),
              ]),
            ],
          ),
        ]),
      ]),
    ],
  }),
  states: [
    {
      // The Relay dashboard's panel, so the fixture and the product screen match.
      name: 'the Relay pair',
      props: {
        data: DAYS,
        series: PAIR,
        x: { key: 'day', scale: 'time', label: 'Day' },
        label: 'Tickets opened and resolved by day',
      },
      expect: { 'data-size': 'md' },
    },
    {
      name: 'single series area',
      props: {
        data: BACKLOG,
        series: [{ key: 'backlog', label: 'Open backlog' }],
        x: { key: 'day', scale: 'time', label: 'Day' },
        variant: 'area',
        label: 'Open backlog by day',
      },
    },
    {
      name: 'markers',
      props: {
        data: DAYS.slice(0, 10),
        series: PAIR,
        x: { key: 'day', scale: 'time', label: 'Day' },
        markers: true,
        label: 'Opened and resolved, with points',
      },
    },
    {
      name: 'gap',
      props: {
        data: WITH_GAP,
        series: PAIR,
        x: { key: 'day', scale: 'time', label: 'Day' },
        label: 'Opened and resolved, with a reporting gap',
      },
    },
    {
      // "2026-08-01" is a calendar date and renders as "Aug".
      name: 'band-of-dates',
      props: {
        data: MONTHS,
        series: [{ key: 'tickets', label: 'Tickets' }],
        x: { key: 'month', format: { style: 'date', granularity: 'month' }, label: 'Month' },
        label: 'Tickets by month',
      },
    },
    {
      name: 'emphasis',
      props: {
        data: TEAM_ROWS,
        series: TEAMS,
        x: { key: 'week', label: 'Week' },
        emphasis: 'Escalations',
        label: 'Resolution time by team',
      },
    },
    {
      name: 'baseline',
      props: {
        data: RESPONSE,
        series: [{ key: 'minutes', label: 'First response' }],
        x: { key: 'week', label: 'Week' },
        baseline: { value: 30, label: 'SLA' },
        label: 'First response against the SLA',
      },
    },
    {
      name: 'max series',
      props: {
        data: EIGHT_ROWS,
        series: EIGHT,
        x: { key: 'week', label: 'Week' },
        label: 'Volume by channel',
      },
    },
    {
      name: 'status-toned',
      props: {
        data: TEAM_ROWS,
        series: [
          { key: 'Frontline', label: 'Frontline' },
          { key: 'Escalations', label: 'Error rate', tone: 'danger' },
        ],
        x: { key: 'week', label: 'Week' },
        label: 'Frontline volume and error rate',
      },
    },
    {
      name: 'y currency',
      props: {
        data: REFUNDS,
        series: [{ key: 'refunds', label: 'Refunds' }],
        x: { key: 'week', label: 'Week' },
        y: { format: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 } },
        label: 'Weekly refunds',
      },
    },
    {
      name: 'empty',
      props: {
        data: [],
        series: PAIR,
        x: { key: 'day', scale: 'time' },
        label: 'Tickets by day',
      },
      expect: { 'data-state': 'empty' },
    },
    {
      name: 'loading',
      props: {
        data: DAYS,
        series: PAIR,
        x: { key: 'day', scale: 'time' },
        loading: true,
        label: 'Tickets by day',
      },
      expect: { 'data-state': 'loading' },
    },
    {
      // `false` removes the visual layer only: the reading, its announcements and the twin stay.
      name: 'tooltip off',
      props: {
        data: DAYS,
        series: PAIR,
        x: { key: 'day', scale: 'time' },
        tooltip: false,
        label: 'Tickets by day, print',
      },
    },
    {
      // With `onSelect`: the summary names the activation, and an agent can pick a day.
      name: 'selectable',
      props: {
        data: DAYS,
        series: PAIR,
        x: { key: 'day', scale: 'time', label: 'Day' },
        label: 'Tickets opened and resolved by day',
        onSelect: { js: '() => {}' },
      },
    },
    {
      // With `onBrushEnd` on a time x: a person, or an agent, brushes a range of days.
      name: 'brushable',
      props: {
        data: DAYS,
        series: [{ key: 'opened', label: 'Opened' }],
        x: { key: 'day', scale: 'time', label: 'Day' },
        label: 'Tickets opened by day',
        onBrushEnd: { js: '() => {}' },
      },
    },
  ],
})
