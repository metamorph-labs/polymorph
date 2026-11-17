import {
  cond,
  each,
  el,
  identity,
  lit,
  member,
  run,
  text,
  type Effect,
  type Expr,
  type Node,
} from './dsl'

/**
 * The chart frame (`docs/charts.md`), described once for every chart member.
 *
 * The React vocabulary draws the frame with eight components under
 * `packages/react-ui/src/charts/frame/`: the figure, its axes, the legend, the
 * scale legend, the tooltip, the brush, the annotation layers and the table
 * twin. They are anatomy, not members: no fixture, no export, no registry
 * entry. A chart's description draws the same anatomy through the builders
 * here, which return the nodes each component renders, so a chart's template
 * holds the frame's elements, classes and attributes as React's does, and the
 * frame is written once in the description language.
 *
 * The frame holds one value of its own, the twin's open state, and the chart
 * holds it (`twinOpen` in `chartState`), because a node a builder returns has
 * no instance to hold it in. Everything else the frame draws is the engine's
 * (`@polymorph/engine/charts`): the ticks, the readout, the brush's range, the
 * annotation layers and the scale legend's swatches.
 *
 * A builder reads the chart's scope by the names the charts share: the props
 * `label`, `size` and `messages`, and the values `chartState` declares.
 */

/**
 * The engine's chart functions an expression may call. A renderer imports each
 * from its foundation, which re-exports `@polymorph/engine/charts`.
 */
export const CHART_HELPERS: readonly string[] = [
  'DEFAULT_CHART_MESSAGES',
  'DEFAULT_GRID_MESSAGES',
  'DEFAULT_RANGE_MESSAGES',
  'areaChartModel',
  'areaChartReadout',
  'areaChartSelection',
  'barChartModel',
  'barChartReadout',
  'barChartSelection',
  'brushDrawing',
  'brushSpan',
  'brushValues',
  'createBrush',
  'createReading',
  'createSyncMember',
  'createWarningLog',
  'donutChartModel',
  'donutChartReadout',
  'donutChartSelection',
  'funnelChartModel',
  'funnelChartReadout',
  'funnelChartSelection',
  'heatmapModel',
  'heatmapReadout',
  'heatmapSelection',
  'histogramModel',
  'histogramReadout',
  'histogramSelection',
  'lineChartModel',
  'lineChartReadout',
  'lineChartSelection',
  'measureBox',
  'nearest2D',
  'nearestIndex',
  'radarChartModel',
  'radarChartReadout',
  'radarChartSelection',
  'readChartCap',
  'readingRest',
  'readingView',
  'scaleLegendSteps',
  'scatterChartModel',
  'scatterChartReadout',
  'scatterChartSelection',
  'syncIndexOf',
  'syncValueAt',
  'toggleSeries',
  'treemapModel',
  'treemapReadout',
  'treemapSelection',
  'UNMEASURED',
]

/**
 * An expression a builder writes into a larger one, parenthesized unless it is
 * a plain name or a property chain, so an operator in it binds as written
 * (`model.axes?.y ?? null`).
 */
const group = (expr: Expr): Expr => (/^[\w$.]+$/.test(expr) ? expr : `(${expr})`)

/** The recipes the frame draws with, by binding name. A chart spreads them into its `recipes`. */
export const FRAME_RECIPES = {
  a11y: 'conventions/a11y',
  chartAxis: 'charts/frame/chart-axis',
  chartBrush: 'charts/frame/chart-brush',
  chartFrame: 'charts/frame/chart-frame',
  chartLegend: 'charts/frame/chart-legend',
  chartNotes: 'charts/frame/chart-annotations',
  chartScale: 'charts/frame/chart-scale-legend',
  chartTooltip: 'charts/frame/chart-tooltip',
  chartTwin: 'charts/frame/chart-twin',
} as const

/**
 * The values every chart holds: the measured plot (`box`, `null` until the
 * first measurement), the reading machine and the position it last reported
 * (`position`), the series the reader has hidden from the legend, whether the
 * table twin is open, and the log of the model's warnings already shown
 * (`warningLog`). `seriesStart` is the reading's series coordinate at rest
 * (`null` for most charts, `0` for the heatmap, whose second axis always has a
 * row).
 */
