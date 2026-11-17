/**
 * Plot geometry: where the drawing area is, and what counts as a hit.
 *
 * These are pure functions with no `'use client'`, because `Sparkline` is an
 * axis-less glyph that renders on the server and uses the same arithmetic as
 * the cartesian members. Measuring the container is the one stateful part. It
 * lives in `measured-box.ts`, and each framework binds it where its members
 * run in the browser (React's `useMeasuredBox` carries the directive), so
 * importing this file never pulls a component into the client bundle.
 *
 * Width is measured, never scaled. A chart stretched by `viewBox` scales its
 * labels and stroke widths with the container, so a 2px hairline stops being
 * 2px. The plot lays out in real pixels at the measured width and lays out
 * again on resize. Every number below is a device pixel.
 */

/**
 * The minimum pointer target size, in px. This is the WCAG 2.5.8 minimum, the
 * same one the control ladder is built against.
 *
 * Marks are often thinner than this (a 2px line, a bar in a dense band), so a
 * chart's hit areas are not its painted marks. Each mark's target is inflated
 * to at least this size, through the surface gap. Pinpoint targets are an
 * anti-pattern (the interaction contract, `docs/charts.md`).
 */
export const HIT_TARGET_MIN = 24

/**
 * There is deliberately no `plotBox` function.
 *
 * It would subtract a y gutter, an x-axis band and a top inset from the
 * frame's box. The layout engine already handles the gutter and the band. The
 * frame's plot region is a two-by-two grid: the gutter is an `auto` column
 * sized to its own labels, and the band is an `auto` row taken out of the
 * height. The box the frame measures and passes to a member is therefore
 * already the drawing area. A function that computed it again would invite a
 * member to subtract the gutter and band twice.
 *
 * The top inset is not needed either, for a different reason. A `nice()`d
 * domain puts the top tick at or above the largest value, so no mark reaches
 * the plot's top edge unless it has a radius. A mark with a radius insets its
 * own scale range by that radius. That is the member's arithmetic, not the
 * frame's.
 */

/**
 * The index whose position is nearest a pixel. The crosshair uses it.
 *
 * The pointer targets an x value such as a date, not a 2px line (the
 * interaction contract, `docs/charts.md`). On a continuous x, the reading
 * snaps to the nearest x position and one tooltip lists every series there.
 * Positions are assumed sorted. They are, because they come from a scale over
 * rows in the given order.
 *
 * Returns `-1` for an empty set, so a caller can tell "nothing to point at"
 * from "the first one". A `null` position is a row with no place on the axis
 * (an unparseable date, a non-numeric linear value). It is never the nearest,
 * because pointing at it would put the reading on a mark that is not drawn.
 */
export function nearestIndex(positions: readonly (number | null)[], px: number): number {
  let best = -1
  let bestDistance = Infinity
  for (let index = 0; index < positions.length; index += 1) {
    const at = positions[index]
    if (at === null || at === undefined) continue
    const distance = Math.abs(at - px)
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  }
  return best
}

/** A point on the plot's plane, in px: a scatter mark or a radar vertex. */
export interface PlanePoint {
  x: number
  y: number
}

/**
 * The index whose point is nearest a pixel on the plane, within
 * `HIT_TARGET_MIN` by default. This is a linear scan for the forms where any
 * neighbour can be nearest (ScatterChart marks, RadarChart vertices).
 *
 * The scan is linear on purpose. Over the tier's declared size (≤ ~1k points)
 * its cost is not noticeable, and d3-delaunay is deferred until a measured
 * need. The deferral is recorded here so it does not become a dependency
 * unnoticed. The distance limit is the other half of the decision: more than
 * `within` px from every mark, the pointer is over the surface, not over data.
 * A scan that always returned a match would make the whole plot one target.
 *
 * `null` entries are rows with no place (a gap value, an unparseable date) and
 * are never the nearest, as in `nearestIndex`. Returns `-1` when nothing is
 * within reach. Ties keep the first point in data order.
 */
export function nearest2D(
  points: readonly (PlanePoint | null)[],
  x: number,
  y: number,
  within = HIT_TARGET_MIN,
): number {
  let best = -1
  let bestDistance = within * within
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (point === null || point === undefined) continue
    const dx = point.x - x
    const dy = point.y - y
    const distance = dx * dx + dy * dy
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  }
  return best
}

