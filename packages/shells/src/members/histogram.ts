import {
  chartAxis,
  chartEffects,
  chartFrame,
  chartMarkSource,
  chartState,
  chartTooltip,
  chartTwin,
  FRAME_RECIPES,
} from '../chart-frame'
import { cond, describeMember, each, el, flag, lit, run } from '../dsl'

/*
 * The React fixture's samples, computed here by the same arithmetic, so the
 * generated fixture holds them as plain numbers. Random data would draw a
 * different shape on every render, and the shape is what the chart shows.
 */

/** One week of first-response minutes, n = 240: most under 10, with a shoulder out to 45. */
const FIRST_RESPONSE: number[] = [
  ...Array.from({ length: 200 }, (_, index) => Math.round(((index * 7919) % 1000) / 10) / 10),
  ...Array.from({ length: 40 }, (_, index) => 10 + Math.round(((index * 104729) % 3500) / 10) / 10),
]

/** Resolution hours with a long right tail: most tickets close within four hours. */
const RESOLUTION_HOURS: number[] = [
  ...Array.from({ length: 150 }, (_, index) => Math.round(((index * 31) % 400) / 10) / 10),
  ...Array.from({ length: 30 }, (_, index) => 4 + Math.round((index / 30) ** 2 * 680) / 10),
]

/** A new queue: fourteen observations. Sturges gives about 5 bins, and nothing is smoothed. */
const FEW: number[] = [2.1, 3.4, 3.8, 4.2, 5.0, 5.5, 6.1, 6.8, 7.2, 8.0, 9.4, 11.2, 12.8, 14.5]

/** Order values in dollars, for the currency format's "$0–$25" ranges. */
const ORDER_VALUES: number[] = Array.from(
  { length: 120 },
  (_, index) => ((index * 53) % 140) + ((index * 17) % 23),
)

/**
 * The values every chart holds, without `hidden`: a sample has no series, so
 * the chart has no legend to hide one from.
 */
const { hidden: _hidden, ...SAMPLE_STATE } = chartState()

/**
 * Histogram (`design/components/histogram.md`): the distribution of one
 * sample, as contiguous bars over its bins on a continuous measure, with the
 * count axis anchored at zero. The drawing is the engine's `histogramModel`,
 * which the React member draws too: the bins from `binSample`, their en-dash
 * ranges, the bars, the edge ticks and the count ticks, and the dev warning.
 * The readout at a reading position is `histogramReadout`, and what `onSelect`
 * reports is `histogramSelection`, the bin's edges and count.
 *
 * The plot is one focus stop. Left/Right walk the bins in axis order through
 * the engine's reading machine; the pointer reads the bin nearest its
 * coordinate. Enter, Space and a click report the selection when the caller
 * listens for `select`. There is no legend: one measure, one paint.
 */