export function chartState(seriesStart: Expr = 'null'): Record<string, Expr> {
  return {
    box: 'UNMEASURED',
    reading: `createReading({ count: 0, seriesStart: ${seriesStart} })`,
    position: `readingRest(${seriesStart})`,
    hidden: 'new Set<string>()',
    twinOpen: 'false',
    warningLog: 'createWarningLog()',
  }
}

/**
 * The effects every chart runs: the plot is measured on mount and whenever its
 * cell changes size; the position the reading machine reports is followed; and
 * each warning the engine's model reports is logged when it enters the list,
 * through the engine's `createWarningLog`, as React's `useDevWarnings` logs it.
 */
export function chartEffects(model: Expr = 'model'): Effect[] {
  return [
    { resize: ['plot'], run: 'box = plot === null ? box : measureBox(plot, box)' },
    { run: 'reading.subscribe((now) => { position = now })' },
    {
      watch: `${model}.warnings.join('\\n')`,
      run: `warningLog.log(${model}.warnings, (message) => devWarning(true, message))`,
    },
  ]
}

/**
 * The effect of a chart whose model reads the palette's series cap (Scatter,
 * Radar): the cap is read from the plot each time the marks appear, and kept
 * while the empty state shows. React's member reads it from its plot surface
 * when the surface mounts, and the empty state does not render the surface, so
 * an empty chart warns about no cap there either. The chart holds `cap`, and
 * its model's input reads it.
 */
export function capEffect(): Effect {
  return {
    watch: "model.state === 'empty'",
    run: "cap = model.state === 'empty' ? cap : readChartCap(plot)",
  }
}

/**
 * What a chart's agent block reads its marks through, declared as the chart's
 * `marks` (the engine's `ChartMarkSource`): the reading's walk, the chart's
 * input and model, and the readout and the selection of the chart's engine,
 * named by its prefix (`barChart` for `barChartReadout`). The chart declares
 * `walk`, the counts its keys give the reading machine, and the agent block
 * every chart gives reads `marks`:
 *
 * ```ts
 * agent: {
 *   on: 'frame',
 *   state: {
 *     items: 'chartMarks(marks, reading)',
 *     position: 'chartPosition(marks, reading)',
 *     count: 'walk.count',
 *   },
 *   actions: {
 *     read: { argument: 'number', run: 'readChartPosition(marks, value, reading)' },
 *     choose: { argument: 'id', run: 'chooseChartMark(marks, value, reading, activate)' },
 *   },
 *   unless: '!listening.select',
 * },
 * ```
 *
 * `items` is the window of marks around the reading position, and `read`
 * moves the reading as Left and Right do. The frame shows the position as the
 * figure's `data-position`.
 *
 * A chart whose legend toggles adds the legend's keys to that block, `series`
 * and `hidden` read from the figure (`chartSeries`) and `toggle`, which
 * chooses among `series` as `choose` chooses among `items`. It lists `items`
 * only while it listens for `select`, and registers while it listens for
 * `select` or draws a legend (`unless: '!listening.select && !model.legend'`).
 * A chart with a brush adds `range-start`, `range-end` and `brush` (`chartRange`).
 *
 * Each description writes that block itself, because the staleness law reads
 * the names of its states and actions from the description's own file.
 */
export function chartMarkSource(engine: string): Expr {
  return `({ walk, input, model, readout: ${engine}Readout, selection: ${engine}Selection })`
}

export interface FrameParts {
  /** The member's name, written as its `data-member`. */
  member: string
  /** The frame's state: `ready`, `loading` or `empty`. */
  state: Expr
  /** The visually hidden sentence that orients a reader. */
  summary: Expr
  /** What the live region says about the reading position. */
  announcement: Expr
  /** The marks: the plot's focus stop and what it draws. */
  plot: readonly Node[]
  yAxis?: readonly Node[]
  xAxis?: readonly Node[]
  legend?: readonly Node[]
  tooltip?: readonly Node[]
  twin: readonly Node[]
  /** The empty state's content; the member's sentence from its catalog by default. */
  empty?: readonly Node[]
}

