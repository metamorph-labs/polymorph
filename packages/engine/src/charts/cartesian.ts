import { formatValue, granularityFor, parseIso, type NotationMessages } from './format'
import { estimateTextWidth, labelCapacity } from './geometry'
import { spokenSummary } from './messages'
import {
  bandDomain,
  bandXScale,
  continuousScale,
  DEFAULT_VALUE_TICKS,
  seriesValues,
  thinLabels,
  timeDomain,
  valueDomain,
  type BandScale,
  type ContinuousScale,
} from './scales'
import type { ResolvedSeries } from './series'
import type {
  ChartDatum,
  ChartMessages,
  ChartScaleKind,
  ChartXAxis,
  ChartYAxis,
  ValueFormat,
} from './types'
import type { AxisTick } from './anatomy'
import type { MeasuredBox } from './measured-box'

/**
 * Shared geometry for the cartesian members (`BarChart`, `LineChart` and others).
 *
 * The members share one implementation of scales, ticks and positions. A
 * chart's x positions must agree with its axis labels, hit areas, crosshair and
 * table twin, and separate implementations could differ by a rounding.
 *
 * Everything here is a pure function of data and a measured box. The stateful
 * part, the reading position, is the machine in `reading.ts`, and the
 * *strings* are in `readout.ts`.
 */

/** Point dots: r 4, so 8px across, plus the 2px surface ring the stylesheet draws. */
export const MARKER_RADIUS = 4

/**
 * A stand-in for the rendered size of `text.xs`, in px.
 *
 * Used **only** to estimate label width for two collision decisions: how many
 * band labels fit, and whether two end labels would overlap. It never sizes
 * anything. The drawn size comes from the token, and this number in a
 * stylesheet would be a raw value.
 *
 * 12 is `text.xs` at standard density (12.5px) rounded down, so the estimate runs
 * slightly under the drawn width, and further under at compact density, where
 * `text.xs` is 13px. Capacity therefore errs towards one label too many rather
 * than too few. Rounding up would be the safer direction, because the remaining
 * labels stay legible and an overlapping pair does not; raising the constant to
 * 13 would change the label count of every chart, so it stays at 12 until that
 * is decided.
 */
export const ESTIMATED_AXIS_TEXT_PX = 12

/** The minimum space between two axis labels, so they do not read as one. */
export const LABEL_GAP_PX = 12

const DAY_MS = 86_400_000

/** Roughly how long each unit is, for turning a span into a tick count. */
const GRANULARITY_MS = {
  day: DAY_MS,
  week: 7 * DAY_MS,
  month: 30.44 * DAY_MS,
  quarter: 91.31 * DAY_MS,
  year: 365.25 * DAY_MS,
} as const

/**
 * Removes consecutive ticks with the same label.
 *
 * `nice()` can put two ticks inside one labelled unit (a weekly step under a
 * monthly format), which gives `Aug Aug Aug` and looks like a rendering bug.
 * The first tick of each run keeps its position, so the remaining labels still
 * sit at their values.
 */
function dropRepeats(ticks: readonly AxisTick[]): AxisTick[] {
  const kept: AxisTick[] = []
  for (const tick of ticks) {
    if (kept.at(-1)?.label === tick.label) continue
    kept.push(tick)
  }
  return kept
}

/**
 * An inline axis's ticks, with each label anchored that centred would be drawn
 * past an end of the plot.
 *
 * A label is centred on its tick. A tick at either end of a continuous axis
 * sits on the plot's edge, so its label lies half outside the plot, and a band
 * label wider than the room beside its band does the same. Past the plot's
 * inline end there is no other part of the chart, and past its start there is
 * none in a right-to-left document, where the y gutter is on the other side.
 * Such a label is anchored at its end of the plot: its start on a tick at the
 * start, its end on a tick at the end. LineChart's end labels and the
 * annotation labels end at the plot's inline end the same way.
 *
 * Anchoring is preferred to reserving room at the plot's ends. Room would move
 * every mark, position and hit area inward by an estimate of a label's width;
 * the anchor moves only the label. The tick and the gridline drawn from it
 * stay where the scale put them. The axis is laid out in physical pixels, as
 * the marks are, so `start` is the left end in either direction.
 *
 * An anchored label lies up to half its width nearer the label beside it, and
 * two labels nearer than `gap` read as one ("80100"). The label beside an
 * anchored one gives way when the two would come nearer than that. The
 * anchored label stays, because it shows the range the axis covers. On an
 * axis that drops whole labels to keep them apart (a band axis, Histogram's
 * edges) the tick is dropped with its label. On an axis whose ticks the scale
 * chooses (`keepTicks`) the tick stays with an empty label, because a
 * gridline is drawn from it and the gridlines stay evenly spaced. With no
 * `gap` every label is kept.
 *
 * Widths are estimated (`ESTIMATED_AXIS_TEXT_PX`). A tick on the plot's edge
 * is anchored whatever the estimate, because any label there crosses it.
 */
