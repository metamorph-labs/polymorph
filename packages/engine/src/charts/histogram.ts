import { cssVar } from '@polymorph/theme'

import type { AxisTick, ChartReadout, ChartTooltipRow, ChartTwinColumn } from './anatomy'
import { anchorAtEnds, ESTIMATED_AXIS_TEXT_PX } from './cartesian'
import { formatValue } from './format'
import { barPath, crisp, estimateTextWidth, hitBox, labelCapacity, rulePath } from './geometry'
import type { MeasuredBox } from './measured-box'
import { DEFAULT_CHART_MESSAGES, spokenSummary } from './messages'
import type { ReadingPosition, ReadingView } from './reading'
import {
  binSample,
  continuousScale,
  DEFAULT_VALUE_TICKS,
  thinLabels,
  valueDomain,
  type SampleBin,
} from './scales'
import {
  chartState,
  type ChartMessages,
  type ChartState,
  type ChartTooltipConfig,
  type ChartYAxis,
  type ValueFormat,
} from './types'

/**
 * Histogram's drawing (`design/components/histogram.md`): the bins of one
 * sample, everything the member shows that follows from its props and the
 * measured plot, and what it shows at a reading position. Every framework's
 * Histogram renders it, so the bins, their geometry and the readout's words
 * are decided once.
 *
 * **The input is a sample, not rows.** `data` is `readonly number[]`. Finding
 * the sample's shape is the chart's purpose, so the model does the binning,
 * through the engine's `binSample` wrapper over `d3-array.bin`. d3 supplies the
 * arithmetic; the wrapper and this model make every decision. Bins are
 * positions on a scale, not rows, and the sample's order carries no
 * information, so the rule that a chart never reorders its data still holds.
 */

export interface HistogramXAxis {
  /** The measure's name, used as the twin's range column header. */
  label?: string
  /** Formats the edges and the bin ranges ("a–b", both edges formatted with it). */
  format?: ValueFormat
}

export interface HistogramInput {
  /** The raw observations, unbinned and in any order. */
  data: readonly number[]
  /** A target bin count; Sturges' rule when absent. */
  bins?: number | undefined
  x?: HistogramXAxis | undefined
  y?: ChartYAxis | undefined
  /** The chart's accessible name. */
  label: string
  locale?: string | undefined
  messages?: ChartMessages | undefined
  /** The tooltip's configuration; it shapes the readout and not the marks. */
  tooltip?: ChartTooltipConfig | false | undefined
  loading?: boolean | undefined
  /** Whether the member has an `onSelect`: the summary then says the plot responds to Enter. */
  selectable?: boolean | undefined
  /** The measured plot, or `null` before the first measurement. */
  box: MeasuredBox | null
}

/** One bin on the plot: its pointer target and its bar. */
export interface HistogramBar {
  key: string
  /** The bin's position in `bins`, which the reading walks. */
  index: number
  /** The pointer target: the bin's full width through the plot, at least the minimum hit size. */
  hit: { x: number; y: number; width: number; height: number }
  /**
   * The bar, or `null` for an empty bin, which draws no bar and keeps its
   * place. The twin and the keyboard walk both report its zero count.
   */
  d: string | null
}

/** The plot at its measured size. */
export interface HistogramPlot {
  width: number
  height: number
  /**
   * The zero rule's position in px, which the stylesheet's entrance grows the
   * bars from (`--pm-chart-zero`). It is geometry, not a design value.
   */
  zero: number
  /** The gridlines, on the count axis only. */
  grid: { key: string; d: string }[]
  bars: HistogramBar[]
  /** The zero baseline, the only axis stroke. */
  zeroRule: string
}

