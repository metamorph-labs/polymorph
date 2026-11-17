/**
 * `@polymorph/svelte`: what a Svelte consumer installs beneath the vocabulary.
 *
 * The engine (`@polymorph/engine`) is re-exported whole, so a member imports
 * one package. The theme engine and its tokens, the conventions, the motion
 * values and the runtime come from here. The conventions include the
 * framework-free helpers every framework's members share (`spacingAttrs`,
 * `fitTextarea`, `modalFocusTarget`, `avatarTone`, `paginationWindow`, the
 * tooltip delays, `gateFiles`, `relativeTimePhrase`, the segmented field's
 * model, the focus and key handling a machine leaves to its renderer, the
 * overlay trigger anchor and `devWarning`). This package adds the parts that
 * only exist in Svelte: the icon gateway (`Glyph`, `BrandMark`), the portal,
 * the slot conventions that let a member read and pass props to what a caller
 * put in a slot, the machine-prop spelling, the toast store, the
 * page-transition convention and the states fixture's types. It is the
 * counterpart of `@polymorph/react` and `@polymorph/vue`, and it is written by
 * hand; the members built on it (`@polymorph/svelte-ui`) are generated.
 *
 * The presences are a subpath (`@polymorph/svelte/motion`), not a root export,
 * for the reason the React foundation gives: application code may not
 * choreograph motion.
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

export { MEDIA_QUERIES, useMediaQuery } from './conventions/media.svelte'
export type { MediaQueryName } from './conventions/media.svelte'

export { useDirection } from './conventions/direction.svelte'
export { useMode } from './conventions/mode.svelte'
export { useThemeValues } from './conventions/theme-values.svelte'

export {
  attributes,
  chainHandlers,
  mergeParts,
  normalizeProps,
  styleText,
} from './conventions/attributes'

export { afterRender, refList, useDeparture, watchEffect } from './conventions/effects.svelte'
export type { RefList } from './conventions/effects.svelte'

export { joinSlot, SlotScope, SlotText } from './conventions/slotted.svelte'
export type { Joined, Slotted, SlotScopeOptions } from './conventions/slotted.svelte'
export { default as SlotOutlet } from './conventions/SlotOutlet.svelte'

export { bindSnippet, isBound } from './conventions/render'
export type { BoundSnippet, RenderNode } from './conventions/render'
export { default as Render } from './conventions/Render.svelte'
export { default as Portal } from './conventions/Portal.svelte'

export { useControlRef } from './conventions/control-ref.svelte'
export type { ControlRef } from './conventions/control-ref.svelte'

export {
  getToasts,
  removeToast,
  subscribeToasts,
  toast,
  useToasts,
} from './conventions/toast.svelte'
export type {
  ToastOptions,
  ToastPhase,
  ToastPromiseSpec,
  ToastRecord,
} from './conventions/toast.svelte'

export { usePageTransitionPending } from './conventions/page-transitions.svelte'
export { default as PageTransition } from './conventions/PageTransition.svelte'
export { default as PageTransitions } from './conventions/PageTransitions.svelte'

export type { ComponentStates, Overrides, StateEntry } from './conventions/states'
export { default as Held } from './conventions/Held.svelte'

export { default as Glyph } from './icon/Glyph.svelte'
export { default as BrandMark } from './icon/BrandMark.svelte'

// The Icon member ships here, as it ships in `@polymorph/react`, so a vendored
// member imports it from the foundation. It is generated from its description
// (`packages/shells/src/members/icon.ts`) like every other Svelte member.
export { default as Icon } from './icon/Icon.svelte'
export type { IconProps } from './icon/Icon.svelte'
