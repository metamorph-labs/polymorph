'use client'

import {
  chartMarks,
  chartPosition,
  type ChartMessages,
  type ChartSize,
  type ChartTooltipConfig,
  chooseChartMark,
  DEFAULT_CHART_MESSAGES,
  type DonutCenter,
  donutChartModel,
  donutChartReadout,
  donutChartSelection,
  type DonutSegment,
  readChartPosition,
  useAgentMember,
  useDevWarnings,
  type ValueFormat,
} from '@polymorph/react'
import { useCallback, useMemo, useRef, type CSSProperties, type KeyboardEvent } from 'react'

import { useMeasuredBox } from './frame/use-measured-box'
import { ChartFrame } from './frame/ChartFrame'
import { ChartLegend } from './frame/ChartLegend'
import { ChartTooltip } from './frame/ChartTooltip'
import { ChartTwin } from './frame/ChartTwin'
import { useReading } from './frame/use-reading'
import styles from '@polymorph/recipes/charts/donut-chart.module.css'

export type { DonutCenter, DonutSegment } from '@polymorph/react'

/**
 * A donut chart showing part-to-whole shares at a glance (`design/components/donut-chart.md`).
 *
 * It answers "roughly how does it split". It is **not** for comparing close
 * values, which is a bar chart's job, as the spec states. It is not a
 * `Meter`, which shows one value against a limit, and never a solid pie,
 * because the ring de-emphasises the angle comparison a solid pie invites.
 *
 * A donut is a bar chart wrapped around its total. So the ring's thickness is
 * the bar-thickness cap, and the tooltip and the twin both show the **share**:
 * it is the number a part-to-whole reader wants, and the one the geometry shows
 * least accurately.
 */

export interface DonutChartProps {
  /** The segments, at most 6. A seventh raises a dev warning suggesting an "Other" segment. */
  segments: readonly DonutSegment[]
  center?: DonutCenter
  /** Formats segment values in the tooltip and the twin. */
  format?: ValueFormat
  size?: ChartSize
  label: string
  locale?: string
  tooltip?: ChartTooltipConfig | false
  /**
   * Called with the read segment's key, label, value and derived share, on
   * Enter, Space or click.
   */
  onSelect?: (selection: { key: string; label: string; value: number; share: number }) => void
  loading?: boolean
  /**
   * The chart tier's string catalog (`ChartMessages`). Defaults to generic
   * English; a localized host passes the same object to every chart.
   */
  messages?: ChartMessages
}

export function DonutChart({
  segments,
  center,
  format,
  size = 'md',
  label,
  locale,
  tooltip = {},
  onSelect,
  loading = false,
  messages = DEFAULT_CHART_MESSAGES,
}: DonutChartProps) {
  const { ref: plotRef, box } = useMeasuredBox<HTMLDivElement>()

  /*
   * The drawing, from the engine (`donutChartModel`): the slots, the total, the
   * ring's arcs and the readout's words, decided once for every framework's
   * DonutChart. The reading position is not an input, so a pointer move
   * redraws no arc.
   */
  const selectable = onSelect !== undefined
  const input = useMemo(
    () => ({ segments, center, format, label, locale, messages, loading, selectable, box }),
    [segments, center, format, label, locale, messages, loading, selectable, box],
  )
  const model = useMemo(() => donutChartModel(input), [input])
  useDevWarnings(model.warnings)

  const walk = { count: segments.length }
  const reading = useReading(walk)
  const readout = donutChartReadout({ ...input, tooltip }, model, reading)

  /**
   * Reports the read segment, including its share. It reads the live position,
   * not the rendered one; see LineChart's note on click timing.
   */
  const activate = useCallback(() => {
    if (onSelect === undefined) return
    const selection = donutChartSelection(input, model, reading.now())
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
  const marks = { walk, input, model, readout: donutChartReadout, selection: donutChartSelection }
  useAgentMember(
    {
      member: 'DonutChart',
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
      member="DonutChart"
      frameRef={frame}
      position={reading.active ? reading.index : null}
      label={label}
      size={size}
      state={model.state}
      plotRef={plotRef}
      summary={model.summary}
      announcement={readout.announcement}
      legend={model.legend ? <ChartLegend series={model.painted} keyShape="rect" /> : null}
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
      {/* One focus stop. Left/Right walk the segments clockwise. */}
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
            data-reading={reading.active ? '' : undefined}
            width={plot.width}
            height={plot.height}
            aria-hidden="true"
            focusable="false"
          >
            <g transform={plot.transform}>
              <g>
                {plot.arcs.map((arc) => (
                  <path
                    key={arc.key}
                    className={styles.segment}
                    style={{ '--pm-chart-mark': arc.paint } as CSSProperties}
                    data-active={arc.index === reading.index ? '' : undefined}
                    d={arc.d}
                  />
                ))}
              </g>

              {/*
               * The pointer targets, over the paint. A 4% segment is a sliver,
               * and the system minimum is 24px across the ring in both
               * directions.
               */}
              <g>
                {plot.arcs.map((arc) => (
                  <path
                    key={arc.key}
                    className={styles.hit}
                    d={arc.hit}
                    onPointerEnter={() => reading.moveTo(arc.index)}
                  />
                ))}
              </g>
            </g>

            {plot.center === null ? null : (
              <g className={styles.center}>
                <text x={plot.center.x} y={plot.center.y} textAnchor="middle">
                  {plot.center.value}
                </text>
                {plot.center.label === undefined ? null : (
                  <text
                    className={styles.centerLabel}
                    x={plot.center.x}
                    y={plot.center.labelY}
                    textAnchor="middle"
                  >
                    {plot.center.label}
                  </text>
                )}
              </g>
            )}
          </svg>
        )}
      </div>
    </ChartFrame>
  )
}
