'use client'

import {
  chartMarks,
  chartPosition,
  chooseChartMark,
  DEFAULT_GRID_MESSAGES,
  heatmapModel,
  heatmapReadout,
  heatmapSelection,
  readChartPosition,
  useAgentMember,
  useDevWarnings,
  type ChartDatum,
  type ChartMessages,
  type ChartSize,
  type ChartTooltipConfig,
  type ChartXAxis,
  type HeatmapValue,
  type HeatmapYAxis,
} from '@polymorph/react'
import { useCallback, useMemo, useRef, type CSSProperties, type KeyboardEvent } from 'react'

import { useMeasuredBox } from './frame/use-measured-box'
import { ChartAxis } from './frame/ChartAxis'
import { ChartFrame } from './frame/ChartFrame'
import { ChartScaleLegend } from './frame/ChartScaleLegend'
import { ChartTooltip } from './frame/ChartTooltip'
import { ChartTwin } from './frame/ChartTwin'
import { useReading } from './frame/use-reading'
import styles from '@polymorph/recipes/charts/heatmap.module.css'

export type { HeatmapValue, HeatmapYAxis } from '@polymorph/react'

/**
 * A heatmap showing magnitude over a grid (`design/components/heatmap.md`). It
 * is the main use of the sequential colour ramp.
 *
 * It answers "where is it concentrated". It is **not** a comparison chart:
 * adjacent cells blur together past about seven bins, and telling two close
 * values apart is BarChart's job. **Signed data switches to diverging colours
 * automatically**, as in BarChart; there is no prop for it. The range is
 * symmetric, `[-A, +A]`, with seven steps: the multi-step arms around
 * `--pm-chart-mid`, not two poles stretched into a ramp. **Mid means exactly
 * zero**, not just a lighter shade. The axes, gaps, twin and absent-cell rules
 * are the same as for the sequential grid.
 *
 * No `series` and no `emphasis`: a heatmap has one measure, not several series.
 * So the scale legend replaces the series legend, and the tier's slot palette
 * is not used.
 */

export interface HeatmapProps {
  /**
   * One row per cell. A missing x×y combination shows the **surface**. A `null`
   * value is an absent cell, shown as — in the twin, and never a zero.
   */
  data: readonly ChartDatum[]
  x: ChartXAxis
  y: HeatmapYAxis
  value: HeatmapValue
  size?: ChartSize
  label: string
  locale?: string
  tooltip?: ChartTooltipConfig | false
  /**
   * Called with the read cell's x, y and value, on Enter, Space or click. An
   * absent cell reports nothing, because there is no measurement to select.
   */
  onSelect?: (selection: { x: string | number; y: string | number; value: number }) => void
  loading?: boolean
  /**
   * The chart tier's string catalog (`ChartMessages`). Defaults to generic
   * English; a localized host passes the same object to every chart.
   */
  messages?: ChartMessages
}

export function Heatmap({
  data,
  x,
  y,
  value,
  size = 'md',
  label,
  locale,
  tooltip = {},
  onSelect,
  loading = false,
  messages = DEFAULT_GRID_MESSAGES,
}: HeatmapProps) {
  const { ref: plotRef, box } = useMeasuredBox<HTMLDivElement>()

  /*
   * The drawing, from the engine (`heatmapModel`): the grid, the quantisation,
   * the cells' colours, the scale legend's bounds and the readout's words,
   * decided once for every framework's Heatmap. The reading position is not an
   * input, so a pointer move redraws no cell.
   */
  const selectable = onSelect !== undefined
  const input = useMemo(
    () => ({ data, x, y, value, label, locale, messages, loading, selectable, box }),
    [data, x, y, value, label, locale, messages, loading, selectable, box],
  )
  const model = useMemo(() => heatmapModel(input), [input])
  useDevWarnings(model.warnings)

  /*
   * The reading position is a cell: `index` walks x and `series` walks y. The
   * shared hook's series dimension serves as the second axis, which gives the
   * walk the spec asks for: Left/Right along x, Up/Down along y, in reading
   * order. `seriesStart: 0` because a cell always has a row, so the walk starts
   * on the first row instead of BarChart's "no series selected".
   */
  const walk = {
    count: model.columns.length,
    seriesCount: model.rows.length,
    walkSeries: true,
    seriesStart: 0,
  }
  const reading = useReading(walk)
  const row = reading.series ?? 0
  const readout = heatmapReadout({ ...input, tooltip }, model, reading)

  /**
   * Reports the read cell's column, row and value. An absent cell reports
   * nothing, because the payload's `value` must be a number. It reads the live
   * position, not the rendered one; see LineChart's note on click timing.
   */
  const activate = useCallback(() => {
    if (onSelect === undefined) return
    const selection = heatmapSelection(input, model, reading.now())
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
  const marks = { walk, input, model, readout: heatmapReadout, selection: heatmapSelection }
  useAgentMember(
    {
      member: 'Heatmap',
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
      member="Heatmap"
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
      /*
       * The scale legend replaces the series legend, because there are no series
       * to name, only a range to read against. On signed data it shows the arms
       * with three labels (min · zero · max); otherwise the sequential strip.
       */
      legend={
        !model.legend ? null : model.scale.variant === 'diverging' ? (
          <ChartScaleLegend
            variant="diverging"
            min={model.scale.min}
            zero={model.scale.zero}
            max={model.scale.max}
          />
        ) : (
          <ChartScaleLegend min={model.scale.min} max={model.scale.max} />
        )
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
      {/* One focus stop. Arrow keys walk the cells in reading order. */}
      <div
        className={styles.surface}
        tabIndex={0}
        role="img"
        aria-label={label}
        onKeyDown={onKeyDown}
        onClick={() => activate()}
        onPointerLeave={reading.clear}
        onBlur={reading.clear}
      >
        {plot === null ? null : (
          <svg
            className={styles.marks}
            width={plot.width}
            height={plot.height}
            aria-hidden="true"
            focusable="false"
          >
            {/* The corner radius is the engine's `BAR_END_RADIUS`, so a cell's
                corners match a bar's data end. An absent cell draws nothing. */}
            <g className={styles.cells}>
              {plot.cells.map((cell) => (
                <rect
                  key={cell.key}
                  className={styles.cell}
                  style={{ '--pm-chart-cell': cell.paint } as CSSProperties}
                  data-active={reading.index === cell.column && row === cell.row ? '' : undefined}
                  x={cell.x}
                  y={cell.y}
                  width={cell.width}
                  height={cell.height}
                  rx={plot.radius}
                />
              ))}
            </g>

            {/* The pointer targets: one per grid position, present or absent. */}
            <g className={styles.hits}>
              {plot.hits.map((hit) => (
                <rect
                  key={hit.key}
                  className={styles.hit}
                  x={hit.x}
                  y={hit.y}
                  width={hit.width}
                  height={hit.height}
                  onPointerEnter={() => reading.moveTo(hit.column, hit.row)}
                />
              ))}
            </g>
          </svg>
        )}
      </div>
    </ChartFrame>
  )
}
