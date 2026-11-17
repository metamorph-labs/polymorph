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
import { cond, describeMember, each, el, lit, type FixtureValue } from '../dsl'

const WEEKS = ['W25', 'W26', 'W27', 'W28', 'W29', 'W30', 'W31', 'W32']

/** Relay's queue by priority, as the product panel shows it. */
const PRIORITY = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'high', label: 'High' },
  { key: 'normal', label: 'Normal' },
]

const BACKLOG = WEEKS.map((week, index) => ({
  week,
  urgent: 12 + (index % 3) * 4,
  high: 34 + index * 2,
  normal: 68 - index * 3 + (index % 4) * 6,
}))

const CHANNELS = [
  { key: 'email', label: 'Email' },
  { key: 'chat', label: 'Chat' },
  { key: 'phone', label: 'Phone' },
]

/** Two weeks the chat exporter missed. The band drops out and comes back. */
const WITH_HOLE = WEEKS.map((week, index) => ({
  week,
  email: 210 + index * 8,
  chat: index === 3 || index === 4 ? null : 96 + index * 5,
  phone: 41 + (index % 3) * 6,
}))

const EIGHT = ['Email', 'Chat', 'Phone', 'Social', 'Portal', 'API', 'Partner', 'Walk-in'].map(
  (label) => ({ key: label.toLowerCase().replace(/[^a-z]/g, ''), label }),
)

const EIGHT_ROWS = WEEKS.map((week, index) =>
  Object.fromEntries([
    ['week', week],
    ...EIGHT.map((entry, at) => [entry.key, 34 - at * 3 + (index % 4) * 2]),
  ]),
) as FixtureValue

/** Thirty calendar dates. They are date-only, so no timezone shift applies. */
const DAYS = Array.from({ length: 30 }, (_, index) => {
  const day = String(index + 1).padStart(2, '0')
  return {
    day: `2026-07-${day}`,
    urgent: 8 + (index % 5) * 2,
    high: 22 + (index % 7) * 3,
    normal: 44 - (index % 6) * 4,
  }
})

/**
 * AreaChart (`design/components/area-chart.md`): part-to-whole change over
 * time as stacked bands, each band's top edge the series' line. The drawing is
 * the engine's `areaChartModel`, which the React member draws too: the stack,
 * the gap and negative rules, every band's wash and edge, the warnings and the
 * twin's value-and-share cells. The readout at a reading position, with its
 * crosshair, is `areaChartReadout`, and what `onSelect` reports is
 * `areaChartSelection`. The brush and the sync group are LineChart's, through
 * `brushSpan` and `brushValues`, on a `time` x only.
 *
 * The plot is one focus stop. Left/Right walk the rows through the engine's
 * reading machine, and the pointer reads the row nearest its coordinate.
 * Enter, Space and a click report the selection when the caller listens for
 * `select`. The legend toggles a series out of the stack, and the bands above
 * it restack on the remaining total.
 */
