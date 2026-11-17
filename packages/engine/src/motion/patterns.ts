import type { MotionEnvironment } from './environment'
import {
  MOTION_VALUES,
  PATTERN_KINDS,
  REDUCED_MOTION_PROJECTION,
  type BindingName,
  type DistanceName,
  type DurationClass,
  type PatternName,
  type Spring,
  type SpringRole,
} from './values'

/**
 * The pattern registry: takes a binding name and returns concrete numbers.
 *
 * Nothing here defines new motion. Every value is derived: the exit from the
 * enter (×0.65), the duration from the element's size class, the distance and
 * scale depth from the temperament, and the projection from the reduced-motion
 * table. A component names a binding and gets the full choreography. It cannot
 * name a duration.
 *
 * `motion.json`'s bindings come in six shapes, so the resolver returns a
 * discriminated union instead of treating them all as enter/exit pairs. A
 * spring on a switch thumb is not a presence transition and is not typed as one.
 */

export type Edge = 'top' | 'right' | 'bottom' | 'left'
export type OriginRule = 'anchored' | 'pointer-launched' | 'default'

/**
 * Which edge a sheet is pinned to, in logical terms. The physical direction is
 * resolved here from the environment, not by the component, so a recipe does
 * not need to know the page's reading direction.
 */
export type SheetSide = 'start' | 'end' | 'bottom'

/**
 * Value names as `motion` understands them: transform channels, not CSS.
 *
 * `x`/`y` accept a string for the one pattern whose travel is a proportion of
 * the element instead of a distance in pixels (`sheet`, motion.md pattern
 * definitions).
 */
export interface Keyframe {
  opacity?: number
  scale?: number
  x?: number | string
  y?: number | string
}

/** A `motion` transition. Durations are seconds, because that is its unit. */
export interface Transition {
  duration?: number
  ease?: readonly number[]
  type?: 'spring'
  stiffness?: number
  damping?: number
  mass?: number
  /** Per-value overrides, for a pattern whose channels use different timing. */
  opacity?: Transition
  scale?: Transition
}

export interface PresenceMotion {
  kind: 'presence'
  binding: BindingName
  pattern: PatternName
  /** The pattern that runs after the reduced-motion projection is applied. */
  effective: PatternName
  projected: boolean
  initial: Keyframe
  animate: Keyframe
  exit: Keyframe
  enterTransition: Transition
  exitTransition: Transition
  transformOrigin?: string
  /** The properties the engine animates. The law test reads this. */
  properties: ('opacity' | 'transform')[]
}

export interface CollapseMotion {
  kind: 'collapse'
  binding: BindingName
  axis: 'inline' | 'block'
  mode: 'persistent' | 'exit'
  sizeDurationMs: number
  sizeEasing: readonly number[]
  /** Half the size duration (the pattern's 0.5 split), in both modes. */
  contentFadeMs: number
  /** In `exit` mode the content fades before the size changes. */
  contentFadeLeads: boolean
  projected: boolean
}

export interface SpringMotion {
  kind: 'spring'
  binding: BindingName
  spring: Spring
  /** Instant at `none` and under reduced motion, so the change applies at once. */
  transition: Transition
  properties: ('transform' | 'opacity')[]
}

export interface TransitionMotion {
  kind: 'transition'
  binding: BindingName
  durationMs: number
  easing: readonly number[]
  properties: string[]
}

export interface AmbientMotion {
  kind: 'ambient'
  binding: BindingName
  pattern: 'shimmer' | 'spin'
  /** `0` means the loop is off, at `none` or under reduced motion. */
  periodMs: number
}

export interface PressMotion {
  kind: 'press'
  binding: BindingName
  /** `1` means no transform, and colour states alone give the feedback. */
  scale: number
  downMs: number
  downEasing: readonly number[]
  releaseSpring: Spring
}

export type ResolvedBinding =
  PresenceMotion | CollapseMotion | SpringMotion | TransitionMotion | AmbientMotion | PressMotion

export interface ResolveOptions {
  /** For an anchored surface: Radix's `data-side` / `data-align`. */
  side?: Edge
  align?: 'start' | 'center' | 'end'
  /** For a pointer-launched panel: a pre-computed `transform-origin`. */
  origin?: string
  /** For a `sheet`: which edge the panel is pinned to. */
  sheetSide?: SheetSide
}

