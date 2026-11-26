import type { AxisTick, ChartReadout, ChartTwinColumn } from './anatomy'
import {
  annotationLayers,
  mapAnnotations,
  type AnnotationInk,
  type AnnotationWash,
} from './annotations'
import type { BrushState } from './brush'
import {
  cartesianGeometry,
  categoriesOf,
  endLabelsFor,
  MARKER_RADIUS,
  summaryFor,
} from './cartesian'
import { parseIso } from './format'
import { crisp, nearestIndex, rulePath } from './geometry'
import type { MeasuredBox } from './measured-box'
import { DEFAULT_RANGE_MESSAGES } from './messages'
import { areaPath, linePath, type MaybePoint } from './paths'
import type { ReadingPosition, ReadingView } from './reading'
import { announcement, readingRows, twinColumns, twinRows } from './readout'
import { inferScale, seriesValues } from './scales'
import {
  emphasised,
  emphasisWarning,
  legendFor,
  resolveSeries,
  valueAt,
  type ResolvedSeries,
} from './series'
import {
  chartState,
  type ChartAnnotation,
  type ChartBaseline,
  type ChartDatum,
  type ChartMessages,
  type ChartScaleKind,
  type ChartSeries,
  type ChartState,
  type ChartTooltipConfig,
  type ChartXAxis,
  type ChartYAxis,
} from './types'

/**
 * LineChart's drawing (`design/components/line-chart.md`): everything the
 * member shows that follows from its props, the series the reader has hidden
 * and the measured plot, and what it shows at a reading position. Every
 * framework's LineChart renders it, so the strokes, the gap rule, the end
 * labels and the readout's words are decided once.
 *
 * Two rules matter most. `null` is a **gap**: the line breaks and never dips to
 * zero, because a missing measurement is not a measurement of zero. The reading
 * position is a **crosshair**, not a hover target: the pointer aims at a date,
 * one readout lists every series at that date, and the arrow keys walk the same
 * positions, so every value is reachable by keyboard as well as by pointer.
 *
 * The module also holds what LineChart and AreaChart share about a range on a
 * continuous x: each row's x-domain value, which the `syncId` broadcast sends,
 * the brush's span on the plot, and the committed pair `onBrushEnd` reports.
 */

export type LineVariant = 'line' | 'area'
export type LineCurve = 'monotone' | 'step'

export interface LineChartInput {
  data: readonly ChartDatum[]
  series: readonly ChartSeries[]
  x: ChartXAxis
  y?: ChartYAxis | undefined
  variant?: LineVariant | undefined
  markers?: boolean | undefined
  curve?: LineCurve | undefined
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
  /** Whether the member has an `onBrushEnd`: the brush is on over a continuous x. */
  brushable?: boolean | undefined
  /** The sync group the member asks to join. */
  syncId?: string | undefined
  /** The series the reader has hidden from the legend. */
  hidden?: ReadonlySet<string> | undefined
  /** The measured plot, or `null` before the first measurement. */
  box: MeasuredBox | null
}

/** A point dot, where the series has a value and the row has an x position. */
export interface LineMarker {
  key: string
  /** The row's index, which the reading position's `data-active` compares against. */
  index: number
  cx: number
  cy: number
  r: number
}

/** One visible series: its stroke, its wash in the area variant, and its markers. */
export interface LineStroke {
  key: string
  /** A `var(--pm-chart-…)` reference, set as `--pm-chart-mark` on the series' group. */
  paint: string
  /** The area variant's wash, closed to the domain floor; `null` in the line variant. */
  wash: string | null
  /** The stroke, broken at every gap. */
  line: string
  /** The point dots, empty unless `markers` is set. */
  markers: LineMarker[]
}

/** An endpoint value, end-aligned at the plot's inline end. */
export interface LineEndLabel {
  key: string
  x: number
  y: number
  text: string
}

/** The plot at its measured size. */
export interface LinePlot {
  width: number
  height: number
  /** The gridlines, at the value axis's ticks. */
  grid: { key: string; d: string }[]
  /** The zero rule, or `null` when zero is outside the domain. */
  zeroRule: string | null
  /** A reference band's wash, under the marks. */
  wash: AnnotationWash[]
  /** The annotation ink, in the reference-line slot before the strokes. */
  ink: AnnotationInk | null
  strokes: LineStroke[]
  /** The endpoint values; empty when two would collide. */
  endLabels: LineEndLabel[]
}

