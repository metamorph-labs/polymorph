import { AvatarGroup, AvatarRoot } from './avatar-parts'
import type { AvatarProps } from './avatar-parts'

/**
 * A round mark identifying a person or workspace (`design/components/avatar.md`).
 *
 * Falls back in order: image, initials, glyph. A broken image URL shows the
 * initials, because the name is always there. The glyph means there is no name
 * ("unassigned"), a different fact from a missing picture.
 *
 * Colour is deterministic per user without adding colours. The spec rejects
 * hash-to-hue, because a computed hue sits outside the role system and the
 * contrast law never measures it. So the hash picks one of the five status
 * **roles** the theme already emits, which `laws.test.ts` checks in both modes
 * for every preset. Two people reliably get two colours, the same on every
 * screen and reload, and the colours follow the tenant's theme and preset.
 */

export type { AvatarGroupProps, AvatarProps, AvatarSize } from './avatar-parts'

/**
 * The initials and the identity tone are framework-free decisions about a
 * name, made once in the engine (`avatarTone`, `initialsOf`) so every
 * framework's Avatar gives one name the same mark. They are re-exported here
 * for the vocabulary's index.
 */
export { avatarTone, initialsOf } from '@polymorph/react'
export type { AvatarTone } from '@polymorph/react'

/**
 * The member, in a module without `'use client'`, so a server component can
 * read `Avatar.Group` from it. A client module's export reaches a server component
 * as a reference with no properties, so a part attached there is `undefined`
 * on a server. The root and the parts are the client module's own exports
 * (`avatar-parts.tsx`), and this function only renders the root.
 */
export function Avatar(props: AvatarProps) {
  return <AvatarRoot {...props} />
}
Avatar.Group = AvatarGroup
