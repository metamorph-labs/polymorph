import {
  chartEffects,
  chartFrame,
  chartMarkSource,
  chartState,
  chartTooltip,
  chartTwin,
  FRAME_RECIPES,
} from '../chart-frame'
import { cond, describeMember, each, el, flag, lit, run, text } from '../dsl'

/** The React fixture's data: Relay's tickets this month, from opened to rated. */
const LIFECYCLE = [
  { key: 'opened', label: 'Opened', value: 1240 },
  { key: 'assigned', label: 'Assigned', value: 1180 },
  { key: 'replied', label: 'First reply', value: 1020 },
  { key: 'resolved', label: 'Resolved', value: 860 },
  { key: 'rated', label: 'Rated', value: 312 },
]

/** The help centre's self-serve path, twelve steps long. */
const TWELVE = [
  'Searched',
  'Opened an article',
  'Read to the end',
  'Opened a second article',
  'Used the contact form',
  'Picked a topic',
  'Wrote a message',
  'Attached a file',
  'Sent',
  'Got an answer',
  'Marked solved',
  'Rated the answer',
].map((label, index) => ({
  key: `step-${index + 1}`,
  label,
  value: Math.round(9600 * 0.82 ** index),
}))

/**
 * The values every chart holds, without `hidden`: a funnel is one series and
 * has no legend, so nothing is hidden.
 */
const { hidden: _hidden, ...FUNNEL_STATE } = chartState()

/** A line of text the plot draws, at the engine's position, from the inline start. */
const placed = (className: string, item: string, width?: string) =>
  el(
    'span',
    {
      class: [className],
      geometry: {
        '--pm-chart-text-x': `\`\${${item}.x}px\``,
        '--pm-chart-text-y': `\`\${${item}.y}px\``,
        ...(width === undefined ? {} : { '--pm-chart-text-width': width }),
      },
    },
    [text(`${item}.text`)],
  )

/**
 * FunnelChart (`design/components/funnel-chart.md`): the count that survives
 * each stage of an ordered process, as one horizontal bar per stage from the
 * inline start, with each stage's value and share of the first stage, and the
 * step rate between two bars. The drawing is the engine's `funnelChartModel`,
 * which the React member draws too: every bar, its pointer target, the text
 * that fits and the dev warnings. The readout at a reading position is
 * `funnelChartReadout`, and what `onSelect` reports is `funnelChartSelection`.
 *
 * The plot is one focus stop. Left/Right walk the stages through the engine's
 * reading machine, and the pointer reads the row whose target it enters. A
 * press on a row moves the reading there before the surface reports it, so
 * Enter, Space and a click report the stage when the caller listens for
 * `select`. There is no legend: every bar is the same series.
 */
