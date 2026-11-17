/**
 * `@polymorph/react`: what a React consumer installs.
 *
 * The engine's root (`@polymorph/engine`) is re-exported whole, so a member
 * imports one package: the theme engine and its tokens, the conventions and
 * the runtime come from here, together with the parts that only exist in
 * React: the icon gateway, the hooks, and the conventions typed with React's
 * element types (props, spacing children, states fixtures). Members import
 * this package and not the engine.
 * The `vendorable-imports` rule allows both, so two other laws enforce it.
 * react-ui's consumption law (`packages/react-ui/consumption.test.ts`) fails on
 * a shipped import its manifest does not declare, and forbids declaring the
 * engine. The registry's closure test fails when a vendored member's closure
 * reaches the engine.
 *
 * The motion engine and the presence components built on it are a subpath
 * (`@polymorph/react/motion`), not a root export, for the reason the engine
 * gives: application code may not choreograph motion, so the surface is
 * visible to member internals only.
 */
export * from '@polymorph/engine'

/*
 * The engine's heavier helpers are subpaths, so an application that imports
 * the engine's root for its theme does not load them. A member reaches them
 * here, as it reaches the rest of the engine: the QR encoder, the chart marks'
 * paths and the Markdown parser.
 */
export * from '@polymorph/engine/charts'
export * from '@polymorph/engine/markdown'
export * from '@polymorph/engine/qr'

export { useAgentMember } from './conventions/agent'

export { useControlRef } from './conventions/control-ref'
export type { ControlRef } from './conventions/control-ref'

export { useDevWarning, useDevWarnings } from './conventions/dev'

export { useDirection } from './conventions/direction'

export { useMode } from './conventions/mode'

export { useThemeValues } from './conventions/theme-values'

export { assertGoverned } from './conventions/props'
export type { Governed, GovernedCheck, NativeProps, StyleEscapeHatch } from './conventions/props'

export type { LayoutChildren } from './conventions/spacing'

export { useSupplied } from './conventions/supplied'

export type { ComponentStates, StateEntry } from './conventions/states'

export { Icon } from './icon/Icon'
export type { IconProps, IconSize } from './icon/Icon'
export { BRAND_MARKS, BrandMark, isBrandName } from './icon/BrandMark'
export type { BrandMarkProps, BrandName } from './icon/BrandMark'
