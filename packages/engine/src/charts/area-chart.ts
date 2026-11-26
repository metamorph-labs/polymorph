import type { AxisTick, ChartTooltipRow, ChartTwinColumn } from './anatomy'
import {
  annotationLayers,
  mapAnnotations,
  type AnnotationInk,
  type AnnotationWash,
} from './annotations'
import { cartesianGeometry, categoriesOf, summaryFor } from './cartesian'
import { formatValue } from './format'
import { crisp, rulePath } from './geometry'
import {
  crosshairAt,
  domainValuesOf,
  lineChartSelection,
  type CrosshairReadout,
  type RangeModel,
} from './line-chart'
import type { MeasuredBox } from './measured-box'
import { DEFAULT_RANGE_MESSAGES } from './messages'
import { linePath, type PathPoint } from './paths'
import type { ReadingPosition, ReadingView } from './reading'
import { announcement, twinColumns } from './readout'
import { inferScale } from './scales'
import {
  emphasised,
  emphasisWarning,
  legendFor,
  resolveSeries,
  stackSegments,
  valueAt,
  type ResolvedSeries,
  type StackSegment,
} from './series'
import {
  chartState,
  type ChartAnnotation,
  type ChartBaseline,
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
 * AreaChart's drawing (`design/components/area-chart.md`): everything the
 * member shows that follows from its props, the series the reader has hidden
 * and the measured plot, and what it shows at a reading position. Every
 * framework's AreaChart renders it, so the stack, the gap rule, the negative
 * rule and the readout's words are decided once.
 *
 * The top edge of each band is the series' line. The 2px stroke carries the
 * shape and the 10% wash shows which side of it the quantity is on, so a
 * stacked area reads as weighted lines instead of blocks of colour.
 *
 * The brush and the sync group work as LineChart's (`line-chart.ts`), on a
 * `time` x only: this member takes no `linear` x, and a band has no continuum.
 */

export type AreaVariant = 'stacked' | 'percent'

export interface AreaChartInput {
  data: readonly ChartDatum[]
  series: readonly ChartSeries[]
  x: ChartXAxis
  y?: ChartYAxis | undefined
  variant?: AreaVariant | undefined
  emphasis?: string | undefined
  baseline?: ChartBaseline | undefined
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
  /** Whether the member has an `onBrushEnd`: the brush is on over a time x. */
  brushable?: boolean | undefined
  /** The sync group the member asks to join. */
  syncId?: string | undefined
  /** The series the reader has hidden from the legend. */
  hidden?: ReadonlySet<string> | undefined
  /** The measured plot, or `null` before the first measurement. */
  box: MeasuredBox | null
}

/** One visible series' band. */
export interface AreaBand {
  key: string
  /** A `var(--pm-chart-…)` reference, set as `--pm-chart-mark` on the band's group. */
  paint: string
  /** The wash between the band's edge and the band below, broken at every gap. */
  fill: string
  /** The band's top edge: the series' line, the only edge a reader can follow. */
  edge: string
}

/** The plot at its measured size. */
export interface AreaPlot {
  width: number
  height: number
  /** The gridlines, at the value axis's ticks. */
  grid: { key: string; d: string }[]
  /** A reference band's wash, under the marks. */
  wash: AnnotationWash[]
  /** The annotation ink, in the baseline's slot before the bands. */
  ink: AnnotationInk | null
  /** Stacked bottom-up in declaration order, so the first band sits on the baseline. */
  bands: AreaBand[]
}

export interface AreaChartModel extends RangeModel {
  state: ChartState
  /** The declared series with their colours, for the legend and the twin. */
  painted: ResolvedSeries[]
  /** The series not hidden, which the stack and the readout show. */
  visible: ResolvedSeries[]
  /** Each row's x label. */
  categories: string[]
  /** The visible series' segments, per series per row: where each band runs at each x. */
  segments: StackSegment[][]
  /** Whether the brush is on: a `time` x and an `onBrushEnd`. */
  brushOn: boolean
  /** The group the member joins: `syncId` on a `time` x, else none. */
  syncGroup: string | undefined
  /** The visually hidden sentence that orients a reader. */
  summary: string
  /** One message per unlawful use, each naming what the caller probably wants. */
  warnings: string[]
  /** Whether the legend shows: two or more series. */
  legend: boolean
  twin: { columns: ChartTwinColumn[]; rows: string[][] }
  /**
   * The ticks of the two axes. `null` with no rows, because `loading` takes
   * precedence over `empty` and a first load with no data would otherwise show
   * an invented 0–1 scale. Loading *with* rows keeps its axes, as part of the
   * held frame.
   */
  axes: { y: AxisTick[]; x: AxisTick[] } | null
  /** The marks, or `null` before the plot is measured. */
  plot: AreaPlot | null
}

const PERCENT: ValueFormat = { style: 'percent' }

/** Whether any of the stacked columns carries a value below zero. */
function hasNegative(rows: readonly ChartDatum[], keys: readonly string[]): boolean {
  return rows.some((row) => keys.some((key) => (valueAt(row, key) ?? 0) < 0))
}

/** One row with its negative measurements replaced by `null`, which means absent. */
function withoutNegatives(row: ChartDatum, keys: readonly string[]): ChartDatum {
  const copy: Record<string, string | number | null> = { ...row }
  for (const key of keys) {
    const value = copy[key]
    if (typeof value === 'number' && value < 0) copy[key] = null
  }
  return copy
}

interface BandPoint {
  top: PathPoint
  floor: number
}

/**
 * A band between two edges.
 *
 * `areaPath`'s baseline is a single number. That suits a wash anchored at the
 * plot floor but not a stack, whose floor is the band below. This walks the
 * upper edge forward and the lower edge back, in runs, so a gap breaks the band
 * as well as its edge. An area that bridged a gap would fill in unmeasured
 * data, which is worse than a line doing so because a filled region reads as a
 * quantity.
 */
function bandPath(band: readonly (BandPoint | null)[]): string {
  const runs: BandPoint[][] = []
  let current: BandPoint[] | null = null

  for (const point of band) {
    if (point === null) {
      current = null
      continue
    }
    if (current === null) {
      current = []
      runs.push(current)
    }
    current.push(point)
  }

  return runs
    .filter((run) => run.length > 0)
    .map((run) => {
      const top = linePath(run.map((point) => point.top))
      if (top === '') return ''
      const back = run.map((point) => ({ x: point.top.x, y: point.floor })).reverse()
      return `${top}${linePath(back).replace(/^M/, 'L')}Z`
    })
    .join('')
}

/**
 * A cell's text, for the readout and the twin. In `percent` it shows the value
 * **and** the share, because the normalized number is never shown alone. `at`
 * is the series' position among the visible series, whose stack the share is
 * of. An absent value is `''`.
 */
function cellOf(
  input: Pick<AreaChartInput, 'data' | 'y' | 'locale' | 'variant'>,
  segments: readonly StackSegment[][],
  index: number,
  key: string,
  at: number,
): string {
  const raw = valueAt(input.data[index], key)
  if (raw === null) return ''
  const value = formatValue(raw, input.y?.format, input.locale)
  if (input.variant !== 'percent') return value
  // The share of the stack a band takes at one x.
  const segment = segments[at]?.[index]
  const share = segment === undefined ? 0 : segment.to - segment.from
  return `${value} · ${formatValue(share, PERCENT, input.locale)}`
}

export function areaChartModel(input: AreaChartInput): AreaChartModel {
  const {
    data,
    series,
    x,
    y,
    variant = 'stacked',
    emphasis,
    baseline,
    annotations,
    label,
    locale,
    messages = DEFAULT_RANGE_MESSAGES,
    loading = false,
    selectable = false,
    brushable = false,
    syncId,
    hidden,
    box,
  } = input

  const resolution = resolveSeries(series)
  const painted = emphasised(resolution.series, emphasis)
  const misnamed = emphasisWarning(series, emphasis)

  /*
   * Toggle-to-isolate: a hidden series leaves the stack and the bands above it
   * restack on the remaining total, because the stack is a sum. The chart
   * redraws instead of leaving a hole.
   */
  const visible = painted.filter((entry) => !(hidden?.has(entry.key) ?? false))

  const keys = visible.map((entry) => entry.key)
  const allKeys = painted.map((entry) => entry.key)
  const percent = variant === 'percent'
  const negative = hasNegative(data, allKeys)

  const kind = x.scale ?? inferScale(data, x.key)
  /*
   * The shared `continuous` check, narrowed for this member. The spec allows
   * only a **band or time** x ("this member takes no linear x"), so the brush
   * and the sync work on time only, as their warning texts say. A linear x
   * raises a dev warning below that names LineChart, and the chart still draws
   * it, as RadarChart does. LineChart accepts both time and linear.
   */
  const continuous = kind === 'time'
  const brushOn = brushable && continuous
  const syncOn = syncId !== undefined && continuous

  /*
   * Dev warnings, each naming what the caller probably wants. A stack of one
   * series is a line. An `auto` domain would measure a stack from somewhere
   * other than zero. A value below zero needs BarChart's diverging mode (the
   * Likert form). A target against a percent stack is a target against 100%. A
   * linear x belongs to LineChart. The brush and sync need a continuum, which a
   * band does not have.
   */
  const warnings: string[] = []
  if (resolution.warnings.length > 0) warnings.push(resolution.warnings.join(' '))
  if (misnamed !== undefined) warnings.push(misnamed)
  if (series.length === 1) {
    warnings.push(
      'AreaChart with one series is a LineChart with variant="area" — a stack of one is a line, and the member that draws it says so in its name.',
    )
  }
  if (y?.domain === 'auto') {
    warnings.push(
      'AreaChart ignores y.domain "auto" — a stack is measured from zero, so the domain is anchored there.',
    )
  }
  if (negative) {
    warnings.push(
      'A stack cannot honestly carry a value below zero — signed stacking is BarChart\'s mode: "diverging" (bar-chart.md). Negative values are absent from the bands and present in the table twin.',
    )
  }
  if (percent && baseline !== undefined) {
    warnings.push(
      'A baseline against a percent stack is meaningless — every x totals 100%. Not drawn.',
    )
  }
  if (kind === 'linear') {
    warnings.push(
      'AreaChart takes a band or time x axis; a "linear" x is the continuous-measure read, which is LineChart\'s own (line-chart.md). Drawing what was given.',
    )
  }
  if (brushable && kind === 'band') {
    warnings.push(
      'onBrushEnd needs a time x here — a band has no continuum to select a range of. No brush.',
    )
  }
  if (syncId !== undefined && kind === 'band') {
    warnings.push(
      'syncId needs a time x here — the broadcast is an x-domain value, and a band has none. Not synced.',
    )
  }

  /*
   * The rows the stack is built from. A negative value is **removed**, not
   * clamped or accumulated. A band runs upward from the total beneath it, so a
   * negative band would run *down* through the band below and paint a quantity
   * that is not there. The value is absent from the bands but present in the
   * twin, which reads the raw rows, so no data is silently dropped. The warning
   * above says where it went.
   */
  const stackable = negative ? data.map((row) => withoutNegatives(row, allKeys)) : data
  const segments = stackSegments(stackable, keys, percent ? 'percent' : 'stacked')

  /*
   * The axis must reach the running total, not the largest single band. In
   * `percent` it reaches 1, because that is what `stackOffsetExpand` produces.
   * With every series hidden there is no stack, so the axis keeps the *full*
   * stack's total, because the data still exists.
   */
  const tops = percent
    ? [0, 1]
    : (keys.length > 0 ? segments : stackSegments(stackable, allKeys, 'stacked'))
        .flat()
        .map((segment) => segment.to)

  const geometry = cartesianGeometry({
    data,
    x,
    kind,
    y: percent ? { ...y, format: y?.format ?? PERCENT } : y,
    series: visible,
    locale,
    messages,
    plot: box,
    domainMode: 'zero',
    valueOverride: tops,
  })

  const categories = categoriesOf(data, x, kind, locale, messages, geometry?.categoryStep ?? 0)
  const positions = geometry?.positions ?? []

  let plot: AreaPlot | null = null
  if (geometry !== null && box !== null) {
    // The baseline means nothing against percent and is not drawn. Annotations
    // are still allowed; their values are in this member's domain, which in
    // percent is ratios (as the spec states).
    const target = percent ? undefined : baseline
    const mapped =
      data.length === 0 ||
      (target === undefined && (annotations === undefined || annotations.length === 0))
        ? null
        : mapAnnotations({
            annotations,
            baseline: target,
            valueAt: (value) => geometry.value.at(value),
            categoryAt: geometry.categoryAt,
            vertical: true,
          })
    const layers = mapped === null ? null : annotationLayers(mapped, 'y', box.width, box.height)

    const bands = visible.map((entry, at): AreaBand => {
      const layer = segments[at] ?? []
      const band = data.map((_, index): BandPoint | null => {
        const segment = layer[index]
        const position = positions[index]
        // A row with no x position breaks the band, as a row with no value
        // does. It is never placed at x=0.
        if (
          segment === undefined ||
          !segment.present ||
          position === null ||
          position === undefined
        ) {
          return null
        }
        return {
          top: { x: position, y: geometry.value.at(segment.to) },
          floor: geometry.value.at(segment.from),
        }
      })
      return {
        key: entry.key,
        paint: entry.paint,
        fill: bandPath(band),
        edge: linePath(band.map((point) => point?.top ?? null)),
      }
    })

    plot = {
      width: box.width,
      height: box.height,
      grid: geometry.valueTicks.map((tick) => ({
        key: tick.key,
        d: rulePath([0, crisp(tick.at)], [box.width, crisp(tick.at)]),
      })),
      wash: layers?.wash ?? [],
      ink: layers?.ink ?? null,
      bands,
    }
  }

  /*
   * The twin reads the raw, unfiltered rows: every declared series, hidden or
   * not, because the twin never hides data. A share only means something
   * within the *visible* stack, so in `percent` a hidden series' cells show the
   * value without a share.
   */
  const twinRows = data.map((_, index) => [
    categories[index] ?? '',
    ...painted.map((entry) => {
      const raw = valueAt(data[index], entry.key)
      if (raw === null) return ''
      const at = visible.findIndex((candidate) => candidate.key === entry.key)
      if (percent && at !== -1) return cellOf(input, segments, index, entry.key, at)
      return formatValue(raw, y?.format, locale)
    }),
  ])

  return {
    state: chartState(data, loading),
    kind,
    painted,
    visible,
    categories,
    segments,
    brushOn,
    syncGroup: syncOn ? syncId : undefined,
    domainValues: domainValuesOf(data, x.key, kind, continuous),
    summary: summaryFor(messages, label, painted, data.length, selectable, { measure: y?.label }),
    warnings,
    legend: legendFor(painted) !== null,
    twin: { columns: twinColumns(x, painted), rows: twinRows },
    axes:
      geometry === null || data.length === 0
        ? null
        : { y: geometry.valueTicks, x: geometry.categoryTicks },
    positions,
    plot,
  }
}

/**
 * What the chart shows at a reading position: the tooltip's rows, the live
 * region's sentence, the tooltip itself and the crosshair, the only
 * active-state feedback. Bands never dim, because a fading wash would change
 * the picture the reader is comparing against.
 *
 * Every visible series is read at the position, in `percent` with its value
 * and its share. `tooltip: false` removes only the visual layer.
 */
export function areaChartReadout(
  input: AreaChartInput,
  model: AreaChartModel,
  view: ReadingView,
): CrosshairReadout {
  const { tooltip = {}, box } = input
  const messages = input.messages ?? DEFAULT_RANGE_MESSAGES
  const index = view.index
  if (index === null) return { rows: [], announcement: '', tooltip: null, crosshair: null }
  const rows = model.visible.map((entry, at): ChartTooltipRow => {
    const cell = cellOf(input, model.segments, index, entry.key, at)
    return {
      key: entry.key,
      label: entry.label,
      value: cell === '' ? messages.noData : cell,
      paint: entry.paint,
    }
  })
  const category = model.categories[index] ?? ''
  const drawn = model.plot === null || box === null ? null : crosshairAt(model, index, box)
  return {
    rows,
    announcement: announcement(category, rows),
    tooltip:
      tooltip === false || !view.active || drawn === null || rows.length === 0
        ? null
        : {
            ...(tooltip.hideLabel ? {} : { header: category }),
            rows,
            indicator: tooltip.indicator ?? 'dot',
            x: drawn.x,
            y: drawn.y,
            side: drawn.side,
          },
    crosshair: view.active && drawn !== null ? drawn.crosshair : null,
  }
}

/** What `onSelect` reports at a position: the row and its index, as LineChart's. */
export function areaChartSelection(
  input: Pick<AreaChartInput, 'data'>,
  model: AreaChartModel,
  at: ReadingPosition,
): { index: number; datum: ChartDatum } | null {
  return lineChartSelection(input, model, at)
}
