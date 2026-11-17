import { linePath, type MaybePoint, type PathPoint } from './paths'

/**
 * Sparkline's drawing (`design/components/sparkline.md`): the line and the
 * end dot in the drawing's own coordinates, which the CSS box scales. Every
 * framework's Sparkline draws it, so the scale, the gaps and the rule that a
 * trend needs two points are decided once.
 */

/** The drawing coordinates. The CSS box sets the real proportions. */
const VIEW = { width: 100, height: 25 } as const

/** Room for the end dot and half the stroke width at the extremes. */
const INSET = 4

const END_DOT_RADIUS = 3

export interface SparklineGeometry {
  /** The `viewBox` the drawing is in. */
  viewBox: string
  /** The stroke through every point, broken where a value is not finite. */
  d: string
  /** The dot on the current period, the last point; `null` when the last value is not finite. */
  end: (PathPoint & { r: number }) | null
}

/**
 * The drawing for `data`, or `null` when it has fewer than two finite values:
 * a trend needs two, and a lone dot would imply a shape the data does not
 * have. A non-finite entry is a gap, not a zero: it is left out of the scale
 * and the line breaks over it. A flat series has no span, so it is scaled by
 * one rather than divided by zero, and draws as a level line at the bottom of
 * the drawing.
 */
export function sparklineGeometry(data: readonly number[]): SparklineGeometry | null {
  const finite = data.filter((value) => Number.isFinite(value))
  if (finite.length < 2) return null

  const low = Math.min(...finite)
  const high = Math.max(...finite)
  const span = high - low || 1
  const step = (VIEW.width - INSET * 2) / (data.length - 1)

  const points: MaybePoint[] = data.map((value, index) =>
    Number.isFinite(value)
      ? {
          x: INSET + index * step,
          y: INSET + (1 - (value - low) / span) * (VIEW.height - INSET * 2),
        }
      : null,
  )
  const last = points[points.length - 1] ?? null

  return {
    viewBox: `0 0 ${VIEW.width} ${VIEW.height}`,
    d: linePath(points),
    end: last === null ? null : { ...last, r: END_DOT_RADIUS },
  }
}