export interface HistogramModel {
  state: ChartState
  /** The sample's bins, in axis order. */
  bins: SampleBin[]
  /** Each bin's en-dash range, "a–b", as the tooltip, the twin and the live region print it. */
  ranges: string[]
  /** The visually hidden sentence that orients a reader. */
  summary: string
  /** One message per unlawful use, each naming the correct alternative. */
  warnings: string[]
  twin: { columns: ChartTwinColumn[]; rows: string[][] }
  /**
   * The ticks of the two axes: counts on y, bin edges on x. `null` without
   * bins or before the plot is measured, because an axis over an empty plot
   * shows a range that was never measured.
   */
  axes: { y: AxisTick[]; x: AxisTick[] } | null
  /** Each bin's centre along x, in px, for the pointer and the tooltip. */
  positions: number[]
  /** The marks, or `null` without bins or before the plot is measured. */
  plot: HistogramPlot | null
}

/** The minimum space between two edge labels, so they do not read as one. */
const LABEL_GAP_PX = 12

/** The single-series paint: slot 1, the palette's first slot, as a token reference. */
const PAINT = cssVar('chart.1')

export function histogramModel(input: HistogramInput): HistogramModel {
  const {
    data,
    bins: target,
    x,
    y,
    label,
    locale,
    messages = DEFAULT_CHART_MESSAGES,
    loading = false,
    selectable = false,
    box,
  } = input

  const warnings: string[] = []
  if (y?.domain === 'auto') {
    warnings.push(
      'Histogram ignores y.domain "auto" — a truncated bar lies, and that applies to counts ' +
        'verbatim, so the count axis is always anchored at zero.',
    )
  }

  /** The bins, computed through the engine wrapper, never `d3-array` directly. */
  const sample = binSample(data, target)

  /**
   * A bin's label is the en-dash range "a–b", both edges formatted with
   * `x.format`. The tooltip, the twin and the live region use the same string.
   * The engine's bins are half-open [a, b), which the label does not show: the
   * bars share edges, the labels share endpoints, and a value on a shared edge
   * counts once, in the bin to its right.
   */
  const ranges = sample.map(
    (bin) =>
      `${formatValue(bin.from, x?.format, locale)}–${formatValue(bin.to, x?.format, locale)}`,
  )

  /** The count column's header in the twin, also used by the readout. */
  const countLabel = y?.label ?? messages.countColumn

  const first = sample[0]
  const last = sample[sample.length - 1]
  let axes: HistogramModel['axes'] = null
  let positions: number[] = []
  let plot: HistogramPlot | null = null
  if (
    box !== null &&
    box.width > 0 &&
    box.height > 0 &&
    first !== undefined &&
    last !== undefined
  ) {
    const { width, height } = box
    /*
     * The measure maps linearly across the plot without `nice()`. The edges
     * from d3 are already clean steps, and extending the domain past them would
     * draw plot area that no bin covers. A flat sample (every observation
     * identical) is one bin with equal edges. Its measure runs half a unit to
     * either side of the value, the bar fills it, and the axis has the one
     * edge, so the bar has a width and no two ticks share a key.
     */
    const flat = !(last.to > first.from)
    const lo = flat ? first.from - 0.5 : first.from
    const hi = flat ? first.from + 0.5 : last.to
    const atX = (value: number) => ((value - lo) / (hi - lo)) * width

    const value = continuousScale(
      'linear',
      valueDomain(
        sample.map((bin) => bin.count),
        'zero',
      ),
      [height, 0],
      y?.ticks ?? DEFAULT_VALUE_TICKS,
    )
    const zero = value.at(0)

    /*
     * Ticks sit at bin edges, thinned to clean steps, as the spec requires.
     * There is one more edge than there are bins. Thinning keeps the first and
     * last edge, so the axis still shows the range the sample covers.
     */
    const edges = flat ? [first.from] : [first.from, ...sample.map((bin) => bin.to)]
    const widest = edges.reduce(
      (most, edge) =>
        Math.max(
          most,
          estimateTextWidth(formatValue(edge, x?.format, locale), ESTIMATED_AXIS_TEXT_PX),
        ),
      0,
    )
    const kept = new Set(thinLabels(edges, labelCapacity(width, widest, LABEL_GAP_PX)))
    const valueTicks = value.ticks.map((tick) => ({
      key: String(tick),
      at: value.at(tick),
      label: formatValue(tick, y?.format, locale),
    }))

    axes = {
      y: valueTicks,
      x: anchorAtEnds(
        edges
          .filter((edge) => kept.has(edge))
          .map((edge) => ({
            key: String(edge),
            at: atX(edge),
            label: formatValue(edge, x?.format, locale),
          })),
        width,
        LABEL_GAP_PX,
      ),
    }
    positions = sample.map((bin) => atX((bin.from + bin.to) / 2))

    plot = {
      width,
      height,
      zero,
      grid: valueTicks.map((tick) => ({
        key: tick.key,
        d: rulePath([0, crisp(tick.at)], [width, crisp(tick.at)]),
      })),
      bars: sample.map((bin, index): HistogramBar => {
        const from = flat ? 0 : atX(bin.from)
        const to = flat ? width : atX(bin.to)
        /*
         * Bins are contiguous, with no band padding and no thickness cap. A bin
         * shares its edges with its neighbours, and space between bins would
         * suggest categories the axis does not have. The 2px surface gap is
         * the only separator, split across each shared edge. The sample's
         * outer edges are not inset.
         */
        const start = from + (index > 0 ? 1 : 0)
        const span = Math.max(0, to - (index < sample.length - 1 ? 1 : 0) - start)
        const top = value.at(bin.count)
        const hit = hitBox((from + to) / 2, to - from)
        return {
          key: String(bin.from),
          index,
          hit: { x: hit.start, y: 0, width: hit.size, height },
          d: bin.count > 0 ? barPath(start, top, span, Math.max(0, zero - top), 'top') : null,
        }
      }),
      zeroRule: rulePath([0, crisp(zero)], [width, crisp(zero)]),
    }
  }

  return {
    state: chartState(data, loading),
    bins: sample,
    ranges,
    /*
     * A sample has observations but no series, so this is the series summary
     * with an empty series list.
     */
    summary: spokenSummary(
      messages.summary({ label, series: [], points: data.length }),
      messages,
      selectable,
    ),
    warnings,
    twin: {
      columns: [
        { key: '__range', label: x?.label ?? messages.rangeColumn },
        { key: '__count', label: countLabel, numeric: true },
      ],
      rows: sample.map((bin, index) => [
        ranges[index] ?? '',
        formatValue(bin.count, y?.format, locale),
      ]),
    },
    axes,
    positions,
    plot,
  }
}

