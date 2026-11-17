'use client'

import {
  chartMarks,
  chartPosition,
  type ChartMessages,
  type ChartSize,
  type ChartTooltipConfig,
  type ChartYAxis,
  chooseChartMark,
  DEFAULT_CHART_MESSAGES,
  histogramModel,
  histogramReadout,
  histogramSelection,
  type HistogramXAxis,
  nearestIndex,
  readChartPosition,
  useAgentMember,
  useDevWarnings,
} from '@polymorph/react'
import {
  useCallback,
  useMemo,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'

import { useMeasuredBox } from './frame/use-measured-box'
import { ChartAxis } from './frame/ChartAxis'
import { ChartFrame } from './frame/ChartFrame'
import { ChartTooltip } from './frame/ChartTooltip'
import { ChartTwin } from './frame/ChartTwin'
import { useReading } from './frame/use-reading'
import styles from '@polymorph/recipes/charts/histogram.module.css'

export type { HistogramXAxis } from '@polymorph/react'

/**
 * A histogram showing the distribution of one sample (`design/components/histogram.md`).
 *
 * It answers "how is it spread". It is **not** a BarChart: BarChart compares
 * *named* things across a band, while a histogram's x is a continuous measure
 * and its bars are bins computed from the sample. BarChart's `time`/`linear`
 * warning points here. It is not a Heatmap either, which shows magnitude over a
 * grid, not a continuum.
 *
 * **The input is a sample, not rows.** `data` is `readonly number[]`. It is the
 * only member whose input is not `ChartDatum[]`. Rows and columns describe data
 * already shaped for reading; a histogram's input has no shape yet, and finding
 * the shape is the chart's purpose. So the chart bins the sample: the engine's
 * `histogramModel` does, through its `binSample` wrapper over `d3-array.bin`,
 * and this member draws the model. d3 supplies the arithmetic and the engine
 * makes every decision, so every framework's Histogram bins alike. The rule
 * that a chart never reorders its data still holds: bins are positions on a
 * scale, not rows, and the sample's order carries no information.
 */

export interface HistogramProps {
  /** The raw observations, unbinned and in any order; `[]` renders the empty state. */
  data: readonly number[]
  /**
   * A **target** bin count. Defaults to d3's Sturges rule (⌈log₂ n⌉ + 1).
   * `d3-array.bin` may adjust it to clean thresholds, as tick counts are.
   */
  bins?: number
  /**
   * The measure's axis. It is not a `ChartXAxis`: there is no `key`, because
   * the sample is the column, and no `scale`, because it is always linear.
   * Ticks sit at bin edges, thinned to clean steps.
   */
  x?: HistogramXAxis
  /**
   * The count axis, **always zero-anchored** because a truncated bar misstates
   * a count. `domain: 'auto'` raises a dev warning and is ignored, as in
   * BarChart.
   */
  y?: ChartYAxis
  size?: ChartSize
  /** The accessible name. */
  label: string
  /** The locale for `Intl` formatting. */
  locale?: string
  /** The per-bin readout: the range and its count. `false` removes the visual layer only. */
  tooltip?: ChartTooltipConfig | false
  /** Called with the read bin's edges and count, on Enter, Space or click. */
  onSelect?: (selection: { bin: { from: number; to: number; count: number } }) => void
  /** Shows the previous frame at reduced opacity during a refetch. */
  loading?: boolean
  /**
   * The chart tier's string catalog (`ChartMessages`). Defaults to generic
   * English; a localized host passes the same object to every chart.
   */
  messages?: ChartMessages
}

export function Histogram({
  data,
  bins,
  x,
  y,
  size = 'md',
  label,
  locale,
  tooltip = {},
  onSelect,
  loading = false,
  messages = DEFAULT_CHART_MESSAGES,
}: HistogramProps) {
  const { ref: plotRef, box } = useMeasuredBox<HTMLDivElement>()

  /*
   * The drawing, from the engine (`histogramModel`): the bins, their ranges,
   * the bars' geometry and the readout's words, decided once for every
   * framework's Histogram. The reading position is not an input, so a pointer
   * move redraws no bar.
   */
  const selectable = onSelect !== undefined
  const input = useMemo(
    () => ({ data, bins, x, y, label, locale, messages, loading, selectable, box }),
    [data, bins, x, y, label, locale, messages, loading, selectable, box],
  )
  const model = useMemo(() => histogramModel(input), [input])
  useDevWarnings(model.warnings)

  const walk = { count: model.bins.length }
  const reading = useReading(walk)
  const readout = histogramReadout({ ...input, tooltip }, model, reading)

  /**
   * Reports the read bin's edges and count. It reads the live position from
   * `reading.now()`, not the rendered one; see LineChart's note on click
   * timing.
   */
  const activate = useCallback(() => {
    if (onSelect === undefined) return
    const selection = histogramSelection(input, model, reading.now())
    if (selection !== null) onSelect(selection)
  }, [onSelect, input, model, reading])

  /*
   * The spec's `agent` fence, which every chart that takes `onSelect` shares
   * (`chartMarks`): a mark an agent picks is a position the keys reach, named
   * by what the live region says there, and `choose` moves the reading to it
   * and runs `activate`, as Enter does. `items` is the window of marks around
   * the reading position, and `read` moves the reading as Left and Right do.
   * Without `onSelect` a person has nothing to pick, so the chart registers
   * nothing.
   */
  const frame = useRef<HTMLElement>(null)
  const marks = { walk, input, model, readout: histogramReadout, selection: histogramSelection }
  useAgentMember(
    {
      member: 'Histogram',
      element: () => frame.current,
      state: () => ({
        items: chartMarks(marks, reading),
        position: chartPosition(marks, reading),
        count: walk.count,
      }),
      actions: {
        read: {
          argument: 'number',
          run: (position) => readChartPosition(marks, position, reading),
        },
        choose: { argument: 'id', run: (id) => chooseChartMark(marks, id, reading, activate) },
      },
    },
    { unless: onSelect === undefined },
  )

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (onSelect !== undefined && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      activate()
      return
    }
    reading.onKeyDown(event)
  }

  const { plot } = model

  return (
    <ChartFrame
      member="Histogram"
      frameRef={frame}
      position={reading.active ? reading.index : null}
      label={label}
      size={size}
      state={model.state}
      plotRef={plotRef}
      summary={model.summary}
      announcement={readout.announcement}
      /* No axes without bins, because an axis over an empty plot shows a range
         that was never measured. The measure's name is not drawn at the axis
         end, because the tier draws no axis names (see `ChartAxis`). As in the
         heatmap, a name there would collide with the last edge label. The name
         heads the twin's range column instead. */
      yAxis={model.axes === null ? null : <ChartAxis orientation="y" ticks={model.axes.y} />}
      xAxis={model.axes === null ? null : <ChartAxis orientation="x" ticks={model.axes.x} />}
      /* No legend: there is one measure and no series. The panel title names
         the sample, and comparing two samples takes two histograms. */
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
      {/* One focus stop. Left/Right walk the bins in axis order. */}
      <div
        className={styles.surface}
        tabIndex={0}
        role="img"
        aria-label={label}
        onKeyDown={onKeyDown}
        onClick={() => activate()}
        /*
         * The reading follows the pointer's coordinates, snapped to the nearest
         * bin, as in BarChart (where it was measured). The bins' hit rects
         * still receive enter events when the browser delivers them, and
         * deduplication makes the overlap harmless.
         */
        onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
          if (plot === null) return
          const at = event.currentTarget.getBoundingClientRect()
          reading.moveTo(nearestIndex(model.positions, event.clientX - at.left))
        }}
        onPointerLeave={reading.clear}
        onBlur={reading.clear}
      >
        {plot === null ? null : (
          <svg
            className={styles.marks}
            data-reading={reading.active ? '' : undefined}
            width={plot.width}
            height={plot.height}
            /* The zero rule's position, passed to the stylesheet so the
               entrance grows from it. It is geometry, not a design value
               (see BarChart's note). */
            style={{ '--pm-chart-zero': `${plot.zero}px` } as CSSProperties}
            aria-hidden="true"
            focusable="false"
          >
            {/* Hairlines on the count axis only. */}
            <g className={styles.grid}>
              {plot.grid.map((line) => (
                <path key={line.key} d={line.d} />
              ))}
            </g>

            <g className={styles.bins}>
              {plot.bars.map((bar) => (
                <g key={bar.key} data-active={reading.index === bar.index ? '' : undefined}>
                  <rect
                    className={styles.hit}
                    x={bar.hit.x}
                    y={bar.hit.y}
                    width={bar.hit.width}
                    height={bar.hit.height}
                    onPointerEnter={() => reading.moveTo(bar.index)}
                  />
                  {/* An empty bin draws no bar and keeps its place. The twin
                      and the keyboard walk both report its zero count. */}
                  {bar.d === null ? null : <path className={styles.bar} d={bar.d} />}
                </g>
              ))}
            </g>

            {/* The zero baseline, the only axis stroke. */}
            <path className={styles.zero} d={plot.zeroRule} />
          </svg>
        )}
      </div>
    </ChartFrame>
  )
}
