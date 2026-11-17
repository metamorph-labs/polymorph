'use client'

import {
  brushChartRange,
  brushSpan,
  brushValues,
  type CartesianChartProps,
  chartHiddenSeries,
  chartMarks,
  chartPosition,
  chartRange,
  chartSeries,
  chooseChartMark,
  type ChartDatum,
  DEFAULT_RANGE_MESSAGES,
  lineChartModel,
  lineChartReadout,
  lineChartSelection,
  nearestIndex,
  readChartPosition,
  syncIndexOf,
  syncValueAt,
  toggleChartSeries,
  toggleSeries,
  useAgentMember,
  useDevWarnings,
} from '@polymorph/react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'

import { useMeasuredBox } from './frame/use-measured-box'
import { ChartAnnotations } from './frame/ChartAnnotations'
import { ChartAxis } from './frame/ChartAxis'
import { ChartBrush } from './frame/ChartBrush'
import { ChartFrame } from './frame/ChartFrame'
import { ChartLegend, legendKeyClass } from './frame/ChartLegend'
import { ChartTooltip } from './frame/ChartTooltip'
import { ChartTwin } from './frame/ChartTwin'
import { useBrush } from './frame/use-brush'
import { useReading, type Reading } from './frame/use-reading'
import { useSyncGroup } from './frame/use-sync'
import styles from '@polymorph/recipes/charts/line-chart.module.css'

/**
 * A line chart for change over time (`design/components/line-chart.md`).
 *
 * It answers "which way is it going". It is **not** for part-to-whole over
 * time, which is AreaChart's stacking. It is not a Sparkline, which has no
 * axes, sits inline, and answers a smaller question.
 *
 * Two rules matter most. `null` is a **gap**: the line breaks and never dips to
 * zero, because a missing measurement is not a measurement of zero. The reading
 * position is a **crosshair**, not a hover target: the pointer aims at a date,
 * one readout lists every series at that date, and the arrow keys walk the same
 * positions, so every value is reachable by keyboard as well as by pointer.
 */

export interface LineChartProps extends CartesianChartProps {
  /** `area` adds a light wash of the series hue (about 10% alpha) under the line. */
  variant?: 'line' | 'area'
  /** Point dots of at least 8px with a 2px surface ring, a second channel for CVD and print. */
  markers?: boolean
  /**
   * The line shape. `step` is **`curveStepAfter`**: a measurement holds until
   * the next one. `'linear'` is engine-internal and not offered here.
   */
  curve?: 'monotone' | 'step'
  /** Called with the row at the reading position, on Enter, Space or click. */
  onSelect?: (selection: { index: number; datum: ChartDatum }) => void
  /**
   * Enables the range brush, for a `time` or `linear` x only, because a band
   * has no continuum. The brush only reports a committed range to app state
   * and never filters the chart itself; `FilterBar` owns and displays the
   * range. It passes ISO strings for `time` and numbers for `linear`, and fires
   * on commit only.
   */
  onBrushEnd?: (range: [string, string] | [number, number]) => void
  /**
   * Syncs the reading position across sibling charts through a module-scope
   * registry, with no provider. The broadcast is the **x-domain value**, never
   * the row index, and each receiver maps it through its own scale. Works for a
   * `time` or `linear` x only, like the brush. Escape or blur clears the whole
   * group.
   */
  syncId?: string
}

const NONE: ReadonlySet<string> = new Set()