export default describeMember({
  member: 'AreaChart',
  dir: 'charts',
  recipe: 'charts/area-chart',
  recipes: FRAME_RECIPES,
  defaults: {
    variant: lit('stacked'),
    size: lit('md'),
    tooltip: '() => ({})',
    loading: 'false',
    messages: '() => DEFAULT_RANGE_MESSAGES',
  },
  state: { ...chartState(), ...rangeState() },
  derived: {
    input:
      '({ data, series, x, y, variant, emphasis, baseline, annotations, label, locale, messages, tooltip, loading, selectable: listening.select, brushable: listening.brushEnd, syncId, hidden, box })',
    model: 'areaChartModel(input)',
    view: 'readingView(position, data.length)',
    readout: 'areaChartReadout(input, model, view)',
    ...rangeDerived('areaChartSelection'),
    marks: chartMarkSource('areaChart'),
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
    member: 'AreaChart',
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
          rootClass: 'legend',
          toggles: true,
        }),
      ]),
    ],
    twin: [chartTwin('model.twin.columns', 'model.twin.rows')],
    tooltip: [chartTooltip('readout.tooltip')],
    plot: [
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
              el('g', { part: 'grid', class: ['grid'] }, [
                each('model.plot?.grid ?? []', 'line', 'line.key', [
                  el('path', { attrs: { d: 'line.d' } }),
                ]),
              ]),
              // The brush selection, drawn under the data.
              chartBrush('rangeDrawing'),
              // The annotation layers, wash then ink, in the baseline's slot.
              chartAnnotationWash('model.plot?.wash ?? []'),
              chartAnnotationInk('model.plot?.ink ?? null'),
              // Stacked bottom-up; wrapped so the stylesheet's stagger counts only bands.
              el('g', { part: 'bands', class: ['bands'] }, [
                each('model.plot?.bands ?? []', 'band', 'band.key', [
                  el('g', { geometry: { '--pm-chart-mark': 'band.paint' } }, [
                    el('path', { class: ['band'], attrs: { d: 'band.fill' } }),
                    // The edge is the series' line, the only edge a reader can follow.
                    el('path', { class: ['edge'], attrs: { d: 'band.edge' } }),
                  ]),
                ]),
              ]),
              // The crosshair is the only active-state feedback; bands never dim.
              cond('readout.crosshair !== null', [
                el('path', {
                  part: 'crosshair',
                  class: ['crosshair'],
                  attrs: { 'data-active': lit(''), d: 'readout.crosshair' },
                }),
              ]),
            ],
          ),
        ]),
      ]),
    ],
  }),
  states: [
    {
      name: 'backlog composition',
      props: {
        data: BACKLOG,
        series: PRIORITY,
        x: { key: 'week', label: 'Week' },
        label: 'Open backlog by priority',
      },
      expect: { 'data-size': 'md' },
    },
    {
      // The same data as shares. The y axis formats itself as percent.
      name: 'percent',
      props: {
        data: BACKLOG,
        series: PRIORITY,
        x: { key: 'week', label: 'Week' },
        variant: 'percent',
        label: 'Share of open backlog by priority',
      },
    },
    {
      name: 'absent band',
      props: {
        data: WITH_HOLE,
        series: CHANNELS,
        x: { key: 'week', label: 'Week' },
        label: 'Ticket volume by channel',
      },
    },
    {
      name: 'emphasis',
      props: {
        data: BACKLOG,
        series: PRIORITY,
        x: { key: 'week', label: 'Week' },
        emphasis: 'urgent',
        label: 'Open backlog, urgent emphasised',
      },
    },
    {
      // Deliberately busy: eight bands is the limit, and the legend and twin carry the reading.
      name: 'max series',
      props: {
        data: EIGHT_ROWS,
        series: EIGHT,
        x: { key: 'week', label: 'Week' },
        label: 'Volume by channel',
      },
    },
    {
      name: 'baseline',
      props: {
        data: BACKLOG,
        series: PRIORITY,
        x: { key: 'week', label: 'Week' },
        baseline: { value: 120, label: 'Capacity' },
        label: 'Open backlog against capacity',
      },
    },
    {
      name: 'time scale',
      props: {
        data: DAYS,
        series: PRIORITY,
        x: { key: 'day', scale: 'time', label: 'Day' },
        label: 'Open backlog by day',
      },
    },
    {
      name: 'empty',
      props: { data: [], series: PRIORITY, x: { key: 'week' }, label: 'Open backlog' },
      expect: { 'data-state': 'empty' },
    },
    {
      name: 'loading',
      props: {
        data: BACKLOG,
        series: PRIORITY,
        x: { key: 'week' },
        loading: true,
        label: 'Open backlog',
      },
      expect: { 'data-state': 'loading' },
    },
    {
      name: 'tooltip off',
      props: {
        data: BACKLOG,
        series: PRIORITY,
        x: { key: 'week' },
        tooltip: false,
        label: 'Open backlog, print',
      },
    },
    {
      // With `onSelect`: the summary names the activation, and an agent can pick a week.
      name: 'selectable',
      props: {
        data: BACKLOG,
        series: PRIORITY,
        x: { key: 'week', label: 'Week' },
        label: 'Open backlog by priority',
        onSelect: { js: '() => {}' },
      },
    },
    {
      // With `onBrushEnd` on a time x: a person, or an agent, brushes a range of days.
      name: 'brushable',
      props: {
        data: DAYS,
        series: PRIORITY,
        x: { key: 'day', scale: 'time', label: 'Day' },
        label: 'Open backlog by day',
        onBrushEnd: { js: '() => {}' },
      },
    },
  ],
})
