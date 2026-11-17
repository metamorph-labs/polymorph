import type { ChartReadout, ChartTooltipRow, ChartTwinColumn } from './anatomy'
import { formatValue } from './format'
import { BAR_END_RADIUS, HIT_TARGET_MIN } from './geometry'
import type { MeasuredBox } from './measured-box'
import { DEFAULT_CHART_MESSAGES, spokenSummary } from './messages'
import { ringArcs } from './paths'
import type { ReadingPosition, ReadingView } from './reading'
import { resolveSeries, type ResolvedSeries } from './series'
import {
  chartState,
  type ChartMessages,
  type ChartSlot,
  type ChartState,
  type ChartTooltipConfig,
  type ValueFormat,
} from './types'

/**
 * DonutChart's drawing (`design/components/donut-chart.md`): everything the
 * member shows that follows from its props and the measured plot, and what it
 * shows at a reading position. Every framework's DonutChart renders it, so the
 * ring's geometry, the shares and the readout's words are decided once.
 *
 * A donut is a bar chart wrapped around its total. So the ring's thickness is
 * the bar-thickness cap, and the tooltip and the twin both show the **share**:
 * it is the number a part-to-whole reader wants, and the one the geometry shows
 * least accurately.
 */

export interface DonutSegment {
  key: string
  label: string
  value: number
  /** The palette slot. Defaults to declaration order, so colour follows the segment. */
  slot?: ChartSlot
}

export interface DonutCenter {
  /** The centre figure, pre-formatted by the app, which owns the total (as with Stat). */
  value: string
  label?: string
}

export interface DonutChartInput {
  segments: readonly DonutSegment[]
  center?: DonutCenter | undefined
  /** Formats segment values in the tooltip and the twin. */
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
  /** The measured plot, or `null` before the first measurement. */
  box: MeasuredBox | null
}

/** One segment's arc on the ring. */
export interface DonutArc {
  key: string
  /** The segment's position in `segments`, which the reading walks. */
  index: number
  /** The painted arc. */
  d: string
  /**
   * The pointer target: the same sector, grown to `HIT_TARGET_MIN` along the
   * ring and across it.
   */
  hit: string
  /** A `var(--pm-chart-…)` reference, set as `--pm-chart-mark`. */
  paint: string
}

/** The figure in the hole, placed at the ring's centre. */
export interface DonutCenterDrawing {
  value: string
  label?: string
  x: number
  y: number
  /** The label's baseline, below the figure's. */
  labelY: number
}

/** The plot at its measured size. */
export interface DonutPlot {
  width: number
  height: number
  /** The ring's centre, as the `transform` of the group the arcs are drawn in. */
  transform: string
  /**
   * The arcs that draw, in declaration order. A segment with no share (a zero,
   * a negative or a value that is not a number) takes none of the ring, so it
   * has no arc here and keeps its legend key and its twin row.
   */
  arcs: DonutArc[]
  center: DonutCenterDrawing | null
}

export interface DonutChartModel {
  state: ChartState
  /** The segments with their colours, for the legend and the readout. */
  painted: ResolvedSeries[]
  /** The visually hidden sentence that orients a reader. */
  summary: string
  /** One message per unlawful use, each naming the correct alternative. */
  warnings: string[]
  /** Whether the legend shows: two or more segments. */
  legend: boolean
  twin: { columns: ChartTwinColumn[]; rows: string[][] }
  /** The total of the positive finite values, which every share divides by. */
  total: number
  /** The ring's outer radius in px, `0` before the plot is measured. */
  radius: number
  /**
   * Each segment's angle from 12 o'clock, in radians, index-aligned with
   * `segments`, including a segment that draws nothing: a reader who arrows
   * onto it still gets a readout where it would be. Empty when no ring draws.
   */
  bearings: number[]
  /** The marks, or `null` before the plot is measured. */
  plot: DonutPlot | null
}

/** The segment limit. Past six, adjacent slots are too close together on the wheel. */
const MAX_SEGMENTS = 6

