import type { ChartReadout, ChartTooltipRow, ChartTwinColumn } from './anatomy'
import { MARKER_RADIUS } from './cartesian'
import { formatValue } from './format'
import { rulePath, type PlanePoint } from './geometry'
import type { MeasuredBox } from './measured-box'
import { DEFAULT_CHART_MESSAGES, spokenSummary } from './messages'
import type { MaybePoint } from './paths'
import { polarAngles, polarPoint, profilePath, radialScale, ringPath } from './polar'
import type { ReadingPosition, ReadingView } from './reading'
import { legendFor, resolveSeries, valueAt, type ResolvedSeries } from './series'
import {
  chartState,
  type ChartDatum,
  type ChartMessages,
  type ChartSeries,
  type ChartState,
  type ChartTooltipConfig,
  type ValueFormat,
} from './types'

/**
 * RadarChart's drawing (`design/components/radar-chart.md`): everything the
 * member shows that follows from its props, the series the reader has hidden,
 * the palette's series cap and the measured plot, and what it shows at a
 * reading position. Every framework's RadarChart renders it, so the polar
 * geometry, the guardrails' warnings and the readout's words are decided once.
 *
 * It takes three to six spokes, at most three polygons, and one scale. Radar
 * charts are easy to misread, so the member builds its guardrails into the API:
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

export interface RadarAxis {
  key: string
  /** The axis name, never derived from the key, as with `ChartSeries.label`. */
  label: string
}

export interface RadarChartInput {
  axes: readonly RadarAxis[]
  data: readonly ChartDatum[]
  series: readonly ChartSeries[]
  format?: ValueFormat | undefined
  /** The chart's accessible name. */
  label: string
  locale?: string | undefined
  messages?: ChartMessages | undefined
  /** The tooltip's configuration; it shapes the readout and not the marks. */
  tooltip?: ChartTooltipConfig | false | undefined
  loading?: boolean | undefined
  /** Whether the member has an `onSelect`: the summary then says the plot responds to Enter. */
  selectable?: boolean | undefined
  /** The series the reader has hidden from the legend. */
  hidden?: ReadonlySet<string> | undefined
  /**
   * The palette's any-neighbour cap, as `readChartCap` reads it from the plot;
   * `null` before it is read, and a `null` cap warns about nothing.
   */
  cap?: number | null | undefined
  /** The measured plot, or `null` before the first measurement. */
  box: MeasuredBox | null
}

/** One vertex marker: a measured value on a spoke. A gap draws none. */
export interface RadarVertex {
  key: string
  /** The axis it sits on, which the Left/Right walk selects. */
  index: number
  /** Centre-relative, in px. */
  x: number
  y: number
  r: number
}

/** One series' polygon: its wash and stroke share the path, and its vertices sit on it. */
export interface RadarProfile {
  key: string
  /** The series' position among the visible series, which the Up/Down walk selects. */
  series: number
  /** A `var(--pm-chart-…)` reference, set as `--pm-chart-mark`. */
  paint: string
  d: string
  /** Every spoke's vertex, centre-relative, `null` for a gap. */
  points: MaybePoint[]
  vertices: RadarVertex[]
}

/** An axis label at a spoke's end, anchored away from the centre. */
export interface RadarLabel {
  key: string
  text: string
  /** Centre-relative, in px. */
  x: number
  y: number
  anchor: 'start' | 'middle' | 'end'
}

/** The plot at its measured size. Everything inside it is drawn relative to its centre. */
export interface RadarPlot {
  width: number
  height: number
  center: PlanePoint
  /** The translation that puts the drawing's origin at the centre. */
  transform: string
  /** The outer radius: half the plot's shorter side, as in DonutChart. */
  radius: number
  /** Each spoke's bearing, clockwise from 12 o'clock, in the axes' order. */
  angles: number[]
  /** The shared scale's maximum, which the outermost ring marks. */
  top: number
  /** The rings, then the spokes. */
  grid: { key: string; d: string }[]
  profiles: RadarProfile[]
  labels: RadarLabel[]
}

export interface RadarChartModel {
  state: ChartState
  /** The declared series with their colours, for the legend and the twin. */
  painted: ResolvedSeries[]
  /** The series not hidden, which the marks and the readout show. */
  visible: ResolvedSeries[]
  /** The visually hidden sentence that orients a reader. */
  summary: string
  /** One message per unlawful use, each naming the correct alternative. */
  warnings: string[]
  /** Whether the legend shows: two or more series. */
  legend: boolean
  twin: { columns: ChartTwinColumn[]; rows: string[][] }
  /**
   * Every vertex's position in the plot, series-major (`series × axes + axis`),
   * `null` for a gap: what the pointer's nearest scan reads. Empty before the
   * plot is measured.
   */
  positions: (PlanePoint | null)[]
  /** The marks, or `null` before the plot is measured or with nothing to draw. */
  plot: RadarPlot | null
}

