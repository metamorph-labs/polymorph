import { cssVar } from '@polymorph/theme'

import type { AxisTick, ChartReadout, ChartTwinColumn } from './anatomy'
import {
  annotationLayers,
  mapAnnotations,
  type AnnotationInk,
  type AnnotationWash,
} from './annotations'
import { cartesianGeometry, categoriesOf, MARKER_RADIUS, summaryFor } from './cartesian'
import { barPath, crisp, hitBox, rulePath } from './geometry'
import type { MeasuredBox } from './measured-box'
import { DEFAULT_CHART_MESSAGES } from './messages'
import { linePath, type MaybePoint } from './paths'
import type { ReadingPosition, ReadingView } from './reading'
import { announcement, readingRows, seriesAnnouncement, twinColumns, twinRows } from './readout'
import { seriesValues } from './scales'
import {
  divergingArms,
  emphasised,
  emphasisWarning,
  hasMixedSigns,
  legendFor,
  resolveSeries,
  stackSegments,
  valueAt,
  type ResolvedSeries,
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
} from './types'

/**
 * BarChart's drawing (`design/components/bar-chart.md`): everything the member
 * shows that follows from its props, the series the reader has hidden and the
 * measured plot, and what it shows at a reading position. Every framework's
 * BarChart renders it, so the bars' geometry, the stacking rules, the colours
 * and the readout's words are decided once.
 *
 * The main rule: **the y domain always includes zero**. A bar's length is its
 * value, so a truncated axis misstates every comparison on the chart. For that
 * reason `y.domain: 'auto'` raises a dev warning and is ignored.
 *
 * `lines` draws further series as lines over the bars, on the same value axis.
 * There is one value axis and never a second: two scales on one plot relate
 * two measures by an arbitrary ratio, and where the marks cross means nothing
 * (`docs/charts.md`). A line therefore reads in the bars' unit and format, and
 * the readout, the twin and the summary state it as they state a bar series.
 */

export type BarOrientation = 'vertical' | 'horizontal'
export type BarMode = 'grouped' | 'stacked' | 'diverging'

export interface BarChartInput {
  data: readonly ChartDatum[]
  series: readonly ChartSeries[]
  /**
   * Series drawn as lines over the bars, on the bars' value axis. They take
   * the slots after the bars' and are drawn on a vertical chart only.
   */
  lines?: readonly ChartSeries[] | undefined
  x: ChartXAxis
  y?: ChartYAxis | undefined
  orientation?: BarOrientation | undefined
  mode?: BarMode | undefined
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
  /** The series the reader has hidden from the legend. */
  hidden?: ReadonlySet<string> | undefined
  /** The measured plot, or `null` before the first measurement. */
  box: MeasuredBox | null
}

/** One bar, or one segment of a stacked or diverging column. */
export interface BarMark {
  key: string
  /** The series' position among the visible series, which the Up/Down walk selects. */
  series: number
  d: string
  /** A `var(--pm-chart-…)` reference, set as `--pm-chart-mark`. */
  paint: string
}

/** One category's band: its pointer target and its marks. */
export interface BarBand {
  key: string
  index: number
  /** The pointer target: the whole band, at least the minimum hit size across. */
  hit: { x: number; y: number; width: number; height: number }
  marks: BarMark[]
}

/** A point of a line over the bars, at its category's centre. */
export interface BarLinePoint {
  key: string
  /** The row's index, which the reading position's `data-active` compares against. */
  index: number
  cx: number
  cy: number
  r: number
}

/** One visible line series: its stroke, broken at every gap, and a point per value. */
export interface BarLine {
  key: string
  /** The series' position among the visible series, after every bar series. */
  series: number
  /** A `var(--pm-chart-…)` reference, set as `--pm-chart-mark` on the line's group. */
  paint: string
  d: string
  points: BarLinePoint[]
}