/** The heterogeneous JSON entry, read once and narrowed here. */
interface RawBinding {
  pattern?: string
  class?: string
  distance?: string
  edge?: string
  origin?: string
  spring?: string
  mode?: string
  axis?: string
  easing?: string
  properties?: string[]
  plus?: string
  /**
   * An exit that is not the enter reversed. A TagInput chip enters with
   * `scale-fade` and exits with a plain `fade`, because the row closing the gap
   * behind it completes the exit. A chip shrinking while its neighbours slide
   * would be two motions where the spec asks for one.
   *
   * Only the keyframe changes. Duration class, easing and projection come from
   * the binding, so an exit override cannot introduce a second set of numbers.
   */
  exit?: string
}

function raw(name: BindingName): RawBinding {
  return MOTION_VALUES.bindings[name] as RawBinding
}

const DEFAULT_DISTANCE_BY_CLASS = { control: 'sm', surface: 'md', overlay: 'lg' } as const

/**
 * A sheet's full width or height. It is the only travel in the system that is
 * not a distance token. It equals the panel's own size, so the panel starts
 * exactly off canvas whatever its size.
 */
const SHEET_TRAVEL = '100%'

/** The off-canvas direction for an inline-pinned sheet, given the page's direction. */
function inlineTravel(side: 'start' | 'end', direction: 'ltr' | 'rtl'): string {
  const towardEnd = (side === 'end') === (direction === 'ltr')
  return towardEnd ? SHEET_TRAVEL : `-${SHEET_TRAVEL}`
}

function exitDuration(env: MotionEnvironment, durationClass: DurationClass): number {
  return env.durations[`${durationClass}Exit`]
}

function seconds(ms: number): number {
  return ms / 1000
}

/** At `none` the engine is bypassed (motion.md, springs): no spring and zero duration. */
function instant(): Transition {
  return { duration: 0 }
}

function springTransition(spring: Spring): Transition {
  return { type: 'spring', stiffness: spring.stiffness, damping: spring.damping, mass: spring.mass }
}

/**
 * Where an anchored surface grows from: the edge facing its trigger, adjusted on
 * the cross axis by `align`. A menu opening below its button grows from its own
 * top edge, so it appears to come out of the button.
 */
export function transformOriginFor(side?: Edge, align?: 'start' | 'center' | 'end'): string {
  if (!side) return 'center'

  const cross =
    align === 'start' ? 'start' : align === 'end' ? 'end' : ('center' as 'start' | 'center' | 'end')

  switch (side) {
    case 'bottom':
      return `${horizontal(cross)} top`
    case 'top':
      return `${horizontal(cross)} bottom`
    case 'right':
      return `left ${vertical(cross)}`
    case 'left':
      return `right ${vertical(cross)}`
  }
}

function horizontal(cross: 'start' | 'center' | 'end'): string {
  return cross === 'start' ? 'left' : cross === 'end' ? 'right' : 'center'
}

function vertical(cross: 'start' | 'center' | 'end'): string {
  return cross === 'start' ? 'top' : cross === 'end' ? 'bottom' : 'center'
}

/**
 * A pointer-launched panel grows from the trigger's position, projected into the
 * panel's own box and clamped to it. A dialog opened from a button in the corner
 * therefore does not appear to expand from outside itself.
 */