/** `--pm-space-6`: the bar-thickness cap, applied to the ring. */
const RING_THICKNESS = 24

/** Touching marks are separated by a surface-coloured gap, never by a stroke. */
const RING_GAP_PX = 2

/** The readout's distance outside the ring, clear of the paint. */
const READOUT_OFFSET_PX = 8

/** How close to the plot's block edges the readout's centre may come. */
const READOUT_MARGIN_PX = 24

/** The gap between the centre figure's baseline and its label, in px. */
const CENTER_LABEL_OFFSET = 18

/** The derived share column, in both readouts, because angles are hard to estimate. */
const SHARE: ValueFormat = { style: 'percent', maximumFractionDigits: 1 }

/**
 * A value as the total counts it. A non-finite value counts as zero, because
 * one `NaN` in the total's sum would erase every arc. That segment draws
 * nothing and the rest of the ring still draws.
 */
const measured = (value: number) => (Number.isFinite(value) ? value : 0)

/** A segment's share of the total: `0` for a negative, a non-finite value or an empty total. */
const shareOf = (value: number, total: number) =>
  total <= 0 ? 0 : Math.max(0, measured(value)) / total

export function donutChartModel(input: DonutChartInput): DonutChartModel {
  const {
    segments,
    center,
    format,
    label,
    locale,
    messages = DEFAULT_CHART_MESSAGES,
    loading = false,
    selectable = false,
    box,
  } = input

  /*
   * The same slot assignment every other member uses, so a channel that is slot
   * 2 in a bar chart beside this one is slot 2 here. A segment is a series with
   * one value, which `resolveSeries` accepts.
   */
  const resolution = resolveSeries(
    segments.map(({ key, label: name, slot }) => ({ key, label: name, slot })),
  )
  const painted = resolution.series

  const warnings: string[] = []
  if (resolution.warnings.length > 0) warnings.push(resolution.warnings.join(' '))
  if (segments.length > MAX_SEGMENTS) {
    warnings.push(
      `${segments.length} segments, and the ring holds ${MAX_SEGMENTS}. Fold the tail into a single "Other" segment in the data — past six, a reader is comparing angles they cannot tell apart.`,
    )
  }
  if (segments.some((segment) => segment.value < 0)) {
    warnings.push(
      'A share cannot be negative — a part is not less than nothing of a whole. Negative segments are absent from the ring and present in the table twin.',
    )
  }

  /**
   * The total, from the positive finite values only.
   *
   * A negative value cannot be a share of a total, so it gets no arc. It is not
   * silently dropped: it keeps its legend key and its twin row, and the warning
   * above says where it went.
   */
  const total = segments.reduce((sum, segment) => sum + Math.max(0, measured(segment.value)), 0)

  /** The ring fits the plot's shorter side, so a wide panel leaves space around it. */
  const radius = box === null ? 0 : Math.min(box.width, box.height) / 2

  const ring =
    radius <= 0 || total <= 0
      ? []
      : ringArcs(
          segments.map((segment) => ({ key: segment.key, share: shareOf(segment.value, total) })),
          {
            outerRadius: radius,
            thickness: RING_THICKNESS,
            gapPx: RING_GAP_PX,
            cornerRadius: BAR_END_RADIUS,
            minHitPx: HIT_TARGET_MIN,
          },
        )

  let plot: DonutPlot | null = null
  if (box !== null) {
    const middle = { x: box.width / 2, y: box.height / 2 }
    plot = {
      width: box.width,
      height: box.height,
      transform: `translate(${middle.x} ${middle.y})`,
      // A segment with no share has no path and no target; the rest keep their draw order.
      arcs: ring.flatMap((arc, index) =>
        arc.d === ''
          ? []
          : [{ key: arc.key, index, d: arc.d, hit: arc.hit, paint: painted[index]?.paint ?? '' }],
      ),
      center:
        center === undefined
          ? null
          : {
              value: center.value,
              ...(center.label === undefined ? {} : { label: center.label }),
              x: middle.x,
              y: middle.y,
              labelY: middle.y + CENTER_LABEL_OFFSET,
            },
    }
  }

  return {
    state: chartState(segments, loading),
    painted,
    summary: spokenSummary(
      messages.donutSummary({ label, segments: segments.length }),
      messages,
      selectable,
    ),
    warnings,
    legend: painted.length >= 2,
    twin: {
      columns: [
        { key: '__segment', label: messages.segmentColumn },
        { key: '__value', label: messages.valueColumn, numeric: true },
        { key: '__share', label: messages.shareColumn, numeric: true },
      ],
      rows: segments.map((segment) => [
        segment.label,
        formatValue(segment.value, format, locale),
        formatValue(shareOf(segment.value, total), SHARE, locale),
      ]),
    },
    total,
    radius,
    bearings: ring.map((arc) => arc.midAngle),
    plot,
  }
}