/** The plot at its measured size. */
export interface BarPlot {
  width: number
  height: number
  /**
   * The zero rule's position in px, which the stylesheet's entrance grows the
   * bars from (`--pm-chart-zero`). It is geometry, not a design value.
   */
  zero: number
  /** The gridlines, at the value axis's ticks. */
  grid: { key: string; d: string }[]
  /** A reference band's wash, under the marks. */
  wash: AnnotationWash[]
  bands: BarBand[]
  /** The zero rule, the only axis stroke, drawn over the marks. */
  zeroRule: string
  /** The annotation ink, over the marks, where the baseline draws. */
  ink: AnnotationInk | null
  /** The line series, over the bars and the annotation ink. Empty without `lines`. */
  lines: BarLine[]
}

export interface BarChartModel {
  state: ChartState
  vertical: boolean
  /** How the marks combine, after the fallbacks: `data-mode`. */
  drawn: BarMode
  /**
   * The declared series with their colours, for the legend and the twin: the
   * bar series, then the line series.
   */
  painted: ResolvedSeries[]
  /** The series not hidden, which the marks and the readout show, bars first. */
  visible: ResolvedSeries[]
  /** The keys of the series drawn as lines, whose legend keys are lines. */
  lineKeys: string[]
  /** Each row's category label. */
  categories: string[]
  /** The visually hidden sentence that orients a reader. */
  summary: string
  /** One message per unlawful use, each naming the correct alternative. */
  warnings: string[]
  /** Whether the legend shows: two or more series. */
  legend: boolean
  twin: { columns: ChartTwinColumn[]; rows: string[][] }
  /**
   * The ticks of the two screen axes. `null` with no rows: with no data there
   * is no scale, and a value axis reading 0 to 1 over an empty plot shows a
   * range that was never measured. Loading *with* rows keeps its axes, as part
   * of the held frame.
   */
  axes: { y: AxisTick[]; x: AxisTick[] } | null
  /** Each row's centre along the band axis, in px, for the pointer. */
  positions: (number | null)[]
  /** The marks, or `null` before the plot is measured. */
  plot: BarPlot | null
}

/** A bar is at most 24px thick and never fills its band; the rest is spacing. */
const MAX_BAR_PX = 24

/** Touching marks are separated by a surface-coloured gap, never by a stroke. */
const MARK_GAP_PX = 2

const NO_LINES: readonly ChartSeries[] = []

/**
 * A line series' points over the bars' band axis: each row's value at its
 * category's centre, which is the centre the row's bars are grouped around,
 * on the bars' own value scale (`toPx`). A row with no value is a gap: the
 * stroke breaks there and no point is drawn, because a missing measurement is
 * not a measurement of zero.
 */
export function barLinePoints(
  data: readonly ChartDatum[],
  key: string,
  positions: readonly (number | null)[],
  toPx: (value: number) => number,
): MaybePoint[] {
  return data.map((row, index) => {
    const value = valueAt(row, key)
    const at = positions[index]
    return value === null || at === null || at === undefined ? null : { x: at, y: toPx(value) }
  })
}