/**
 * The frame (React's `ChartFrame`): the figure that is the member's outermost
 * element, the plot region with its axes, the legend, the summary, the twin
 * and the live region. The figure carries the reading position as
 * `data-position`, from `view`, the reading as a render shows it, which every
 * chart derives.
 *
 * **The frame has no chrome**: no title, no card, no surface; `Dashboard.Panel`
 * and `Card` own those. **The gutter is sized by CSS**: the plot region is a
 * two-by-two grid, the y column as wide as its widest tick label. The plot cell
 * is the `plot` element the chart measures. The live region is always in the
 * document, because most screen readers do not announce a region added with
 * its words already in it.
 */
export function chartFrame(parts: FrameParts): Node {
  return el(
    'figure',
    {
      part: 'frame',
      // The element a chart's agent block registers, named by the chart's label.
      ref: 'frame',
      class: ['chartFrame.frame'],
      attrs: {
        'data-size': 'size',
        'data-state': parts.state,
        // The reading position along the chart, which an agent's `position` reads; absent at rest.
        'data-position': 'view.active ? view.index : undefined',
        'aria-label': 'label',
        ...identity(parts.member),
      },
    },
    [
      el('div', { part: 'region', class: ['chartFrame.region'] }, [
        el('div', { part: 'y axis', class: ['chartFrame.yAxis'] }, parts.yAxis ?? []),
        el('div', { part: 'plot', class: ['chartFrame.plot'], ref: 'plot' }, [
          cond(
            `${parts.state} === 'empty'`,
            [
              el(
                'div',
                { class: ['chartFrame.empty'] },
                parts.empty ?? [el('span', {}, [text('messages.empty')])],
              ),
            ],
            parts.plot,
          ),
          ...(parts.tooltip ?? []),
        ]),
        el('div', { part: 'x axis', class: ['chartFrame.xAxis'] }, parts.xAxis ?? []),
      ]),
      ...(parts.legend ?? []),
      // The relief channel the palette law's soft gates depend on: the summary and the twin.
      el('span', { part: 'summary', class: ['a11y.visuallyHidden'] }, [text(parts.summary)]),
      ...parts.twin,
      el('span', { part: 'live region', class: ['a11y.visuallyHidden'] }, [
        el('div', { attrs: { 'aria-live': lit('polite'), 'aria-atomic': lit('true') } }, [
          text(parts.announcement),
        ]),
      ]),
    ],
  )
}

/**
 * An axis's tick labels (React's `ChartAxis`): HTML, not SVG text, so a label
 * takes the theme's numeric font settings and reads as text. Hidden from the
 * tree, because the twin carries the values. `ticks` is `undefined` for an
 * axis that draws nothing (no rows, no measurement yet).
 */
export function chartAxis(orientation: 'x' | 'y', ticks: Expr, label?: Expr): Node {
  return cond(`${group(ticks)} !== undefined`, [
    el(
      'div',
      {
        part: `${orientation} axis ticks`,
        class: ['chartAxis.axis'],
        attrs: { 'data-orientation': lit(orientation), 'aria-hidden': lit('true') },
      },
      [
        each(`${group(ticks)} ?? []`, 'tick', 'tick.key', [
          el(
            'span',
            {
              class: ['chartAxis.tick'],
              // Which end of the label sits on its tick, where centred it would leave the plot.
              attrs: { 'data-align': 'tick.align' },
              geometry:
                orientation === 'y' ? { top: '`${tick.at}px`' } : { left: '`${tick.at}px`' },
            },
            [text('tick.label')],
          ),
        ]),
        ...(label === undefined
          ? []
          : [
              cond(`${group(label)} !== undefined`, [
                el('span', { class: ['chartAxis.name'] }, [text(label)]),
              ]),
            ]),
      ],
    ),
  ])
}

export interface LegendParts {
  /** The series it names, in order: the chart's painted series. */
  series: Expr
  /** `rect` for fills, `line` for strokes, matching what the plot draws. */
  keyShape: 'rect' | 'line'
  /**
   * The keys of the series drawn as lines in a plot whose other series are
   * fills (BarChart's `lines`): their keys are lines whatever `keyShape` says.
   */
  lineKeys?: Expr
  /**
   * The root's class: the member's own (`legend`, composed from the legend's
   * sheet), which is how a member's recipe joins the legend's states.
   */
  rootClass: string
  /** Whether the keys toggle their series: buttons with `aria-pressed`, over the chart's `hidden`. */
  toggles: boolean
}

