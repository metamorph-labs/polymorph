'use client'

import {
  chartHiddenSeries,
  chartMarks,
  chartPosition,
  chartSeries,
  chooseChartMark,
  DEFAULT_CHART_MESSAGES,
  nearest2D,
  readChartPosition,
  scatterChartModel,
  scatterChartReadout,
  scatterChartSelection,
  toggleChartSeries,
  toggleSeries,
  useAgentMember,
  useDevWarnings,
  type ChartAnnotation,
  type ChartDatum,
  type ChartMessages,
  type ChartSeries,
  type ChartSize,
  type ChartTooltipConfig,
  type ChartXAxis,
  type ChartYAxis,
  type ScatterBubble,
} from '@polymorph/react'
import {
  useCallback,
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
import { ChartFrame } from './frame/ChartFrame'
import { ChartLegend, legendKeyClass } from './frame/ChartLegend'
import { ChartTooltip } from './frame/ChartTooltip'
import { ChartTwin } from './frame/ChartTwin'
import { useChartCap } from './frame/use-chart-cap'
import { useReading } from './frame/use-reading'
import styles from '@polymorph/recipes/charts/scatter-chart.module.css'

export type { ScatterBubble } from '@polymorph/react'

/**
 * A scatter chart for correlation between two measures (`design/components/scatter-chart.md`).
 * Each mark is one observation placed by its x and y values. In bubble mode the
 * mark's **area** encodes a third value.
 *
 * It answers "do these move together". It is **not** a LineChart, because
 * nothing connects and the rows are observations, not a sequence. It is not a
 * BarChart, because nothing is measured by length from zero. It is the tier's
 * first **any-neighbour form**: any two marks can land beside each other, so
 * the series limit is the palette's all-pairs cap (`--pm-chart-cap`), not the
 * wheel's eight hue anchors.
 */

export interface ScatterChartProps {
  /**
   * One row per observation. A `null` x, y or bubble value renders **no mark**
   * for that row and series (shown as — in the twin), never a zero.
   */
  data: readonly ChartDatum[]
  /**
   * The series, **at most the palette's cap**. The member reads
   * `--pm-chart-cap` (emitted by the theme at the minimum across modes) and
   * dev-warns above it.
   */
  series: readonly ChartSeries[]
  /**
   * The x axis, `linear` or `time`. An omitted `scale` defaults to `'linear'`
   * here, not `'band'`, because a scatter's x is a measure. `band` raises a dev
   * warning naming BarChart, and the axis renders linear.
   */
  x: ChartXAxis
  /** The y axis. `domain` defaults to `'auto'` to fit the data; `'zero'` anchors at zero. */
  y?: ChartYAxis
  bubble?: ScatterBubble
  size?: ChartSize
  /** The accessible name. */
  label: string
  /** The locale for `Intl` formatting. */
  locale?: string
  /**
   * The per-mark readout (no crosshair): the x, y and bubble values, each in
   * its own format.
   */
  tooltip?: ChartTooltipConfig | false
  /**
   * Annotations from the tier's closed union (line, band and point), all
   * allowed on this member.
   */
  annotations?: readonly ChartAnnotation[]
  /**
   * Called with the row index, series key and row at the reading position, on
   * Enter, Space or click.
   */
  onSelect?: (selection: { index: number; key: string; datum: ChartDatum }) => void
  /** Shows the previous frame at reduced opacity during a refetch. */
  loading?: boolean
  /**
   * The chart tier's string catalog (`ChartMessages`). Defaults to generic
   * English; a localized host passes the same object to every chart.
   */
  messages?: ChartMessages
}

const NONE: ReadonlySet<string> = new Set()

export function ScatterChart({
  data,
  series,
  x,
  y,
  bubble,
  size = 'md',
  label,
  locale,
  tooltip = {},
  annotations,
  onSelect,
  loading = false,
  messages = DEFAULT_CHART_MESSAGES,
}: ScatterChartProps) {
  const { ref: plotRef, box } = useMeasuredBox<HTMLDivElement>()
  const { capRef, cap } = useChartCap()

  /**
   * Toggle-to-isolate (`ChartLegend`): the series hidden from the legend, owned
   * by the member, because the domains refit to the series that remain.
   */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(NONE)
  const toggle = useCallback((key: string) => setHidden((was) => toggleSeries(was, key)), [])

  /*
   * The drawing, from the engine (`scatterChartModel`): the marks' places, the
   * bubble radii, the cap warning and the readout's words, decided once for
   * every framework's ScatterChart. The reading position is not an input, so a
   * pointer move redraws no mark.
   */
  const selectable = onSelect !== undefined
  const input = useMemo(
    () => ({
      data,
      series,
      x,
      y,
      bubble,
      annotations,
      label,
      locale,
      messages,
      loading,
      selectable,
      hidden,
      cap,
      box,
    }),
    [
      data,
      series,
      x,
      y,
      bubble,
      annotations,
      label,
      locale,
      messages,
      loading,
      selectable,
      hidden,
      cap,
      box,
    ],
  )
  const model = useMemo(() => scatterChartModel(input), [input])
  useDevWarnings(model.warnings)

  /**
   * The reading position is a mark. `index` walks rows within the active
   * series, and `series` switches series at the same row (Up/Down).
   * `seriesStart: 0` because a mark always belongs to a series. This matches
   * the heatmap's second axis, not BarChart's whole-band resting position.
   */
  const walk = {
    count: data.length,
    seriesCount: model.visible.length,
    walkSeries: true,
    seriesStart: 0,
  }
  const reading = useReading(walk)
  const activeSeries = reading.series ?? 0
  const readout = scatterChartReadout({ ...input, tooltip }, model, reading)

  /**
   * Reports the row index, series key and row. It reads the live position from
   * `reading.now()`, not the rendered one.
   */
  const activate = useCallback(() => {
    if (onSelect === undefined) return
    const selection = scatterChartSelection(input, model, reading.now())
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
   * (`chartSeries`), and `toggle` presses one, as a person does. The chart
   * registers while a person has something to operate in it: `onSelect`, or a
   * legend.
   */
  const frame = useRef<HTMLElement>(null)
  const marks = {
    walk,
    input,
    model,
    readout: scatterChartReadout,
    selection: scatterChartSelection,
  }
  useAgentMember(
    {
      member: 'ScatterChart',
      element: () => frame.current,
      state: () => ({
        items: onSelect === undefined ? [] : chartMarks(marks, reading),
        position: chartPosition(marks, reading),
        count: walk.count,
        series: chartSeries(frame.current, legendKeyClass, model.painted),
        hidden: chartHiddenSeries(frame.current, legendKeyClass, model.painted),
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
      },
    },
    { unless: onSelect === undefined && !model.legend },
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
      member="ScatterChart"
      frameRef={frame}
      position={reading.active ? reading.index : null}
      label={label}
      size={size}
      state={model.state}
      plotRef={plotRef}
      summary={model.summary}
      announcement={readout.announcement}
      /* No axes without rows, because an axis over an empty plot shows a range
         that was never measured. */
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
      {/* One focus stop. Left/Right walk rows within the active series;
          Up/Down switch series at the same row. */}
      <div
        ref={capRef}
        className={styles.surface}
        tabIndex={0}
        role="img"
        aria-label={label}
        onKeyDown={onKeyDown}
        onClick={() => activate()}
        /*
         * The hit test is a linear 2D nearest scan, limited to `HIT_TARGET_MIN`.
         * It is fast enough for the tier's limit of about 1k points, and
         * d3-delaunay is deferred until a measured need. Beyond the limit the
         * pointer is over empty surface and the reading clears, so the whole
         * plot does not become one target.
         */
        onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
          if (plot === null) return
          const at = event.currentTarget.getBoundingClientRect()
          const hit = nearest2D(model.points, event.clientX - at.left, event.clientY - at.top)
          if (hit === -1) {
            reading.clear()
            return
          }
          reading.moveTo(hit % data.length, Math.floor(hit / data.length))
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
            aria-hidden="true"
            focusable="false"
          >
            {/* Gridlines on **both** axes, because both are value axes and
                gridlines belong only on value axes. */}
            <g className={styles.grid}>
              {plot.grid.map((line) => (
                <path key={line.key} d={line.d} />
              ))}
            </g>

            {/* A zero rule per axis, only when zero is inside that axis's
                domain. With `auto` domains a plot may have none. */}
            {plot.zero.map((rule) => (
              <path key={rule.key} className={styles.zero} d={rule.d} />
            ))}

            <ChartAnnotations layer="wash" layers={plot} />

            {/* One group per series. The active series keeps full opacity and
                the rest fade back (transient emphasis). */}
            <g className={styles.points}>
              {plot.groups.map((group) => (
                <g
                  key={group.key}
                  style={{ '--pm-chart-mark': group.paint } as CSSProperties}
                  data-active={reading.active && activeSeries === group.series ? '' : undefined}
                >
                  {group.dots.map((dot) => (
                    <circle
                      key={dot.index}
                      className={styles.dot}
                      cx={dot.cx}
                      cy={dot.cy}
                      r={dot.r}
                      /* The per-dot stagger index, set inline as geometry,
                         like BarChart's zero. The stylesheet turns it into a
                         delay capped at the stagger maximum, so a dense plot
                         still finishes entering quickly. */
                      style={{ '--pm-chart-dot': dot.index } as CSSProperties}
                      data-active={
                        reading.index === dot.index && activeSeries === group.series
                          ? ''
                          : undefined
                      }
                    />
                  ))}
                </g>
              ))}
            </g>

            <ChartAnnotations layer="ink" layers={plot} />
          </svg>
        )}
      </div>
    </ChartFrame>
  )
}
