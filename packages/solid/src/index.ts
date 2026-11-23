/**
 * `@polymorph/solid`: what a Solid consumer installs beneath the vocabulary.
 *
 * The engine (`@polymorph/engine`) is re-exported whole, so a member imports
 * one package. The theme engine and its tokens, the conventions, the motion
 * values and the runtime come from here. The conventions include the
 * framework-free helpers every framework's members share (`spacingAttrs`,
 * `fitTextarea`, `modalFocusTarget`, `avatarTone`, `paginationWindow`, the
 * tooltip delays, `gateFiles`, `relativeTimePhrase`, the segmented field's
 * model, the focus and key handling a machine leaves to its renderer, the
 * overlay trigger anchor and `devWarning`). This package adds the parts that
 * only exist in Solid: the icon gateway (`Glyph`, `BrandMark`), the slot
 * conventions, the keyed list, the element refs, the toast store, the
 * page-transition convention and the states fixture's types. It is the
 * counterpart of `@polymorph/react` and `@polymorph/vue`, and it is written by
 * hand; the members built on it (`@polymorph/solid-ui`) are generated.
 *
 * The motion presence primitives are a subpath (`@polymorph/solid/motion`),
 * not a root export, for the reason the React foundation gives: application
 * code may not choreograph motion.
 */
export * from '@polymorph/engine'

/*
 * The engine's heavier helpers are subpaths, so an application that imports
 * the engine's root for its theme does not load them. A member reaches them
 * here, as it reaches the rest of the engine: the QR encoder, the chart marks'
 * paths, the Markdown parser, the rich-text document and the rich-text editor.
 * Every subpath declares no side effect, so a bundle that uses none of the
 * editor's names drops the editor and the editing library with it.
 */
export * from '@polymorph/engine/charts'
export * from '@polymorph/engine/markdown'
export * from '@polymorph/engine/qr'
export * from '@polymorph/engine/rich-text'
export * from '@polymorph/engine/rich-text-editor'

export { MEDIA_QUERIES, useMediaQuery } from './conventions/media'
export type { MediaQueryName } from './conventions/media'

export { useDirection } from './conventions/direction'
export { useMode } from './conventions/mode'
export { useThemeValues } from './conventions/theme-values'

// The engine's `anchorProps`, with the focus handlers named the way Solid spells them.
export { anchorProps } from './conventions/trigger-anchor'

export { classes, mergeParts } from './conventions/merge'

export { Each, itemOf, Keyed } from './conventions/keyed'

export { useMachine } from './conventions/machine'

export { afresh } from './conventions/hydration'

export { afterRender, watchEffect } from './conventions/effects'

export {
  createCell,
  createDerived,
  createKept,
  elementList,
  elementRef,
  useControlRef,
} from './conventions/cells'
export type { Defaults } from './conventions/cells'

export {
  PageTransition,
  PageTransitions,
  usePageTransitionPending,
} from './conventions/page-transitions'
export type { PageTransitionProps } from './conventions/page-transitions'

export {
  BORROWED,
  claimSlot,
  drawSlot,
  hostMember,
  IDENTITY,
  ownerContext,
  provide,
  ResolvedSlot,
  resolveSlot,
  scope,
  slotDraws,
  useDeparture,
} from './conventions/slotted'
export type { BorrowedHolder, Slot, SlotPass, Slotted } from './conventions/slotted'

export { getToasts, removeToast, subscribeToasts, toast, useToasts } from './conventions/toast'
export type { ToastOptions, ToastPhase, ToastPromiseSpec, ToastRecord } from './conventions/toast'

export type { ComponentStates, StateEntry } from './conventions/states'

export { Glyph } from './icon/Glyph'
export type { GlyphProps } from './icon/Glyph'

export { BrandMark } from './icon/BrandMark'
export type { BrandMarkProps } from './icon/BrandMark'

// The Icon member ships here, as it ships in `@polymorph/react`, so a vendored
// member imports it from the foundation. It is generated from its description
// (`packages/shells/src/members/icon.ts`) like every other Solid member.
export { default as Icon } from './icon/Icon'
export type { IconProps } from './icon/Icon'
