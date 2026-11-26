import type { AxisTick, ChartReadout, ChartTooltipRow, ChartTwinColumn } from './anatomy'
import {
  annotationLayers,
  mapAnnotations,
  type AnnotationInk,
  type AnnotationWash,
} from './annotations'
import { anchorAtEnds, LABEL_GAP_PX, MARKER_RADIUS, summaryFor } from './cartesian'
import { formatValue, granularityFor, parseIso } from './format'
import { crisp, rulePath, type PlanePoint } from './geometry'
import type { MeasuredBox } from './measured-box'
import { DEFAULT_CHART_MESSAGES } from './messages'
import type { ReadingPosition, ReadingView } from './reading'
import { categoryLabels, twinColumns, twinRows } from './readout'
import {
  continuousScale,
  DEFAULT_VALUE_TICKS,
  sqrtRadiusScale,
  timeDomain,
  valueDomain,
  valueExtent,
  type ContinuousScale,
} from './scales'
import { legendFor, resolveSeries, valueAt, type ResolvedSeries } from './series'
import {
  chartState,
  type ChartAnnotation,
  type ChartDatum,
  type ChartMessages,
  type ChartSeries,
  type ChartState,
  type ChartTooltipConfig,
  type ChartXAxis,
  type ChartYAxis,
  type ValueFormat,
} from './types'

/**
 * ScatterChart's drawing (`design/components/scatter-chart.md`): everything the
 * member shows that follows from its props, the series the reader has hidden,
 * the palette's cap and the measured plot, and what it shows at a reading
 * position. Every framework's ScatterChart renders it, so the marks' places,
 * the bubble radii, the cap warning and the readout's words are decided once.
 *
 * It is the tier's first **any-neighbour form**: any two marks can land beside
 * each other, so the series limit is the palette's all-pairs cap
 * (`--pm-chart-cap`), not the wheel's eight hue anchors.
 */

/** Bubble mode: mark area encodes `datum[key]` through a sqrt radius scale. */
export interface ScatterBubble {
  key: string
  /** The tooltip and twin column name. It is never derived from the key. */
  label?: string
  format?: ValueFormat
}

export interface ScatterChartInput {
  data: readonly ChartDatum[]
  series: readonly ChartSeries[]
  /** `linear` or `time`; an omitted `scale` is `linear` here, and `band` warns and renders linear. */
  x: ChartXAxis
  y?: ChartYAxis | undefined
  bubble?: ScatterBubble | undefined
  annotations?: readonly ChartAnnotation[] | undefined
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
   * The palette's any-neighbour cap, read from the plot (`readChartCap`), or
   * `null` where no theme is installed or nothing has been read yet. A `null`
   * cap warns about nothing.
   */
  cap?: number | null | undefined
  /** The measured plot, or `null` before the first measurement. */
  box: MeasuredBox | null
}

/** One observation's mark. */
export interface ScatterDot {
  /** The row's index: the mark's key and its entrance stagger index (`--pm-chart-dot`). */
  index: number
  cx: number
  cy: number
  r: number
}

/** One visible series' marks, in one group that carries its paint. */
export interface ScatterGroup {
  key: string
  /** The series' position among the visible series, which the Up/Down walk selects. */
  series: number
  /** A `var(--pm-chart-…)` reference, set as `--pm-chart-mark`. */
  paint: string
  dots: ScatterDot[]
}

/** The plot at its measured size. */
export interface ScatterPlot {
  width: number
  height: number
  /** The gridlines on both axes, the y axis's first, because both are value axes. */
  grid: { key: string; d: string }[]
  /** A zero rule per axis whose domain holds zero, the y axis's first. */
  zero: { key: string; d: string }[]
  /** A reference band's wash, under the marks. */
  wash: AnnotationWash[]
  groups: ScatterGroup[]
  /** The annotation ink, over the marks. */
  ink: AnnotationInk | null
}

export interface ScatterChartModel {
  state: ChartState
  /** The declared series with their colours, for the legend and the twin. */
  painted: ResolvedSeries[]
  /** The series not hidden, which the marks and the readout show. */
  visible: ResolvedSeries[]
  /** Each row's x label, in the x axis's display format. */
  categories: string[]
  /** The visually hidden sentence that orients a reader. */
  summary: string
  /** One message per unlawful use, each naming the correct alternative. */
  warnings: string[]
  /** Whether the legend shows: two or more series. */
  legend: boolean
  /** The x column, one per series, and the bubble column in bubble mode. */
  twin: { columns: ChartTwinColumn[]; rows: string[][] }
  /**
   * The ticks of the two axes, `null` before the plot is measured and with no
   * rows: an axis over an empty plot shows a range that was never measured.
   */
  axes: { y: AxisTick[]; x: AxisTick[] } | null
  /**
   * One point per visible series per row, flattened series-major, `null` where
   * no mark draws. The pointer's nearest-point scan reads it, and
   * `series * data.length + row` recovers the indices.
   */
  points: (PlanePoint | null)[]
  /** The marks, or `null` before the plot is measured. */
  plot: ScatterPlot | null
}

