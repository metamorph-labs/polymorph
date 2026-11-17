import { linePath, type MaybePoint, type PathPoint } from './paths'

import { continuousScale, type ContinuousScale } from './scales'

/**
 * Polar geometry: the line chart's geometry in radial form
 * (`design/components/radar-chart.md`).
 *
 * Pure functions with no `'use client'`, like `geometry.ts`, because everything
 * here is arithmetic over an angle and a radius. The conventions are the tier's
 * existing ones, restated here so a radial member stays consistent with the
 * donut's ring. Angles run clockwise from 12 o'clock, and a point at angle θ is
 * at `(sin θ · r, −cos θ · r)` relative to the plot's centre. `ringArcs` and
 * the donut's readout bearing use the same frame.
 */

/** The bearing of axis `index` of `count`, in radians from 12 o'clock, clockwise. */
export function polarAngle(index: number, count: number): number {
  if (count <= 0) return 0
  return (Math.PI * 2 * index) / count
}

/** Every axis's bearing, in order. These are the spokes. */
export function polarAngles(count: number): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => polarAngle(index, count))
}

/** A bearing and a distance as a centre-relative point, in the SVG's own frame. */
export function polarPoint(angle: number, radius: number): PathPoint {
  return { x: Math.sin(angle) * radius, y: -Math.cos(angle) * radius }
}

/**
 * The one shared zero-based radial scale (`radar-chart.md`, "what it is not").
 *
 * Zero is at the centre and the nice'd maximum at the outer radius, with ~4
 * rings from the tick logic. These are the y-axis defaults applied radially.
 * There is exactly one per chart, shared by every axis and series. Separate
 * scales per axis are the classic way a radar chart misleads, so the engine
 * offers no way to build one per spoke. A non-positive maximum widens to 1, as
 * a flat cartesian domain does, because a single value still needs a position.
 */
export function radialScale(max: number, radius: number, tickCount = 4): ContinuousScale {
  const top = Number.isFinite(max) && max > 0 ? max : 1
  return continuousScale('linear', [0, top], [0, Math.max(0, radius)], tickCount)
}

/**
 * A concentric ring at one radius, drawn as a polygon through the spokes, not
 * a circle. A circle would imply a continuous scale between axes, which does
 * not exist. The scale exists only on the spokes.
 */
export function ringPath(angles: readonly number[], radius: number): string {
  if (angles.length === 0 || radius <= 0) return ''
  const path = angles
    .map((angle, index) => {
      const point = polarPoint(angle, radius)
      return `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`
    })
    .join('')
  return `${path}Z`
}

/**
 * A series' profile: its vertices joined spoke to spoke with straight
 * segments. A curve between spokes would draw values on axes that do not
 * exist, for the same reason rings are polygons.
 *
 * `null` is a gap. The polygon breaks at that vertex and never dips to zero. A
 * profile with no gaps closes with `Z` so the last join is a real join. A
 * profile with gaps is drawn as runs, and the wrap-around edge (last vertex
 * back to first) is drawn if and only if both of its ends exist.
 */
export function profilePath(points: readonly MaybePoint[]): string {
  if (points.length < 2) return ''
  if (points.every((point) => point !== null)) {
    const path = points
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'}${(point as PathPoint).x} ${(point as PathPoint).y}`,
      )
      .join('')
    return `${path}Z`
  }
  // Appending the first vertex draws the wrap edge when both its ends are
  // present. The shared `defined` predicate breaks the line at every gap.
  return linePath([...points, points[0] ?? null], 'linear')
}