export function barChartModel(input: BarChartInput): BarChartModel {
  const {
    data,
    series,
    lines = NO_LINES,
    x,
    y,
    orientation = 'vertical',
    mode = 'grouped',
    emphasis,
    baseline,
    annotations,
    locale,
    messages = DEFAULT_CHART_MESSAGES,
    loading = false,
    selectable = false,
    hidden,
    box,
  } = input

  /*
   * A line joins the categories along x, so it is drawn over vertical bars
   * only. On a horizontal chart the categories run down the page, where a line
   * through them reads as a profile, not as the change the line is for. The
   * horizontal chart warns and draws its bars without the lines.
   */
  const vertical = orientation === 'vertical'
  const drawnLines = vertical ? lines : NO_LINES

  /*
   * One resolution for the bars and the lines, so an explicit slot on either
   * reserves its seat for both, and the lines take the slots after the bars'.
   * The bar rules below (the arms, the stacks, the signed colours) read the bar
   * series only, so a chart with no lines resolves exactly as it did before.
   */
  const resolution = resolveSeries([...series, ...drawnLines])
  const barSeries = resolution.series.slice(0, series.length)
  const lineSeries = resolution.series.slice(series.length)

  /*
   * Likert colours: in `diverging` mode each side's series take the arms
   * outward from zero, arm 1 nearest the centre and arm 3 at the extremes.
   * Arms are assigned over the *declared* series, before emphasis and before
   * hiding, because colour follows the series. Hiding "Agree" must not shift
   * "Strongly agree" one arm inward, and `emphasis` greys an arm as it greys a
   * slot. A status-toned series keeps its status colour. A single declared
   * series uses the automatic signed path below, which gives the same colour
   * (arm 3).
   */
  const divergingMode = mode === 'diverging'
  let armed = barSeries
  if (divergingMode && barSeries.length >= 2) {
    const arms = divergingArms(
      data,
      barSeries.map((entry) => entry.key),
    )
    armed = barSeries.map((entry, index) => {
      const arm = arms[index]
      if (arm === null || arm === undefined || entry.tone !== undefined) return entry
      return { ...entry, paint: arm.paint }
    })
  }

  const paintedBars = emphasised(armed, emphasis)
  const paintedLines = emphasised(lineSeries, emphasis)
  const painted = [...paintedBars, ...paintedLines]
  const misnamed = emphasisWarning([...series, ...drawnLines], emphasis)

  // Toggle-to-isolate: the legend's hidden series leave the marks, and the domains refit.
  const shown = (entry: ResolvedSeries) => !(hidden?.has(entry.key) ?? false)
  const visibleBars = paintedBars.filter(shown)
  const visibleLines = paintedLines.filter(shown)
  const visible = [...visibleBars, ...visibleLines]

  /*
   * Dev warnings, each naming the correct alternative. A scale that is not a
   * band belongs to Histogram. An `auto` domain truncates the bars. A stack
   * with values on both sides of zero needs diverging mode, and in that mode
   * the warning is reversed, because signed data is expected there. Each case
   * renders a correct fallback instead of silently clamping, because a chart
   * that quietly drops data is worse than one that falls back and logs why.
   */
  const signs = hasMixedSigns(
    data,
    visibleBars.map((entry) => entry.key),
  )
  const mixed = mode === 'stacked' && signs
  const oneSided =
    divergingMode &&
    !signs &&
    data.some((row) => visibleBars.some((entry) => valueAt(row, entry.key) !== null))
  const warnings: string[] = []
  if (resolution.warnings.length > 0) warnings.push(resolution.warnings.join(' '))
  if (misnamed !== undefined) warnings.push(misnamed)
  if (!vertical && lines.length > 0) {
    warnings.push(
      'BarChart draws lines over vertical bars only — a line joins the categories along x, and a horizontal chart runs them down the page. Rendering the bars without the lines.',
    )
  }
  if (x.scale !== undefined && x.scale !== 'band') {
    warnings.push(
      `BarChart takes a band x axis; "${x.scale}" bars over a continuum are Histogram's own bins (histogram.md). Rendering as a band.`,
    )
  }
  if (y?.domain === 'auto') {
    warnings.push(
      'BarChart ignores y.domain "auto" — a truncated bar lies, so the domain is always anchored at zero.',
    )
  }
  if (mixed) {
    warnings.push(
      'A stacked bar cannot honestly carry values on both sides of zero — the Likert form is mode: "diverging" (bar-chart.md). Rendering grouped, with nothing clamped.',
    )
  }
  if (oneSided) {
    warnings.push(
      'mode "diverging" stacks pre-signed values outward from both sides of zero — signed data is the point. This data is all one sign, so nothing diverges; "stacked" or "grouped" states it honestly.',
    )
  }

  const stacked = mode === 'stacked' && !mixed && visibleBars.length > 1
  /*
   * Segment-based drawing: a stack and a diverging stack are one mechanism
   * with two offsets. Diverging stays on when hiding leaves one visible series.
   * The offset then draws the same marks as grouped, but keeps the arm colours,
   * so a reader who hides three Likert answers keeps the fourth's colour.
   */
  const layered = stacked || (divergingMode && visibleBars.length > 0)
  const segments = layered
    ? stackSegments(
        data,
        visibleBars.map((entry) => entry.key),
        divergingMode ? 'diverging' : 'stacked',
      )
    : []
  // The lines share the bars' value axis, so it reaches their values too.
  const lineValues = seriesValues(
    data,
    visibleLines.map((entry) => entry.key),
  )

  const geometry = cartesianGeometry({
    data,
    x,
    // Bars take a band x only; a continuum belongs to Histogram.
    kind: 'band',
    y,
    series: visible,
    locale,
    messages,
    plot: box,
    domainMode: 'zero',
    orientation,
    /*
     * Two cases where the series' own values do not set the axis. A stack's
     * axis must cover the running total (three bands of forty is a hundred
     * and twenty, not forty), and a diverging stack's must reach both running
     * extremes. So the layered modes pass the segments' bounds. With every
     * series hidden there is nothing to fit, and a domain over no values would
     * be an invented axis, so the axes keep the full data's domain.
     */
    ...(layered
      ? {
          valueOverride: [
            ...segments.flat().flatMap((segment) => [segment.from, segment.to]),
            ...lineValues,
          ],
        }
      : visible.length === 0
        ? {
            valueOverride: seriesValues(
              data,
              painted.map((entry) => entry.key),
            ),
          }
        : {}),
  })

  const categories = categoriesOf(data, x, 'band', locale, messages)

  /**
   * Single-series signed data uses the polarity colours automatically, because
   * sign is what matters when there is one series. Multi-series signed data
   * keeps its series hues, because there the colour identifies the series and
   * sign is a detail of one bar. Counted over the *declared* series, not the
   * visible ones, because colour follows the series: hiding all but one never
   * repaints it.
   */
  const signed =
    paintedBars.length === 1 && data.some((row) => (valueAt(row, paintedBars[0]!.key) ?? 0) < 0)

  const axes =
    geometry === null || data.length === 0
      ? null
      : {
          y: vertical ? geometry.valueTicks : geometry.categoryTicks,
          x: vertical ? geometry.categoryTicks : geometry.valueTicks,
        }

  let plot: BarPlot | null = null
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
            vertical,
          })
    const layers =
      mapped === null ? null : annotationLayers(mapped, vertical ? 'y' : 'x', box.width, box.height)

    const bands = data.map((row, index): BarBand => {
      const center = geometry.positions[index] ?? 0
      const bandWidth = geometry.band?.bandwidth ?? 0
      const slotCount = layered ? 1 : Math.max(1, visibleBars.length)
      /*
       * The outermost segment on each side of this row. The data-end radius
       * goes on the end of the data, and a diverging column has two ends, one
       * per side. Zero-length segments do not count, because giving them the
       * radius would take it from the real end.
       */
      let lastPos = -1
      let lastNeg = -1
      if (divergingMode && layered) {
        visibleBars.forEach((entry, at) => {
          const value = valueAt(row, entry.key)
          if (value === null || value === 0) return
          if (value > 0) lastPos = at
          else lastNeg = at
        })
      }
      // A bar never fills its band, because the remainder is the spacing between groups.
      const slot = Math.min(
        MAX_BAR_PX,
        Math.max(1, (bandWidth - MARK_GAP_PX * (slotCount - 1)) / slotCount),
      )
      const groupWidth = slot * slotCount + MARK_GAP_PX * (slotCount - 1)
      const groupStart = center - groupWidth / 2
      /*
       * The hit area is the whole band, at least 24px wide (`hitBox`). A 6px
       * bar in a dense chart is too small a target, and past thirty bands the
       * band itself is too. Neighbouring targets may overlap at that density.
       * The ring makes the same trade-off, because an overlapping target still
       * hits something and a sliver hits nothing.
       */
      const hit = hitBox(center, bandWidth)

      const marks: BarMark[] = []
      visibleBars.forEach((entry, at) => {
        const value = valueAt(row, entry.key)
        // A gap draws no bar, never a zero-height one.
        if (value === null && !layered) return

        const bounds = layered
          ? segments[at]?.[index]
          : { from: 0, to: value ?? 0, present: value !== null }
        if (bounds === undefined || !bounds.present) return

        const near = geometry.value.at(bounds.from)
        const far = geometry.value.at(bounds.to)
        /*
         * Which side of zero the segment is on. The diverging offset returns a
         * negative segment's pair with the nearest-to-zero value *last*
         * (`[-9, 0]`, not `[0, -9]`), so the pair's order does not indicate
         * sign there. The sum of the bounds does.
         */
        const positive = divergingMode ? bounds.from + bounds.to > 0 : bounds.to >= bounds.from

        /*
         * Stacked segments touch, and touching marks are separated by a
         * surface gap, not a stroke, because a border adds heavy ink that is
         * not data. The gap is taken from the segment's length at the baseline
         * end, so it shortens the mark without moving the value's position. A
         * diverging segment is inner when an earlier series already occupies
         * its side of this row. The outermost segment keeps its full length,
         * because the top of a stack is the total (each side's total, when
         * diverging), and shortening it would misstate the number the column
         * shows.
         */
        const outermost = !layered
          ? true
          : divergingMode
            ? at === (positive ? lastPos : lastNeg)
            : at === visibleBars.length - 1
        const inner = divergingMode
          ? visibleBars.slice(0, at).some((prev) => {
              const before = valueAt(row, prev.key)
              return before !== null && before !== 0 && before > 0 === positive
            })
          : at > 0
        const gap = layered && inner ? MARK_GAP_PX : 0
        const start = Math.min(near, far) + (positive ? 0 : gap)
        const length = Math.max(0, Math.abs(far - near) - gap)
        const offset = layered ? 0 : at * (slot + MARK_GAP_PX)
        const bandPos = groupStart + offset

        // Arm 3, the outermost step, so a signed bar shows its magnitude at
        // full strength. The inner arms are the diverging *scale's* steps.
        const paint = signed ? cssVar(positive ? 'chart.pos.3' : 'chart.neg.3') : entry.paint

        /*
         * Only the outermost segment gets the data-end radius. Rounding every
         * segment of a stack puts a notch at each boundary, so one column looks
         * like several. The radius marks the *end of the data*, and in a stack
         * that is the top.
         */
        const d = vertical
          ? barPath(
              bandPos,
              start,
              slot,
              length,
              positive ? 'top' : 'bottom',
              outermost ? undefined : 0,
            )
          : barPath(
              start,
              bandPos,
              length,
              slot,
              positive ? 'right' : 'left',
              outermost ? undefined : 0,
            )
        marks.push({ key: entry.key, series: at, d, paint })
      })

      return {
        key: categories[index] ?? String(index),
        index,
        hit: {
          x: vertical ? hit.start : 0,
          y: vertical ? 0 : hit.start,
          width: vertical ? hit.size : box.width,
          height: vertical ? box.height : hit.size,
        },
        marks,
      }
    })

    /*
     * Each line is drawn through its rows' category centres on the bars' value
     * scale, with a point at every value: the point is the line's second
     * channel besides colour, as `markers` is LineChart's, and a filled circle
     * on a stroke cannot be taken for a bar.
     */
    const barLines = (data.length === 0 ? [] : visibleLines).map((entry, at): BarLine => {
      const points = barLinePoints(data, entry.key, geometry.positions, (value) =>
        geometry.value.at(value),
      )
      return {
        key: entry.key,
        series: visibleBars.length + at,
        paint: entry.paint,
        d: linePath(points),
        points: points.flatMap((point, index) =>
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
        ),
      }
    })

    plot = {
      width: box.width,
      height: box.height,
      zero: geometry.zero,
      grid: geometry.valueTicks.map((tick) => ({
        key: tick.key,
        d: vertical
          ? rulePath([0, crisp(tick.at)], [box.width, crisp(tick.at)])
          : rulePath([crisp(tick.at), 0], [crisp(tick.at), box.height]),
      })),
      wash: layers?.wash ?? [],
      bands,
      zeroRule: vertical
        ? rulePath([0, crisp(geometry.zero)], [box.width, crisp(geometry.zero)])
        : rulePath([crisp(geometry.zero), 0], [crisp(geometry.zero), box.height]),
      ink: layers?.ink ?? null,
      lines: barLines,
    }
  }

  return {
    state: chartState(data, loading),
    vertical,
    drawn: layered ? (divergingMode ? 'diverging' : 'stacked') : 'grouped',
    painted,
    visible,
    lineKeys: paintedLines.map((entry) => entry.key),
    categories,
    summary: summaryFor(messages, input.label, painted, data.length, selectable),
    warnings,
    legend: legendFor(painted) !== null,
    twin: {
      columns: twinColumns(x, painted),
      rows: twinRows(data, categories, painted, y?.format, locale),
    },
    axes,
    positions: geometry?.positions ?? [],
    plot,
  }
}

