/**
 * `@polymorph/angular`: what an Angular consumer installs beneath the vocabulary.
 *
 * The engine (`@polymorph/engine`) is re-exported whole, so a member imports
 * one package. The theme engine and its tokens, the conventions, the motion
 * values and the runtime come from here. The conventions include the
 * framework-free helpers every framework's members share (`spacingAttrs`,
 * `fitTextarea`, `modalFocusTarget`, `avatarTone`, `paginationWindow`, the
 * tooltip delays, `gateFiles`, `relativeTimePhrase`, the segmented field's
 * model, and the focus and key handling a machine leaves to its renderer:
 * `syncTriggerAnchor`, `anchorProps`, `followHighlight`, `returnFocus`,
 * `roveRadio`). This package adds the parts that only exist in Angular: the Zag
 * adapter (`useMachine`, `normalizeProps` and the `Spread` directive), the
 * member's context (its host, its props, its events and its slots), the slot
 * directives, the cells a member's scope is spelled as, the icon gateway
 * (`Glyph`, `BrandMark`), the toast store, the page-transition convention and
 * the states fixture's types. It is the counterpart of `@polymorph/react` and
 * `@polymorph/vue`, and it is written by hand; the members built on it
 * (`@polymorph/angular-ui`) are generated.
 *
 * The motion presence primitives are a subpath (`@polymorph/angular/motion`),
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

export {
  createBindable,
  isDomProperty,
  mergeParts,
  normalizeProps,
  Spread,
  useMachine,
  writeStyle,
  writeValue,
} from './zag'
export type { AngularBindable } from './zag'

// The engine's `devWarning` reads `process.env.NODE_ENV`, which the Angular CLI does not define
// in the browser; this one reads `ngDevMode`, as Angular's own development checks do.
export { devWarning } from './conventions/dev'

export { MEDIA_QUERIES, useMediaQuery } from './conventions/media'
export type { MediaQueryName } from './conventions/media'

export { useDirection } from './conventions/direction'
export { useMode } from './conventions/mode'
export { useThemeValues } from './conventions/theme-values'

export {
  cell,
  derived,
  elementList,
  elementRef,
  hostRef,
  measured,
  Ref,
  useControlRef,
} from './conventions/cells'
export type { Cell, ControlRef, ElementCell, ElementHolder, ElementList } from './conventions/cells'

export {
  BORROWED,
  borrowedHolder,
  handBack,
  IDENTITY,
  KEEPS_HOLDER,
  KEEPS_IDENTITY,
  lend,
  lenderHolder,
  lentIdentity,
  MEMBER_PROVIDERS,
  memberAt,
  MemberContext,
  ownerOf,
  ownerToken,
  provideOwner,
  setup,
  SLOT_HOST,
  uniqueId,
  useMember,
} from './conventions/member'
export type { BorrowedHolder, PropReads, SlotPass, Slotted } from './conventions/member'

export {
  bindSlot,
  bindTemplate,
  isTemplate,
  Portal,
  Render,
  SlotOutlet,
  SlotTemplate,
} from './conventions/slots'
export type { BoundTemplate, Content, NodeTemplate, TemplateContext } from './conventions/slots'

export { mountEffect, watchEffect, watchMeasured } from './conventions/effects'

export { useDeparture } from './conventions/departure'

export {
  PageTransition,
  PageTransitions,
  usePageTransitionPending,
} from './conventions/page-transitions'

export { getToasts, removeToast, subscribeToasts, toast, useToasts } from './conventions/toast'
export type { ToastOptions, ToastPhase, ToastPromiseSpec, ToastRecord } from './conventions/toast'

export { Overrides } from './conventions/states'
export type { ComponentStates, StateEntry } from './conventions/states'

export { Glyph } from './icon/Glyph'
export { BrandMark } from './icon/BrandMark'

// The Icon member ships here, as it ships in `@polymorph/react`, so a vendored
// member imports it from the foundation. It is generated from its description
// (`packages/shells/src/members/icon.ts`) like every other Angular member.
export { Icon } from './icon/Icon'
export type { IconProps } from './icon/Icon'

export { classes, fieldValue, getters, presence } from './conventions/classes'
export type { Each, Emitted } from './conventions/types'
export { pressOnce, selectOnce, typeInto } from './conventions/typing'
