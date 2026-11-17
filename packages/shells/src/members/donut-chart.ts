import {
  chartEffects,
  chartFrame,
  chartLegend,
  chartMarkSource,
  chartState,
  chartTooltip,
  chartTwin,
  FRAME_RECIPES,
} from '../chart-frame'
import { cond, describeMember, each, el, flag, lit, run, text } from '../dsl'

/** The React fixture's data: Relay's tickets by channel. */
const CHANNELS = [
  { key: 'email', label: 'Email', value: 214 },
  { key: 'chat', label: 'Chat', value: 96 },
  { key: 'phone', label: 'Phone', value: 41 },
  { key: 'social', label: 'Social', value: 18 },
]

const TEAMS = [
  { key: 'frontline', label: 'Frontline', value: 128 },
  { key: 'billing', label: 'Billing', value: 74 },
  { key: 'technical', label: 'Technical', value: 61 },
  { key: 'escalations', label: 'Escalations', value: 39 },
  { key: 'partners', label: 'Partners', value: 22 },
  { key: 'onboarding', label: 'Onboarding', value: 14 },
]

/** A channel with no use this month. The ring skips it; the legend keeps it. */
const WITH_ZERO = [...CHANNELS.slice(0, 3), { key: 'social', label: 'Social', value: 0 }]

/**
 * The values every chart holds, without `hidden`: the legend only labels, so
 * no segment is hidden.
 */
const { hidden: _hidden, ...RING_STATE } = chartState()

/**
 * DonutChart (`design/components/donut-chart.md`): how a whole splits into at
 * most six parts, as a ring of arcs with the total in the hole and no axes. The
 * drawing is the engine's `donutChartModel`, which the React member draws too:
 * the slots, the total, every arc and its pointer target, the centre figure and
 * the dev warnings. The readout at a reading position is `donutChartReadout`,
 * which places the tooltip outside the ring on the segment's bearing, and what
 * `onSelect` reports is `donutChartSelection`, with the segment's share.
 *
 * The plot is one focus stop. Left/Right walk the segments clockwise through
 * the engine's reading machine, and the pointer reads the segment whose target
 * it enters. Enter, Space and a click report the selection when the caller
 * listens for `select`. The legend only labels: a ring has no domain to refit.
 */