/**
 * The legend (React's `ChartLegend`): derived, never a prop. The key matches
 * the mark's shape, an icon renders beside the key and never instead of it,
 * and a chart that toggles to isolate makes each key a button, pressed while
 * its series shows.
 */
export function chartLegend(parts: LegendParts): Node {
  const key: Node[] = [
    el('span', {
      class: ['chartLegend.swatch'],
      // A token reference, not a colour: `var(--pm-chart-3)`.
      geometry: { '--pm-chart-key': 'entry.paint' },
      attrs: { 'aria-hidden': lit('true') },
    }),
    cond('entry.icon !== undefined', [
      el('span', { class: ['chartLegend.glyph'] }, [
        member('Icon', { name: 'entry.icon', size: lit('sm') }),
      ]),
    ]),
    el('span', { class: ['chartLegend.label'] }, [text('entry.label')]),
  ]
  return cond(`${group(parts.series)}.length > 0`, [
    el(
      'ul',
      {
        part: 'legend',
        class: [parts.rootClass],
        attrs: { 'data-key-shape': lit(parts.keyShape) },
      },
      [
        each(parts.series, 'entry', 'entry.key', [
          el(
            'li',
            {
              class: ['chartLegend.item'],
              ...(parts.lineKeys === undefined
                ? {}
                : {
                    attrs: {
                      'data-key-shape': `${parts.lineKeys}.includes(entry.key) ? 'line' : undefined`,
                    },
                  }),
            },
            parts.toggles
              ? [
                  el(
                    'button',
                    {
                      class: ['chartLegend.key'],
                      attrs: {
                        type: lit('button'),
                        'aria-pressed': "hidden.has(entry.key) ? 'false' : 'true'",
                      },
                      on: { click: run('hidden = toggleSeries(hidden, entry.key)') },
                    },
                    key,
                  ),
                ]
              : key,
          ),
        ]),
      ],
    ),
  ])
}

/**
 * The scale legend (React's `ChartScaleLegend`), which replaces the series
 * legend on a heatmap: the ramp's emitted steps with the extent they cover.
 * `bounds` is the formatted extent: `{ min, max }`, or `{ min, zero, max }`
 * for the diverging variant, whose three labels sit under the band.
 */
export function chartScaleLegend(variant: Expr, bounds: Expr): Node {
  const step = (of: string): Node =>
    each(of, 'step', 'step.key', [
      el('span', { class: ['chartScale.step'], geometry: { background: 'step.paint' } }),
    ])
  return cond(
    `${group(variant)} === 'diverging'`,
    [
      el(
        'div',
        {
          part: 'scale legend',
          class: ['chartScale.scale'],
          attrs: { 'data-variant': lit('diverging') },
        },
        [
          el('span', { class: ['chartScale.band'], attrs: { 'aria-hidden': lit('true') } }, [
            step("scaleLegendSteps('diverging')"),
          ]),
          el('span', { class: ['chartScale.bounds'] }, [
            el('span', { class: ['chartScale.bound'] }, [text(`${group(bounds)}.min`)]),
            el('span', { class: ['chartScale.bound'] }, [text(`${group(bounds)}.zero`)]),
            el('span', { class: ['chartScale.bound'] }, [text(`${group(bounds)}.max`)]),
          ]),
        ],
      ),
    ],
    [
      el('div', { part: 'scale legend', class: ['chartScale.scale'] }, [
        el('span', { class: ['chartScale.bound'] }, [text(`${group(bounds)}.min`)]),
        el('span', { class: ['chartScale.ramp'], attrs: { 'aria-hidden': lit('true') } }, [
          step("scaleLegendSteps('sequential')"),
        ]),
        el('span', { class: ['chartScale.bound'] }, [text(`${group(bounds)}.max`)]),
      ]),
    ],
  )
}

/**
 * The tooltip (React's `ChartTooltip`): not the overlay Tooltip and not a
 * portal, a box positioned within the plot. The value comes first, then the
 * label. Hidden from the tree, because the live region says the same.
 * `tooltip` is the readout's, `null` when it does not show.
 */
