/**
 * `@polymorph/vue`: what a Vue consumer installs beneath the vocabulary.
 *
 * The engine (`@polymorph/engine`) is re-exported whole, so a member imports
 * one package. The theme engine and its tokens, the conventions, the motion
 * values and the runtime come from here. The conventions include the
 * framework-free helpers every framework's members share (`spacingAttrs`,
 * `fitTextarea`, `modalFocusTarget`, `avatarTone`, `paginationWindow`, the
 * tooltip delays, `gateFiles`, `relativeTimePhrase`, the segmented field's
 * model, the focus and key handling a machine leaves to its renderer, the
 * overlay trigger anchor and `devWarning`). This package adds the parts that
 * only exist in Vue: the icon gateway (`Glyph`, `BrandMark`), the composables,
 * the toast store, the page-transition convention and the states fixture's
 * types.
 * It is the counterpart of `@polymorph/react`, and it is written by hand; the
 * members built on it (`@polymorph/vue-ui`) are generated.
 *
 * The motion presence composable is a subpath (`@polymorph/vue/motion`), not a
 * root export, for the reason the React foundation gives: application code may
 * not choreograph motion.
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

export { MEDIA_QUERIES, useMediaQuery } from './conventions/media'
export type { MediaQueryName } from './conventions/media'

export { useDirection } from './conventions/direction'
export { useMode } from './conventions/mode'
export { useThemeValues } from './conventions/theme-values'

export { afterRender } from './conventions/after-render'

export { mergeParts } from './conventions/merge'

export {
  PageTransition,
  PageTransitions,
  usePageTransitionPending,
} from './conventions/page-transitions'

export {
  definedProps,
  slotted,
  slotNode,
  slottedElements,
  useDeparture,
  useListening,
  useTrackedSlots,
} from './conventions/slotted'
export type { Slotted } from './conventions/slotted'

export { useControlRef } from './conventions/control-ref'
export type { ControlRef } from './conventions/control-ref'

export { getToasts, removeToast, subscribeToasts, toast, useToasts } from './conventions/toast'
export type { ToastOptions, ToastPhase, ToastPromiseSpec, ToastRecord } from './conventions/toast'

export type { ComponentStates, StateEntry } from './conventions/states'

export { Glyph } from './icon/Glyph'
export type { GlyphProps } from './icon/Glyph'

export { BrandMark } from './icon/BrandMark'
export type { BrandMarkProps } from './icon/BrandMark'

// The Icon member ships here, as it ships in `@polymorph/react`, so a vendored
// member imports it from the foundation. It is generated from its description
// (`packages/shells/src/members/icon.ts`) like every other Vue member.
export { default as Icon } from './icon/Icon.vue'
export type { IconProps } from './icon/Icon.vue'