/**
 * The bubble radius bounds, from the mark spec. The minimum is 8px across, the
 * marker size, because a smaller bubble stops reading as a mark. The maximum is
 * 24px across, `HIT_TARGET_MIN`, so the largest mark is its own hit target.
 */
const BUBBLE_RADIUS_MIN = 4
const BUBBLE_RADIUS_MAX = 12

/**
 * The value a row places on the x axis, in the scale's domain: the number on
 * a linear x, the instant on a time x. `null` where the axis cannot place the
 * row.
 */
function xValueOf(
  row: ChartDatum | undefined,
  key: string,
  kind: 'time' | 'linear',
): number | null {
  const raw = row?.[key]
  if (kind === 'linear') return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
  const parsed = typeof raw === 'string' ? parseIso(raw) : null
  return parsed === null ? null : parsed.getTime()
}

/**
 * Whether the plot draws a series' point at a row: the x axis places the row,
 * and the series' value and, with `bubble`, the size are present. A `null` in
 * any of the three draws no mark (`scatter-chart.md`).
 */
function drawsPoint(input: ScatterChartInput, row: ChartDatum | undefined, key: string): boolean {
  const { x, bubble } = input
  const kind = x.scale === 'time' ? 'time' : 'linear'
  return (
    xValueOf(row, x.key, kind) !== null &&
    valueAt(row, key) !== null &&
    (bubble === undefined || valueAt(row, bubble.key) !== null)
  )
}