/**
 * Where the readout sits, and which way it opens.
 *
 * On a vertical chart the band is a column, so the readout tracks along x at
 * mid-height. On a horizontal chart the band is a row and the axes swap. Past
 * the halfway mark the readout flips side, so near the plot's end it opens
 * inward instead of off the frame.
 */
function readoutAt(
  along: number,
  box: MeasuredBox,
  vertical: boolean,
): { x: number; y: number; side: 'start' | 'end' } {
  const x = vertical ? along : box.width / 2
  return { x, y: vertical ? box.height / 2 : along, side: x > box.width / 2 ? 'start' : 'end' }
}

/**
 * What the chart shows at a reading position: the tooltip's rows, the live
 * region's sentence and the tooltip itself.
 *
 * The series selected by the Up/Down walk narrows the *announcement* only. The
 * tooltip still lists every series, and the band keeps its emphasis, with the
 * walked mark also carrying `data-active`. `tooltip: false` removes only the
 * visual layer: the announcement stays.
 */
export function barChartReadout(
  input: BarChartInput,
  model: BarChartModel,
  view: ReadingView,
): ChartReadout {
  const { data, y, locale, tooltip = {}, box } = input
  const messages = input.messages ?? DEFAULT_CHART_MESSAGES
  if (view.index === null) return { rows: [], announcement: '', tooltip: null }
  const rows = readingRows(data, view.index, model.visible, y?.format, locale, messages.noData)
  const category = model.categories[view.index] ?? ''
  const walked = view.series === null ? undefined : rows[view.series]
  return {
    rows,
    announcement:
      walked === undefined ? announcement(category, rows) : seriesAnnouncement(category, walked),
    tooltip:
      tooltip === false || !view.active || model.plot === null || box === null || rows.length === 0
        ? null
        : {
            ...(tooltip.hideLabel ? {} : { header: category }),
            rows,
            indicator: tooltip.indicator ?? 'dot',
            ...readoutAt(model.positions[view.index] ?? 0, box, model.vertical),
          },
  }
}

/**
 * What `onSelect` reports at a position: the row and the series. A walked mark
 * reports its own series. A whole-band reading reports the first visible
 * series, which is where the walk's first Up/Down press lands. `null` when
 * nothing is read, and at a walked mark whose value is `null`: the plot draws
 * no bar and no line point there, the live region says it has no data, and a
 * press there reports nothing, as at a ScatterChart's absent point. A
 * whole-band reading reports the band whatever its values are, because the
 * band is what is read.
 */
export function barChartSelection(
  input: BarChartInput,
  model: BarChartModel,
  at: ReadingPosition,
): { index: number; key: string; datum: ChartDatum } | null {
  if (at.index === null) return null
  const datum = input.data[at.index]
  const entry = model.visible[at.series ?? 0] ?? model.visible[0]
  if (datum === undefined || entry === undefined) return null
  if (at.series !== null && valueAt(datum, entry.key) === null) return null
  return { index: at.index, key: entry.key, datum }
}