/** What the brush and the sync group read of a LineChart's or an AreaChart's model. */
export interface RangeModel {
  /** The x axis's scale kind, after inference. */
  kind: ChartScaleKind
  /** Each row's x-domain value: epoch milliseconds on a time x, the number on a linear x. */
  domainValues: (number | null)[]
  /** Each row's position along x, in px. */
  positions: (number | null)[]
  plot: { height: number } | null
}

export interface LineChartModel extends RangeModel {
  state: ChartState
  /** The declared series with their colours, for the legend and the twin. */
  painted: ResolvedSeries[]
  /** The series not hidden, which the marks and the readout show. */
  visible: ResolvedSeries[]
  /** Each row's x label. */
  categories: string[]
  /** Whether the brush is on: a `time` or `linear` x and an `onBrushEnd`. */
  brushOn: boolean
  /** The group the member joins: `syncId` on a `time` or `linear` x, else none. */
  syncGroup: string | undefined
  /** The visually hidden sentence that orients a reader. */
  summary: string
  /** One message per unlawful use, each naming the correct alternative. */
  warnings: string[]
  /** Whether the legend shows: two or more series. */
  legend: boolean
  twin: { columns: ChartTwinColumn[]; rows: string[][] }
  /**
   * The ticks of the two axes. `null` with no rows: with no data there is no
   * scale, and an axis over an empty plot shows a range that was never
   * measured. The check is on the rows, not on the empty state, because
   * `loading` takes precedence over `empty` and a first load with no data
   * would otherwise show an invented 0–1 scale. Loading *with* rows keeps its
   * axes, as part of the held frame.
   */
  axes: { y: AxisTick[]; x: AxisTick[] } | null
  /** The marks, or `null` before the plot is measured. */
  plot: LinePlot | null
}

/** What a LineChart or an AreaChart shows at a reading position: the readout and its crosshair. */
export interface CrosshairReadout extends ChartReadout {
  /**
   * The crosshair, a hairline at the reading position's x, or `null` when
   * nothing is read. It snaps to the nearest x *position*, because the pointer
   * aims at a date, not at a 2px line.
   */
  crosshair: string | null
}

/** A brushed range's two ends along x, in px, over the plot's height. */
export interface BrushSpan {
  from: number
  to: number
  height: number
}

/**
 * Each row's x-domain value, which the `syncId` broadcast sends and the brush
 * sorts its pair by. A row an axis cannot place has none. A band x has none at
 * all.
 */
export function domainValuesOf(
  data: readonly ChartDatum[],
  key: string,
  kind: ChartScaleKind,
  continuous: boolean,
): (number | null)[] {
  if (!continuous) return data.map(() => null)
  return data.map((row) => {
    const raw = row[key]
    if (kind === 'linear') return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
    // The scale's own parse: a date-only string is a calendar date at local
    // midnight. Any other parse could put the broadcast a day off.
    const parsed = typeof raw === 'string' ? parseIso(raw) : null
    return parsed === null ? null : parsed.getTime()
  })
}

/**
 * What a reading at `index` sends to the `syncId` group: the row's x-domain
 * value, or `null` when nothing is read, which clears the group. `undefined`
 * sends nothing: a row with no x position has no value to share, and sending
 * `null` for it would clear the group.
 */
export function syncValueAt(model: RangeModel, index: number | null): number | null | undefined {
  if (index === null) return null
  return model.domainValues[index] ?? undefined
}

/**
 * Where a value received from the `syncId` group puts the reading: the row
 * nearest to it along x, through this chart's own rows, so a daily and a
 * weekly chart share a reading. `null` for a `null` value, which clears the
 * reading. `undefined` leaves the reading where it is, because no row has an x
 * position.
 */
export function syncIndexOf(model: RangeModel, value: number | null): number | null | undefined {
  if (value === null) return null
  const at = nearestIndex(model.domainValues, value)
  return at === -1 ? undefined : at
}

