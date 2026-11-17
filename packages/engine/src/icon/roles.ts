import iconSet from '../../../../design/icons.json' with { type: 'json' }

/**
 * The closed semantic icon-role enum, derived from `design/icons.json` instead
 * of copied. With one source, a role cannot exist in the map but not in the
 * spec, or the reverse.
 *
 * Application code and vocabulary components reference meanings: `delete`,
 * `warning`, `expand`. Because the enum is closed, an invented icon name is a
 * type error instead of a broken render. That matters most for generated UI.
 */

export const ICON_SET = iconSet.set

/**
 * The imported map, under a local name. The types derive from this constant
 * instead of from the import, so `tsc` writes the map's shape into the published
 * declarations. Otherwise they would import `design/icons.json`, which no
 * consumer installs, and `IconRole` would become an unchecked
 * `string | number | symbol`.
 */
const ROLES = iconSet.roles

export const ICON_ROLES = Object.keys(ROLES) as IconRole[]

export type IconRole = keyof typeof ROLES

export type IconGroup = 'action' | 'navigation' | 'status' | 'object' | 'form'

export interface IconRoleMeta {
  glyph: string
  group: IconGroup
}

/**
 * Role -> `{ glyph, group }`. `group` orders the gallery and is not API. Each
 * entry also carries `ios` and `android`, the SF Symbol and the Material
 * Symbols name the native members draw it with (`packages/native`), which the
 * web does not read.
 */
export const ICON_ROLE_META = ROLES as Record<IconRole, IconRoleMeta>

const ROLE_SET: ReadonlySet<string> = new Set(ICON_ROLES)

export function isIconRole(value: string): value is IconRole {
  return ROLE_SET.has(value)
}
