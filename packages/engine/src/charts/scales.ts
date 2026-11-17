import { bin, extent, max, min } from 'd3-array'
import { scaleBand, scaleLinear, scaleSqrt, scaleTime } from 'd3-scale'

import { parseIso } from './format'
import type { ChartDatum, ChartScaleKind, ChartYAxis } from './types'

/**
 * Scales, the first part of what the engine borrows from d3 (`docs/charts.md`;
 * `design/components/README-substrates.md`, chart physics).
 *
 * Only arithmetic is borrowed. `nice()` domains and tick selection are easy to
 * get slightly wrong, and a home-grown tick algorithm that labels 0, 3.7 and
 * 7.4 makes a chart look unfinished. No design decision is borrowed. This
 * module returns numbers, and every colour, length and duration around them
 * comes from the vocabulary.
 *
 * d3 is visible only in the engine: here, in `paths.ts` and in `series.ts`.
 * `polymorph/no-external-dataviz` confines it to that directory. Nothing below
 * is re-exported. Only this repository's own shapes leave this file, which
 * keeps d3 contained.
 */

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

export interface BandScale {
  kind: 'band'
  domain: readonly string[]
  /** Inline start of a category's band, in px from the plot's origin. */
  start(value: string): number | undefined
  /** The band's middle, where a line point or a tick label is placed. */
  center(value: string): number | undefined
  /** How wide one band is, before the mark's own thickness cap. */
  bandwidth: number
  /** The category under a pixel position, for hit testing and the crosshair. */
  at(px: number): string | undefined
}

export interface ContinuousScale {
  kind: 'time' | 'linear'
  domain: readonly [number, number]
  /** Value → px from the plot's origin. */
  at(value: number): number
  /** px → value, for hit testing. */
  invert(px: number): number
  /** Clean tick values from `nice()`, never the raw extent. */
  ticks: readonly number[]
  /** The distance between ticks. A time axis reads its granularity off this. */
  step: number
}

export type XScale = BandScale | ContinuousScale

export function isBand(scale: XScale): scale is BandScale {
  return scale.kind === 'band'
}

/* -------------------------------------------------------------------------- */
/* Domains                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A value axis's domain.
 *
 * `zero` anchors the domain at the origin. Bars always use `zero`, because a
 * bar's length is its value, so a baseline anywhere else misstates every
 * comparison on the chart. `auto` fits the data. It is for lines, where the
 * mark's position carries the value and the reader is looking at shape.
 *
 * A domain with no spread (one row, or every row equal) is widened instead of
 * left flat, because a zero-height scale divides by zero downstream and a
 * single point still needs a position.
 */
export function valueDomain(
  values: readonly number[],
  mode: ChartYAxis['domain'] = 'zero',
): [number, number] {
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) return [0, 1]

  let low = min(finite) ?? 0
  let high = max(finite) ?? 1
  if (mode !== 'auto') {
    low = Math.min(0, low)
    high = Math.max(0, high)
  }
  if (low === high) {
    // For `auto` both ends move, so the point sits in the middle. For `zero`
    // only the top moves, because that domain must start at the origin.
    if (mode === 'auto') {
      const pad = Math.abs(low) || 1
      return [low - pad, high + pad]
    }
    return high === 0 ? [0, 1] : [Math.min(0, low), Math.max(0, high)]
  }
  return [low, high]
}

/** Every finite number a set of series contributes, for `valueDomain`. */
export function seriesValues(rows: readonly ChartDatum[], keys: readonly string[]): number[] {
  const values: number[] = []
  for (const row of rows) {
    for (const key of keys) {
      const value = row[key]
      // `null` is a gap, not a zero. Treating it as 0 would pull the domain
      // toward the origin.
      if (typeof value === 'number' && Number.isFinite(value)) values.push(value)
    }
  }
  return values
}

/** The time extent of a column of ISO strings, as epoch milliseconds. */
export function timeDomain(rows: readonly ChartDatum[], key: string): [number, number] {
  const times: number[] = []
  for (const row of rows) {
    const value = row[key]
    if (typeof value !== 'string') continue
    const parsed = parseIso(value)
    if (parsed !== null) times.push(parsed.getTime())
  }
  const [low, high] = extent(times)
  if (low === undefined || high === undefined) return [0, 1]
  return low === high ? [low, low + 1] : [low, high]
}

