/**
 * `@polymorph/react/motion`: the motion engine for React members. It exports
 * the engine's environment, patterns and values, plus the presence and
 * indicator components that only exist in React.
 *
 * The list is explicit, not `export *`. The engine also exports `animateTo`,
 * `animateProperty` and `setFrame`. The presence components below run on them
 * and a member never calls them, so this entry does not re-export them.
 * `packaging.test.ts` checks the build for them.
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

export { MotionIndicator } from './indicator'
export type { MotionIndicatorProps } from './indicator'

export { MotionPresence, MotionSurface, useMotionEnvironment, useProjectedOrigin } from './presence'
export type { MotionSurfaceProps } from './presence'