export function lineChartModel(input: LineChartInput): LineChartModel {
  const {
    data,
    series,
    x,
    y,
    variant = 'line',
    markers = false,
    curve = 'monotone',
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
   * Toggle-to-isolate: the legend's hidden series leave the marks, and the
   * domains refit to the remaining series. Hiding removes a series and
   * `emphasis` greys the rest; the two combine because removal is by key.
   */
  const visible = painted.filter((entry) => !(hidden?.has(entry.key) ?? false))

  const kind = x.scale ?? inferScale(data, x.key)
  const continuous = kind === 'time' || kind === 'linear'
  const brushOn = brushable && continuous
  const syncOn = syncId !== undefined && continuous

  const warnings: string[] = []
  if (resolution.warnings.length > 0) warnings.push(resolution.warnings.join(' '))
  if (misnamed !== undefined) warnings.push(misnamed)
  if (brushable && !continuous) {
    warnings.push(
      'onBrushEnd needs a time or linear x — a band has no continuum to select a range of. No brush.',
    )
  }
  if (syncId !== undefined && !continuous) {
    warnings.push(
      'syncId needs a time or linear x — the broadcast is an x-domain value, and a band has none. Not synced.',
    )
  }

  const geometry = cartesianGeometry({
    data,
    x,
    kind,
    y,
    series: visible,
    locale,
    messages,
    plot: box,
    domainMode: y?.domain ?? 'auto',
    /*
     * With every series hidden there is nothing to fit, and a domain over no
     * values would be an invented 0–1 axis. The axes keep the full data's
     * domain instead, because the data still exists.
     */
    ...(visible.length === 0
      ? {
          valueOverride: seriesValues(
            data,
            painted.map((entry) => entry.key),
          ),
        }
      : {}),
  })

  const categories = categoriesOf(data, x, kind, locale, messages, geometry?.categoryStep ?? 0)
  const positions = geometry?.positions ?? []

  let plot: LinePlot | null = null
  if (geometry !== null && box !== null) {
    const mapped =
      data.length === 0 ||
      (baseline === undefined && (annotations === undefined || annotations.length === 0))
        ? null
        : mapAnnotations({
            annotations,
            baseline,
            valueAt: (value) => geometry.value.at(value),
            categoryAt: geometry.categoryAt,
            vertical: true,
          })
    const layers = mapped === null ? null : annotationLayers(mapped, 'y', box.width, box.height)
    const floor = geometry.value.at(geometry.value.domain[0])

    const strokes = visible.map((entry): LineStroke => {
      const points: MaybePoint[] = data.map((row, index) => {
        const value = valueAt(row, entry.key)
        const at = positions[index]
        // A row with no x position is a gap, like a row with no value. The
        // stroke breaks instead of going to x=0.
        return value === null || at === null || at === undefined
          ? null
          : { x: at, y: geometry.value.at(value) }
      })
      return {
        key: entry.key,
        paint: entry.paint,
        wash: variant === 'area' ? areaPath(points, floor, curve) : null,
        line: linePath(points, curve),
        markers: markers
          ? points.flatMap((point, index) =>
              point === null
                ? []
                : [
                    {
                      key: `${entry.key}-${index}`,
                      index,
                      cx: point.x,
                      cy: point.y,
                      r: MARKER_RADIUS,
                    },
                  ],
            )
          : [],
      }
    })

    const last = data[data.length - 1]
    const ends =
      data.length === 0
        ? []
        : endLabelsFor(
            data,
            visible,
            (key) => valueAt(last, key),
            (value) => geometry.value.at(value),
            y?.format,
            locale,
          )

    plot = {
      width: box.width,
      height: box.height,
      // Gridlines on the value axis only, and no tick lines.
      grid: geometry.valueTicks.map((tick) => ({
        key: tick.key,
        d: rulePath([0, crisp(tick.at)], [box.width, crisp(tick.at)]),
      })),
      // The only axis stroke, drawn only when zero is in view. A rule at the
      // domain floor would wrongly suggest the axis starts at zero.
      zeroRule: geometry.hasZero
        ? rulePath([0, crisp(geometry.zero)], [box.width, crisp(geometry.zero)])
        : null,
      wash: layers?.wash ?? [],
      ink: layers?.ink ?? null,
      strokes,
      endLabels: ends.map((end) => ({
        key: end.key,
        x: box.width,
        y: end.baseline,
        text: end.text,
      })),
    }
  }

  return {
    state: chartState(data, loading),
    kind,
    painted,
    visible,
    categories,
    brushOn,
    syncGroup: syncOn ? syncId : undefined,
    domainValues: domainValuesOf(data, x.key, kind, continuous),
    summary: summaryFor(messages, label, painted, data.length, selectable, { measure: y?.label }),
    warnings,
    legend: legendFor(painted) !== null,
    twin: {
      columns: twinColumns(x, painted),
      rows: twinRows(data, categories, painted, y?.format, locale),
    },
    axes:
      geometry === null || data.length === 0
        ? null
        : { y: geometry.valueTicks, x: geometry.categoryTicks },
    positions,
    plot,
  }
}

/**
 * The crosshair and the tooltip's place at a row. The readout tracks along x
 * at mid-height, and past the halfway mark it flips side, so near the plot's
 * end it opens inward instead of off the frame. A row with no x position reads
 * at the plot's start.
 */
export function crosshairAt(
  model: { positions: readonly (number | null)[] },
  index: number,
  box: MeasuredBox,
): { x: number; y: number; side: 'start' | 'end'; crosshair: string } {
  const along = model.positions[index] ?? 0
  return {
    x: along,
    y: box.height / 2,
    side: along > box.width / 2 ? 'start' : 'end',
    crosshair: rulePath([crisp(along), 0], [crisp(along), box.height]),
  }
}

/**
 * What the chart shows at a reading position: the tooltip's rows, the live
 * region's sentence, the tooltip itself and the crosshair.
 *
 * One readout lists every visible series, because the pointer aims at a date,
 * not at a line. `tooltip: false` removes only the visual layer: the
 * announcement and the crosshair stay.
 */
export function lineChartReadout(
  input: LineChartInput,
  model: LineChartModel,
  view: ReadingView,
): CrosshairReadout {
  const { data, y, locale, tooltip = {}, box } = input
  const messages = input.messages ?? DEFAULT_RANGE_MESSAGES
  if (view.index === null) return { rows: [], announcement: '', tooltip: null, crosshair: null }
  const rows = readingRows(data, view.index, model.visible, y?.format, locale, messages.noData)
  const category = model.categories[view.index] ?? ''
  const drawn = model.plot === null || box === null ? null : crosshairAt(model, view.index, box)
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

/**
 * What `onSelect` reports at a position: the row and its index, or `null` when
 * nothing is read. A member passes the live position, not the rendered one: a
 * click can arrive before a pointer move's render, and the previous render's
 * position would select the wrong row.
 */
export function lineChartSelection(
  input: Pick<LineChartInput, 'data'>,
  _model: RangeModel,
  at: ReadingPosition,
): { index: number; datum: ChartDatum } | null {
  if (at.index === null) return null
  const datum = input.data[at.index]
  return datum === undefined ? null : { index: at.index, datum }
}

/**
 * The brush's range on the plot: the positions of its two rows and the plot's
 * height, or `null` with no range, no plot, or a row with no x position. `state`
 * is the brush machine's range for the rows the member draws now.
 */
export function brushSpan(model: RangeModel, state: BrushState | null): BrushSpan | null {
  if (state === null || model.plot === null) return null
  const from = model.positions[state.anchor]
  const to = model.positions[state.edge]
  if (from === null || from === undefined || to === null || to === undefined) return null
  return { from, to, height: model.plot.height }
}

/**
 * The committed pair `onBrushEnd` reports, sorted by the rows' x-domain values:
 * the rows' ISO strings on a time x, their numbers on a linear x.
 */
export function brushValues(
  input: { data: readonly ChartDatum[]; x: ChartXAxis },
  model: RangeModel,
  anchor: number,
  edge: number,
): [string, string] | [number, number] | null {
  const { data, x } = input
  const [lo, hi] = [anchor, edge].sort(
    (left, right) => (model.domainValues[left] ?? 0) - (model.domainValues[right] ?? 0),
  )
  if (lo === undefined || hi === undefined) return null
  if (model.kind === 'time') {
    return [String(data[lo]?.[x.key] ?? ''), String(data[hi]?.[x.key] ?? '')]
  }
  return [Number(data[lo]?.[x.key] ?? 0), Number(data[hi]?.[x.key] ?? 0)]
}
