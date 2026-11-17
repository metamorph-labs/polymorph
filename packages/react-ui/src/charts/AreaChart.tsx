'use client'

import {
  areaChartModel,
  areaChartReadout,
  areaChartSelection,
  brushChartRange,
  brushSpan,
  brushValues,
  chartHiddenSeries,
  chartMarks,
  chartPosition,
  chartRange,
  chartSeries,
  chooseChartMark,
  type CartesianChartProps,
  type ChartDatum,
  DEFAULT_RANGE_MESSAGES,
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
import styles from '@polymorph/recipes/charts/area-chart.module.css'

/**
 * A stacked area chart for part-to-whole change over time (`design/components/area-chart.md`).
 *
 * It answers "what is it made of, and how is that changing". It is **not** for
 * comparing several trends, because strokes do not stack, and not for a share
 * at one moment, which is the DonutChart.
 *
 * The top edge of each band is the series' line. The 2px stroke carries the
 * shape and the 10% wash shows which side of it the quantity is on, so a
 * stacked area reads as weighted lines instead of blocks of colour.
 */

export interface AreaChartProps extends CartesianChartProps {
  /** `percent` normalizes each x to 100%, to show shares instead of volumes. */
  variant?: 'stacked' | 'percent'
  /** Called with the row at the reading position, on Enter, Space or click. */
  onSelect?: (selection: { index: number; datum: ChartDatum }) => void
  /**
   * Enables the range brush, for a `time` x only: this member takes no
   * `linear` x and a band has no continuum. The brush reports a committed
   * range and never filters the chart itself. It passes ISO strings and fires
   * on commit only.
   */
  onBrushEnd?: (range: [string, string] | [number, number]) => void
  /**
   * Syncs the reading position across sibling charts. The broadcast is the
   * x-domain value, never the row index, and Escape or blur clears the whole
   * group. The registry works as described in `line-chart.md`.
   */
  syncId?: string
}

const NONE: ReadonlySet<string> = new Set()

export function AreaChart({
  data,
  series,
  x,
  y,
  variant = 'stacked',
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
}: AreaChartProps) {
  const { ref: plotRef, box } = useMeasuredBox<HTMLDivElement>()

  /**
   * Toggle-to-isolate (`ChartLegend`): the series hidden from the legend, owned
   * by the member. A hidden series leaves the stack and the bands above it
   * restack on the remaining total, because the stack is a sum. The chart
   * redraws instead of leaving a hole.
   */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(NONE)
  const toggle = useCallback((key: string) => setHidden((was) => toggleSeries(was, key)), [])

  /*
   * The drawing, from the engine (`areaChartModel`): the stack, the gap and
   * negative rules, the warnings, the twin's cells and the rows' x-domain
   * values, decided once for every framework's AreaChart. The reading position
   * is not an input, so a pointer move redraws no band.
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
  const model = useMemo(() => areaChartModel(input), [input])
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

  /**
   * Emits the committed pair. This member brushes on time only, so the pair is
   * always the rows' ISO strings, never numbers.
   */
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

  const readout = areaChartReadout({ ...input, tooltip }, model, reading)

  const activate = useCallback(() => {
    if (onSelect === undefined) return
    // Read the live position, not the rendered one; see LineChart's note on
    // click timing.
    const selection = areaChartSelection(input, model, reading.now())
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
  const marks = { walk, input, model, readout: areaChartReadout, selection: areaChartSelection }
  useAgentMember(
    {
      member: 'AreaChart',
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
      member="AreaChart"
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
            keyShape="rect"
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
      <div
        className={styles.surface}
        tabIndex={0}
        role="img"
        aria-label={label}
        onKeyDown={onKeyDown}
        onClick={() => {
          if (brush.consumeClick()) return
          activate()
        }}
        onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
          if (!model.brushOn) return
          const at = event.currentTarget.getBoundingClientRect()
          brush.onPointerDown(event.clientX - at.left)
          // Guarded because a synthetic pointer has no capturable id. A brush
          // without capture still works; see LineChart.
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
            <g className={styles.grid}>
              {plot.grid.map((line) => (
                <path key={line.key} d={line.d} />
              ))}
            </g>

            {/* The brush selection, drawn under the data. */}
            {span === null ? null : <ChartBrush {...span} />}

            {/* The annotation layers, wash then ink, in the baseline's slot. */}
            <ChartAnnotations layer="wash" layers={plot} />
            <ChartAnnotations layer="ink" layers={plot} />

            {/*
             * Stacked bottom-up in declaration order. The first series sits on
             * the baseline, so the reader has one band that never moves.
             *
             * Wrapped so the stylesheet's stagger counts only bands. The grid
             * and the annotation layer are `g` elements too. A stagger that
             * counted them would delay the first band, and by a *different*
             * amount on a chart with a baseline.
             */}
            <g className={styles.bands}>
              {plot.bands.map((band) => (
                <g key={band.key} style={{ '--pm-chart-mark': band.paint } as CSSProperties}>
                  <path className={styles.band} d={band.fill} />
                  {/* The edge is the series' line. The top of a band is the
                      only edge a reader can follow. */}
                  <path className={styles.edge} d={band.edge} />
                </g>
              ))}
            </g>

            {/* The crosshair is the only active-state feedback. Bands never
                dim, because a fading wash would change the picture the reader
                is comparing against. */}
            {readout.crosshair === null ? null : (
              <path className={styles.crosshair} data-active="" d={readout.crosshair} />
            )}
          </svg>
        )}
      </div>
    </ChartFrame>
  )
}