export function projectedOrigin(trigger: Element | null, panel: Element): string {
  if (!trigger) return 'center'
  const from = trigger.getBoundingClientRect()
  const to = panel.getBoundingClientRect()
  if (to.width === 0 || to.height === 0) return 'center'

  const x = clamp(from.left + from.width / 2 - to.left, 0, to.width)
  const y = clamp(from.top + from.height / 2 - to.top, 0, to.height)
  return `${Math.round(x)}px ${Math.round(y)}px`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * The exit keyframe for a binding that declares its own exit.
 *
 * `fade` is the only override allowed, and that restriction is the law. An exit
 * override may only remove an effect from an exit. `taginput.chip` enters with
 * a pop and exits with a plain fade, because the row closing the gap behind it
 * completes the motion. An override must never add choreography the enter did
 * not have, because that would be two bindings under one name. `fade` is also
 * its own reduced-motion projection, so an override needs no separate
 * projection.
 */
function exitFrameOf(pattern: string): Keyframe {
  if (pattern !== 'fade') {
    throw new Error(
      `Binding exit "${pattern}" is not lawful — an exit override may only be "fade".`,
    )
  }
  return { opacity: 0 }
}

function resolvePresence(
  binding: BindingName,
  pattern: PatternName,
  env: MotionEnvironment,
  options: ResolveOptions,
): PresenceMotion {
  const entry = raw(binding)
  const durationClass = (entry.class ?? 'control') as DurationClass
  const still = env.temperament === 'none'

  // Reduced motion projects regardless of temperament and keeps the duration,
  // because an opacity change is vestibular-safe (motion.md, reduced-motion
  // projections).
  const effective = (
    env.reducedMotion ? REDUCED_MOTION_PROJECTION[pattern] : pattern
  ) as PatternName
  const projected = effective !== pattern

  // Every pattern here fades except `sheet`. A sheet keeps opacity 1 throughout
  // because it slides in instead of fading in (motion.md, pattern definitions).
  // `fade` is only what it projects to under reduced motion.
  const fades = effective !== 'sheet'
  const from: Keyframe = fades ? { opacity: 0 } : {}
  const to: Keyframe = fades ? { opacity: 1 } : {}
  const properties: ('opacity' | 'transform')[] = fades ? ['opacity'] : []

  // `still` skips the travel instead of only zeroing its duration. At `none` the
  // engine is bypassed (motion.md, springs), and a 100% offset applied for one
  // frame before an instant transition makes the panel flicker off canvas.
  if (effective === 'sheet' && !still) {
    const pinned = options.sheetSide ?? (entry.edge as SheetSide | undefined) ?? 'end'
    // 100% is the panel's geometry, not a travel distance. `distanceScale` does
    // not apply, so no temperament leaves a sheet partly on the page.
    if (pinned === 'bottom') from.y = SHEET_TRAVEL
    else from.x = inlineTravel(pinned, env.direction)
    to.x = 0
    to.y = 0
    properties.push('transform')
  }

  if (effective === 'scale-fade') {
    const base = MOTION_VALUES.scaleFrom[durationClass]
    from.scale = 1 - (1 - base) * env.distanceScale
    to.scale = 1
    properties.push('transform')
  }

  if (effective === 'slide-fade') {
    const name = (entry.distance ?? DEFAULT_DISTANCE_BY_CLASS[durationClass]) as DistanceName
    const travel = MOTION_VALUES.distancesPx[name] * env.distanceScale
    const edge = (entry.edge ?? 'bottom') as Edge
    if (edge === 'top') from.y = -travel
    else if (edge === 'bottom') from.y = travel
    else if (edge === 'left') from.x = -travel
    else from.x = travel
    to.x = 0
    to.y = 0
    properties.push('transform')
  }

  if (effective === 'spring-pop') {
    from.scale = 0.5
    to.scale = 1
    properties.push('transform')
  }

  const enterMs = env.durations[durationClass]
  const exitMs = exitDuration(env, durationClass)

  let enterTransition: Transition
  let exitTransition: Transition

  if (still) {
    enterTransition = instant()
    exitTransition = instant()
  } else if (effective === 'spring-pop') {
    // Scale uses the spring and opacity does not. The pop comes from the spring,
    // and fading on the same curve would look like a bounce in brightness.
    enterTransition = {
      opacity: {
        duration: seconds(enterMs * MOTION_VALUES.pressFeedback.downDurationFactor),
        ease: MOTION_VALUES.easings.standard,
      },
      scale: springTransition(env.springs.snappy),
    }
    // A pop does not reverse on exit. The exit is a plain fade.
    exitTransition = { duration: seconds(exitMs), ease: MOTION_VALUES.easings.exit }
  } else if (entry.spring) {
    enterTransition = springTransition(env.springs[entry.spring as SpringRole])
    exitTransition = { duration: seconds(exitMs), ease: MOTION_VALUES.easings.exit }
  } else {
    enterTransition = { duration: seconds(enterMs), ease: MOTION_VALUES.easings.enter }
    exitTransition = { duration: seconds(exitMs), ease: MOTION_VALUES.easings.exit }
  }

  // A declared exit takes precedence. Otherwise the exit is the enter reversed,
  // except for a pop, which exits with a fade.
  const exit: Keyframe =
    entry.exit === undefined
      ? effective === 'spring-pop'
        ? { opacity: 0 }
        : { ...from }
      : exitFrameOf(entry.exit)

  const origin = resolveOrigin(entry.origin as OriginRule | undefined, options)

  return {
    kind: 'presence',
    binding,
    pattern,
    effective,
    projected,
    initial: from,
    animate: to,
    exit,
    enterTransition,
    exitTransition,
    ...(origin === undefined ? {} : { transformOrigin: origin }),
    properties,
  }
}

function resolveOrigin(rule: OriginRule | undefined, options: ResolveOptions): string | undefined {
  if (rule === 'anchored') return transformOriginFor(options.side, options.align)
  if (rule === 'pointer-launched') return options.origin ?? 'center'
  return undefined
}

function resolveCollapse(binding: BindingName, env: MotionEnvironment): CollapseMotion {
  const entry = raw(binding)
  const mode = (entry.mode ?? 'persistent') as 'persistent' | 'exit'
  const projected = env.reducedMotion || env.temperament === 'none'

  const sizeDurationMs = projected
    ? 0
    : mode === 'exit'
      ? exitDuration(env, 'surface')
      : env.durations.surface

  return {
    kind: 'collapse',
    binding,
    axis: (entry.axis ?? 'block') as 'inline' | 'block',
    mode,
    sizeDurationMs,
    sizeEasing: mode === 'exit' ? MOTION_VALUES.easings.exit : MOTION_VALUES.easings.standard,
    // Content still fades under reduced motion. Only the size change is instant.
    contentFadeMs:
      (env.reducedMotion && env.temperament !== 'none'
        ? mode === 'exit'
          ? exitDuration(env, 'surface')
          : env.durations.surface
        : sizeDurationMs) * 0.5,
    contentFadeLeads: mode === 'exit',
    projected,
  }
}

function resolveSpring(binding: BindingName, env: MotionEnvironment): SpringMotion {
  const entry = raw(binding)
  const spring = env.springs[(entry.spring ?? 'default') as SpringRole]
  const still = env.temperament === 'none' || env.reducedMotion
  return {
    kind: 'spring',
    binding,
    spring,
    transition: still ? instant() : springTransition(spring),
    properties: ['transform'],
  }
}

function resolveTransition(binding: BindingName, env: MotionEnvironment): TransitionMotion {
  const entry = raw(binding)
  const durationClass = (entry.class ?? 'control') as DurationClass
  const still = env.temperament === 'none' || env.reducedMotion
  return {
    kind: 'transition',
    binding,
    durationMs: still ? 0 : env.durations[durationClass],
    easing:
      MOTION_VALUES.easings[(entry.easing ?? 'standard') as keyof typeof MOTION_VALUES.easings],
    properties: entry.properties ?? ['transform'],
  }
}

function resolveAmbient(
  binding: BindingName,
  pattern: 'shimmer' | 'spin',
  env: MotionEnvironment,
): AmbientMotion {
  return {
    kind: 'ambient',
    binding,
    pattern,
    periodMs: env.reducedMotion ? 0 : env.ambient[pattern],
  }
}

function resolvePress(binding: BindingName, env: MotionEnvironment): PressMotion {
  const press = MOTION_VALUES.pressFeedback
  return {
    kind: 'press',
    binding,
    scale: env.reducedMotion ? 1 : env.pressScale,
    downMs: env.durations.control * press.downDurationFactor,
    downEasing: MOTION_VALUES.easings[press.downEasing as keyof typeof MOTION_VALUES.easings],
    releaseSpring: env.springs[press.releaseSpring as SpringRole],
  }
}

/**
 * The single entry point. `patterns.test.ts` asserts that every binding in
 * `motion.json` resolves, so a binding added to the spec without engine support
 * fails a test instead of leaving a component silently without motion.
 */
export function resolveBinding(
  binding: BindingName,
  env: MotionEnvironment,
  options: ResolveOptions = {},
): ResolvedBinding {
  const entry = raw(binding)
  const pattern = entry.pattern as PatternName | undefined

  if (pattern === undefined) {
    // A binding with no pattern is a bare spring or a bare transition.
    return entry.spring ? resolveSpring(binding, env) : resolveTransition(binding, env)
  }

  if (pattern === 'press-feedback') return resolvePress(binding, env)
  if (pattern === 'shimmer' || pattern === 'spin') return resolveAmbient(binding, pattern, env)
  if (pattern === 'collapse') return resolveCollapse(binding, env)

  return resolvePresence(binding, pattern, env, options)
}

/** Which kind of properties a pattern may animate. Law 2 reads this. */
export function patternKind(pattern: PatternName) {
  return PATTERN_KINDS[pattern]
}