export function anchorAtEnds(
  ticks: readonly AxisTick[],
  length: number,
  gap?: number,
  keepTicks = false,
): AxisTick[] {
  const anchored = ticks.map((tick): AxisTick => {
    const half = estimateTextWidth(tick.label, ESTIMATED_AXIS_TEXT_PX) / 2
    if (tick.at - half < 0) return { ...tick, align: 'start' }
    if (tick.at + half > length) return { ...tick, align: 'end' }
    return tick
  })
  const last = anchored.length - 1
  if (gap === undefined || last < 2) return anchored

  /** Where a label's box starts and ends along the axis, by its anchor. */
  const span = (tick: AxisTick): [number, number] => {
    const width = estimateTextWidth(tick.label, ESTIMATED_AXIS_TEXT_PX)
    const from =
      tick.align === 'start'
        ? tick.at
        : tick.align === 'end'
          ? tick.at - width
          : tick.at - width / 2
    return [from, from + width]
  }
  /** Whether the label at `index` gives way to the anchored label at `end`, beside it. */
  const crowded = (end: number, index: number) => {
    const anchor = anchored[end]
    const beside = anchored[index]
    if (anchor?.align === undefined || beside === undefined) return false
    const [before, after] = end < index ? [anchor, beside] : [beside, anchor]
    return span(after)[0] - span(before)[1] < gap
  }
  const dropped = new Set<number>()
  if (crowded(0, 1)) dropped.add(1)
  if (crowded(last, last - 1)) dropped.add(last - 1)
  return keepTicks
    ? anchored.map((tick, index) => (dropped.has(index) ? { ...tick, label: '' } : tick))
    : anchored.filter((_, index) => !dropped.has(index))
}

export interface CartesianInput {
  data: readonly ChartDatum[]
  x: ChartXAxis
  kind: ChartScaleKind
  y: ChartYAxis | undefined
  series: readonly ResolvedSeries[]
  locale: string | undefined
  /**
   * The catalog's notation, used with the locale. The host words quarter ticks
   * (`ChartMessages.quarter`), the only text the geometry produces.
   */
  messages: NotationMessages
  /** The measured plot cell, or `null` before the first measurement. */
  plot: MeasuredBox | null
  /** Bars force `zero`; lines default to fitting the data. */
  domainMode: 'zero' | 'auto'
  /**
   * The numbers the value axis must reach, when they are not the series' own.
   *
   * A stack's axis must cover the running *total* (three bands of forty is a
   * hundred and twenty, not forty), and in the percent variant it covers 0 to 1
   * whatever the raw values are. Both depend on the marks, not the data, so the
   * stacking member passes them in and other callers of `cartesianGeometry`
   * need not know about stacking.
   */
  valueOverride?: readonly number[]
  /**
   * Which way the value axis runs. `vertical` puts values on y (the default);
   * `horizontal` is BarChart's horizontal form, where the value axis is x.
   */
  orientation?: 'vertical' | 'horizontal'
}

export interface CartesianGeometry {
  /** The value scale, in px along whichever axis carries values. */
  value: ContinuousScale
  /** Present when x is categorical. */
  band: BandScale | null
  /**
   * The position of row `index` along the band/time axis, in px, or `null` when
   * a continuous axis cannot place the row (an unparseable date, a non-numeric
   * linear value). Members treat `null` as absent, as they treat a `null`
   * value: a row with no position is a gap, never a mark at x=0.
   */
  positions: (number | null)[]
  /** Value-axis ticks, as the axis component wants them. */
  valueTicks: AxisTick[]
  /** Category or time ticks, thinned to what fits. */
  categoryTicks: AxisTick[]
  /** The px of value 0, or of the domain floor when zero is off screen. */
  zero: number
  /** Whether zero is inside the domain. A zero rule is drawn only if it is. */
  hasZero: boolean
  /**
   * The px position of a category-axis value (a band's centre, or a date's or
   * number's position on the continuum), or `null` for a value the axis cannot
   * place. The annotation layer uses it to place `point` annotations, because
   * only this module holds the scale.
   */
  categoryAt: (value: string | number) => number | null
  /**
   * The distance between category ticks, in milliseconds on a time axis.
   *
   * Exposed because the *labels* outside the plot need it too. The twin's first
   * column and the tooltip's header are formatted at the x axis's granularity.
   * Using the **value** scale's step instead would format a monthly axis in
   * days.
   */
  categoryStep: number
}

