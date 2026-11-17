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

/** The React fixture's data: Relay's storage, in gigabytes, by kind. */
const STORAGE = [
  { key: 'attachments', label: 'Attachments', value: 420 },
  { key: 'images', label: 'Inline images', value: 260 },
  { key: 'exports', label: 'Exports', value: 180 },
  { key: 'audit', label: 'Audit log', value: 90 },
  { key: 'avatars', label: 'Avatars', value: 50 },
]

/** Relay's open tickets by team, and within each team by channel. */
const TEAMS = [
  {
    key: 'support',
    label: 'Support',
    value: 340,
    children: [
      { key: 'support-email', label: 'Email', value: 180 },
      { key: 'support-chat', label: 'Chat', value: 120 },
      { key: 'support-phone', label: 'Phone', value: 40 },
    ],
  },
  {
    key: 'technical',
    label: 'Technical',
    value: 140,
    children: [
      { key: 'technical-email', label: 'Email', value: 70 },
      { key: 'technical-chat', label: 'Chat', value: 50 },
      { key: 'technical-phone', label: 'Phone', value: 20 },
    ],
  },
  {
    key: 'billing',
    label: 'Billing',
    value: 120,
    children: [
      { key: 'billing-email', label: 'Email', value: 90 },
      { key: 'billing-chat', label: 'Chat', value: 30 },
    ],
  },
  { key: 'partners', label: 'Partners', value: 35 },
]

/** One workspace that holds nearly everything, and forty that hold almost nothing. */
const SKEWED = [
  { key: 'main', label: 'Main workspace', value: 96_000 },
  ...Array.from({ length: 40 }, (_, index) => ({
    key: `sandbox-${index + 1}`,
    label: `Sandbox ${index + 1}`,
    value: 20 + index * 3,
  })),
]

/**
 * The values every chart holds, without `hidden`: the legend only labels, so
 * no group is hidden.
 */
const { hidden: _hidden, ...TREEMAP_STATE } = chartState()

/**
 * Treemap (`design/components/treemap.md`): parts of a whole as rectangles
 * that tile the plot, each with an area proportional to its value, in one
 * level or two. The drawing is the engine's `treemapModel`, which the React
 * member draws too: the squarified layout, the colours by group, the gaps,
 * every pointer target, the label plates that fit and the dev warnings. The
 * readout at a reading position is `treemapReadout`, and what `onSelect`
 * reports is `treemapSelection`, with the item's share.
 *
 * The plot is one focus stop. Left/Right walk the tiles in reading order
 * through the engine's reading machine, and the pointer reads the tile whose
 * target it enters. A press on a tile moves the reading there before the
 * surface reports it, so Enter, Space and a click report the item when the
 * caller listens for `select`. The legend only labels the groups.
 */