/** The axis-count bounds for a readable polygon. */
const MIN_AXES = 3
const MAX_AXES = 6

/** About 4 concentric rings, matching the default y-tick count. */
const RING_COUNT = 4

/** The gap between a spoke's end and its axis label, and between a vertex and its readout. */
const LABEL_OFFSET_PX = 8

/** The closest the readout's centre may come to the plot's block edges, as in DonutChart. */
const READOUT_MARGIN_PX = 24

export function radarChartModel(input: RadarChartInput): RadarChartModel {
  const {
    axes,
    data,
    series,
    format,
    label,
    locale,
    messages = DEFAULT_CHART_MESSAGES,
    loading = false,
    selectable = false,
    hidden,
    cap = null,
    box,
  } = input
  const resolution = resolveSeries(series)
  const painted = resolution.series

  // Toggle-to-isolate: the legend's hidden series leave the marks, and the shared scale refits.
  const visible = painted.filter((entry) => !(hidden?.has(entry.key) ?? false))

  const warnings: string[] = []
  if (resolution.warnings.length > 0) warnings.push(resolution.warnings.join(' '))
  if (axes.length > 0 && axes.length < MIN_AXES) {
    warnings.push(
      `${axes.length} axes make a dumbbell, not a radar — two numbers read better side by side ` +
        '(a bar, a Stat pair). Drawing what was given.',
    )
  }
  if (axes.length > MAX_AXES) {
    warnings.push(
      `${axes.length} axes, and past ${MAX_AXES} the polygon stops being readable. ` +
        'Drawing what was given.',
    )
  }
  if (data.length > 0 && data.length !== axes.length) {
    warnings.push(
      `${data.length} rows against ${axes.length} axes — the member binds row i to axes[i], so ` +
        'the two lengths must agree. Extra rows are undrawn; missing rows are gaps.',
    )
  }
  if (cap !== null && series.length > cap) {
    warnings.push(
      `${series.length} series, and this palette's any-neighbour cap is ${cap} (--pm-chart-cap). ` +
        'A radar is an any-neighbour form — polygons cross anywhere — so it carries at most the ' +
        'slots that pass the all-pairs gates. Drawing what was given.',
    )
  }

  let plot: RadarPlot | null = null
  let positions: (PlanePoint | null)[] = []
  if (box !== null && box.width > 0 && box.height > 0 && axes.length > 0 && data.length > 0) {
    const center = { x: box.width / 2, y: box.height / 2 }
    const radius = Math.min(box.width, box.height) / 2
    const angles = polarAngles(axes.length)

    /*
     * The shared zero-based scale refits to the visible series, because
     * isolating a series is meant to change the view. With every series hidden
     * there is nothing to fit, so the scale keeps the full data's maximum.
     */
    const keys = (visible.length > 0 ? visible : painted).map((entry) => entry.key)
    let top = 0
    for (let index = 0; index < axes.length; index += 1) {
      const row = data[index]
      for (const key of keys) {
        const value = valueAt(row, key)
        if (value !== null && value > top) top = value
      }
    }
    const scale = radialScale(top, radius, RING_COUNT)

    /*
     * Rings are polygons through the spokes, not circles. A circle implies
     * values between axes, and the scale exists only on the spokes
     * (`polar.ts`). Ring radii sit at the scale's ticks, the outermost at the
     * domain maximum.
     */
    const rings = scale.ticks.filter((tick) => tick > 0).map((tick) => scale.at(tick))

    /** Centre-relative vertices per series per axis, `null` a gap. */
    const profiles = visible.map((entry, at): RadarProfile => {
      const points = angles.map((angle, index): MaybePoint => {
        const value = valueAt(data[index], entry.key)
        return value === null ? null : polarPoint(angle, scale.at(value))
      })
      const vertices: RadarVertex[] = []
      points.forEach((point, index) => {
        if (point !== null) {
          vertices.push({ key: String(index), index, x: point.x, y: point.y, r: MARKER_RADIUS })
        }
      })
      return {
        key: entry.key,
        series: at,
        paint: entry.paint,
        d: profilePath(points),
        points,
        vertices,
      }
    })

    /** Absolute positions, series-major, for the naive scan. */
    positions = profiles.flatMap((profile) =>
      profile.points.map((point) =>
        point === null ? null : { x: center.x + point.x, y: center.y + point.y },
      ),
    )

    /*
     * Axis labels sit outside the plot at each spoke's end. They extend past
     * the plot edge into the panel's padding.
     */
    const labels = angles.flatMap((angle, index): RadarLabel[] => {
      const axis = axes[index]
      if (axis === undefined) return []
      const end = polarPoint(angle, radius + LABEL_OFFSET_PX)
      const sideways = Math.abs(Math.sin(angle)) > 0.35
      const anchor = !sideways ? 'middle' : Math.sin(angle) > 0 ? 'start' : 'end'
      const below = Math.cos(angle) < -0.35
      const above = Math.cos(angle) > 0.35
      return [
        {
          key: axis.key,
          text: axis.label,
          x: end.x,
          y: end.y + (above ? -2 : below ? 10 : 4),
          anchor,
        },
      ]
    })

    plot = {
      width: box.width,
      height: box.height,
      center,
      transform: `translate(${center.x} ${center.y})`,
      radius,
      angles,
      top: scale.domain[1],
      grid: [
        ...rings.map((ring) => ({ key: `ring-${ring}`, d: ringPath(angles, ring) })),
        ...angles.map((angle, index) => {
          const end = polarPoint(angle, radius)
          return { key: `spoke-${index}`, d: rulePath([0, 0], [end.x, end.y]) }
        }),
      ],
      profiles,
      labels,
    }
  }

  return {
    state: chartState(data, loading),
    painted,
    visible,
    /* The domain maximum appears here and in the twin. The rings carry no
       figures, because the tier never labels every point. */
    summary: spokenSummary(
      messages.radarSummary({
        label,
        axes: axes.length,
        series: painted.length,
        max: plot === null ? '' : formatValue(plot.top, format, locale),
      }),
      messages,
      selectable,
    ),
    warnings,
    legend: legendFor(painted) !== null,
    twin: {
      columns: [
        { key: '__axis', label: '' },
        ...painted.map((entry) => ({ key: entry.key, label: entry.label, numeric: true })),
      ],
      rows: axes.map((axis, index) => [
        axis.label,
        ...painted.map((entry) => {
          const value = valueAt(data[index], entry.key)
          return value === null ? '' : formatValue(value, format, locale)
        }),
      ]),
    },
    positions,
    plot,
  }
}