/**
 * The category label for each row: text as written, or a date at its
 * granularity.
 *
 * A date-only string is a calendar date and is formatted as one, which is why
 * `parseIso` exists. An axis one day early goes unnoticed until a month
 * boundary.
 */
export function categoriesOf(
  data: readonly ChartDatum[],
  x: ChartXAxis,
  kind: ChartScaleKind,
  locale: string | undefined,
  messages: NotationMessages,
  stepMs = 0,
): string[] {
  const format: ValueFormat | undefined =
    kind === 'time'
      ? { style: 'date', granularity: x.format?.granularity ?? granularityFor(stepMs) }
      : x.format
  return data.map((row) => formatValue(row[x.key] ?? '', format, locale, messages))
}

/**
 * Scales, positions and ticks for one measured plot.
 *
 * `null` before the first measurement. The frame already renders at full
 * height with its axes and twin in place, so nothing reflows when the
 * measurement arrives.
 */
export function cartesianGeometry(input: CartesianInput): CartesianGeometry | null {
  const { data, x, kind, y, series, plot, domainMode, orientation = 'vertical' } = input
  if (plot === null || plot.width <= 0 || plot.height <= 0) return null

  const vertical = orientation === 'vertical'
  const bandLength = vertical ? plot.width : plot.height
  const valueLength = vertical ? plot.height : plot.width

  const keys = series.map((entry) => entry.key)
  const domain = valueDomain(input.valueOverride ?? seriesValues(data, keys), domainMode)
  // Values run bottom-to-top on a vertical chart and left-to-right on a
  // horizontal one, so the range is reversed only for vertical.
  const value = continuousScale(
    'linear',
    domain,
    vertical ? [valueLength, 0] : [0, valueLength],
    y?.ticks ?? DEFAULT_VALUE_TICKS,
  )

  let band: BandScale | null = null
  let positions: (number | null)[] = []
  let categoryTicks: AxisTick[] = []
  let categoryStep = 0
  let categoryAt: (value: string | number) => number | null = () => null

  if (kind === 'time' || kind === 'linear') {
    const extent =
      kind === 'time'
        ? timeDomain(data, x.key)
        : valueDomain(
            data
              .map((row) => row[x.key])
              .filter((entry): entry is number => typeof entry === 'number'),
            'auto',
          )
    /*
     * A stated granularity sets the tick *interval*, not only the label.
     *
     * Five ticks across a month, formatted as months, gives
     * `Aug Aug Aug Aug Aug`. So when the spec states the unit, the tick count is
     * derived from the span in that unit, and d3 places its ticks on those
     * boundaries. The count is at least two, because one tick is not an axis.
     */
    const asked =
      kind === 'time' && x.ticks === undefined && x.format?.granularity !== undefined
        ? Math.max(2, Math.round((extent[1] - extent[0]) / GRANULARITY_MS[x.format.granularity]))
        : (x.ticks ?? DEFAULT_VALUE_TICKS)
    const scale = continuousScale(kind, extent, [0, bandLength], asked)
    categoryStep = scale.step
    categoryAt = (value) => {
      if (kind === 'linear') {
        return typeof value === 'number' && Number.isFinite(value) ? scale.at(value) : null
      }
      const parsed = typeof value === 'string' ? parseIso(value) : null
      return parsed === null ? null : scale.at(parsed.getTime())
    }
    positions = data.map((row) => {
      const raw = row[x.key]
      // A row the axis cannot place gets no position. `0` would put a mark at the
      // domain's left edge for a value that was never parsed.
      if (kind === 'linear')
        return typeof raw === 'number' && Number.isFinite(raw) ? scale.at(raw) : null
      const parsed = typeof raw === 'string' ? parseIso(raw) : null
      return parsed === null ? null : scale.at(parsed.getTime())
    })
    const format: ValueFormat | undefined =
      kind === 'time'
        ? { style: 'date', granularity: x.format?.granularity ?? granularityFor(scale.step) }
        : x.format
    categoryTicks = dropRepeats(
      scale.ticks.map((tick) => ({
        key: String(tick),
        at: scale.at(tick),
        label:
          kind === 'time'
            ? formatValue(new Date(tick).toISOString(), format, input.locale, input.messages)
            : formatValue(tick, format, input.locale),
      })),
    )
  } else {
    const domainLabels = bandDomain(data, x.key)
    const scale = bandXScale(domainLabels, bandLength)
    band = scale
    categoryAt = (value) => scale.center(String(value)) ?? null
    positions = data.map((row) => scale.center(String(row[x.key] ?? '')) ?? 0)
    const categories = categoriesOf(data, x, kind, input.locale, input.messages)
    /*
     * Labels are never rotated or clipped, so the axis drops whole labels at an
     * even stride once they stop fitting. What fits depends on the direction
     * they are stacked in.
     *
     * On a vertical chart the labels sit side by side along x, so the limit is
     * their *width*. On a horizontal chart they stack down the y axis, so the
     * limit is a **line box**; the gutter handles the width. Measuring width in
     * both cases would show only one long agent name on a horizontal chart,
     * which is the case horizontal orientation exists for.
     */
    const each = vertical
      ? categories.reduce(
          (most, text) => Math.max(most, estimateTextWidth(text, ESTIMATED_AXIS_TEXT_PX)),
          0,
        )
      : ESTIMATED_AXIS_TEXT_PX * 1.5
    const fits = labelCapacity(bandLength, each, LABEL_GAP_PX)
    const kept = new Set(thinLabels(domainLabels, fits))
    categoryTicks = domainLabels
      .filter((entry) => kept.has(entry))
      .map((entry) => ({
        key: entry,
        at: band?.center(entry) ?? 0,
        label: categories[domainLabels.indexOf(entry)] ?? entry,
      }))
  }

  const hasZero = domain[0] <= 0 && domain[1] >= 0
  const zero = value.at(hasZero ? 0 : domain[0])
  const valueTicks = value.ticks.map((tick) => ({
    key: String(tick),
    at: value.at(tick),
    label: formatValue(tick, y?.format, input.locale),
  }))

  return {
    value,
    band,
    positions,
    zero,
    hasZero,
    categoryAt,
    categoryStep,
    // Whichever axis runs along x is the one whose end labels are anchored. A
    // band axis drops whole labels to keep them apart. A continuous one keeps
    // the ticks its scale chose, and the gridlines drawn from them.
    valueTicks: vertical ? valueTicks : anchorAtEnds(valueTicks, valueLength, LABEL_GAP_PX, true),
    categoryTicks: vertical
      ? anchorAtEnds(categoryTicks, bandLength, LABEL_GAP_PX, band === null)
      : categoryTicks,
  }
}

