/**
 * `@polymorph/engine/motion`: the motion engine, for component internals only.
 *
 * **Nothing here is re-exported from the engine's root**, and the packaging law
 * checks that in the build (`packaging.test.ts`). A component names a binding
 * from `motion.json` and never sees a duration or a spring: `resolveBinding`
 * turns the binding into keyframes and transitions for the current
 * environment, and `animateTo` runs them on the browser's Web Animations API
 * with no animation library.
 *
 * It is a subpath, not a root export. Component source needs the engine,
 * application code must never reach it, and a package boundary is the only
 * place that can be enforced by more than a comment. Each foundation builds
 * its presence on this module: React's components (`MotionPresence`,
 * `MotionSurface`, `MotionIndicator`) live in `@polymorph/react/motion`, which
 * re-exports the rest of it, and the Vue, Svelte, Solid and Angular
 * foundations have their own. `animateTo`, `animateProperty` and `setFrame`
 * are exported for those presence implementations and are not part of any
 * member's surface. The motion CSS (`motion.module.css`'s state feedback and
 * press scale) ships in `@polymorph/recipes` beside the recipes that compose
 * it, because a CSS Module's `composes … from` cannot name a package.
 */

export { animateProperty, animateTo, setFrame } from './animate'

export { prefersReducedMotion, readMotionEnvironment, stillMotionEnvironment } from './environment'
export type { MotionEnvironment } from './environment'

export { patternKind, projectedOrigin, resolveBinding, transformOriginFor } from './patterns'
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
} from './patterns'

export {
  dampingRatio,
  isBindingName,
  MOTION_VALUES,
  PATTERN_KINDS,
  PATTERN_NAMES,
  REDUCED_MOTION_PROJECTION,
} from './values'
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
} from './values'