/** The readout's position: just outside the read vertex, on the same bearing. */
function readoutAt(
  plot: RadarPlot,
  series: number,
  index: number,
): { x: number; y: number } | null {
  const point = plot.profiles[series]?.points[index]
  if (point === null || point === undefined) return null
  const angle = plot.angles[index] ?? 0
  const out = polarPoint(angle, Math.hypot(point.x, point.y) + LABEL_OFFSET_PX)
  return {
    x: plot.center.x + out.x,
    y: Math.min(
      plot.height - READOUT_MARGIN_PX,
      Math.max(READOUT_MARGIN_PX, plot.center.y + out.y),
    ),
  }
}

/**
 * What the chart shows at a reading position: the vertex's one row, the live
 * region's sentence ("axis: series, value") and the tooltip.
 *
 * The reading position is a vertex. `index` walks the axes around the polygon
 * and wraps, because clockwise past the last spoke is the first. `series`
 * switches polygons at the same axis. `tooltip: false` removes only the visual
 * layer: the announcement stays.
 */
export function radarChartReadout(
  input: RadarChartInput,
  model: RadarChartModel,
  view: ReadingView,
): ChartReadout {
  const { axes, data, format, locale, tooltip = {} } = input
  const messages = input.messages ?? DEFAULT_CHART_MESSAGES
  const walked = view.series ?? 0
  const entry = model.visible[walked]
  const axis = view.index === null ? undefined : axes[view.index]
  if (view.index === null || axis === undefined || entry === undefined) {
    return { rows: [], announcement: '', tooltip: null }
  }
  const value = valueAt(data[view.index], entry.key)
  const text = value === null ? messages.noData : formatValue(value, format, locale)
  const rows: ChartTooltipRow[] = [
    { key: entry.key, label: entry.label, value: text, paint: entry.paint },
  ]
  const at = model.plot === null ? null : readoutAt(model.plot, walked, view.index)
  return {
    rows,
    announcement: `${axis.label}: ${entry.label}, ${text}`,
    tooltip:
      tooltip === false || !view.active || at === null || model.plot === null
        ? null
        : {
            ...(tooltip.hideLabel ? {} : { header: axis.label }),
            rows,
            indicator: tooltip.indicator ?? 'dot',
            x: at.x,
            y: at.y,
            side: at.x > model.plot.width / 2 ? 'start' : 'end',
          },
  }
}

/**
 * What `onSelect` reports at a position: the axis key, the series key and the
 * value. `null` when nothing is read or the vertex is a gap.
 */
export function radarChartSelection(
  input: RadarChartInput,
  model: RadarChartModel,
  at: ReadingPosition,
): { axis: string; key: string; value: number } | null {
  if (at.index === null) return null
  const axis = input.axes[at.index]
  const entry = model.visible[at.series ?? 0]
  if (axis === undefined || entry === undefined) return null
  const value = valueAt(input.data[at.index], entry.key)
  if (value === null) return null
  return { axis: axis.key, key: entry.key, value }
}