/**
 * What the chart shows at a reading position: the tooltip's row, the live
 * region's sentence and the tooltip itself. Both show the value **and** the
 * share, because the geometry shows the share least accurately. A value that
 * is not a finite number shows the twin's em dash. `tooltip: false` removes
 * only the visual layer: the announcement stays.
 */
export function donutChartReadout(
  input: DonutChartInput,
  model: DonutChartModel,
  view: ReadingView,
): ChartReadout {
  const { segments, format, locale, tooltip = {}, box } = input
  const read = view.index === null ? undefined : segments[view.index]
  if (view.index === null || read === undefined) {
    return { rows: [], announcement: '', tooltip: null }
  }
  const value = Number.isFinite(read.value) ? formatValue(read.value, format, locale) : '—'
  const share = formatValue(shareOf(read.value, model.total), SHARE, locale)
  const rows: ChartTooltipRow[] = [
    {
      key: read.key,
      label: read.label,
      value: `${value} · ${share}`,
      paint: model.painted[view.index]?.paint ?? '',
    },
  ]

  /*
   * The readout sits just outside the ring on the segment's bearing, not in
   * the hole. The hole shows the total, and a tooltip there would cover it.
   */
  const bearing = model.bearings[view.index]
  const away = model.radius + READOUT_OFFSET_PX
  const at =
    bearing === undefined || box === null
      ? null
      : {
          x: box.width / 2 + Math.sin(bearing) * away,
          /*
           * Kept inside the plot. The ring fits the plot's shorter side, so a
           * segment at twelve o'clock puts its bearing *above* the top edge. The
           * readout is centred on that position, so it would open into the
           * panel's padding over the title. The member must keep the readout
           * in the frame, and on a ring the edge it can cross is the block edge.
           */
          y: Math.min(
            box.height - READOUT_MARGIN_PX,
            Math.max(READOUT_MARGIN_PX, box.height / 2 - Math.cos(bearing) * away),
          ),
        }

  return {
    rows,
    announcement: `${read.label}: ${value}, ${share}`,
    tooltip:
      tooltip === false || !view.active || at === null || box === null
        ? null
        : {
            rows,
            indicator: tooltip.indicator ?? 'dot',
            ...at,
            side: at.x > box.width / 2 ? 'start' : 'end',
          },
  }
}

/**
 * What `onSelect` reports at a position: the segment's key, label, value and
 * share, because the geometry shows the share least accurately. A segment
 * whose value is not a finite number reports nothing, because the payload's
 * `value` must be a number. `null` when nothing is read.
 */
export function donutChartSelection(
  input: DonutChartInput,
  model: DonutChartModel,
  at: ReadingPosition,
): { key: string; label: string; value: number; share: number } | null {
  const segment = at.index === null ? undefined : input.segments[at.index]
  if (segment === undefined || !Number.isFinite(segment.value)) return null
  return {
    key: segment.key,
    label: segment.label,
    value: segment.value,
    share: shareOf(segment.value, model.total),
  }
}