/** The category column, in row order. The chart never reorders categories. */
export function bandDomain(rows: readonly ChartDatum[], key: string): string[] {
  const seen = new Set<string>()
  const domain: string[] = []
  for (const row of rows) {
    const value = row[key]
    const label = value === null ? '' : String(value)
    if (seen.has(label)) continue
    seen.add(label)
    domain.push(label)
  }
  return domain
}

/**
 * The scale a column uses when the spec does not say. Band is the default
 * because most charts compare named things. A column of ISO strings is the one
 * case worth inferring. The check covers every row, not just the first, so one
 * stray label does not turn a date axis into a category axis.
 */
export function inferScale(rows: readonly ChartDatum[], key: string): ChartScaleKind {
  if (rows.length === 0) return 'band'
  let strings = 0
  let dates = 0
  for (const row of rows) {
    const value = row[key]
    if (typeof value !== 'string') continue
    strings += 1
    if (parseIso(value) !== null) dates += 1
  }
  return strings > 0 && dates === strings ? 'time' : 'band'
}

/* -------------------------------------------------------------------------- */
/* Construction                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The share of a band left empty instead of covered by the mark. The leftover
 * is the spacing between groups (`bar-chart.md`: "the band's leftover is air").
 * The mark also caps its own thickness, so a two-column chart gets two bars of
 * proportionate width instead of two very wide ones.
 */
const BAND_PADDING_INNER = 0.2
const BAND_PADDING_OUTER = 0.1

export function bandXScale(domain: readonly string[], width: number): BandScale {
  const scale = scaleBand<string>()
    .domain([...domain])
    .range([0, Math.max(0, width)])
    .paddingInner(BAND_PADDING_INNER)
    .paddingOuter(BAND_PADDING_OUTER)

  const step = scale.step()
  return {
    kind: 'band',
    domain,
    start: (value) => scale(value),
    center: (value) => {
      const at = scale(value)
      return at === undefined ? undefined : at + scale.bandwidth() / 2
    },
    bandwidth: scale.bandwidth(),
    at: (px) => {
      if (domain.length === 0 || step === 0) return undefined
      const index = Math.floor((px - BAND_PADDING_OUTER * step) / step)
      return domain[Math.min(domain.length - 1, Math.max(0, index))]
    },
  }
}

/**
 * The tick count a continuous axis aims for when the spec does not set one.
 *
 * Four to five ticks matches the reference density and is as many as a reader
 * can keep in mind. A value axis works as a ruler, not as a table of values.
 */
export const DEFAULT_VALUE_TICKS = 5

export function continuousScale(
  kind: 'time' | 'linear',
  domain: readonly [number, number],
  range: readonly [number, number],
  tickCount = DEFAULT_VALUE_TICKS,
): ContinuousScale {
  /*
   * The two scales are built in separate branches instead of through one
   * variable typed to cover both. d3's time and linear scales take and return
   * different types at every method (`Date` against `number`). A union would
   * need a cast at every call, and those `as never` casts would hide useful type
   * errors.
   */
  if (kind === 'time') {
    // Local time, not UTC. `parseIso` reads a date-only value at local
    // midnight, so month and year boundaries must also be found in local time.
    // Otherwise a January tick lands on 31 December.
    const scale = scaleTime()
      .domain([new Date(domain[0]), new Date(domain[1])])
      .range([...range])
    // `nice()` is the most important borrowed piece. It rounds the domain out
    // to calendar boundaries, so ticks fall on dates a reader recognises
    // instead of on the data's uneven extent.
    scale.nice(tickCount)
    const ticks = scale.ticks(tickCount).map((date) => date.getTime())
    const [low, high] = scale.domain()
    const niceDomain: [number, number] = [low?.getTime() ?? 0, high?.getTime() ?? 1]
    return {
      kind,
      domain: niceDomain,
      at: (value) => scale(new Date(value)),
      invert: (px) => scale.invert(px).getTime(),
      ticks,
      step: stepOf(ticks, niceDomain),
    }
  }

  const scale = scaleLinear()
    .domain([...domain])
    .range([...range])
  scale.nice(tickCount)
  const ticks = scale.ticks(tickCount)
  const [low, high] = scale.domain()
  const niceDomain: [number, number] = [low ?? 0, high ?? 1]
  return {
    kind,
    domain: niceDomain,
    at: (value) => scale(value),
    invert: (px) => scale.invert(px),
    ticks,
    step: stepOf(ticks, niceDomain),
  }
}

