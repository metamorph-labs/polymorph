/**
 * `@polymorph/elements`: the foundation of the Web Components renderer.
 *
 * Every member is a custom element (`poly-button`, `poly-tabs-content`) in the
 * light DOM, which renders the generated Solid member (`@polymorph/solid-ui`)
 * into itself. This package holds what every element shares: the element base
 * class and `define`, the attribute codecs, the events and `waitUntil`, and the
 * states fixture's types. The members' definitions are generated
 * (`@polymorph/elements-ui`), except `poly-icon`'s, which ships here as `Icon`
 * ships in every foundation.
 *
 * The engine (`@polymorph/engine`) is re-exported whole, as every foundation
 * re-exports it, with the toast store a page raises toasts through and the
 * types the React vocabulary exports beside its members.
 *
 * It imports the stylesheets every element needs, so every element brings
 * them: the base layer, the host rule, and the rules for an element that has
 * not rendered its member. Each Solid member brings its own recipe.
 */
import '@polymorph/recipes/base.css'
import './host.css'
import './pending.css'

export * from '@polymorph/engine'
export * from '@polymorph/engine/charts'
export * from '@polymorph/engine/markdown'
export * from '@polymorph/engine/qr'

export { getToasts, removeToast, subscribeToasts, toast } from '@polymorph/solid'
export type {
  BrandMarkProps,
  IconProps,
  ToastOptions,
  ToastPhase,
  ToastPromiseSpec,
  ToastRecord,
} from '@polymorph/solid'

export { define, defineLazy, fillSlot, inheritedMethod, PolyElement, restore } from './element'
export type { InstanceEvent, MemberElement } from './element'
export { ERROR_EVENT, PolymorphEvent } from './events'
export type { PolymorphEventInit } from './events'
export { coerce, decode, encode, Unreadable } from './codecs'
export type { TemporalCodecs } from './codecs'
export { attributeOf, eventOf, PREFIX, propertyOf, slotOf, tagOf } from './definition'
export type {
  Codec,
  ElementCallback,
  ElementDefinition,
  ElementEvent,
  ElementProperties,
  PropertyName,
} from './definition'
export { assign, create, holding, listen } from './fixture'
export type { StateEntry, ComponentStates, FindElement, FixtureElement, Holding } from './fixture'

export { PolyIcon } from './icon/Icon'
export type { PolyIconElement } from './icon/Icon'
