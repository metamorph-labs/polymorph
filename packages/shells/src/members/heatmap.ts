import {
  chartAxis,
  chartEffects,
  chartFrame,
  chartMarkSource,
  chartScaleLegend,
  chartState,
  chartTooltip,
  chartTwin,
  FRAME_RECIPES,
} from '../chart-frame'
import { cond, describeMember, each, el, flag, lit, run } from '../dsl'

/** The React fixture's data: Relay's support week, weekday × hour band. */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const BANDS = ['00–04', '04–08', '08–12', '12–16', '16–20', '20–24']

/** Quiet overnight, a working-hours plateau, and a Tue–Thu surge across the two midday bands. */
const VOLUME: Record<string, readonly number[]> = {
  Mon: [1, 6, 34, 38, 21, 4],
  Tue: [2, 8, 51, 58, 26, 5],
  Wed: [1, 7, 49, 55, 24, 6],
  Thu: [2, 9, 46, 52, 23, 4],
  Fri: [1, 5, 31, 29, 17, 3],
  Sat: [0, 2, 9, 11, 7, 2],
  Sun: [0, 1, 6, 8, 5, 1],
}

const WEEK = DAYS.flatMap((day) =>
  BANDS.map((band, index) => ({ band, day, tickets: VOLUME[day]?.[index] ?? 0 })),
)

/** The same grid at thousands scale, so `compact` has something to shorten. */
const AT_SCALE = WEEK.map((row) => ({ ...row, tickets: row.tickets * 214 }))

/** A new product's first fortnight: most cells absent, which must show the surface. */
const SPARSE = WEEK.map((row) => {
  const live =
    (row.day === 'Wed' && row.band === '08–12') ||
    (row.day === 'Wed' && row.band === '12–16') ||
    (row.day === 'Thu' && row.band === '12–16') ||
    (row.day === 'Fri' && row.band === '08–12')
  return { ...row, tickets: live ? row.tickets : null }
})

/** Fourteen calendar dates as columns, against channels: a date already implies its weekday. */
const CHANNELS = ['Email', 'Chat', 'Phone', 'Social']

const FORTNIGHT = CHANNELS.flatMap((channel, row) =>
  Array.from({ length: 14 }, (_, index) => {
    const weekend = index % 7 === 5 || index % 7 === 6
    const base = [64, 38, 21, 9][row] ?? 10
    return {
      date: `2026-07-${String(index + 1).padStart(2, '0')}`,
      channel,
      tickets: Math.round(base * (weekend ? 0.3 : 1) * (1 + ((index * 7) % 5) / 12)),
    }
  }),
)

/** Staffing delta against plan, weekday × shift: signed values −6…+8 with one exact zero. */
const SHIFTS = ['Morning', 'Midday', 'Evening', 'Night']

const DELTAS: Record<string, readonly number[]> = {
  Mon: [-6, -2, 1, 2],
  Tue: [-4, 3, 5, 1],
  Wed: [-1, 8, 0, -2],
  Thu: [2, 6, 4, -3],
  Fri: [-5, -3, 2, 3],
}

const STAFFING = Object.keys(DELTAS).flatMap((day) =>
  SHIFTS.map((shift, index) => ({ shift, day, delta: DELTAS[day]?.[index] ?? 0 })),
)

const HOUR_BY_DAY = { x: { key: 'band', label: 'Hour' }, y: { key: 'day', label: 'Day' } }

const BARE = { x: { key: 'band' }, y: { key: 'day' }, value: { key: 'tickets' } }

/**
 * The values every chart holds, without `hidden`: a heatmap has no series for a legend to hide.
 * A cell always has a row, so the reading's second coordinate rests on the first (`0`).
 */
const { hidden: _hidden, ...GRID_STATE } = chartState('0')

/**
 * Heatmap (`design/components/heatmap.md`): magnitude over a band × band grid,
 * on the sequential ramp, or on the diverging arms when the measure is signed.
 * The drawing is the engine's `heatmapModel`, which the React member draws
 * too: the grid, the quantisation, every cell's paint and pointer target, and
 * the scale legend's bounds. The readout at a reading position is
 * `heatmapReadout`, and what `onSelect` reports is `heatmapSelection`.
 *
 * The plot is one focus stop. The reading's index walks the columns with
 * Left/Right and its second coordinate walks the rows with Up/Down, starting
 * on the first row (`seriesStart: 0`), through the engine's reading machine;
 * the pointer reads the cell whose target it enters. Enter, Space and a click
 * report the read cell when the caller listens for `select`, and an absent
 * cell reports nothing. The scale legend replaces the series legend.
 */