/**
 * The visually hidden summary sentence for a reader who cannot see the plot.
 * The host's catalog composes it from the chart's name, its series' names and
 * its row count.
 */
export function summaryFor(
  messages: ChartMessages,
  label: string,
  series: readonly ResolvedSeries[],
  rowCount: number,
  selectable: boolean,
): string {
  return spokenSummary(
    messages.summary({ label, series: series.map((entry) => entry.label), points: rowCount }),
    messages,
    selectable,
  )
}

/**
 * The baseline of a label that belongs `gap` px above an anchor at `at`.
 *
 * The plot's `svg` cuts what is drawn past its edges, so a label above an
 * anchor near the top edge would lose its text. Where the text has no room
 * above the anchor it is drawn below it, the same gap away. The room is
 * `ESTIMATED_AXIS_TEXT_PX`, the height of the text above its baseline.
 */
export function labelBaseline(at: number, gap: number): number {
  const above = at - gap
  return above - ESTIMATED_AXIS_TEXT_PX >= 0 ? above : at + gap + ESTIMATED_AXIS_TEXT_PX
}

/** The gap between an endpoint's marker and its label. */
const END_LABEL_GAP = 2

export interface EndLabel {
  key: string
  /** The endpoint's position on the value axis, in px. */
  y: number
  /** The text's baseline: above the endpoint, or below it where the plot has no room above. */
  baseline: number
  text: string
}

/**
 * The endpoint value for each series: **selective, never a number per point**.
 *
 * All end labels are dropped when two would collide. The alternative is
 * nudging them apart, and a label moved away from its line can look like it
 * belongs to the wrong series. The legend and tooltip cover that case. The
 * collision is decided between baselines and not endpoints, because a label
 * drawn below its endpoint sits where the next series' label would be.
 */
export function endLabelsFor(
  data: readonly ChartDatum[],
  series: readonly ResolvedSeries[],
  valueOf: (key: string) => number | null,
  yAt: (value: number) => number,
  format: ValueFormat | undefined,
  locale: string | undefined,
): EndLabel[] {
  if (data.length === 0) return []

  const labels: EndLabel[] = []
  for (const entry of series) {
    const value = valueOf(entry.key)
    if (value === null) continue
    const y = yAt(value)
    labels.push({
      key: entry.key,
      y,
      baseline: labelBaseline(y, MARKER_RADIUS + END_LABEL_GAP),
      text: formatValue(value, format, locale),
    })
  }

  const sorted = labels.map((label) => label.baseline).sort((left, right) => left - right)
  for (let index = 1; index < sorted.length; index += 1) {
    const gap = (sorted[index] ?? 0) - (sorted[index - 1] ?? 0)
    if (gap < ESTIMATED_AXIS_TEXT_PX * 1.4) return []
  }
  return labels
}
