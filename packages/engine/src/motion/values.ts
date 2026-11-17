import motionJson from '../../../../design/motion/motion.json' with { type: 'json' }

/**
 * The motion values, typed. They are read from `design/motion/motion.json`, not
 * copied. The JSON is the machine-readable form of `design/motion/motion.md`,
 * and the motion engine reads it.
 *
 * Some values are tokens and some live only here (motion.md, token emission).
 * Durations, easings, springs, press scale and ambient periods are tokens
 * because CSS reads them, so a CSS transition rescales with temperament exactly
 * as the engine does. Distances, scale-froms, origins, projections and bindings
 * are engine-only data. CSS never reads them, and the token count is limited.
 */

export const MOTION_VALUES = motionJson

// Typed from `MOTION_VALUES`, not from the import. `tsc` writes the constant's
// shape into the published declarations. A type naming `motionJson` would
// instead import `design/motion/motion.json`, which no consumer installs.
export type DurationClass = keyof typeof MOTION_VALUES.durationsMs
export type EasingRole = keyof typeof MOTION_VALUES.easings
export type DistanceName = keyof typeof MOTION_VALUES.distancesPx
export type SpringRole = keyof (typeof MOTION_VALUES.springs)['standard']
export type AmbientRole = keyof typeof MOTION_VALUES.ambientPeriodsMs
export type BindingName = keyof typeof MOTION_VALUES.bindings

/**
 * Every pattern a spec may bind. `press-feedback` is the only micro-pattern with
 * no entry in `patterns`. It is pure CSS (motion.md, press feedback), so it has
 * values but no enter/exit choreography.
 */
export const PATTERN_NAMES = [
  'fade',
  'scale-fade',
  'slide-fade',
  'collapse',
  'spring-pop',
  'shimmer',
  'spin',
  'sheet',
  'press-feedback',
] as const

export type PatternName = (typeof PATTERN_NAMES)[number]

/**
 * Which properties a pattern may animate. This makes the compositor-only motion
 * law (`docs/motion.md`) checkable.
 *
 *  - `interactive`: transform and opacity only. Anything else causes main-thread
 *    layout while the user is waiting.
 *  - `container`: may animate its own size. `collapse` is the only member, and
 *    only on non-interactive containers (motion.md, interruption laws).
 *  - `ambient`: a loop, transform only, turned off globally under reduced motion.
 */
export const PATTERN_KINDS = {
  fade: 'interactive',
  'scale-fade': 'interactive',
  'slide-fade': 'interactive',
  'spring-pop': 'interactive',
  'press-feedback': 'interactive',
  // Transform only. A sheet keeps opacity 1 throughout (motion.md, pattern
  // definitions). It is still `interactive`, because the kind governs which
  // properties may animate, and a sheet animates a compositor property.
  sheet: 'interactive',
  collapse: 'container',
  shimmer: 'ambient',
  spin: 'ambient',
} as const satisfies Record<PatternName, 'interactive' | 'container' | 'ambient'>

export type PatternKind = (typeof PATTERN_KINDS)[PatternName]

/**
 * Reduced-motion projection per pattern (motion.md, reduced-motion
 * projections), applied **regardless of temperament**. Durations are kept,
 * because an opacity change is vestibular-safe. Only `none` sets time to zero.
 *
 * Copied from that table, not parsed from the JSON, because the JSON's
 * `reducedMotion` field is prose (`"off (static glyph)"`). `values.test.ts`
 * checks this map against that prose so the two stay in sync.
 */
export const REDUCED_MOTION_PROJECTION = {
  fade: 'fade',
  'scale-fade': 'fade',
  'slide-fade': 'fade',
  'spring-pop': 'fade',
  collapse: 'instant',
  shimmer: 'off',
  spin: 'off',
  // The only projection that adds a channel instead of removing one. A sheet
  // has no fade to fall back to, so it appears in place at opacity 0→1.
  sheet: 'fade',
  'press-feedback': 'off',
} as const satisfies Record<PatternName, PatternName | 'instant' | 'off'>

export type Projection = (typeof REDUCED_MOTION_PROJECTION)[PatternName]

export interface Spring {
  stiffness: number
  damping: number
  mass: number
}

/** Damping ratio ζ = damping / 2√(stiffness · mass), the springs' design parameter. */
export function dampingRatio(spring: Spring): number {
  return spring.damping / (2 * Math.sqrt(spring.stiffness * spring.mass))
}

export function isBindingName(value: string): value is BindingName {
  return Object.hasOwn(MOTION_VALUES.bindings, value)
}