/**
 * What the chart shows at a reading position: the bin's count as the tooltip's
 * row, under its range, and "a–b: count" as the live region's sentence.
 * `tooltip: false` removes only the visual layer: the announcement stays.
 */
export function histogramReadout(
  input: HistogramInput,
  model: HistogramModel,
  view: ReadingView,
): ChartReadout {
  const { y, locale, tooltip = {}, box } = input
  const messages = input.messages ?? DEFAULT_CHART_MESSAGES
  const read = view.index === null ? undefined : model.bins[view.index]
  if (view.index === null || read === undefined) {
    return { rows: [], announcement: '', tooltip: null }
  }
  const range = model.ranges[view.index] ?? ''
  const count = formatValue(read.count, y?.format, locale)
  const rows: ChartTooltipRow[] = [
    { key: 'count', label: y?.label ?? messages.countColumn, value: count, paint: PAINT },
  ]
  const along = model.positions[view.index] ?? 0
  return {
    rows,
    announcement: `${range}: ${count}`,
    tooltip:
      tooltip === false || !view.active || model.plot === null || box === null
        ? null
        : {
            ...(tooltip.hideLabel ? {} : { header: range }),
            rows,
            indicator: tooltip.indicator ?? 'dot',
            x: along,
            y: box.height / 2,
            // Past the halfway mark the readout opens inward, so it never leaves the frame.
            side: along > box.width / 2 ? 'start' : 'end',
          },
  }
}

/**
 * What `onSelect` reports at a position: the bin's edges and count. `null`
 * when nothing is read.
 */
export function histogramSelection(
  _input: HistogramInput,
  model: HistogramModel,
  at: ReadingPosition,
): { bin: { from: number; to: number; count: number } } | null {
  const bin = at.index === null ? undefined : model.bins[at.index]
  if (bin === undefined) return null
  return { bin: { from: bin.from, to: bin.to, count: bin.count } }
}