/** The distance between ticks, or the domain's span when there is only one tick. */
function stepOf(ticks: readonly number[], domain: readonly [number, number]): number {
  if (ticks.length > 1) return (ticks[1] ?? 0) - (ticks[0] ?? 0)
  return domain[1] - domain[0]
}

/**
 * Band labels thinned to what fits.
 *
 * Labels are never rotated and never clipped. A rotated label is hard to read,
 * and a clipped one is misleading. A band axis therefore drops whole labels at
 * an even stride (every 2nd, every 3rd). When that is still unreadable, the fix
 * is a horizontal orientation or the tooltip and the table twin, not a smaller
 * font.
 *
 * The stride is even so the remaining labels stay evenly spaced. The first and
 * last labels are always kept, so the axis still shows the range it covers.
 *
 * No two labels are closer than the stride. `maxLabels` counts labels a full
 * label and gap apart, and the stride is the even spacing that keeps within
 * it, so two labels nearer than the stride can touch.
 */
export function thinLabels<T>(domain: readonly T[], maxLabels: number): T[] {
  if (domain.length === 0) return []
  if (maxLabels <= 1) {
    const first = domain[0]
    return first === undefined ? [] : [first]
  }
  const stride = Math.max(1, Math.ceil(domain.length / maxLabels))
  const kept = domain.filter((_, index) => index % stride === 0)
  const lastIndex = domain.length - 1
  const last = domain[lastIndex]
  /*
   * Keep the final category even if its gap is uneven. An axis whose labels
   * stop three bars from the end looks as if the data stops there too. Off the
   * stride, the final category is fewer bands from the label before it than the
   * stride, so it takes that label's place and the last gap is the longer one.
   * The first label always stays.
   */
  if (last !== undefined && lastIndex % stride !== 0) {
    if (kept.length > 1) kept.pop()
    kept.push(last)
  }
  return kept
}

/* -------------------------------------------------------------------------- */
/* Bins                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Which of `count` equal-width bins a value falls in. This is the heatmap's
 * entire colour choice.
 *
 * Values are quantised, never interpolated. The seven sequential steps are the
 * palette. They are measured for monotone lightness and a minimum separation
 * between neighbours, and a colour mixed between two of them is not checked by
 * any law. Binning also matches the question a heatmap answers, "which band is
 * this in". A continuous ramp suggests a precision the eye cannot read.
 *
 * A flat extent puts every value in the top bin instead of dividing by zero.
 * If every cell is 40, every cell is the maximum.
 */
export function binOf(value: number, extent: readonly [number, number], count: number): number {
  if (count <= 1) return 0
  const [low, high] = extent
  if (!(high > low)) return count - 1
  const at = Math.floor(((value - low) / (high - low)) * count)
  return Math.min(count - 1, Math.max(0, at))
}

/**
 * The diverging arm for a signed value (`design/components/heatmap.md`). This
 * is the diverging scale's entire colour choice, as `binOf` is for the
 * sequential scale.
 *
 * The range is symmetric, `[-A, +A]` with `A = max(|lo|, |hi|)` from
 * `signedAmplitude`, so equal magnitudes get equal intensity. Each side has
 * three equal-width magnitude bins. The mid means exactly zero: a value near
 * zero gets arm 1, because the mid colour states that the value is zero. The
 * result is a signed integer whose sign is the side: `-arms..-1` below zero,
 * `0` for zero itself, `1..arms` above. A caller maps `-3` to
 * `--pm-chart-neg-3` and `0` to `--pm-chart-mid` with no mapping in between.
 *
 * A non-positive amplitude means every measurement is zero, so every
 * measurement maps to the mid.
 */