export default describeMember({
  member: 'DonutChart',
  dir: 'charts',
  recipe: 'charts/donut-chart',
  recipes: FRAME_RECIPES,
  defaults: {
    size: lit('md'),
    tooltip: '() => ({})',
    loading: 'false',
    messages: '() => DEFAULT_CHART_MESSAGES',
  },
  state: RING_STATE,
  derived: {
    input:
      '({ segments, center, format, label, locale, messages, tooltip, loading, selectable: listening.select, box })',
    model: 'donutChartModel(input)',
    view: 'readingView(position, segments.length)',
    readout: 'donutChartReadout(input, model, view)',
    activate:
      "() => { const selection = donutChartSelection(input, model, reading.now()); if (selection !== null) emit('select', selection) }",
    walk: '({ count: segments.length })',
    marks: chartMarkSource('donutChart'),
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
    member: 'DonutChart',
    state: 'model.state',
    summary: 'model.summary',
    announcement: 'readout.announcement',
    legend: [
      cond('model.legend', [
        chartLegend({
          series: 'model.painted',
          keyShape: 'rect',
          rootClass: 'chartLegend.legend',
          toggles: false,
        }),
      ]),
    ],
    twin: [chartTwin('model.twin.columns', 'model.twin.rows')],
    tooltip: [chartTooltip('readout.tooltip')],
    plot: [
      // One focus stop. Left/Right walk the segments clockwise.
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
                  'data-reading': flag('view.active'),
                  width: 'model.plot?.width',
                  height: 'model.plot?.height',
                  'aria-hidden': lit('true'),
                  focusable: lit('false'),
                },
              },
              [
                el('g', { part: 'ring centre', attrs: { transform: 'model.plot?.transform' } }, [
                  el('g', { part: 'ring' }, [
                    each('model.plot?.arcs ?? []', 'arc', 'arc.key', [
                      el('path', {
                        class: ['segment'],
                        geometry: { '--pm-chart-mark': 'arc.paint' },
                        attrs: { 'data-active': flag('view.index === arc.index'), d: 'arc.d' },
                      }),
                    ]),
                  ]),
                  // The pointer targets, over the paint: a sliver's target is grown to 24px.
                  el('g', { part: 'hits' }, [
                    each('model.plot?.arcs ?? []', 'arc', 'arc.key', [
                      el('path', {
                        class: ['hit'],
                        attrs: { d: 'arc.hit' },
                        on: { pointerenter: run('reading.moveTo(arc.index)') },
                      }),
                    ]),
                  ]),
                ]),
                cond('(model.plot?.center ?? null) !== null', [
                  el('g', { part: 'centre figure', class: ['center'] }, [
                    el(
                      'text',
                      {
                        attrs: {
                          x: 'model.plot?.center?.x',
                          y: 'model.plot?.center?.y',
                          'text-anchor': lit('middle'),
                        },
                      },
                      [text('model.plot?.center?.value')],
                    ),
                    cond('model.plot?.center?.label !== undefined', [
                      el(
                        'text',
                        {
                          class: ['centerLabel'],
                          attrs: {
                            x: 'model.plot?.center?.x',
                            y: 'model.plot?.center?.labelY',
                            'text-anchor': lit('middle'),
                          },
                        },
                        [text('model.plot?.center?.label')],
                      ),
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
      name: 'channels',
      props: {
        segments: CHANNELS,
        center: { value: '369', label: 'Open tickets' },
        label: 'Open tickets by channel',
      },
      expect: { 'data-size': 'md' },
    },
    {
      // At the six-segment limit; a seventh raises a dev warning suggesting an "Other" segment.
      name: 'six segments',
      props: {
        segments: TEAMS,
        center: { value: '338', label: 'Open tickets' },
        label: 'Open tickets by team',
      },
    },
    {
      name: 'two segments',
      props: {
        segments: [
          { key: 'resolved', label: 'Resolved', value: 812 },
          { key: 'open', label: 'Open', value: 369 },
        ],
        center: { value: '1,181', label: 'This month' },
        label: 'Resolved against open',
      },
    },
    {
      // One share so dominant that no reader has to estimate an angle to see it.
      name: 'dominant share',
      props: {
        segments: [
          { key: 'self', label: 'Self-serve', value: 880 },
          { key: 'assisted', label: 'Assisted', value: 120 },
        ],
        center: { value: '88%', label: 'Self-serve' },
        label: 'Resolution path',
      },
    },
    {
      name: 'zero segment',
      props: {
        segments: WITH_ZERO,
        center: { value: '351', label: 'Open tickets' },
        label: 'Open tickets by channel, with an unused channel',
      },
    },
    {
      name: 'no center',
      props: { segments: CHANNELS, label: 'Open tickets by channel' },
    },
    {
      name: 'format',
      props: {
        segments: [
          { key: 'plan', label: 'Subscriptions', value: 48_200 },
          { key: 'seats', label: 'Seats', value: 21_400 },
          { key: 'support', label: 'Support', value: 9600 },
        ],
        format: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 },
        center: { value: '$79,200', label: 'Monthly revenue' },
        label: 'Revenue by line',
      },
    },
    {
      name: 'empty',
      props: { segments: [], label: 'Open tickets by channel' },
      expect: { 'data-state': 'empty' },
    },
    {
      name: 'loading',
      props: { segments: CHANNELS, loading: true, label: 'Open tickets by channel' },
      expect: { 'data-state': 'loading' },
    },
    {
      name: 'tooltip off',
      props: { segments: CHANNELS, tooltip: false, label: 'Open tickets by channel, print' },
    },
    {
      // With `onSelect`: the summary names the activation, and an agent can pick a segment.
      name: 'selectable',
      props: {
        segments: CHANNELS,
        center: { value: '369', label: 'Open tickets' },
        label: 'Open tickets by channel',
        onSelect: { js: '() => {}' },
      },
    },
  ],
})
