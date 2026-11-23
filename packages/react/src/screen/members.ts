import type { ComponentType } from 'react'

/**
 * The components a screen is drawn with, by member name.
 *
 * The React foundation knows no member, so the host passes the ones it has:
 * `import * as members from '@polymorph/react-ui'`, the index of a vendored
 * copy, or a map of its own. A compound part is read from its member
 * (`members.Table.Row`), or from a key of its own (`members['Table.Row']`),
 * which is how a map of lazy components gives one.
 */
export type ScreenMembers = Readonly<Record<string, unknown>>

/**
 * A component the renderer draws: a function, or one of React's component
 * objects (`memo`, `lazy`). Its props are the member's own, and the walk
 * passes only those.
 */
export type MemberComponent = ComponentType<Record<string, unknown>>

/** The own property of a value, never one it inherits: `constructor` names nothing. */
function own(value: unknown, key: string): unknown {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return undefined
  return Object.prototype.hasOwnProperty.call(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined
}

/**
 * Whether a value is a component. A component object (`memo`, `forwardRef`,
 * `lazy`) carries React's `$$typeof`; a plain object that holds parts is not
 * one.
 */
function isComponent(value: unknown): value is MemberComponent {
  return (
    typeof value === 'function' ||
    (typeof value === 'object' && value !== null && '$$typeof' in value)
  )
}

/**
 * The component that draws `'A'` or `'A.B'`, or `null` when the members hold
 * none. A part is the member's property of that name, by the validator's rule
 * that a name has one segment or two.
 */
export function componentFor(members: ScreenMembers, name: string): MemberComponent | null {
  const direct = own(members, name)
  if (isComponent(direct)) return direct
  const segments = name.split('.')
  const [owner, part] = segments
  if (segments.length !== 2 || owner === undefined || part === undefined) return null
  const found = own(own(members, owner), part)
  return isComponent(found) ? found : null
}