export default describeMember({
  member: 'Histogram',
  dir: 'charts',
  recipe: 'charts/histogram',
  recipes: FRAME_RECIPES,
  defaults: {
    size: lit('md'),
    tooltip: '() => ({})',
    loading: 'false',
    messages: '() => DEFAULT_CHART_MESSAGES',
  },
  state: SAMPLE_STATE,
  derived: {
    input:
      '({ data, bins, x, y, label, locale, messages, tooltip, loading, selectable: listening.select, box })',
    model: 'histogramModel(input)',
    view: 'readingView(position, model.bins.length)',
    readout: 'histogramReadout(input, model, view)',
    activate:
      "() => { const selection = histogramSelection(input, model, reading.now()); if (selection !== null) emit('select', selection) }",
    walk: '({ count: model.bins.length })',
    marks: chartMarkSource('histogram'),
    onKey:
      "(event: KeyboardEvent) => { if (listening.select && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); activate(); return } reading.update(walk); if (reading.key(event.key)) event.preventDefault() }",
    // The reading follows the pointer's coordinate, snapped to the nearest bin, as in BarChart.
    onPointer:
      '(event: PointerEvent) => { if (model.plot === null) return; const rect = (event.currentTarget as Element).getBoundingClientRect(); reading.moveTo(nearestIndex(model.positions, event.clientX - rect.left)) }',
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
    member: 'Histogram',
    state: 'model.state',
    summary: 'model.summary',
    announcement: 'readout.announcement',
    // No axes without bins: an axis over an empty plot shows a range that was never measured.
    yAxis: [chartAxis('y', 'model.axes?.y')],
    xAxis: [chartAxis('x', 'model.axes?.x')],
    twin: [chartTwin('model.twin.columns', 'model.twin.rows')],
    tooltip: [chartTooltip('readout.tooltip')],
    plot: [
      // One focus stop. Left/Right walk the bins in axis order.
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
                // Hairlines on the count axis only.
                el('g', { part: 'grid', class: ['grid'] }, [
                  each('model.plot?.grid ?? []', 'line', 'line.key', [
                    el('path', { attrs: { d: 'line.d' } }),
                  ]),
                ]),
                el('g', { part: 'bins', class: ['bins'] }, [
                  each('model.plot?.bars ?? []', 'bar', 'bar.key', [
                    el('g', { attrs: { 'data-active': flag('view.index === bar.index') } }, [
                      el('rect', {
                        class: ['hit'],
                        attrs: {
                          x: 'bar.hit.x',
                          y: 'bar.hit.y',
                          width: 'bar.hit.width',
                          height: 'bar.hit.height',
                        },
                        on: { pointerenter: run('reading.moveTo(bar.index)') },
                      }),
                      // An empty bin draws no bar and keeps its place.
                      cond('bar.d !== null', [
                        el('path', { class: ['bar'], attrs: { d: 'bar.d ?? undefined' } }),
                      ]),
                    ]),
                  ]),
                ]),
                // The zero baseline, the only axis stroke.
                el('path', { part: 'zero', class: ['zero'], attrs: { d: 'model.plot?.zeroRule' } }),
              ],
            ),
          ]),
        ],
      ),
    ],
  }),
  states: [
    {
      name: 'first-response minutes',
      props: {
        data: FIRST_RESPONSE,
        x: { label: 'Minutes to first response' },
        label: 'First response time, this week',
      },
      expect: { 'data-size': 'md' },
    },
    {
      name: 'skewed',
      props: {
        data: RESOLUTION_HOURS,
        x: { label: 'Hours to resolution' },
        label: 'Resolution time, this month',
      },
    },
    {
      name: 'few points',
      props: { data: FEW, x: { label: 'Minutes' }, label: 'First responses, new queue' },
    },
    {
      name: 'bins override',
      props: {
        data: FIRST_RESPONSE,
        bins: 20,
        x: { label: 'Minutes to first response' },
        label: 'First response time, the finer read',
      },
    },
    {
      name: 'format',
      props: {
        data: ORDER_VALUES,
        x: { label: 'Order value', format: { style: 'currency', currency: 'USD' } },
        label: 'Order values',
      },
    },
    {
      name: 'empty',
      props: { data: [], label: 'First response time, this week' },
      expect: { 'data-state': 'empty' },
    },
    {
      name: 'loading',
      props: { data: FIRST_RESPONSE, loading: true, label: 'First response time, this week' },
      expect: { 'data-state': 'loading' },
    },
    {
      // `false` removes the visual layer only: the reading, its announcements and the twin stay.
      name: 'tooltip off',
      props: { data: FIRST_RESPONSE, tooltip: false, label: 'First response time, print' },
    },
    {
      // With `onSelect`: the summary names the activation, and an agent can pick a bin.
      name: 'selectable',
      props: {
        data: FIRST_RESPONSE,
        x: { label: 'Minutes to first response' },
        label: 'First response time, this week',
        onSelect: { js: '() => {}' },
      },
    },
  ],
})
