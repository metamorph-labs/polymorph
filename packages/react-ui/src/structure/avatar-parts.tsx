'use client'

import {
  Children,
  cloneElement,
  isValidElement,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'

import {
  avatarTone,
  Icon,
  initialsOf,
  memberAttr,
  useDevWarning,
  type IconSize,
} from '@polymorph/react'
import styles from '@polymorph/recipes/structure/avatar.module.css'

/**
 * Avatar's root and its group, which need a browser: the image's fallback when
 * it fails to load. `Avatar.tsx` is the member: it attaches the group to the
 * root in a module a server can evaluate.
 */

export type AvatarSize = IconSize

export interface AvatarProps {
  /** Initials come from this. "Ada Lovelace" → AL; one word → its first two. */
  name: string
  src?: string
  size?: AvatarSize
  /**
   * Set only when the avatar stands alone; beside a visible name it would repeat
   * the name, so it is `aria-hidden` instead.
   */
  label?: string
}

export function AvatarRoot({ name, src, size = 'md', label }: AvatarProps) {
  // Resets when `src` changes, so a new URL gets its own load attempt instead of
  // inheriting the previous failure.
  const [failed, setFailed] = useState<string>()
  const broken = src !== undefined && failed === src

  const initials = initialsOf(name)
  const showImage = src !== undefined && !broken
  const fallback = initials === '' ? 'icon' : 'initials'
  const named = label !== undefined

  return (
    <span
      className={styles.avatar}
      data-size={size}
      data-fallback={showImage ? undefined : fallback}
      // Set only when the initials show. An image covers them, and the icon
      // fallback means there is no name to hash.
      data-tone={fallback === 'initials' && !showImage ? avatarTone(name) : undefined}
      role={named ? 'img' : undefined}
      aria-label={label}
      aria-hidden={named ? undefined : true}
      {...memberAttr('Avatar')}
    >
      {showImage ? (
        // Layered over the fallback rather than replacing it. The initials are
        // already painted, so the image fades in over them without a jump.
        <img
          className={styles.image}
          src={src}
          alt=""
          onError={() => setFailed(src)}
          draggable={false}
        />
      ) : null}

      {fallback === 'icon' ? (
        <Icon name="user" size={size} />
      ) : (
        <span className={styles.initials}>{initials}</span>
      )}
    </span>
  )
}

/**
 * A row of overlapping Avatars (`Avatar.Group`) in the app's order, with a
 * "+N" chip when `max` truncates it.
 */
export interface AvatarGroupProps {
  /** Avatars in the app's order, all with the same `size`. */
  children: ReactNode
  /** Maximum number drawn; the rest become "+N", and omitting it draws all. */
  max?: number
  /** The group's accessible name, such as "Assignees" rather than "Avatars". */
  label: string
}

function isAvatarElement(node: ReactNode): node is ReactElement<AvatarProps> {
  return isValidElement(node) && typeof (node.props as AvatarProps).name === 'string'
}

export function AvatarGroup({ children, max, label }: AvatarGroupProps) {
  const items = Children.toArray(children)
  const drawn = max === undefined ? items : items.slice(0, max)
  const surplus = items.length - drawn.length

  // One diameter across the set: the overlap calculation assumes it, and the set
  // reads as one size. The chip matches, so it lines up as one more mark.
  const sizes = new Set(items.filter(isAvatarElement).map((member) => member.props.size ?? 'md'))
  const size = items.filter(isAvatarElement)[0]?.props.size ?? 'md'

  useDevWarning(
    sizes.size > 1,
    'Avatar.Group: members mix sizes. The overlap assumes one diameter and a set is one ' +
      'register — give every member the same `size`.',
  )

  return (
    <div role="group" aria-label={label} className={styles.group}>
      {drawn.map((member) =>
        // Members render as standalone marks: a group has no adjacent name text,
        // so an unlabelled member takes its `name` as its label (the `label`
        // rule's standalone case) instead of being hidden.
        isAvatarElement(member)
          ? cloneElement(member, { label: member.props.label ?? member.props.name })
          : member,
      )}

      {surplus > 0 ? (
        // Real text, never `aria-hidden`: initials only depict a name, but "+N"
        // is information, the overflow's text alternative.
        <span className={`${styles.avatar} ${styles.surplus}`} data-size={size}>
          {`+${surplus}`}
        </span>
      ) : null}
    </div>
  )
}
