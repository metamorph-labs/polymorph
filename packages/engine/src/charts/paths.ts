import { arc, area, curveMonotoneX, curveStepAfter, line } from 'd3-shape'

/**
 * Mark paths, the second part of what the chart engine borrows from d3 after
 * the scales (`design/components/README-substrates.md`, chart physics). They
 * live in `@polymorph/engine`, beside the scales (`scales.ts`), because
 * neither has a framework in it and every framework's charts draw with them:
 * every Sparkline draws its line with `linePath`.
 *
 * `d3-shape` turns a list of points into a `d` string. The part worth
 * borrowing is `curveMonotoneX`, a spline that is smooth and does not overshoot
 * between points. A naive cubic through (10, 20, 10) rises above 20 and draws a
 * peak the data does not have. A chart that invents a maximum makes readers
 * distrust curves.
 *
 * The other borrowed piece is `defined()`, which makes `null` a gap instead of
 * a zero. An undefined point ends the current segment, and the next defined
 * point starts a new `M`. The line breaks, so a missing measurement is shown as
 * missing.
 */

export interface PathPoint {
  x: number
  y: number
}

/** A point the series does not have. The line breaks here. */
export type MaybePoint = PathPoint | null

const defined = (point: MaybePoint): point is PathPoint => point !== null

/**
 * The curves the tier draws. `monotone` is the default. `step` is
 * `curveStepAfter`, because a measurement holds until the next one
 * (`line-chart.md`). `linear` is internal to the engine. No member exposes it,
 * but a stacked band's walked edge and a radar's spoke-to-spoke stroke are
 * straight segments.
 */
export type PathCurve = 'monotone' | 'linear' | 'step'

function curveOf(generator: { curve(c: typeof curveMonotoneX): unknown }, curve: PathCurve): void {
  if (curve === 'monotone') generator.curve(curveMonotoneX)
  if (curve === 'step') generator.curve(curveStepAfter)
}

/**
 * A stroked series. `null` breaks it.
 *
 * Monotone-x is the default curve. A caller that wants straight segments
 * passes `curve: 'linear'`, which suits a step-shaped measurement such as a
 * count per bucket. A caller that wants the reader to see each value hold
 * until the next passes `'step'`.
 */
export function linePath(points: readonly MaybePoint[], curve: PathCurve = 'monotone'): string {
  const generator = line<MaybePoint>()
    .defined(defined)
    .x((point) => (point as PathPoint).x)
    .y((point) => (point as PathPoint).y)
  curveOf(generator, curve)
  return generator(points) ?? ''
}

/**
 * The wash under a stroked series, closed to a baseline.
 *
 * It uses the same `defined` predicate, so a gap also breaks the wash. An area
 * that bridged a gap would fill in data nobody measured. That is worse than a
 * line bridging it, because a filled region reads as a quantity. The wash uses
 * the stroke's curve, so the stroke and the fill of one series have the same
 * shape.
 */
export function areaPath(
  points: readonly MaybePoint[],
  baseline: number,
  curve: PathCurve = 'monotone',
): string {
  const generator = area<MaybePoint>()
    .defined(defined)
    .x((point) => (point as PathPoint).x)
    .y0(baseline)
    .y1((point) => (point as PathPoint).y)
  curveOf(generator, curve)
  return generator(points) ?? ''
}

/* -------------------------------------------------------------------------- */
/* Arcs                                                                        */
/* -------------------------------------------------------------------------- */

export interface ArcSegment {
  key: string
  /** The share of the ring this segment occupies, 0–1. */
  share: number
}

export interface RingArc {
  key: string
  /** Empty for a segment with no share, which takes none of the ring. */
  d: string
  /**
   * The pointer target: the same sector, inflated to the minimum hit size along
   * the ring and across it. It is transparent and drawn over the painted arc.
   * Empty when `d` is empty, because there is nothing on the ring to point at.
   */
  hit: string
  /** The segment's angle from 12 o'clock, in radians. A readout is placed here. */
  midAngle: number
}

export interface RingOptions {
  outerRadius: number
  /** Radial depth of the ring. This is the bar-thickness cap, applied radially. */
  thickness: number
  /** The surface gap between touching segments, at the mid-radius. */
  gapPx: number
  cornerRadius: number
  /**
   * The minimum size a pointer target is inflated to, along the ring and across
   * it. A 4% segment on a small ring is a two-pixel sliver, which is too small
   * to target (the interaction contract, `docs/charts.md`).
   */
  minHitPx?: number
}

/**
 * A ring of arcs, drawn clockwise from 12 o'clock.
 *
 * `d3-shape`'s `arc` is borrowed for the same reason as its curves. A rounded,
 * padded annular sector needs fiddly trigonometry that is easy to get subtly
 * wrong and hard to check by eye. `pie()`, the layout, is not borrowed.
 * Segment order is declaration order because colour follows the entity, and a
 * generator that sorted by value would recolour the chart whenever the data
 * changed.
 *
 * `padAngle` is derived from a pixel gap at the mid-radius instead of being set
 * as an angle. The rule is a 2px surface gap, and 2px is a different number of
 * radians on a small ring than on a large one.
 */
export function ringArcs(segments: readonly ArcSegment[], options: RingOptions): RingArc[] {
  const { outerRadius, thickness, gapPx, cornerRadius, minHitPx = 0 } = options
  const inner = Math.max(0, outerRadius - thickness)
  const mid = (outerRadius + inner) / 2
  const pad = mid <= 0 ? 0 : gapPx / mid

  const generator = arc<{ start: number; end: number }>()
    .innerRadius(inner)
    .outerRadius(outerRadius)
    .cornerRadius(cornerRadius)
    .padAngle(pad)
    .startAngle((d) => d.start)
    .endAngle((d) => d.end)

  /*
   * The target's generator has no pad and no rounding. Its radial depth grows
   * equally on both sides of the ring's centre line, so a thin ring still
   * catches a pointer just inside or just outside it.
   */
  const grow = Math.max(0, (minHitPx - thickness) / 2)
  const target = arc<{ start: number; end: number }>()
    .innerRadius(Math.max(0, inner - grow))
    .outerRadius(outerRadius + grow)
    .startAngle((d) => d.start)
    .endAngle((d) => d.end)

  // The minimum sweep, equal to `minHitPx` of arc at the mid-radius. Targets
  // may overlap on a ring of slivers. That is acceptable, because an
  // overlapping target can still be hit and a two-pixel one cannot.
  const minSweep = mid <= 0 ? 0 : minHitPx / mid

  /*
   * One entry per segment, including segments with no share. Those draw
   * nothing and have no target, but they still have a position. Returning them
   * keeps the result index-aligned with the input, so a caller never looks one
   * up by key. A zero segment that a reader reaches with the arrow keys also
   * has an angle to place its readout at.
   */
  const arcs: RingArc[] = []
  let at = 0
  for (const segment of segments) {
    const sweep = Math.max(0, segment.share) * Math.PI * 2
    const midAngle = at + sweep / 2
    const hitSweep = Math.max(sweep, minSweep)
    arcs.push({
      key: segment.key,
      // A segment with no share takes none of the ring, because a sliver would
      // suggest a quantity. It keeps its place in the legend and the twin,
      // where a zero is a real value.
      d: sweep > 0 ? (generator({ start: at, end: at + sweep }) ?? '') : '',
      hit:
        sweep > 0
          ? (target({ start: midAngle - hitSweep / 2, end: midAngle + hitSweep / 2 }) ?? '')
          : '',
      midAngle,
    })
    at += sweep
  }
  return arcs
}