export function LineChart({
  data,
  series,
  x,
  y,
  variant = 'line',
  markers = false,
  curve = 'monotone',
  size = 'md',
  label,
  locale,
  tooltip = {},
  emphasis,
  baseline,
  annotations,
  onSelect,
  onBrushEnd,
  syncId,
  loading = false,
  messages = DEFAULT_RANGE_MESSAGES,
}: LineChartProps) {
  const { ref: plotRef, box } = useMeasuredBox<HTMLDivElement>()

  /**
   * Toggle-to-isolate (`ChartLegend`): the series hidden from the legend, owned
   * by the member. The member owns this state because it refits its domains to
   * the remaining series. Hiding removes a series and `emphasis` greys the
   * rest; the two combine because removal is by key.
   */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(NONE)
  const toggle = useCallback((key: string) => setHidden((was) => toggleSeries(was, key)), [])

  /*
   * The drawing, from the engine (`lineChartModel`): the strokes, the gap rule,
   * the end labels, the warnings and the rows' x-domain values, decided once
   * for every framework's LineChart. The reading position is not an input, so
   * a pointer move redraws no stroke.
   */
  const selectable = onSelect !== undefined
  const brushable = onBrushEnd !== undefined
  const input = useMemo(
    () => ({
      data,
      series,
      x,
      y,
      variant,
      markers,
      curve,
      emphasis,
      baseline,
      annotations,
      label,
      locale,
      messages,
      loading,
      selectable,
      brushable,
      syncId,
      hidden,
      box,
    }),
    [
      data,
      series,
      x,
      y,
      variant,
      markers,
      curve,
      emphasis,
      baseline,
      annotations,
      label,
      locale,
      messages,
      loading,
      selectable,
      brushable,
      syncId,
      hidden,
      box,
    ],
  )
  const model = useMemo(() => lineChartModel(input), [input])
  useDevWarnings(model.warnings)

  const receiving = useRef(false)
  const readingRef = useRef<Reading | null>(null)
  const broadcast = useSyncGroup(model.syncGroup, (value) => {
    const shared = readingRef.current
    if (shared === null) return
    // A received reading must not be broadcast again, or the group would loop.
    receiving.current = true
    try {
      const at = syncIndexOf(model, value)
      if (at !== undefined) shared.moveTo(at)
    } finally {
      receiving.current = false
    }
  })

  const walk = { count: data.length }
  const reading = useReading({
    ...walk,
    onRead: (index) => {
      if (receiving.current) return
      // A row with no x position sends nothing (`undefined`), because sending
      // `null` would clear the group.
      const value = syncValueAt(model, index)
      if (value !== undefined) broadcast(value)
    },
  })
  useEffect(() => {
    // Updated in an effect, which is safe because a broadcast only arrives from
    // another member's event handler, after this member has committed.
    readingRef.current = reading
  })

  const commit = useCallback(
    (anchor: number, edge: number) => {
      if (onBrushEnd === undefined) return
      const range = brushValues(input, model, anchor, edge)
      if (range !== null) onBrushEnd(range)
    },
    [onBrushEnd, input, model],
  )

  const brush = useBrush({
    enabled: model.brushOn,
    count: data.length,
    positions: model.positions,
    reading,
    onCommit: commit,
  })

  const readout = lineChartReadout({ ...input, tooltip }, model, reading)

  const activate = useCallback(() => {
    if (onSelect === undefined) return
    // Read the live position, not the rendered one. A click can arrive before
    // the pointer move's render commits, and the previous render's position
    // would select the wrong mark.
    const selection = lineChartSelection(input, model, reading.now())
    if (selection !== null) onSelect(selection)
  }, [onSelect, input, model, reading])

  /*
   * The spec's `agent` fence, which every chart that takes `onSelect` shares
   * (`chartMarks`): a mark an agent picks is a position the keys reach, named
   * by what the live region says there, and `choose` moves the reading to it
   * and runs `activate`, as Enter does. `items` is the window of marks around
   * the reading position, and `read` moves the reading as Left and Right do.
   * Without `onSelect` a person has nothing to pick, so `items` is empty.
   * `series` and `hidden` are the legend's keys, read from the figure
   * (`chartSeries`), and `toggle` presses one, as a person does. `range-start`
   * and `range-end` are the brush's range in rows (`chartRange`), and `brush`
   * builds and commits one with the brush's own keys, so `onBrushEnd` receives
   * what a person's range reports. The chart registers while a person has
   * something to operate in it: `onSelect`, a legend or a brush.
   */
  const frame = useRef<HTMLElement>(null)
  const marks = { walk, input, model, readout: lineChartReadout, selection: lineChartSelection }
  useAgentMember(
    {
      member: 'LineChart',
      element: () => frame.current,
      state: () => ({
        items: onSelect === undefined ? [] : chartMarks(marks, reading),
        position: chartPosition(marks, reading),
        count: walk.count,
        series: chartSeries(frame.current, legendKeyClass, model.painted),
        hidden: chartHiddenSeries(frame.current, legendKeyClass, model.painted),
        'range-start': chartRange(marks, brush.machine).start,
        'range-end': chartRange(marks, brush.machine).end,
      }),
      actions: {
        read: {
          argument: 'number',
          run: (position) => readChartPosition(marks, position, reading),
        },
        choose: {
          argument: 'id',
          among: 'items',
          run: (id) => chooseChartMark(marks, id, reading, activate),
        },
        toggle: {
          argument: 'id',
          among: 'series',
          run: (id) => toggleChartSeries(frame.current, legendKeyClass, model.painted, id),
        },
        brush: {
          argument: 'number',
          run: (row) => brushChartRange(marks, row, brush.machine, reading),
        },
      },
    },
    { unless: onSelect === undefined && !model.legend && !model.brushOn },
  )

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // The brush handles keys first. Enter commits an open range before it
    // selects, and Escape's first stage (cancel the range) takes precedence
    // over clearing the reading.
    if (brush.onKeyDown(event)) return
    if (onSelect !== undefined && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      activate()
      return
    }
    reading.onKeyDown(event)
  }

  const { plot } = model
  const span = brushSpan(model, brush.brush)

  return (
    <ChartFrame
      member="LineChart"
      frameRef={frame}
      position={reading.active ? reading.index : null}
      label={label}
      size={size}
      state={model.state}
      plotRef={plotRef}
      summary={model.summary}
      announcement={readout.announcement}
      yAxis={model.axes === null ? null : <ChartAxis orientation="y" ticks={model.axes.y} />}
      xAxis={model.axes === null ? null : <ChartAxis orientation="x" ticks={model.axes.x} />}
      legend={
        model.legend ? (
          <ChartLegend
            series={model.painted}
            keyShape="line"
            className={styles.legend}
            hidden={hidden}
            onToggle={toggle}
          />
        ) : null
      }
      twin={
        <ChartTwin
          label={label}
          columns={model.twin.columns}
          rows={model.twin.rows}
          messages={messages}
        />
      }
      empty={<span>{messages.empty}</span>}
      tooltip={readout.tooltip === null ? null : <ChartTooltip {...readout.tooltip} />}
    >
      {/*
       * One focus stop for the whole plot (the interaction rules in
       * `docs/charts.md`). Per-mark tab stops would mean forty stops to cross a
       * month of data. `role="img"` with a name tells a screen reader user that
       * there is something here to arrow through.
       */}
      <div
        className={styles.surface}
        tabIndex={0}
        role="img"
        aria-label={label}
        onKeyDown={onKeyDown}
        onClick={() => {
          // The click that ends a drag belongs to the drag, not to a selection.
          if (brush.consumeClick()) return
          activate()
        }}
        onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
          if (!model.brushOn) return
          const at = event.currentTarget.getBoundingClientRect()
          brush.onPointerDown(event.clientX - at.left)
          // Captured, so a drag that leaves the plot still commits on release.
          // A synthetic pointer has no capturable id, so the call is guarded. A
          // brush without capture still works; it only misses a release outside
          // the plot.
          try {
            event.currentTarget.setPointerCapture(event.pointerId)
          } catch {
            /* no capture; the brush still works */
          }
        }}
        onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
          if (plot === null) return
          const at = event.currentTarget.getBoundingClientRect()
          const px = event.clientX - at.left
          reading.moveTo(nearestIndex(model.positions, px))
          brush.onPointerMove(px)
        }}
        onPointerUp={brush.onPointerUp}
        onPointerLeave={reading.clear}
        onBlur={() => {
          brush.onBlur()
          reading.clear()
        }}
      >
        {plot === null ? null : (
          <svg
            className={styles.marks}
            data-variant={variant}
            width={plot.width}
            height={plot.height}
            aria-hidden="true"
            focusable="false"
          >
            {/* Gridlines on the value axis only, and no tick lines. This is the
                system default, set once here instead of per example. */}
            <g className={styles.grid}>
              {plot.grid.map((line) => (
                <path key={line.key} d={line.d} />
              ))}
            </g>

            {/* The only axis stroke, drawn only when zero is in view. A rule at
                the domain floor would wrongly suggest the axis starts at zero. */}
            {plot.zeroRule === null ? null : <path className={styles.zero} d={plot.zeroRule} />}

            {/* The brush selection, drawn under the data. */}
            {span === null ? null : <ChartBrush {...span} />}

            {/* The annotation layers: the wash under the marks, and the ink in
                the reference-line slot, where the baseline draws. */}
            <ChartAnnotations layer="wash" layers={plot} />
            <ChartAnnotations layer="ink" layers={plot} />

            {/*
             * Wrapped so the stylesheet's stagger counts only series. The grid,
             * the zero rule and the annotation layer are `g` elements too. A
             * stagger that counted them would delay the first stroke by the
             * number of those elements, which differs between a chart with a
             * baseline and one without.
             */}
            <g className={styles.strokes}>
              {plot.strokes.map((stroke) => (
                <g key={stroke.key} style={{ '--pm-chart-mark': stroke.paint } as CSSProperties}>
                  {stroke.wash === null ? null : <path className={styles.wash} d={stroke.wash} />}
                  <path className={styles.line} d={stroke.line} />
                  {stroke.markers.map((marker) => (
                    <circle
                      key={marker.key}
                      className={styles.marker}
                      cx={marker.cx}
                      cy={marker.cy}
                      r={marker.r}
                      data-active={reading.index === marker.index ? '' : undefined}
                    />
                  ))}
                </g>
              ))}
            </g>

            {/* The crosshair snaps to the nearest x *position*, because the
                pointer aims at a date, not at a 2px line. */}
            {readout.crosshair === null ? null : (
              <path className={styles.crosshair} d={readout.crosshair} />
            )}

            {plot.endLabels.map((end) => (
              <text key={end.key} className={styles.endLabel} x={end.x} y={end.y} textAnchor="end">
                {end.text}
              </text>
            ))}
          </svg>
        )}
      </div>
    </ChartFrame>
  )
}
