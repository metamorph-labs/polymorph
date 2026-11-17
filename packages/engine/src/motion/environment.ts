'use client'

import type { MotionTemperament } from '@polymorph/theme'

import {
  MOTION_VALUES,
  type AmbientRole,
  type DurationClass,
  type EasingRole,
  type Spring,
  type SpringRole,
} from './values'

/**
 * The motion environment, read from the DOM.
 *
 * The engine reads the same `--pm-motion-*` custom properties a CSS transition
 * reads. That is why temperament scaling happens at the token layer: with one
 * set of values, the engine and the stylesheet cannot disagree, and
 * `[data-motion="expressive"]` on a subtree rescales both.
 *
 * The temperament name is not a token and does not need to be. `durationScale`
 * can be recovered from the emitted control duration, and the four scales
 * (0 / 0.8 / 1 / 1.35) are distinct, so the name is recovered exactly from the
 * JSON the engine already reads. `distanceScale`, which no token carries, then
 * follows from the name.
 */

export interface MotionEnvironment {
  temperament: MotionTemperament
  /** 0 at `none`. Already applied to `durations` and kept for the mapping. */
  durationScale: number
  /** Multiplies every travel distance and scale depth. Engine-side (motion.md, temperaments). */
  distanceScale: number
  /** `prefers-reduced-motion: reduce`. Projects patterns regardless of temperament. */
  reducedMotion: boolean
  /** Milliseconds, already temperament-scaled by the emitter. */
  durations: Record<`${DurationClass}` | `${DurationClass}Exit`, number>
  easings: Record<EasingRole, string>
  springs: Record<SpringRole, Spring>
  pressScale: number
  /** Loop periods in ms. `0` means the loop is off. */
  ambient: Record<AmbientRole, number>
  /**
   * The resolved writing direction, which one pattern's travel depends on. A
   * `sheet` pinned to the inline-end edge exits to the right in LTR and to the
   * left in RTL, and a transform has no logical axis to express that.
   */
  direction: 'ltr' | 'rtl'
  /**
   * False when no theme is installed. The engine then does not animate. It does
   * not invent values, because motion is an enhancement and an unthemed page
   * has nothing to scale.
   */
  tokensPresent: boolean
}

const SPRING_ROLES = ['default', 'snappy', 'gentle'] as const

function readVar(styles: CSSStyleDeclaration, name: string): string {
  return styles.getPropertyValue(name).trim()
}

/** `140ms` / `0.14s` -> 140. NaN when absent. */
function readMs(styles: CSSStyleDeclaration, name: string): number {
  const raw = readVar(styles, name)
  if (raw === '') return Number.NaN
  const value = Number.parseFloat(raw)
  if (Number.isNaN(value)) return Number.NaN
  return raw.endsWith('ms') ? value : value * 1000
}

function readNumber(styles: CSSStyleDeclaration, name: string, fallback: number): number {
  const value = Number.parseFloat(readVar(styles, name))
  return Number.isNaN(value) ? fallback : value
}

function readSpring(styles: CSSStyleDeclaration, role: SpringRole): Spring {
  const fallback = MOTION_VALUES.springs.standard[role]
  return {
    stiffness: readNumber(styles, `--pm-motion-spring-${role}-stiffness`, fallback.stiffness),
    damping: readNumber(styles, `--pm-motion-spring-${role}-damping`, fallback.damping),
    mass: readNumber(styles, `--pm-motion-spring-${role}-mass`, fallback.mass),
  }
}

/**
 * Recover the temperament from the emitted control duration. Exact, because the
 * four duration scales are distinct and both sides of the division come from
 * `motion.json`.
 */
function temperamentFromScale(scale: number): MotionTemperament {
  let closest: MotionTemperament = 'standard'
  let smallest = Number.POSITIVE_INFINITY
  for (const [name, values] of Object.entries(MOTION_VALUES.temperaments)) {
    const distance = Math.abs(values.durationScale - scale)
    if (distance < smallest) {
      smallest = distance
      closest = name as MotionTemperament
    }
  }
  return closest
}

/**
 * The environment with no motion and every field filled.
 *
 * An unthemed element has it, and so does a render with no document. A
 * foundation that renders on a server uses it for that render and for the
 * hydration of its markup, because the two must write the same attributes and
 * a server cannot read a theme. `reducedMotion` is false there: a server
 * cannot read the preference either.
 */
export function stillMotionEnvironment(reducedMotion = false): MotionEnvironment {
  const zero = 0
  return {
    temperament: 'none',
    durationScale: 0,
    distanceScale: 0,
    reducedMotion,
    durations: {
      control: zero,
      controlExit: zero,
      surface: zero,
      surfaceExit: zero,
      overlay: zero,
      overlayExit: zero,
    },
    easings: {
      enter: cubicBezier(MOTION_VALUES.easings.enter),
      exit: cubicBezier(MOTION_VALUES.easings.exit),
      standard: cubicBezier(MOTION_VALUES.easings.standard),
    },
    springs: MOTION_VALUES.springs.standard,
    pressScale: 1,
    ambient: { shimmer: 0, spin: 0 },
    direction: 'ltr',
    tokensPresent: false,
  }
}

function cubicBezier(points: readonly number[]): string {
  return `cubic-bezier(${points.join(', ')})`
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Reads the environment that applies to `element`, or to the document's root
 * without one. A `[data-motion]` scope anywhere above it applies without the
 * engine walking the tree, because the cascade has already resolved it.
 *
 * Where there is no document, on a server, it returns the still environment.
 */
export function readMotionEnvironment(element?: Element): MotionEnvironment {
  if (typeof document === 'undefined') return stillMotionEnvironment()

  const reducedMotion = prefersReducedMotion()
  const styles = getComputedStyle(element ?? document.documentElement)

  const control = readMs(styles, '--pm-motion-duration-control')
  if (Number.isNaN(control)) return stillMotionEnvironment(reducedMotion)

  const durationScale = control / MOTION_VALUES.durationsMs.control
  const temperament = temperamentFromScale(durationScale)

  const springs = Object.fromEntries(
    SPRING_ROLES.map((role) => [role, readSpring(styles, role)]),
  ) as Record<SpringRole, Spring>

  return {
    temperament,
    durationScale,
    distanceScale: MOTION_VALUES.temperaments[temperament].distanceScale,
    reducedMotion,
    durations: {
      control,
      controlExit: readMs(styles, '--pm-motion-duration-control-exit'),
      surface: readMs(styles, '--pm-motion-duration-surface'),
      surfaceExit: readMs(styles, '--pm-motion-duration-surface-exit'),
      overlay: readMs(styles, '--pm-motion-duration-overlay'),
      overlayExit: readMs(styles, '--pm-motion-duration-overlay-exit'),
    },
    easings: {
      enter: readVar(styles, '--pm-motion-easing-enter'),
      exit: readVar(styles, '--pm-motion-easing-exit'),
      standard: readVar(styles, '--pm-motion-easing-standard'),
    },
    springs,
    pressScale: readNumber(styles, '--pm-motion-press-scale', 1),
    ambient: {
      shimmer: readMs(styles, '--pm-motion-ambient-shimmer') || 0,
      spin: readMs(styles, '--pm-motion-ambient-spin') || 0,
    },
    direction: styles.direction === 'rtl' ? 'rtl' : 'ltr',
    tokensPresent: true,
  }
}