export default describeMember({
  member: 'Heatmap',
  dir: 'charts',
  recipe: 'charts/heatmap',
  recipes: FRAME_RECIPES,
  defaults: {
    size: lit('md'),
    tooltip: '() => ({})',
    loading: 'false',
    messages: '() => DEFAULT_GRID_MESSAGES',
  },
  state: GRID_STATE,
  derived: {
    input:
      '({ data, x, y, value, label, locale, messages, tooltip, loading, selectable: listening.select, box })',
    model: 'heatmapModel(input)',
    view: 'readingView(position, model.columns.length, model.rows.length)',
    readout: 'heatmapReadout(input, model, view)',
    activate:
      "() => { const selection = heatmapSelection(input, model, reading.now()); if (selection !== null) emit('select', selection) }",
    // Left/Right walk the columns and Up/Down the rows, in reading order.
    walk: '({ count: model.columns.length, seriesCount: model.rows.length, walkSeries: true, seriesStart: 0 })',
    marks: chartMarkSource('heatmap'),
    onKey:
      "(event: KeyboardEvent) => { if (listening.select && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); activate(); return } reading.update(walk); if (reading.key(event.key)) event.preventDefault() }",
  },
  effects: chartEffects(),
  // The spec's `agent` fence, which every chart that takes `onSelect` gives (`chartMarkSource`).
  agent: {
    on: 'frame',
    state: {
      items: 'chartMarks(marks, reading)',
      position: 'chartPosition(marks, reading)',
      count: 'walk.count',
    },
    actions: {
      read: { argument: 'number', run: 'readChartPosition(marks, value, reading)' },
      choose: { argument: 'id', run: 'chooseChartMark(marks, value, reading, activate)' },
    },
    unless: '!listening.select',
  },
  template: chartFrame({
    member: 'Heatmap',
    state: 'model.state',
    summary: 'model.summary',
    announcement: 'readout.announcement',
    // The axis names are not drawn: on a grid they would overlap a band label. They head the twin.
    yAxis: [chartAxis('y', 'model.axes?.y')],
    xAxis: [chartAxis('x', 'model.axes?.x')],
    // The scale legend replaces the series legend: a range to read against, not series to name.
    legend: [cond('model.legend', [chartScaleLegend('model.scale.variant', 'model.scale')])],
    twin: [chartTwin('model.twin.columns', 'model.twin.rows')],
    tooltip: [chartTooltip('readout.tooltip')],
    plot: [
      // One focus stop. Arrow keys walk the cells in reading order.
      el(
        'div',
        {
          part: 'surface',
          class: ['surface'],
          attrs: { tabindex: lit('0'), role: lit('img'), 'aria-label': 'label' },
          on: {
            keydown: run('onKey($event)'),
            click: run('activate()'),
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
                  width: 'model.plot?.width',
                  height: 'model.plot?.height',
                  'aria-hidden': lit('true'),
                  focusable: lit('false'),
                },
              },
              [
                // An absent cell draws nothing and shows the surface, never the lightest step.
                el('g', { part: 'cells', class: ['cells'] }, [
                  each('model.plot?.cells ?? []', 'cell', 'cell.key', [
                    el('rect', {
                      class: ['cell'],
                      geometry: { '--pm-chart-cell': 'cell.paint' },
                      attrs: {
                        'data-active': flag(
                          'view.index === cell.column && (view.series ?? 0) === cell.row',
                        ),
                        x: 'cell.x',
                        y: 'cell.y',
                        width: 'cell.width',
                        height: 'cell.height',
                        rx: 'model.plot?.radius',
                      },
                    }),
                  ]),
                ]),
                // The pointer targets: one per grid position, present or absent.
                el('g', { part: 'hits', class: ['hits'] }, [
                  each('model.plot?.hits ?? []', 'hit', 'hit.key', [
                    el('rect', {
                      class: ['hit'],
                      attrs: {
                        x: 'hit.x',
                        y: 'hit.y',
                        width: 'hit.width',
                        height: 'hit.height',
                      },
                      on: { pointerenter: run('reading.moveTo(hit.column, hit.row)') },
                    }),
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
      name: 'the support week',
      props: {
        data: WEEK,
        ...HOUR_BY_DAY,
        value: { key: 'tickets' },
        label: 'Ticket volume by weekday and hour',
      },
      expect: { 'data-size': 'md' },
    },
    {
      name: 'compact format',
      props: {
        data: AT_SCALE,
        ...HOUR_BY_DAY,
        value: { key: 'tickets', format: { style: 'compact' } },
        label: 'Session volume by weekday and hour',
      },
    },
    {
      name: 'sparse',
      props: {
        data: SPARSE,
        ...HOUR_BY_DAY,
        value: { key: 'tickets' },
        label: 'Ticket volume in the first fortnight',
      },
    },
    {
      name: 'time-labeled x',
      props: {
        data: FORTNIGHT,
        x: { key: 'date', format: { style: 'date', granularity: 'day' }, label: 'Date' },
        y: { key: 'channel', label: 'Channel' },
        value: { key: 'tickets' },
        label: 'Ticket volume by channel and date',
      },
    },
    {
      name: 'empty',
      props: { data: [], ...BARE, label: 'Ticket volume by weekday and hour' },
      expect: { 'data-state': 'empty' },
    },
    {
      name: 'loading',
      props: { data: WEEK, ...BARE, loading: true, label: 'Ticket volume by weekday and hour' },
      expect: { 'data-state': 'loading' },
    },
    {
      name: 'tooltip off',
      props: {
        data: WEEK,
        ...BARE,
        tooltip: false,
        label: 'Ticket volume by weekday and hour, print',
      },
    },
    {
      // Signed data switches to diverging automatically: the symmetric range, one exact zero in
      // the mid colour, and the scale legend's three labels (min · zero · max).
      name: 'diverging',
      props: {
        data: STAFFING,
        x: { key: 'shift', label: 'Shift' },
        y: { key: 'day', label: 'Day' },
        value: { key: 'delta' },
        label: 'Staffing delta vs plan by weekday and shift',
      },
    },
    {
      // With `onSelect`: the summary names the activation, and an agent can pick a cell.
      name: 'selectable',
      props: {
        data: WEEK,
        ...HOUR_BY_DAY,
        value: { key: 'tickets' },
        label: 'Ticket volume by weekday and hour',
        onSelect: { js: '() => {}' },
      },
    },
  ],
})