export function chartTooltip(drawn: Expr): Node {
  const tooltip = group(drawn)
  return cond(`${tooltip} !== null`, [
    el(
      'div',
      {
        part: 'tooltip',
        class: ['chartTooltip.tooltip'],
        attrs: {
          'data-indicator': `${tooltip}?.indicator`,
          'data-side': `${tooltip}?.side`,
          'aria-hidden': lit('true'),
        },
        geometry: {
          '--pm-chart-tip-x': `\`\${${tooltip}?.x}px\``,
          '--pm-chart-tip-y': `\`\${${tooltip}?.y}px\``,
        },
      },
      [
        cond(`${tooltip}?.header !== undefined`, [
          el('p', { class: ['chartTooltip.header'] }, [text(`${tooltip}?.header`)]),
        ]),
        el('ul', { class: ['chartTooltip.rows'] }, [
          each(`${tooltip}?.rows ?? []`, 'row', 'row.key', [
            el('li', { class: ['chartTooltip.row'] }, [
              el('span', {
                class: ['chartTooltip.key'],
                geometry: { '--pm-chart-key': 'row.paint' },
              }),
              el('span', { class: ['chartTooltip.value'] }, [text('row.value')]),
              el('span', { class: ['chartTooltip.label'] }, [text('row.label')]),
            ]),
          ]),
        ]),
      ],
    ),
  ])
}

/**
 * The brush (React's `ChartBrush`): the active or committed range, washed with
 * the selection roles, edged only at its two boundaries. `range` is the
 * engine's `brushDrawing`, `null` with no range on screen.
 */
export function chartBrush(drawn: Expr): Node {
  const range = group(drawn)
  return cond(`${range} !== null`, [
    el('g', { part: 'brush', class: ['chartBrush.brush'] }, [
      el('rect', {
        class: ['chartBrush.range'],
        attrs: { x: `${range}?.x`, y: '0', width: `${range}?.width`, height: `${range}?.height` },
      }),
      el('path', { class: ['chartBrush.edge'], attrs: { d: `${range}?.near` } }),
      el('path', { class: ['chartBrush.edge'], attrs: { d: `${range}?.far` } }),
    ]),
  ])
}

/**
 * The annotation layers (React's `ChartAnnotations`), from the engine's
 * `annotationLayers`: the wash under the marks, and the ink (edges, rules,
 * point marks and the labels that do not collide) where the member draws its
 * reference lines.
 */
export function chartAnnotationWash(drawn: Expr): Node {
  const wash = group(drawn)
  return cond(`${wash}.length > 0`, [
    el('g', { part: 'annotation wash', class: ['chartNotes.washes'] }, [
      each(wash, 'span', 'span.key', [
        el('rect', {
          class: ['chartNotes.span'],
          attrs: { x: 'span.x', y: 'span.y', width: 'span.width', height: 'span.height' },
        }),
      ]),
    ]),
  ])
}

export function chartAnnotationInk(drawn: Expr): Node {
  const ink = group(drawn)
  return cond(`${ink} !== null`, [
    el('g', { part: 'annotation ink', class: ['chartNotes.ink'] }, [
      each(`${ink}?.spans ?? []`, 'span', 'span.key', [
        el('g', {}, [
          el('path', { class: ['chartNotes.edge'], attrs: { d: 'span.from' } }),
          el('path', { class: ['chartNotes.edge'], attrs: { d: 'span.to' } }),
        ]),
      ]),
      each(`${ink}?.rules ?? []`, 'rule', 'rule.key', [
        el('path', { class: ['chartNotes.rule'], attrs: { d: 'rule.d' } }),
      ]),
      each(`${ink}?.marks ?? []`, 'mark', 'mark.key', [
        el('circle', {
          class: ['chartNotes.mark'],
          attrs: { cx: 'mark.cx', cy: 'mark.cy', r: 'mark.r' },
        }),
      ]),
      each(`${ink}?.labels ?? []`, 'note', 'note.key', [
        el(
          'text',
          {
            class: ['chartNotes.label'],
            attrs: { x: 'note.x', y: 'note.y', 'text-anchor': 'note.anchor' },
          },
          [text('note.text')],
        ),
      ]),
    ]),
  ])
}