export default describeMember({
  member: 'Treemap',
  dir: 'charts',
  recipe: 'charts/treemap',
  recipes: FRAME_RECIPES,
  defaults: {
    size: lit('md'),
    tooltip: '() => ({})',
    loading: 'false',
    messages: '() => DEFAULT_CHART_MESSAGES',
  },
  state: TREEMAP_STATE,
  derived: {
    input:
      '({ items, format, label, locale, messages, tooltip, loading, selectable: listening.select, box })',
    model: 'treemapModel(input)',
    view: 'readingView(position, model.leaves.length)',
    readout: 'treemapReadout(input, model, view)',
    activate:
      "() => { const selection = treemapSelection(input, model, reading.now()); if (selection !== null) emit('select', selection) }",
    walk: '({ count: model.leaves.length })',
    marks: chartMarkSource('treemap'),
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
    member: 'Treemap',
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
      // One focus stop. Left/Right walk the tiles, group by group, largest first.
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
                el('g', { part: 'tiles' }, [
                  each('model.plot?.tiles ?? []', 'tile', 'tile.id', [
                    el('rect', {
                      class: ['tile'],
                      geometry: { '--pm-chart-mark': 'tile.fill' },
                      attrs: {
                        'data-active': flag('view.index === tile.index'),
                        x: 'tile.paint.x',
                        y: 'tile.paint.y',
                        width: 'tile.paint.width',
                        height: 'tile.paint.height',
                        rx: 'model.plot?.radius',
                      },
                    }),
                  ]),
                ]),
                // The pointer targets, over the paint in reading order; a press reads the tile.
                el('g', { part: 'hits' }, [
                  each('model.plot?.tiles ?? []', 'tile', 'tile.id', [
                    el('rect', {
                      class: ['hit'],
                      attrs: {
                        x: 'tile.hit.x',
                        y: 'tile.hit.y',
                        width: 'tile.hit.width',
                        height: 'tile.hit.height',
                      },
                      on: {
                        pointerenter: run('reading.moveTo(tile.index)'),
                        click: run('reading.moveTo(tile.index)'),
                      },
                    }),
                  ]),
                ]),
              ],
            ),
            // The labels, on surface plates, as HTML: a long word ends in an ellipsis.
            el('div', { part: 'text', class: ['text'], attrs: { 'aria-hidden': lit('true') } }, [
              each('model.plot?.tiles ?? []', 'tile', 'tile.id', [
                cond('tile.plate !== null', [
                  el(
                    'span',
                    {
                      class: ['plate'],
                      geometry: {
                        '--pm-chart-text-x': '`${tile.plate?.x}px`',
                        '--pm-chart-text-y': '`${tile.plate?.y}px`',
                        '--pm-chart-text-width': '`${tile.plate?.width}px`',
                      },
                    },
                    [
                      el('span', { class: ['plateLabel'] }, [text('tile.plate?.label')]),
                      el('span', { class: ['plateValue'] }, [text('tile.plate?.value')]),
                    ],
                  ),
                ]),
              ]),
            ]),
          ]),
        ],
      ),
    ],
  }),
  states: [
    {
      name: 'storage',
      props: { items: STORAGE, label: 'Storage by kind, in gigabytes' },
      expect: { 'data-size': 'md' },
    },
    {
      // Two levels: each team in its own colour, its channels inside it.
      name: 'two levels',
      props: { items: TEAMS, label: 'Open tickets by team and channel' },
    },
    {
      name: 'one item',
      props: { items: STORAGE.slice(0, 1), label: 'Storage by kind, in gigabytes' },
    },
    {
      // Nothing takes area; the twin lists every item and the summary says none is drawn.
      name: 'all zero',
      props: {
        items: [
          { key: 'email', label: 'Email', value: 0 },
          { key: 'chat', label: 'Chat', value: 0 },
        ],
        label: 'Escalations by channel',
      },
    },
    {
      name: 'one huge, many tiny',
      props: { items: SKEWED, label: 'Storage by workspace, in megabytes' },
    },
    {
      name: 'long labels',
      props: {
        items: [
          {
            key: 'archive',
            label: 'Archived exports from the previous storage provider, kept for audit',
            value: 300,
          },
          { key: 'current', label: 'Current exports', value: 200 },
          {
            key: 'scheduled',
            label: 'Scheduled reports waiting for delivery to the finance team',
            value: 60,
          },
        ],
        label: 'Exports',
      },
    },
    {
      // A zero and a negative take no area; they stay in the twin and the summary counts them.
      name: 'absent items',
      props: {
        items: [
          ...STORAGE.slice(0, 3),
          { key: 'trash', label: 'Trash', value: 0 },
          { key: 'credit', label: 'Storage credit', value: -40 },
        ],
        label: 'Storage by kind, in gigabytes',
      },
    },
    {
      // A third level is summed into the second, with a dev warning.
      name: 'three levels',
      props: {
        items: [
          {
            key: 'engineering',
            label: 'Engineering',
            value: 90,
            children: [
              {
                key: 'platform',
                label: 'Platform',
                value: 60,
                children: [
                  { key: 'databases', label: 'Databases', value: 35 },
                  { key: 'network', label: 'Network', value: 25 },
                ],
              },
              { key: 'apps', label: 'Apps', value: 30 },
            ],
          },
          { key: 'design', label: 'Design', value: 40 },
        ],
        label: 'Seats by team',
      },
    },
    {
      name: 'format',
      props: {
        items: [
          { key: 'compute', label: 'Compute', value: 48_200 },
          { key: 'storage', label: 'Storage', value: 21_400 },
          { key: 'egress', label: 'Egress', value: 9600 },
          { key: 'support', label: 'Support', value: 4100 },
        ],
        format: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 },
        label: 'Spend by line',
      },
    },
    {
      name: 'small',
      props: { items: TEAMS, size: 'sm', label: 'Open tickets by team and channel' },
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'empty',
      props: { items: [], label: 'Storage by kind, in gigabytes' },
      expect: { 'data-state': 'empty' },
    },
    {
      name: 'loading',
      props: { items: STORAGE, loading: true, label: 'Storage by kind, in gigabytes' },
      expect: { 'data-state': 'loading' },
    },
    {
      name: 'tooltip off',
      props: { items: STORAGE, tooltip: false, label: 'Storage by kind, in gigabytes, print' },
    },
    {
      // With `onSelect`: the summary names the activation, and an agent can pick a tile.
      name: 'selectable',
      props: {
        items: STORAGE,
        label: 'Storage by kind, in gigabytes',
        onSelect: { js: '() => {}' },
      },
    },
  ],
})