export function signedBinOf(value: number, amplitude: number, arms = 3): number {
  if (value === 0 || amplitude <= 0 || arms < 1) return 0
  const share = Math.min(1, Math.abs(value) / amplitude)
  // The top of each side's range belongs to its outermost arm. `binOf` clamps
  // at the ceiling the same way, so an extreme value lands in the extreme bin.
  const step = Math.min(arms, Math.floor(share * arms) + 1)
  return value > 0 ? step : -step
}

/**
 * The one number that defines the symmetric range: how far the larger side
 * reaches.
 *
 * It is computed from the extent instead of from a sign-split pair, so a
 * dataset of only negative values still uses the full range. The range is
 * `[-A, +A]` even when one side is empty, because a lopsided range would make
 * the same magnitude more intense on one side of zero than on the other.
 */
export function signedAmplitude(extent: readonly [number, number]): number {
  return Math.max(Math.abs(extent[0]), Math.abs(extent[1]))
}

/** The extent of one numeric column, ignoring gaps. */
export function valueExtent(rows: readonly ChartDatum[], key: string): [number, number] {
  const numbers: number[] = []
  for (const row of rows) {
    const value = row[key]
    if (typeof value === 'number' && Number.isFinite(value)) numbers.push(value)
  }
  const [low, high] = extent(numbers)
  return low === undefined || high === undefined ? [0, 1] : [low, high]
}

/**
 * One bin of a sample: its edges in the measure's own units, and how many
 * observations fall in it. Every bin is half-open [from, to) except the last,
 * which is closed [from, to]. These are `d3-array.bin`'s own semantics, kept
 * unchanged so the sample's maximum lands in the last bin instead of creating
 * an empty one (`design/components/histogram.md`).
 */
export interface SampleBin {
  from: number
  to: number
  count: number
}

/**
 * The `d3-array.bin` wrapper, which keeps binning inside the engine.
 *
 * The Histogram is the only member whose input is a raw sample instead of
 * rows. Its binning is borrowed arithmetic: Sturges' default count and d3's
 * clean-threshold adjustment are the same kind of arithmetic as `nice()`, and
 * a home-grown threshold rule makes a histogram look unfinished. The call
 * lives here because of the containment law (`polymorph/no-external-dataviz`).
 * Members import this wrapper, never `d3-array`.
 *
 * `bins` is a target, like a tick count. d3 places the thresholds on clean
 * steps, so the actual count may differ, as it does for axis ticks. Non-finite
 * values are not observations and are dropped before binning. A sample that is
 * empty, or empty after dropping, produces no bins.
 */
export function binSample(sample: readonly number[], bins?: number): SampleBin[] {
  const finite = sample.filter((value) => Number.isFinite(value))
  if (finite.length === 0) return []

  const generator = bin()
  // d3's default is Sturges (⌈log₂ n⌉ + 1). A given `bins` replaces it but is
  // still only a target, because thresholds snap to clean steps either way.
  if (bins !== undefined) generator.thresholds(Math.max(1, Math.floor(bins)))

  return generator(finite).map((entry) => ({
    from: entry.x0 ?? 0,
    to: entry.x1 ?? 0,
    count: entry.length,
  }))
}

/**
 * The bubble register's radius (`design/components/scatter-chart.md`). Mark
 * area encodes the value, so the radius grows with the square root. A linear
 * radius would square the apparent differences. It uses `d3-scale`'s
 * `scaleSqrt`, wrapped here for the same containment reason as `binSample`.
 *
 * The range comes from the mark spec's two cells: 8px minimum and 24px maximum
 * diameters, which the member passes in as radii. A flat extent puts every
 * bubble at the maximum, as `binOf` does: if every observation is 40, every
 * observation is the largest.
 */
export function sqrtRadiusScale(
  extent: readonly [number, number],
  range: readonly [number, number],
): (value: number) => number {
  const [low, high] = extent
  const [minR, maxR] = range
  if (!(high > low)) return () => maxR
  const scale = scaleSqrt().domain([low, high]).range([minR, maxR])
  return (value) => scale(value)
}