/**
 * The table twin (React's `ChartTwin`): mandatory anatomy, the relief channel
 * the palette laws depend on. A ghost `table` toggle that names the chart, and
 * a real `Table`, mounted only while open, named twice (its scroll region and
 * its caption) from the catalog. An absent measurement shows an em dash.
 */
export function chartTwin(columnsOf: Expr, rows: Expr): Node {
  const columns = group(columnsOf)
  return el(
    'div',
    {
      part: 'twin',
      class: ['chartTwin.twin'],
      attrs: { 'data-state': "twinOpen ? 'open' : 'closed'" },
    },
    [
      el('div', { class: ['chartTwin.toggle'] }, [
        member(
          'Button',
          {
            variant: lit('ghost'),
            tone: lit('neutral'),
            size: lit('sm'),
            icon: lit('table'),
            iconOnly: 'true',
            label: 'twinOpen ? messages.hideTable(label) : messages.showTable(label)',
          },
          { on: { click: run('twinOpen = !twinOpen') } },
        ),
      ]),
      cond('twinOpen', [
        el('div', { class: ['chartTwin.table'] }, [
          member(
            'Table',
            { label: 'messages.tableLabel(label)', caption: 'messages.tableLabel(label)' },
            {
              slots: {
                default: [
                  member(
                    'TableHead',
                    {},
                    {
                      slots: {
                        default: [
                          member(
                            'TableRow',
                            {},
                            {
                              slots: {
                                default: [
                                  each(columns, 'column', 'column.key', [
                                    member(
                                      'TableHeader',
                                      { numeric: 'column.numeric' },
                                      { slots: { default: [text('column.label')] } },
                                    ),
                                  ]),
                                ],
                              },
                            },
                          ),
                        ],
                      },
                    },
                  ),
                  member(
                    'TableBody',
                    {},
                    {
                      slots: {
                        default: [
                          each(
                            rows,
                            'row',
                            'line',
                            [
                              member(
                                'TableRow',
                                {},
                                {
                                  slots: {
                                    default: [
                                      each(
                                        'row',
                                        'cell',
                                        `${columns}[cellIndex]?.key ?? cellIndex`,
                                        [
                                          member(
                                            'TableCell',
                                            { numeric: `${columns}[cellIndex]?.numeric` },
                                            {
                                              slots: {
                                                default: [text("cell === '' ? '—' : cell")],
                                              },
                                            },
                                          ),
                                        ],
                                        'cellIndex',
                                      ),
                                    ],
                                  },
                                },
                              ),
                            ],
                            'line',
                          ),
                        ],
                      },
                    },
                  ),
                ],
              },
            },
          ),
        ]),
      ]),
    ],
  )
}

/**
 * The state a chart with a range brush and a `syncId` holds besides
 * `chartState` (LineChart, AreaChart): the engine's brush machine and the range
 * it last reported (`brushed`), the chart's member of the sync registry, and
 * whether a value received from the group is being applied (`receiving`), so
 * the reading it moves is not sent back.
 */
export function rangeState(): Record<string, Expr> {
  return {
    brush: 'createBrush({ enabled: false, count: 0, positions: [], onCommit: () => undefined })',
    brushed: 'brush.state()',
    sync: 'createSyncMember((value) => receive(value))',
    receiving: 'false',
  }
}

/**
 * The values and handlers such a chart derives over its `input`, its `model`
 * (a `RangeModel` with `brushOn` and `syncGroup`) and the state above.
 * `selection` names the engine function that reads `onSelect`'s payload at
 * the live reading position (`lineChartSelection`).
 *
 * The brush reads the rows, their positions and the commit at each key and
 * pointer event (`updateBrush`), and handles keys before the reading: Enter
 * commits an open range before it selects, and Escape's first press clears the
 * range and not the reading. The range on screen is read for the rows the
 * chart draws now (`brush.state(data.length)`), so a range built on other data
 * reads as none. A reading the group sends is applied with `receiving` set, so
 * the move it causes is not sent back.
 */