/**
 * A mark's pointer target, inflated to the minimum and centred on the mark.
 *
 * It returns a box instead of applying it, because members draw different
 * shapes over it: a bar puts a transparent rect behind its band, and a line
 * point puts one around its dot. The arithmetic is the same in both cases, so
 * it lives here.
 */
export function hitBox(
  center: number,
  size: number,
  min = HIT_TARGET_MIN,
): { start: number; size: number } {
  const inflated = Math.max(size, min)
  return { start: center - inflated / 2, size: inflated }
}

/**
 * How many band labels fit across a width without touching.
 *
 * Labels are never rotated and never clipped, so the axis drops whole labels
 * instead of shrinking or tilting them. This returns how many fit: the width
 * divided by the space one label takes, gap included.
 */
export function labelCapacity(width: number, labelWidth: number, gap: number): number {
  const each = labelWidth + gap
  if (each <= 0) return 1
  return Math.max(1, Math.floor(width / each))
}

/**
 * The width of a run of text, estimated from the tabular digit advance.
 *
 * Used only before a real measurement exists, on the first pass before
 * anything has been laid out. Tick labels use `--pm-font-numeric` (tabular
 * figures), so every digit has the same advance and the estimate is exact for
 * the numbers that make up most of an axis. A proportional word is
 * over-estimated, which errs toward dropping a label instead of overlapping
 * two.
 */
export function estimateTextWidth(text: string, fontSizePx: number): number {
  // 0.6em is the tabular advance of every family on the pinned list, to within
  // a small margin. A real measurement is preferred; this is the fallback.
  return text.length * fontSizePx * 0.6
}

/**
 * The radius on a bar's data end. Only that end is rounded.
 *
 * Progress's rule applies here too (`bar-chart.md`): data ends stay rounded in
 * every geometry, including `sharp`, because a 4px mark with square ends looks
 * like a rendering artifact, not a design choice. The baseline end stays
 * square because it is not data. It is the zero the bar is measured from, and
 * rounding it would lift the mark off its axis.
 */
export const BAR_END_RADIUS = 4

/** The side of a bar that is its data end, away from the baseline. */
export type BarEnd = 'top' | 'bottom' | 'left' | 'right'

/**
 * A bar, drawn as a path instead of a `<rect>`.
 *
 * A rect rounds all four corners or none (`rx` is not per-corner), and this
 * mark needs exactly two. The shape is drawn rather than clipped so the
 * geometry is in the `d` string, where a test can read it. The radius is
 * clamped, so a bar shorter than its radius becomes a small stub instead of
 * turning inside out.
 */
export function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  end: BarEnd,
  radius = BAR_END_RADIUS,
): string {
  const w = Math.max(0, width)
  const h = Math.max(0, height)
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  const [x1, y1] = [x + w, y + h]

  // Each branch walks the outline from the baseline end, so the two rounded
  // corners are always the pair furthest from zero.
  switch (end) {
    case 'top':
      return `M${x} ${y1}L${x} ${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}L${x1 - r} ${y}A${r} ${r} 0 0 1 ${x1} ${y + r}L${x1} ${y1}Z`
    case 'bottom':
      return `M${x} ${y}L${x} ${y1 - r}A${r} ${r} 0 0 0 ${x + r} ${y1}L${x1 - r} ${y1}A${r} ${r} 0 0 0 ${x1} ${y1 - r}L${x1} ${y}Z`
    case 'right':
      return `M${x} ${y}L${x1 - r} ${y}A${r} ${r} 0 0 1 ${x1} ${y + r}L${x1} ${y1 - r}A${r} ${r} 0 0 1 ${x1 - r} ${y1}L${x} ${y1}Z`
    default:
      return `M${x1} ${y}L${x + r} ${y}A${r} ${r} 0 0 0 ${x} ${y + r}L${x} ${y1 - r}A${r} ${r} 0 0 0 ${x + r} ${y1}L${x1} ${y1}Z`
  }
}

/** An SVG path `d` for a horizontal or vertical rule, in whole pixels. */
export function rulePath(from: readonly [number, number], to: readonly [number, number]): string {
  return `M${from[0]} ${from[1]}L${to[0]} ${to[1]}`
}

/**
 * Snaps a pixel position to the half-pixel grid for odd stroke widths.
 *
 * A 1px hairline drawn on an integer coordinate straddles two device pixels and
 * renders as a blurred 2px line at half opacity.
 */
export function crisp(value: number, strokeWidth = 1): number {
  return strokeWidth % 2 === 0 ? Math.round(value) : Math.round(value) + 0.5
}
