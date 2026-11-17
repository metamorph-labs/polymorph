'use client'

import {
  type ChartDatum,
  chartHiddenSeries,
  chartMarks,
  chartPosition,
  chartSeries,
  type ChartMessages,
  type ChartSeries,
  type ChartSize,
  type ChartTooltipConfig,
  chooseChartMark,
  DEFAULT_CHART_MESSAGES,
  nearest2D,
  type RadarAxis,
  radarChartModel,
  radarChartReadout,
  radarChartSelection,
  readChartPosition,
  toggleChartSeries,
  toggleSeries,
  useAgentMember,
  useDevWarnings,
  type ValueFormat,
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
import { ChartFrame } from './frame/ChartFrame'
import { ChartLegend, legendKeyClass } from './frame/ChartLegend'
import { ChartTooltip } from './frame/ChartTooltip'
import { ChartTwin } from './frame/ChartTwin'
import { useChartCap } from './frame/use-chart-cap'
import { useReading } from './frame/use-reading'
import styles from '@polymorph/recipes/charts/radar-chart.module.css'

/**
 * A radar chart profiling items over shared-unit axes (`design/components/radar-chart.md`).
 * It takes three to six spokes, at most three polygons, and one scale. It answers
 * "what shape is this thing". Radar charts are easy to misread, so the member
 * builds its guardrails into the API:
 *
 *  - **One shared zero-based radial scale across all axes.** Per-axis scales
 *    are the usual way a radar misleads. No API expresses them, and an axis
 *    with a different unit belongs on a different chart.
 *  - **Not an area read.** A polygon's enclosed area grows with the square of
 *    its values and depends on the arbitrary axis order. The twin, an axes ×
 *    series table, is mandatory anatomy for that reason.
 *  - **An any-neighbour form.** Polygons can cross anywhere, so the series
 *    limit is the palette's cap (`--pm-chart-cap`), as for ScatterChart.
 */

export type { RadarAxis } from '@polymorph/react'

export interface RadarChartProps {
  /**
   * The spokes, **3–6**, drawn clockwise from 12 o'clock in the given order.
   * Fewer than 3 raises a dev warning, because two values read better side by
   * side; more than 6 raises one, because the polygon becomes unreadable. The
   * chart still draws every axis it is given, because a warning never hides
   * data.
   */
  axes: readonly RadarAxis[]
  /**
   * **One row per axis, in the axes' order**; row *i* binds to `axes[i]`. A
   * count mismatch raises a dev warning naming both lengths. Each row has one
   * field per series key, and `null` is a **gap**: the polygon breaks at that
   * vertex instead of dipping to zero.
   */
  data: readonly ChartDatum[]
  /**
   * The polygons, **at most the palette's cap**. Polygons can cross anywhere,
   * so `--pm-chart-cap` limits them as it limits Scatter.
   */
  series: readonly ChartSeries[]
  /**
   * Formats values in the tooltip and twin. There is no `y` prop: the one
   * shared scale runs from zero to the nice'd maximum across **all** series and
   * axes, and nothing is configurable per axis.
   */
  format?: ValueFormat
  /** The chart size; the outer radius fits the plot's shorter side, as in DonutChart. */
  size?: ChartSize
  /** The accessible name. */
  label: string
  /** The locale for `Intl` formatting. */
  locale?: string
  /**
   * The per-vertex readout: an axis label header (`hideLabel` removes it), then
   * the series key glyph, series label and formatted value.
   */
  tooltip?: ChartTooltipConfig | false
  /**
   * Called with the axis key, series key and value at the reading position, on
   * Enter, Space or click.
   */
  onSelect?: (selection: { axis: string; key: string; value: number }) => void
  /** Shows the previous frame at reduced opacity during a refetch. */
  loading?: boolean
  /**
   * The chart tier's string catalog (`ChartMessages`). Defaults to generic
   * English; a localized host passes the same object to every chart.
   */
  messages?: ChartMessages
}

const NONE: ReadonlySet<string> = new Set()

export function RadarChart({
  axes,
  data,
  series,
  format,
  size = 'md',
  label,
  locale,
  tooltip = {},
  onSelect,
  loading = false,
  messages = DEFAULT_CHART_MESSAGES,
}: RadarChartProps) {
  const { ref: plotRef, box } = useMeasuredBox<HTMLDivElement>()
  const { capRef, cap } = useChartCap()

  /**
   * Toggle-to-isolate (`ChartLegend`): the series hidden from the legend, owned
   * by the member, because the shared scale refits its maximum to the series
   * that remain.
   */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(NONE)
  const toggle = useCallback((key: string) => setHidden((was) => toggleSeries(was, key)), [])

  /*
   * The drawing, from the engine (`radarChartModel`): the shared scale, the
   * polar geometry, the guardrails' warnings and the readout's words, decided
   * once for every framework's RadarChart. The reading position is not an
   * input, so a pointer move redraws no polygon.
   */
  const selectable = onSelect !== undefined
  const input = useMemo(
    () => ({
      axes,
      data,
      series,
      format,
      label,
      locale,
      messages,
      loading,
      selectable,
      hidden,
      cap,
      box,
    }),
    [axes, data, series, format, label, locale, messages, loading, selectable, hidden, cap, box],
  )
  const model = useMemo(() => radarChartModel(input), [input])
  useDevWarnings(model.warnings)

  /**
   * The reading position is a vertex. `index` walks the axes around the polygon
   * and wraps, because clockwise past the last spoke is the first. `series`
   * switches polygons at the same axis.
   */
  const walk = {
    count: axes.length,
    seriesCount: model.visible.length,
    walkSeries: true,
    seriesStart: 0,
    wrap: true,
  }
  const reading = useReading(walk)
  const activeSeries = reading.series ?? 0
  const readout = radarChartReadout({ ...input, tooltip }, model, reading)

  /**
   * Reports the axis key, series key and value. It reads the live position
   * from `reading.now()`, not the rendered one.
   */
  const activate = useCallback(() => {
    if (onSelect === undefined) return
    const selection = radarChartSelection(input, model, reading.now())
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
  const marks = { walk, input, model, readout: radarChartReadout, selection: radarChartSelection }
  useAgentMember(
    {
      member: 'RadarChart',
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
      member="RadarChart"
      frameRef={frame}
      position={reading.active ? reading.index : null}
      label={label}
      size={size}
      state={model.state}
      plotRef={plotRef}
      summary={model.summary}
      announcement={readout.announcement}
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
      {/* One focus stop. Left/Right walk the axes around the polygon; Up/Down
          switch series at the same axis. */}
      <div
        ref={capRef}
        className={styles.surface}
        tabIndex={0}
        role="img"
        aria-label={label}
        onKeyDown={onKeyDown}
        onClick={() => activate()}
        /* Nearest vertex in 2D, within the hit-target minimum. At most 18
           vertices is far inside the linear scan's intended range. */
        onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
          if (plot === null) return
          const at = event.currentTarget.getBoundingClientRect()
          const hit = nearest2D(model.positions, event.clientX - at.left, event.clientY - at.top)
          if (hit === -1) {
            reading.clear()
            return
          }
          reading.moveTo(hit % axes.length, Math.floor(hit / axes.length))
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
            <g transform={plot.transform}>
              {/* The rings, polygons through the spokes, then the spokes. */}
              <g className={styles.grid}>
                {plot.grid.map((line) => (
                  <path key={line.key} d={line.d} />
                ))}
              </g>

              {/* One group per series: stroke, wash and vertices, as in a
                  line chart, drawn radially. */}
              <g className={styles.profiles}>
                {plot.profiles.map((profile) => (
                  <g
                    key={profile.key}
                    style={{ '--pm-chart-mark': profile.paint } as CSSProperties}
                    data-active={reading.active && activeSeries === profile.series ? '' : undefined}
                  >
                    <path className={styles.wash} d={profile.d} />
                    <path className={styles.stroke} d={profile.d} />
                    {profile.vertices.map((vertex) => (
                      <circle
                        key={vertex.key}
                        className={styles.vertex}
                        cx={vertex.x}
                        cy={vertex.y}
                        r={vertex.r}
                        data-active={
                          reading.index === vertex.index && activeSeries === profile.series
                            ? ''
                            : undefined
                        }
                      />
                    ))}
                  </g>
                ))}
              </g>

              {/* Axis labels at each spoke's end. They use text tokens, never
                  series colour. */}
              <g className={styles.labels}>
                {plot.labels.map((name) => (
                  <text key={name.key} x={name.x} y={name.y} textAnchor={name.anchor}>
                    {name.text}
                  </text>
                ))}
              </g>
            </g>
          </svg>
        )}
      </div>
    </ChartFrame>
  )
}
