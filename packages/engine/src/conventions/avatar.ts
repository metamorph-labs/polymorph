/**
 * Avatar's two decisions about a name (`design/components/avatar.md`): its
 * initials, and its identity tone. Every framework's Avatar makes them here,
 * so one name gets the same mark in each.
 */

/**
 * The five families a name can map to. Each is in the role table, pairs
 * `subtle` with `text`, and is checked by the contrast law, unlike a hue wheel.
 */
const IDENTITY_TONES = ['accent', 'info', 'success', 'warning', 'danger'] as const

export type AvatarTone = (typeof IDENTITY_TONES)[number]

/**
 * A pure function of the name, so the mark is stable across reloads, machines
 * and sessions. FNV-1a: small and well distributed, not a security hash.
 */
export function avatarTone(name: string): AvatarTone {
  let hash = 0x811c9dc5
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return IDENTITY_TONES[hash % IDENTITY_TONES.length] as AvatarTone
}

/**
 * Two letters, upper-cased. "Ada Lovelace" is AL; one word gives its first
 * two. A middle name is not a third initial.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  if (words.length === 1) return (words[0] as string).slice(0, 2).toUpperCase()
  return `${(words[0] as string)[0]}${(words[words.length - 1] as string)[0]}`.toUpperCase()
}
