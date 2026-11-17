'use client'

import {
  barChartModel,
  barChartReadout,
  barChartSelection,
  chartHiddenSeries,
  chartMarks,
  chartPosition,
  chartSeries,
  chooseChartMark,
  DEFAULT_CHART_MESSAGES,
  nearestIndex,
  readChartPosition,
  toggleChartSeries,
  toggleSeries,
  useAgentMember,
  useDevWarnings,
  type CartesianChartProps,
  type ChartDatum,
  type ChartSeries,
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

import { ChartAnnotations } from './frame/ChartAnnotations'
import { ChartAxis } from './frame/ChartAxis'
import { ChartFrame } from './frame/ChartFrame'
import { ChartLegend, legendKeyClass } from './frame/ChartLegend'
import { ChartTooltip } from './frame/ChartTooltip'
import { ChartTwin } from './frame/ChartTwin'
import { useMeasuredBox } from './frame/use-measured-box'
import { useReading } from './frame/use-reading'
import styles from '@polymorph/recipes/charts/bar-chart.module.css'

/**
 * A bar chart for comparing magnitudes across categories (`design/components/bar-chart.md`).
 *
 * It answers "which is bigger". It is **not** a `Histogram`, which bins bars
 * over a continuum. It is not a `Progress`, which shows one ratio against a
 * limit, and not a `Timeline`, which shows a sequence, not sizes.
 *
 * The main rule: **the y domain always includes zero**. A bar's length is its
 * value, so a truncated axis misstates every comparison on the chart. For that
 * reason `y.domain: 'auto'` raises a dev warning and is ignored.
 *
 * `lines` draws further series as lines over the bars, on the same value axis.
 * The chart has one value axis and never a second (`docs/charts.md`).
 */

export interface BarChartProps extends CartesianChartProps {
  /**
   * Series drawn as lines over the bars, on the bars' value axis and in their
   * unit: a moving average of the bars' own measure, say. They take the slots
   * after the bars'. A vertical chart only; a horizontal one warns and draws
   * no lines. A second measure on a scale of its own is a second chart.
   */
  lines?: readonly ChartSeries[]
  /** Use horizontal for long category names, because the system never rotates a label. */
  orientation?: 'vertical' | 'horizontal'
  /**
   * How multiple series combine; applies at 2 or more series. Mixed signs
   * cannot stack, so `stacked` with both signs dev-warns and renders grouped.
   * `diverging` is the Likert form on `stackOffsetDiverging`. **The app splits
   * neutral answers**: it pre-signs values, and the member never derives a
   * neutral key. Each side's segments take the diverging arms outward from
   * zero. In this mode the warning is reversed, because signed data is expected.
   */
  mode?: 'grouped' | 'stacked' | 'diverging'
  /**
   * Called with the row index, series key and row at the reading position, on
   * Enter, Space or click.
   */
  onSelect?: (selection: { index: number; key: string; datum: ChartDatum }) => void
}

const NONE: ReadonlySet<string> = new Set()

export function BarChart({
  data,
  series,
  lines,
  x,
  y,
  orientation = 'vertical',
  mode = 'grouped',
  size = 'md',
  label,
  locale,
  tooltip = {},
  emphasis,
  baseline,
  annotations,
  onSelect,
  loading = false,
  messages = DEFAULT_CHART_MESSAGES,
}: BarChartProps) {
  const { ref: plotRef, box } = useMeasuredBox<HTMLDivElement>()

  /**
   * Toggle-to-isolate (`ChartLegend`): the series hidden from the legend, owned
   * by the member, because the domains refit to the series that remain.
   */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(NONE)
  const toggle = useCallback((key: string) => setHidden((was) => toggleSeries(was, key)), [])

  /*
   * The drawing, from the engine (`barChartModel`): the stacking rules, the
   * colours, the bars' geometry and the readout's words, decided once for
   * every framework's BarChart. The reading position is not an input, so a
   * pointer move redraws no bar.
   */
  const selectable = onSelect !== undefined
  const input = useMemo(
    () => ({
      data,
      series,
      lines,
      x,
      y,
      orientation,
      mode,
      emphasis,
      baseline,
      annotations,
      label,
      locale,
      messages,
      loading,
      selectable,
      hidden,
      box,
    }),
    [
      data,
      series,
      lines,
      x,
      y,
      orientation,
      mode,
      emphasis,
      baseline,
      annotations,
      label,
      locale,
      messages,
      loading,
      selectable,
      hidden,
      box,
    ],
  )
  const model = useMemo(() => barChartModel(input), [input])
  useDevWarnings(model.warnings)

  // A band holds one mark per series, so Up/Down can move between them.
  const walk = { count: data.length, seriesCount: model.visible.length, walkSeries: true }
  const reading = useReading(walk)
  const readout = barChartReadout({ ...input, tooltip }, model, reading)

  /**
   * Reports the selection with its series key. It reads the live position, not
   * the rendered one; see LineChart's note on click timing.
   */
  const activate = useCallback(() => {
    if (onSelect === undefined) return
    const selection = barChartSelection(input, model, reading.now())
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
  const marks = { walk, input, model, readout: barChartReadout, selection: barChartSelection }
  useAgentMember(
    {
      member: 'BarChart',
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

  const { plot, vertical } = model

  return (
    <ChartFrame
      member="BarChart"
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
            lineKeys={model.lineKeys}
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
      {/* One focus stop. Arrow keys walk the bands; Up/Down walk the series in a band, bars then lines. */}
      <div
        className={styles.surface}
        tabIndex={0}
        role="img"
        aria-label={label}
        onKeyDown={onKeyDown}
        onClick={() => activate()}
        /*
         * The reading follows the pointer's *coordinates*, snapped to the
         * nearest band, as a crosshair does. It uses coordinates instead of
         * targets because target-based entering is unreliable under an
         * asynchronous hit test: a pointer that jumps onto the plot can click
         * before the browser has re-resolved what it is over (measured). The
         * bands' hit rects still receive enter events when the browser delivers
         * them, and deduplication makes the overlap harmless.
         */
        onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
          if (plot === null) return
          const at = event.currentTarget.getBoundingClientRect()
          const px = vertical ? event.clientX - at.left : event.clientY - at.top
          reading.moveTo(nearestIndex(model.positions, px), reading.now().series)
        }}
        onPointerLeave={reading.clear}
        onBlur={reading.clear}
      >
        {plot === null ? null : (
          <svg
            className={styles.marks}
            data-orientation={orientation}
            data-mode={model.drawn}
            data-reading={reading.active ? '' : undefined}
            width={plot.width}
            height={plot.height}
            /*
             * The zero rule's position, passed to the stylesheet so the
             * entrance grows from it. It is geometry, not a design value, like
             * Progress's inline `scaleX`, and it is the only inline value this
             * chart writes.
             */
            style={{ '--pm-chart-zero': `${plot.zero}px` } as CSSProperties}
            aria-hidden="true"
            focusable="false"
          >
            <g className={styles.grid}>
              {plot.grid.map((line) => (
                <path key={line.key} d={line.d} />
              ))}
            </g>

            {/* A reference band's wash sits under the data it contextualises. */}
            <ChartAnnotations layer="wash" layers={plot} />

            {/*
             * Wrapped so the stylesheet's entrance applies only to bands. The
             * grid and the annotation layer are `g` elements too, and a rise on
             * `.marks g` would scale them out of the zero line with the marks.
             * The frame's own fade covers them.
             */}
            <g className={styles.bands}>
              {plot.bands.map((band) => {
                const active = reading.index === band.index
                return (
                  <g key={band.key} data-active={active ? '' : undefined}>
                    <rect
                      className={styles.hit}
                      x={band.hit.x}
                      y={band.hit.y}
                      width={band.hit.width}
                      height={band.hit.height}
                      onPointerEnter={() => reading.moveTo(band.index, reading.now().series)}
                    />
                    {band.marks.map((mark) => (
                      <path
                        key={mark.key}
                        className={styles.bar}
                        style={{ '--pm-chart-mark': mark.paint } as CSSProperties}
                        // The mark under the reading position. The band's `<g>`
                        // marks the reading, and the mark selected by the
                        // Up/Down walk carries its own flag as well.
                        data-active={active && reading.series === mark.series ? '' : undefined}
                        d={mark.d}
                      />
                    ))}
                  </g>
                )
              })}
            </g>

            {/* The zero rule, the only axis stroke. It is drawn over the marks
                so a bar reads as sitting on it, not passing through it. */}
            <path className={styles.zero} d={plot.zeroRule} />

            {/* The annotation ink is drawn where the baseline draws on this
                member: over the marks, so a target reads across the bars. */}
            <ChartAnnotations layer="ink" layers={plot} />

            {/*
             * The lines, over everything else, as LineChart draws its strokes
             * over the annotation ink. Absent with no lines, so a chart without
             * them renders what it rendered before. A point carries
             * `data-active` at the band read, unless the walk is on another
             * series.
             */}
            {plot.lines.length === 0 ? null : (
              <g className={styles.lines}>
                {plot.lines.map((line) => (
                  <g key={line.key} style={{ '--pm-chart-mark': line.paint } as CSSProperties}>
                    <path className={styles.line} d={line.d} />
                    {line.points.map((point) => (
                      <circle
                        key={point.key}
                        className={styles.point}
                        cx={point.cx}
                        cy={point.cy}
                        r={point.r}
                        data-active={
                          reading.index === point.index &&
                          (reading.series === null || reading.series === line.series)
                            ? ''
                            : undefined
                        }
                      />
                    ))}
                  </g>
                ))}
              </g>
            )}
          </svg>
        )}
      </div>
    </ChartFrame>
  )
}