export default describeMember({
  member: 'FunnelChart',
  dir: 'charts',
  recipe: 'charts/funnel-chart',
  recipes: FRAME_RECIPES,
  defaults: {
    size: lit('md'),
    tooltip: '() => ({})',
    loading: 'false',
    messages: '() => DEFAULT_CHART_MESSAGES',
  },
  state: FUNNEL_STATE,
  derived: {
    input:
      '({ stages, format, label, locale, messages, tooltip, loading, selectable: listening.select, box })',
    model: 'funnelChartModel(input)',
    view: 'readingView(position, stages.length)',
    readout: 'funnelChartReadout(input, model, view)',
    activate:
      "() => { const selection = funnelChartSelection(input, model, reading.now()); if (selection !== null) emit('select', selection) }",
    walk: '({ count: stages.length })',
    marks: chartMarkSource('funnelChart'),
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
    member: 'FunnelChart',
    state: 'model.state',
    summary: 'model.summary',
    announcement: 'readout.announcement',
    twin: [chartTwin('model.twin.columns', 'model.twin.rows')],
    tooltip: [chartTooltip('readout.tooltip')],
    plot: [
      // One focus stop. Left/Right walk the stages, first to last.
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
                // Where the bars start, which the entrance grows them from: geometry, not a decision.
                geometry: { '--pm-chart-zero': '`${model.plot?.start}px`' },
              },
              [
                el('g', { part: 'bars', class: ['bars'] }, [
                  each('model.plot?.bars ?? []', 'bar', 'bar.key', [
                    el('g', { attrs: { 'data-active': flag('view.index === bar.index') } }, [
                      cond("bar.d !== ''", [
                        el('path', {
                          class: ['bar'],
                          geometry: { '--pm-chart-mark': 'bar.paint' },
                          attrs: { d: 'bar.d' },
                        }),
                      ]),
                      // The stage's whole row, over its bar; a press reads it before the surface reports it.
                      el('rect', {
                        class: ['hit'],
                        attrs: {
                          x: 'bar.hit.x',
                          y: 'bar.hit.y',
                          width: 'bar.hit.width',
                          height: 'bar.hit.height',
                        },
                        on: {
                          pointerenter: run('reading.moveTo(bar.index)'),
                          click: run('reading.moveTo(bar.index)'),
                        },
                      }),
                    ]),
                  ]),
                ]),
              ],
            ),
            // The words on the plot, as HTML: a long label ends in an ellipsis.
            el('div', { part: 'text', class: ['text'], attrs: { 'aria-hidden': lit('true') } }, [
              each('model.plot?.labels ?? []', 'line', 'line.key', [
                placed('label', 'line', '`${model.plot?.labelWidth}px`'),
              ]),
              each('model.plot?.values ?? []', 'line', 'line.key', [placed('value', 'line')]),
              each('model.plot?.steps ?? []', 'line', 'line.key', [placed('step', 'line')]),
            ]),
          ]),
        ],
      ),
    ],
  }),
  states: [
    {
      name: 'lifecycle',
      props: { stages: LIFECYCLE, label: 'Tickets from opened to rated' },
      expect: { 'data-size': 'md' },
    },
    {
      name: 'two stages',
      props: { stages: LIFECYCLE.slice(0, 2), label: 'Tickets opened and assigned' },
    },
    { name: 'one stage', props: { stages: LIFECYCLE.slice(0, 1), label: 'Tickets opened' } },
    {
      // No share and no step can be stated against a first stage of zero.
      name: 'first stage zero',
      props: {
        stages: [
          { key: 'invited', label: 'Invited', value: 0 },
          { key: 'joined', label: 'Joined', value: 0 },
          { key: 'active', label: 'Active', value: 0 },
        ],
        label: 'Agents invited this week',
      },
    },
    {
      name: 'zero in the middle',
      props: {
        stages: [
          { key: 'escalated', label: 'Escalated', value: 46 },
          { key: 'engineering', label: 'Sent to engineering', value: 0 },
          { key: 'fixed', label: 'Fixed', value: 0 },
        ],
        label: 'Escalations this week',
      },
    },
    {
      name: 'equal stages',
      props: {
        stages: [
          { key: 'opened', label: 'Opened', value: 320 },
          { key: 'assigned', label: 'Assigned', value: 320 },
          { key: 'replied', label: 'First reply', value: 290 },
        ],
        label: 'Urgent tickets',
      },
    },
    {
      // Drawn as given and warned about: the member never clamps or reorders.
      name: 'rising stage',
      props: {
        stages: [
          { key: 'trial', label: 'Started a trial', value: 400 },
          { key: 'invited', label: 'Invited a teammate', value: 520 },
          { key: 'paid', label: 'Paid', value: 180 },
        ],
        label: 'Workspaces from trial to paid',
      },
    },
    {
      name: 'long labels',
      props: {
        stages: [
          {
            key: 'verify',
            label: 'Started the identity verification with a passport or a national card',
            value: 2048,
          },
          {
            key: 'upload',
            label: 'Uploaded both sides of the card and a recent photograph',
            value: 1630,
          },
          { key: 'approved', label: 'Approved', value: 1410 },
        ],
        label: 'Identity verification',
      },
    },
    { name: 'twelve stages', props: { stages: TWELVE, label: 'Self-serve help path' } },
    {
      name: 'format',
      props: {
        stages: [
          { key: 'pipeline', label: 'Pipeline', value: 1_840_000 },
          { key: 'qualified', label: 'Qualified', value: 920_000 },
          { key: 'proposal', label: 'Proposal', value: 410_000 },
          { key: 'won', label: 'Won', value: 126_000 },
        ],
        format: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 },
        label: 'Seat revenue by stage',
      },
    },
    {
      name: 'small',
      props: { stages: LIFECYCLE, size: 'sm', label: 'Tickets from opened to rated' },
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'empty',
      props: { stages: [], label: 'Tickets from opened to rated' },
      expect: { 'data-state': 'empty' },
    },
    {
      name: 'loading',
      props: { stages: LIFECYCLE, loading: true, label: 'Tickets from opened to rated' },
      expect: { 'data-state': 'loading' },
    },
    {
      name: 'tooltip off',
      props: { stages: LIFECYCLE, tooltip: false, label: 'Tickets from opened to rated, print' },
    },
    {
      // With `onSelect`: the summary names the activation, and an agent can pick a stage.
      name: 'selectable',
      props: {
        stages: LIFECYCLE,
        label: 'Tickets from opened to rated',
        onSelect: { js: '() => {}' },
      },
    },
  ],
})
