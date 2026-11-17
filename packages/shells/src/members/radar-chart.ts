import {
  capEffect,
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

/** The React fixture's data: Relay's coaching rubric, one shared 0–5 scale on every axis. */
const SKILL_AXES = [
  { key: 'firstResponse', label: 'First response' },
  { key: 'resolution', label: 'Resolution' },
  { key: 'csat', label: 'CSAT' },
  { key: 'escalation', label: 'Escalation judgment' },
  { key: 'coverage', label: 'Coverage' },
]

/** One row per axis, in the axes' order: the agent against the team median. */
const COACHING = [
  { agent: 4.5, team: 3.8 },
  { agent: 3.2, team: 3.6 },
  { agent: 4.8, team: 4.1 },
  { agent: 2.9, team: 3.4 },
  { agent: 3.9, team: 3.7 },
]

/** Three teams on the same rubric, which fills the series cap. */
const TEAMS = [
  { triage: 4.2, escalations: 3.5, billing: 3.9 },
  { triage: 3.8, escalations: 4.3, billing: 3.2 },
  { triage: 4.5, escalations: 3.9, billing: 4.0 },
  { triage: 3.1, escalations: 4.6, billing: 3.6 },
  { triage: 3.7, escalations: 3.3, billing: 4.4 },
]

const SIX_AXES = [...SKILL_AXES, { key: 'tooling', label: 'Tooling fluency' }]

const SIX_ROWS = [...COACHING, { agent: 4.1, team: 3.9 }]

/** One `null` vertex mid-polygon: the stroke breaks and the twin shows an empty cell. */
const GAPPED = COACHING.map((row, index) => (index === 2 ? { agent: null, team: row.team } : row))

/** Coverage ratios, 0–1, for the percent format. */
const RATIOS = [
  { weekdays: 0.92, weekends: 0.54 },
  { weekdays: 0.81, weekends: 0.4 },
  { weekdays: 0.88, weekends: 0.61 },
  { weekdays: 0.74, weekends: 0.35 },
  { weekdays: 0.9, weekends: 0.5 },
]

const PAIR = [
  { key: 'agent', label: 'Priya R.' },
  { key: 'team', label: 'Team median' },
]

/**
 * RadarChart (`design/components/radar-chart.md`): items profiled over three
 * to six shared-unit axes, on one zero-based radial scale. The drawing is the
 * engine's `radarChartModel`, which the React member draws too: the shared
 * scale, the rings and spokes, every polygon, vertex and axis label, and the
 * guardrails' dev warnings, the palette's series cap among them. The readout
 * at a reading position is `radarChartReadout`, and what `onSelect` reports is
 * `radarChartSelection`.
 *
 * The plot is one focus stop. Left/Right walk the axes around the polygon and
 * wrap past the last spoke, and Up/Down switch series at the same axis,
 * through the engine's reading machine; the pointer reads the nearest vertex
 * within the hit-target minimum. Enter, Space and a click report the selection
 * when the caller listens for `select`. The legend toggles a series out of the
 * marks, and the shared scale refits to the rest. The cap is read from the
 * plot when the marks appear (`capEffect`).
 */
export default describeMember({
  member: 'RadarChart',
  dir: 'charts',
  recipe: 'charts/radar-chart',
  recipes: FRAME_RECIPES,
  defaults: {
    size: lit('md'),
    tooltip: '() => ({})',
    loading: 'false',
    messages: '() => DEFAULT_CHART_MESSAGES',
  },
  // The reading's series coordinate starts at the first polygon: a vertex always has one.
  state: { ...chartState('0'), cap: 'readChartCap(null)' },
  derived: {
    input:
      '({ axes, data, series, format, label, locale, messages, tooltip, loading, selectable: listening.select, hidden, cap, box })',
    model: 'radarChartModel(input)',
    view: 'readingView(position, axes.length, model.visible.length)',
    readout: 'radarChartReadout(input, model, view)',
    // The polygon under the reading position.
    walked: 'view.series ?? 0',
    activate:
      "() => { const selection = radarChartSelection(input, model, reading.now()); if (selection !== null) emit('select', selection) }",
    // The axes form a cycle, so Left/Right wrap; Up/Down switch polygons at the same axis.
    walk: '({ count: axes.length, seriesCount: model.visible.length, walkSeries: true, seriesStart: 0, wrap: true })',
    marks: chartMarkSource('radarChart'),
    onKey:
      "(event: KeyboardEvent) => { if (listening.select && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); activate(); return } reading.update(walk); if (reading.key(event.key)) event.preventDefault() }",
    // The nearest vertex in 2D, within the hit-target minimum; series-major, so the axis is the remainder.
    onPointer:
      '(event: PointerEvent) => { if (model.plot === null) return; const rect = (event.currentTarget as Element).getBoundingClientRect(); const hit = nearest2D(model.positions, event.clientX - rect.left, event.clientY - rect.top); if (hit === -1) { reading.clear(); return } reading.moveTo(hit % axes.length, Math.floor(hit / axes.length)) }',
  },
  effects: [...chartEffects(), capEffect()],
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
    member: 'RadarChart',
    state: 'model.state',
    summary: 'model.summary',
    announcement: 'readout.announcement',
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
      // One focus stop. Left/Right walk the axes around the polygon; Up/Down switch series.
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
              },
              [
                el('g', { part: 'centre', attrs: { transform: 'model.plot?.transform' } }, [
                  // The rings, polygons through the spokes, then the spokes.
                  el('g', { part: 'grid', class: ['grid'] }, [
                    each('model.plot?.grid ?? []', 'line', 'line.key', [
                      el('path', { attrs: { d: 'line.d' } }),
                    ]),
                  ]),
                  // One group per series: wash, stroke and vertices, as in a line chart, drawn radially.
                  el('g', { part: 'profiles', class: ['profiles'] }, [
                    each('model.plot?.profiles ?? []', 'profile', 'profile.key', [
                      el(
                        'g',
                        {
                          geometry: { '--pm-chart-mark': 'profile.paint' },
                          attrs: {
                            'data-active': flag('view.active && walked === profile.series'),
                          },
                        },
                        [
                          el('path', { class: ['wash'], attrs: { d: 'profile.d' } }),
                          el('path', { class: ['stroke'], attrs: { d: 'profile.d' } }),
                          each('profile.vertices', 'vertex', 'vertex.key', [
                            el('circle', {
                              class: ['vertex'],
                              attrs: {
                                cx: 'vertex.x',
                                cy: 'vertex.y',
                                r: 'vertex.r',
                                'data-active': flag(
                                  'view.index === vertex.index && walked === profile.series',
                                ),
                              },
                            }),
                          ]),
                        ],
                      ),
                    ]),
                  ]),
                  // Axis labels at each spoke's end, in text tokens, never series colour.
                  el('g', { part: 'labels', class: ['labels'] }, [
                    each('model.plot?.labels ?? []', 'spoke', 'spoke.key', [
                      el(
                        'text',
                        {
                          attrs: { x: 'spoke.x', y: 'spoke.y', 'text-anchor': 'spoke.anchor' },
                        },
                        [text('spoke.text')],
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
      name: 'skills matrix',
      props: {
        axes: SKILL_AXES,
        data: COACHING,
        series: PAIR,
        label: 'Coaching profile against the team',
      },
      expect: { 'data-size': 'md' },
    },
    {
      name: 'three series',
      props: {
        axes: SKILL_AXES,
        data: TEAMS,
        series: [
          { key: 'triage', label: 'Triage' },
          { key: 'escalations', label: 'Escalations' },
          { key: 'billing', label: 'Billing' },
        ],
        label: 'Three teams on the rubric',
      },
    },
    {
      name: 'six axes',
      props: {
        axes: SIX_AXES,
        data: SIX_ROWS,
        series: PAIR,
        label: 'The full rubric — the readable limit',
      },
    },
    {
      name: 'gap',
      props: {
        axes: SKILL_AXES,
        data: GAPPED,
        series: PAIR,
        label: 'Coaching profile with an unmeasured axis',
      },
    },
    {
      name: 'format',
      props: {
        axes: [
          { key: 'mon', label: 'Mon' },
          { key: 'wed', label: 'Wed' },
          { key: 'fri', label: 'Fri' },
          { key: 'sat', label: 'Sat' },
          { key: 'sun', label: 'Sun' },
        ],
        data: RATIOS,
        series: [
          { key: 'weekdays', label: 'Day shift' },
          { key: 'weekends', label: 'Night shift' },
        ],
        format: { style: 'percent' },
        label: 'Coverage by day',
      },
    },
    {
      // One series: no legend, because the panel title names it.
      name: 'single series',
      props: {
        axes: SKILL_AXES,
        data: COACHING,
        series: [{ key: 'team', label: 'Team median' }],
        label: 'The team profile',
      },
    },
    {
      name: 'empty',
      props: {
        axes: SKILL_AXES,
        data: [],
        series: PAIR,
        label: 'Coaching profile against the team',
      },
      expect: { 'data-state': 'empty' },
    },
    {
      name: 'loading',
      props: {
        axes: SKILL_AXES,
        data: COACHING,
        series: PAIR,
        loading: true,
        label: 'Coaching profile against the team',
      },
      expect: { 'data-state': 'loading' },
    },
    {
      // `false` removes the visual layer only: the reading, its announcements and the twin stay.
      name: 'tooltip off',
      props: {
        axes: SKILL_AXES,
        data: COACHING,
        series: PAIR,
        tooltip: false,
        label: 'Coaching profile, print',
      },
    },
    {
      // With `onSelect`: the summary names the activation, and an agent can pick a vertex.
      name: 'selectable',
      props: {
        axes: SKILL_AXES,
        data: COACHING,
        series: PAIR,
        label: 'Coaching profile against the team',
        onSelect: { js: '() => {}' },
      },
    },
  ],
})