/** The two scales over the measured plot, and what follows from them. */
interface PlaneGeometry {
  xScale: ContinuousScale
  yScale: ContinuousScale
  points: (PlanePoint | null)[]
  radiusOf: ((value: number) => number) | null
  xDisplayFormat: ValueFormat | undefined
  hasZeroX: boolean
  hasZeroY: boolean
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

function planeGeometry(
  input: ScatterChartInput,
  kind: 'time' | 'linear',
  visible: readonly ResolvedSeries[],
  painted: readonly ResolvedSeries[],
  messages: ChartMessages,
): PlaneGeometry | null {
  const { data, x, y, bubble, locale, box } = input
  if (box === null || box.width <= 0 || box.height <= 0 || data.length === 0) return null

  /*
   * Both axes are value axes. x always fits its data (`auto`), because zero
   * anchoring exists for bar lengths and nothing here is measured by length.
   * y refits when series are hidden. With every series hidden, the axes keep
   * the full data's domain.
   */
  const xExtent =
    kind === 'time'
      ? timeDomain(data, x.key)
      : valueDomain(
          data
            .map((row) => row[x.key])
            .filter((entry): entry is number => typeof entry === 'number'),
          'auto',
        )
  const xScale = continuousScale(kind, xExtent, [0, box.width], x.ticks ?? DEFAULT_VALUE_TICKS)

  const yKeys = (visible.length > 0 ? visible : painted).map((entry) => entry.key)
  const yValues: number[] = []
  for (const row of data) {
    for (const key of yKeys) {
      const value = valueAt(row, key)
      if (value !== null) yValues.push(value)
    }
  }
  const yScale = continuousScale(
    'linear',
    valueDomain(yValues, y?.domain ?? 'auto'),
    [box.height, 0],
    y?.ticks ?? DEFAULT_VALUE_TICKS,
  )

  /*
   * The bubble scale over the size column's extent. `null` means no bubble
   * mode. A `null` bubble value hides its mark, as a `null` x or y does.
   */
  const radiusOf =
    bubble === undefined
      ? null
      : sqrtRadiusScale(valueExtent(data, bubble.key), [BUBBLE_RADIUS_MIN, BUBBLE_RADIUS_MAX])

  /*
   * One point per series per row, flattened series-major, `null` where
   * `drawsPoint` says the plot draws none. The linear scan reads this
   * directly, and `series * data.length + row` recovers the indices.
   */
  const points: (PlanePoint | null)[] = []
  for (const entry of visible) {
    for (const row of data) {
      const atX = xValueOf(row, x.key, kind)
      const value = valueAt(row, entry.key)
      points.push(
        atX === null || value === null || !drawsPoint(input, row, entry.key)
          ? null
          : { x: xScale.at(atX), y: yScale.at(value) },
      )
    }
  }

  const format: ValueFormat | undefined =
    kind === 'time'
      ? { style: 'date', granularity: x.format?.granularity ?? granularityFor(xScale.step) }
      : x.format

  return {
    xScale,
    yScale,
    points,
    radiusOf,
    xDisplayFormat: format,
    hasZeroX: xScale.domain[0] <= 0 && xScale.domain[1] >= 0,
    hasZeroY: yScale.domain[0] <= 0 && yScale.domain[1] >= 0,
    xTicks: anchorAtEnds(
      xScale.ticks.map((tick) => ({
        key: String(tick),
        at: xScale.at(tick),
        label:
          kind === 'time'
            ? formatValue(new Date(tick).toISOString(), format, locale, messages)
            : formatValue(tick, format, locale),
      })),
      box.width,
      LABEL_GAP_PX,
      true,
    ),
    yTicks: yScale.ticks.map((tick) => ({
      key: String(tick),
      at: yScale.at(tick),
      label: formatValue(tick, y?.format, locale),
    })),
  }
}

export function scatterChartModel(input: ScatterChartInput): ScatterChartModel {
  const {
    data,
    series,
    x,
    y,
    bubble,
    annotations,
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

  // Toggle-to-isolate: the legend's hidden series leave the marks, and the domains refit.
  const visible = painted.filter((entry) => !(hidden?.has(entry.key) ?? false))

  /*
   * Dev warnings, each naming the correct alternative. A band x belongs to
   * BarChart. Past the palette's cap the plot still draws every series: the
   * warning does not hide data.
   */
  const warnings: string[] = []
  if (resolution.warnings.length > 0) warnings.push(resolution.warnings.join(' '))
  if (x.scale === 'band') {
    warnings.push(
      'ScatterChart takes a linear or time x — a band compares named things, which is BarChart. ' +
        'Rendering linear.',
    )
  }
  if (cap !== null && series.length > cap) {
    warnings.push(
      `${series.length} series, and this palette's any-neighbour cap is ${cap} (--pm-chart-cap). ` +
        'A scatter is an any-neighbour form — any two marks can land beside each other — so it ' +
        'carries at most the slots that pass the all-pairs gates. Drawing what was ' +
        'given; fold or split what is past the cap.',
    )
  }

  const kind: 'time' | 'linear' = x.scale === 'time' ? 'time' : 'linear'
  const geometry = planeGeometry(input, kind, visible, painted, messages)
  const categories = categoryLabels(data, x, locale, messages, geometry?.xDisplayFormat)
  const bubbleLabel = bubble === undefined ? '' : (bubble.label ?? bubble.key)

  let plot: ScatterPlot | null = null
  if (geometry !== null && box !== null) {
    const { xScale, yScale } = geometry
    const mapped =
      annotations === undefined || annotations.length === 0
        ? null
        : mapAnnotations({
            annotations,
            baseline: undefined,
            valueAt: (value) => yScale.at(value),
            categoryAt: (value) => {
              if (kind === 'linear') {
                return typeof value === 'number' && Number.isFinite(value) ? xScale.at(value) : null
              }
              const parsed = typeof value === 'string' ? parseIso(value) : null
              return parsed === null ? null : xScale.at(parsed.getTime())
            },
            vertical: true,
          })
    const layers = mapped === null ? null : annotationLayers(mapped, 'y', box.width, box.height)

    // A zero rule per axis, only when zero is inside that axis's domain. With `auto` domains a plot may have none.
    const zero: { key: string; d: string }[] = []
    if (geometry.hasZeroY) {
      const at = crisp(yScale.at(0))
      zero.push({ key: 'y', d: rulePath([0, at], [box.width, at]) })
    }
    if (geometry.hasZeroX) {
      const at = crisp(xScale.at(0))
      zero.push({ key: 'x', d: rulePath([at, 0], [at, box.height]) })
    }

    plot = {
      width: box.width,
      height: box.height,
      // Gridlines on both axes, because both are value axes and gridlines belong only on value axes.
      grid: [
        ...geometry.yTicks.map((tick) => ({
          key: `y-${tick.key}`,
          d: rulePath([0, crisp(tick.at)], [box.width, crisp(tick.at)]),
        })),
        ...geometry.xTicks.map((tick) => ({
          key: `x-${tick.key}`,
          d: rulePath([crisp(tick.at), 0], [crisp(tick.at), box.height]),
        })),
      ],
      zero,
      wash: layers?.wash ?? [],
      groups: visible.map((entry, seriesIndex) => ({
        key: entry.key,
        series: seriesIndex,
        paint: entry.paint,
        dots: data.flatMap((row, index): ScatterDot[] => {
          const point = geometry.points[seriesIndex * data.length + index]
          if (point === null || point === undefined) return []
          const r =
            geometry.radiusOf === null
              ? MARKER_RADIUS
              : geometry.radiusOf(valueAt(row, bubble?.key ?? '') ?? 0)
          return [{ index, cx: point.x, cy: point.y, r }]
        }),
      })),
      ink: layers?.ink ?? null,
    }
  }

  return {
    state: chartState(data, loading),
    painted,
    visible,
    categories,
    summary: summaryFor(messages, label, painted, data.length, selectable, {
      measure: y?.label,
      xMeasure: x.label,
    }),
    warnings,
    legend: legendFor(painted) !== null,
    twin: {
      columns: [
        ...twinColumns(x, painted),
        ...(bubble === undefined
          ? []
          : [{ key: `__${bubble.key}`, label: bubbleLabel, numeric: true }]),
      ],
      rows: twinRows(data, categories, painted, y?.format, locale).map((row, index) =>
        bubble === undefined
          ? row
          : [...row, formatValue(valueAt(data[index], bubble.key), bubble.format, locale)],
      ),
    },
    axes: geometry === null ? null : { y: geometry.yTicks, x: geometry.xTicks },
    points: geometry?.points ?? [],
    plot,
  }
}

/**
 * What the chart shows at a reading position: the read mark's tooltip rows
 * (its y value, then its bubble value), the live region's sentence and the
 * tooltip itself.
 *
 * The reading position is a mark: `index` is the row and `series` the visible
 * series, at `0` before Up/Down moves it, because a mark always belongs to a
 * series. The sentence is "x, y (, bubble): series". The tooltip sits at the
 * mark, and opens inward past the plot's middle. A mark that does not draw (a
 * gap) is still announced, with the catalog's no-data text, and shows no
 * tooltip, because there is nothing to point it at. `tooltip: false` removes
 * only the visual layer: the announcement stays.
 */
export function scatterChartReadout(
  input: ScatterChartInput,
  model: ScatterChartModel,
  view: ReadingView,
): ChartReadout {
  const { data, y, bubble, locale, tooltip = {}, box } = input
  const messages = input.messages ?? DEFAULT_CHART_MESSAGES
  const series = view.series ?? 0
  const entry = model.visible[series]
  const row = view.index === null ? undefined : data[view.index]
  if (view.index === null || row === undefined || entry === undefined) {
    return { rows: [], announcement: '', tooltip: null }
  }

  const xText = model.categories[view.index] ?? ''
  const value = valueAt(row, entry.key)
  // A gap is reported as no data, as in every other member's readout.
  const yText = value === null ? messages.noData : formatValue(value, y?.format, locale)
  const bubbleText =
    bubble === undefined ? '' : formatValue(valueAt(row, bubble.key), bubble.format, locale)

  const rows: ChartTooltipRow[] = [
    { key: entry.key, label: entry.label, value: yText, paint: entry.paint },
    ...(bubble !== undefined && bubbleText !== ''
      ? [
          {
            key: `${entry.key}-bubble`,
            label: bubble.label ?? bubble.key,
            value: bubbleText,
            paint: entry.paint,
          },
        ]
      : []),
  ]

  /** The read mark's position, where the readout is placed. */
  const point = model.points[series * data.length + view.index] ?? null

  return {
    rows,
    announcement: `${xText}, ${yText}${bubbleText === '' ? '' : `, ${bubbleText}`}: ${entry.label}`,
    tooltip:
      tooltip === false || !view.active || point === null || box === null || model.plot === null
        ? null
        : {
            ...(tooltip.hideLabel ? {} : { header: xText }),
            rows,
            indicator: tooltip.indicator ?? 'dot',
            x: point.x,
            y: point.y,
            side: point.x > box.width / 2 ? 'start' : 'end',
          },
  }
}

/**
 * What `onSelect` reports at a position: the row index, the series key and
 * the row. The series is the walked one, the first visible series before
 * Up/Down moves it. `null` when nothing is read, and where the plot draws no
 * point (a `null` x, y or bubble value): the keys reach that position and the
 * live region says it has no data, and a press there reports nothing, as at a
 * heatmap's absent cell.
 */
export function scatterChartSelection(
  input: ScatterChartInput,
  model: ScatterChartModel,
  at: ReadingPosition,
): { index: number; key: string; datum: ChartDatum } | null {
  if (at.index === null) return null
  const datum = input.data[at.index]
  const entry = model.visible[at.series ?? 0]
  if (datum === undefined || entry === undefined) return null
  if (!drawsPoint(input, datum, entry.key)) return null
  return { index: at.index, key: entry.key, datum }
}