export function rangeDerived(selection: string): Record<string, Expr> {
  return {
    // The counts the keys give the reading machine: one position per row, and no series walk.
    walk: '({ count: data.length })',
    rangeSpan: 'brushed === null ? null : brushSpan(model, brush.state(data.length))',
    rangeDrawing:
      'rangeSpan === null ? null : brushDrawing(rangeSpan.from, rangeSpan.to, rangeSpan.height)',
    commit:
      "(anchor: number, edge: number) => { const values = brushValues(input, model, anchor, edge); if (values !== null) emit('brushEnd', values) }",
    updateBrush:
      '() => brush.update({ enabled: model.brushOn, count: data.length, positions: model.positions, onCommit: commit })',
    // The engine's `syncValueAt` says what a position sends: nothing for a row with no x position.
    send: '(index: number | null) => { if (receiving) return; const value = syncValueAt(model, index); if (value !== undefined) sync.broadcast(value) }',
    // The engine's `syncIndexOf` puts a received value on this chart's nearest row; `null` clears.
    receive:
      '(value: number | null) => { receiving = true; const at = syncIndexOf(model, value); if (at !== undefined) reading.moveTo(at); receiving = false }',
    activate: `() => { const selected = ${selection}(input, model, reading.now()); if (selected !== null) emit('select', selected) }`,
    onKey:
      "(event: KeyboardEvent) => { updateBrush(); if (brush.key(event.key, event.shiftKey, reading)) { event.preventDefault(); return } if (listening.select && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); activate(); return } reading.update(walk); if (reading.key(event.key)) event.preventDefault() }",
    // Captured, so a drag that leaves the plot still commits on release.
    onPress:
      '(event: PointerEvent) => { if (!model.brushOn) return; updateBrush(); const rect = (event.currentTarget as Element).getBoundingClientRect(); brush.pointerDown(event.clientX - rect.left); try { (event.currentTarget as Element).setPointerCapture(event.pointerId) } catch { /* a synthetic pointer has nothing to capture; the brush still works */ } }',
    // The reading follows the pointer's coordinates, snapped to the nearest row, as a crosshair does.
    onPointer:
      '(event: PointerEvent) => { if (model.plot === null) return; updateBrush(); const rect = (event.currentTarget as Element).getBoundingClientRect(); const px = event.clientX - rect.left; reading.moveTo(nearestIndex(model.positions, px)); brush.pointerMove(px) }',
    // The click that ends a drag belongs to the drag, not to a selection.
    onClick: '() => { if (brush.consumeClick()) return; activate() }',
    onLeave: '() => { brush.blur(); reading.clear() }',
  }
}

/**
 * The effects such a chart runs besides `chartEffects`: the range the brush
 * reports is followed; the chart joins its sync group, joins again when the
 * group changes, and leaves it when it unmounts, as React's `useSyncGroup`
 * does, so the registry holds only mounted charts; and each move of the
 * reading's index is sent to the group. The plot is the member's anchor: a
 * broadcast skips the chart while the plot is out of the document (a Vue chart
 * in a deactivated `<KeepAlive>`).
 */
export function rangeEffects(): Effect[] {
  return [
    { run: 'brush.subscribe(() => { brushed = brush.state() })' },
    { watch: 'model.syncGroup', run: 'sync.join(model.syncGroup, plot)', release: 'sync.leave()' },
    { run: 'reading.subscribe((now, was) => { if (now.index !== was.index) send(now.index) })' },
  ]
}

/**
 * The plot's focus stop for such a chart: one tab stop, named, that the arrow
 * keys walk, the pointer reads and the brush drags across. `children` are the
 * marks.
 */
export function rangeSurface(children: readonly Node[]): Node {
  return el(
    'div',
    {
      part: 'surface',
      class: ['surface'],
      attrs: { tabindex: lit('0'), role: lit('img'), 'aria-label': 'label' },
      on: {
        keydown: run('onKey($event)'),
        click: run('onClick()'),
        pointerdown: run('onPress($event)'),
        pointermove: run('onPointer($event)'),
        pointerup: run('brush.pointerUp()'),
        pointerleave: run('reading.clear()'),
        blur: run('onLeave()'),
      },
    },
    children,
  )
}
