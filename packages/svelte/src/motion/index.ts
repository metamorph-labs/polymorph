/**
 * `@polymorph/svelte/motion`: the motion engine for Svelte members. It exports
 * the engine's environment, patterns and values, plus the presences that only
 * exist in Svelte. Application code must not import it, for the reason the
 * engine gives: motion choreography belongs to members, not to screens.
 */

export { prefersReducedMotion, readMotionEnvironment } from '@polymorph/engine/motion'
export type { MotionEnvironment } from '@polymorph/engine/motion'

export {
  patternKind,
  projectedOrigin,
  resolveBinding,
  transformOriginFor,
} from '@polymorph/engine/motion'
export type {
  AmbientMotion,
  CollapseMotion,
  Edge,
  Keyframe,
  OriginRule,
  PresenceMotion,
  PressMotion,
  ResolveOptions,
  ResolvedBinding,
  SpringMotion,
  Transition,
  TransitionMotion,
} from '@polymorph/engine/motion'

export {
  dampingRatio,
  isBindingName,
  MOTION_VALUES,
  PATTERN_KINDS,
  PATTERN_NAMES,
  REDUCED_MOTION_PROJECTION,
} from '@polymorph/engine/motion'
export type {
  AmbientRole,
  BindingName,
  DistanceName,
  DurationClass,
  EasingRole,
  PatternKind,
  PatternName,
  Projection,
  Spring,
  SpringRole,
} from '@polymorph/engine/motion'

export { useKeyedPresence, useListPresence, usePresence } from './presence.svelte'
export type { ListEntry, Present, PresenceOptions } from './presence.svelte'
