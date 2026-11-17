'use client'

import {
  chartMarks,
  chartPosition,
  type ChartMessages,
  type ChartSize,
  type ChartTooltipConfig,
  chooseChartMark,
  DEFAULT_CHART_MESSAGES,
  funnelChartModel,
  funnelChartReadout,
  funnelChartSelection,
  type FunnelStage,
  readChartPosition,
  useAgentMember,
  useDevWarnings,
  type ValueFormat,
} from '@polymorph/react'
import { useCallback, useMemo, useRef, type CSSProperties, type KeyboardEvent } from 'react'

import { ChartFrame } from './frame/ChartFrame'
import { ChartTooltip } from './frame/ChartTooltip'
import { ChartTwin } from './frame/ChartTwin'
import { useMeasuredBox } from './frame/use-measured-box'
import { useReading } from './frame/use-reading'
import styles from '@polymorph/recipes/charts/funnel-chart.module.css'

export type { FunnelStage } from '@polymorph/react'

/**
 * A funnel chart of loss between ordered stages (`design/components/funnel-chart.md`).
 *
 * It answers "where do we lose them": an ordered process, one bar per stage
 * from the inline start, each with its value and its share of the first stage,
 * and between two bars the share of the stage above that reached the stage
 * below. It is **not** a `BarChart`, which compares categories that have no
 * order and no first stage to measure against, and not a `Stepper`, which shows
 * where one reader is in a flow rather than how many reached each step.
 *
 * Bars are plain rectangles, not a tapered funnel: a trapezoid states a value by
 * an area its neighbours change.
 */

export interface FunnelChartProps {
  /** The stages in order, first to last. Drawn as given: a stage that rises is never clamped or reordered. */
  stages: readonly FunnelStage[]
  /** Formats each stage's value in the plot, the tooltip and the twin. */
  format?: ValueFormat
  size?: ChartSize
  label: string
  locale?: string
  tooltip?: ChartTooltipConfig | false
  /** Called with the read stage's index, key, label and value, on Enter, Space or click. */
  onSelect?: (selection: { index: number; key: string; label: string; value: number }) => void
  loading?: boolean
  /**
   * The chart tier's string catalog (`ChartMessages`). Defaults to generic
   * English; a localized host passes the same object to every chart.
   */
  messages?: ChartMessages
}

export function FunnelChart({
  stages,
  format,
  size = 'md',
  label,
  locale,
  tooltip = {},
  onSelect,
  loading = false,
  messages = DEFAULT_CHART_MESSAGES,
}: FunnelChartProps) {
  const { ref: plotRef, box } = useMeasuredBox<HTMLDivElement>()

  /*
   * The drawing, from the engine (`funnelChartModel`): the bars, the shares,
   * the step rates, the text that fits and the readout's words, decided once
   * for every framework's FunnelChart. The reading position is not an input,
   * so a pointer move redraws no bar.
   */
  const selectable = onSelect !== undefined
  const input = useMemo(
    () => ({ stages, format, label, locale, messages, loading, selectable, box }),
    [stages, format, label, locale, messages, loading, selectable, box],
  )
  const model = useMemo(() => funnelChartModel(input), [input])
  useDevWarnings(model.warnings)

  const walk = { count: stages.length }
  const reading = useReading(walk)
  const readout = funnelChartReadout({ ...input, tooltip }, model, reading)

  /**
   * Reports the read stage. It reads the live position, not the rendered one;
   * see LineChart's note on click timing.
   */
  const activate = useCallback(() => {
    if (onSelect === undefined) return
    const selection = funnelChartSelection(input, model, reading.now())
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
  const marks = { walk, input, model, readout: funnelChartReadout, selection: funnelChartSelection }
  useAgentMember(
    {
      member: 'FunnelChart',
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
      member="FunnelChart"
      frameRef={frame}
      position={reading.active ? reading.index : null}
      label={label}
      size={size}
      state={model.state}
      plotRef={plotRef}
      summary={model.summary}
      announcement={readout.announcement}
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
      {/* One focus stop. Left/Right walk the stages, first to last. */}
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
          <>
            <svg
              className={styles.marks}
              data-reading={reading.active ? '' : undefined}
              width={plot.width}
              height={plot.height}
              /*
               * Where the bars start, passed to the stylesheet so the entrance
               * grows from it. It is geometry, not a design value, as BarChart's
               * zero rule is.
               */
              style={{ '--pm-chart-zero': `${plot.start}px` } as CSSProperties}
              aria-hidden="true"
              focusable="false"
            >
              <g className={styles.bars}>
                {plot.bars.map((bar) => (
                  <g key={bar.key} data-active={bar.index === reading.index ? '' : undefined}>
                    {bar.d === '' ? null : (
                      <path
                        className={styles.bar}
                        style={{ '--pm-chart-mark': bar.paint } as CSSProperties}
                        d={bar.d}
                      />
                    )}
                    {/*
                     * The pointer target: the stage's whole row, over its bar, so
                     * the pointer reaches the row wherever it enters it. A click
                     * moves the reading here before the surface reports it, so a
                     * press that arrives before the hover is not read on the
                     * stage before.
                     */}
                    <rect
                      className={styles.hit}
                      x={bar.hit.x}
                      y={bar.hit.y}
                      width={bar.hit.width}
                      height={bar.hit.height}
                      onPointerEnter={() => reading.moveTo(bar.index)}
                      onClick={() => reading.moveTo(bar.index)}
                    />
                  </g>
                ))}
              </g>
            </svg>

            {/*
             * The words on the plot are HTML, as an axis's are, so a long label
             * ends in an ellipsis and a number takes the theme's figures. They
             * are hidden from the tree: the summary, the live region and the
             * twin say the same.
             */}
            <div className={styles.text} aria-hidden="true">
              {plot.labels.map((text) => (
                <span
                  key={text.key}
                  className={styles.label}
                  style={
                    {
                      '--pm-chart-text-x': `${text.x}px`,
                      '--pm-chart-text-y': `${text.y}px`,
                      '--pm-chart-text-width': `${plot.labelWidth}px`,
                    } as CSSProperties
                  }
                >
                  {text.text}
                </span>
              ))}
              {plot.values.map((text) => (
                <span
                  key={text.key}
                  className={styles.value}
                  style={
                    {
                      '--pm-chart-text-x': `${text.x}px`,
                      '--pm-chart-text-y': `${text.y}px`,
                    } as CSSProperties
                  }
                >
                  {text.text}
                </span>
              ))}
              {plot.steps.map((text) => (
                <span
                  key={text.key}
                  className={styles.step}
                  style={
                    {
                      '--pm-chart-text-x': `${text.x}px`,
                      '--pm-chart-text-y': `${text.y}px`,
                    } as CSSProperties
                  }
                >
                  {text.text}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </ChartFrame>
  )
}
