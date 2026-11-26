import { DEFAULT_FRAMEWORK, unionParts, type Framework } from './frameworks'
import { DEFAULT_PLATFORM } from './platforms'
import type { ScreenTable, TableDataType, TableMember, TablePrimitive } from './screen-table'

/**
 * What a screen drawn at run time may use: which members, by the host's list
 * or the framework's default, and which addresses.
 *
 * `@polymorph/screen` checks and draws a document by these rules, and the
 * run-time card (`runtime-card.ts`) tells a model the same rules, so the card,
 * the check and the walk cannot disagree. They live in the registry, below the
 * screen package, because the MCP tool that prints the card reads the registry
 * and may not depend on the screen package. The screen package re-exports
 * each of them.
 *
 * This module reads no file and loads no vocabulary table, so the walk can
 * import it (`@polymorph/registry/runtime-members`).
 */

/**
 * The members that host another library's code, which a host allows only by
 * naming them in `members`. `ThirdParty` is the boundary around another
 * library's component: drawn from a document, it would hold whatever the host
 * puts there for it. A law in `packages/screen/src/parity.test.ts` holds that
 * no other member takes markup, a script's address or an embed.
 */
export const CODE_HOSTS: readonly string[] = ['ThirdParty']

/**
 * The members that draw the links and pictures their own text writes, rather
 * than an address in a prop: `Markdown` draws `[label](address)` as a link and
 * `![alt](address)` as a picture. No prop carries those addresses, so a host
 * that refuses addresses cannot refuse them one by one, and the member is left
 * out. A law in `packages/screen/src/parity.test.ts` holds that no other
 * member reads the Markdown parser.
 */
export const ADDRESSES_FROM_TEXT: readonly string[] = ['Markdown']

/**
 * The props and object keys that take an address: a link's target, a pager's
 * previous and next windows, a picture or a recording, and a picture's set of
 * files. A law in `packages/screen/src/parity.test.ts` holds every prop and
 * data type field the vocabulary types as text and names or documents as an
 * address to one of them.
 */
export const ADDRESS_KEYS: ReadonlySet<string> = new Set([
  'avatar',
  'href',
  'nextHref',
  'previousHref',
  'src',
  'srcSet',
])

/** The schemes an address may name. Anything else, and anything without a scheme that is not relative, is refused. */
export const ADDRESS_SCHEMES: readonly string[] = ['http:', 'https:', 'mailto:', 'tel:']

/** Every address policy (`AddressPolicy`), the default first. */
export const ADDRESS_POLICIES = ['allowed', 'refused'] as const

/**
 * Whether a host takes addresses. `allowed`, the default: an address is passed
 * when it is relative, a fragment, or names one of `ADDRESS_SCHEMES`.
 * `refused`: no address the document writes reaches a member, and a member
 * that cannot be drawn without one is not allowed (`addressNeed`).
 */
export type AddressPolicy = (typeof ADDRESS_POLICIES)[number]

/** What a screen may use: a framework's members or a host's own list, and the host's address policy. */
export interface MemberOptions {
  /** The web framework that draws the screen. `react` when absent. */
  framework?: Framework
  /**
   * The members and exception primitives the host allows, by name. A
   * compound part is allowed with its member. Absent, every member the
   * framework draws is allowed except those that host another library's code
   * (`CODE_HOSTS`) and, in React, a member a call site calls as a function
   * (`toast()`).
   */
  members?: readonly string[]
  /** Whether the host takes addresses: `allowed` (the default) or `refused`. */
  addresses?: AddressPolicy
}

/**
 * The members a framework draws from a document when the host names none:
 * every member and primitive the framework ships, without the code hosts and,
 * in React, without a member React draws through a function.
 */
export function defaultMembers(
  vocabulary: ScreenTable,
  framework: Framework = DEFAULT_FRAMEWORK,
): string[] {
  const drawn = (entry: Pick<TableMember, 'name' | 'platforms' | 'frameworks'>): boolean =>
    entry.platforms[DEFAULT_PLATFORM].status !== 'absent' &&
    entry.frameworks[framework].status !== 'absent' &&
    !CODE_HOSTS.includes(entry.name)
  return [
    ...vocabulary.components
      .filter((member) => drawn(member) && !(framework === 'react' && member.call !== null))
      .map((member) => member.name),
    ...vocabulary.exceptions.primitives.filter(drawn).map((primitive) => primitive.name),
  ]
}

/**
 * The members a screen may use, by name: the host's list, or the framework's
 * default, without the members a host that refuses addresses cannot draw.
 */
export function allowedMembers(
  vocabulary: ScreenTable,
  options: MemberOptions = {},
): ReadonlySet<string> {
  const listed = options.members ?? defaultMembers(vocabulary, options.framework)
  if (options.addresses !== 'refused') return new Set(listed)
  return new Set(listed.filter((name) => addressNeed(vocabulary, name) === null))
}

/** A vocabulary's data types by name, and the needs read from it, each made once. */
interface Needs {
  catalogue: Map<string, TableDataType>
  members: Map<string, string | null>
  types: Map<string, string | null>
}

const NEEDS = new WeakMap<ScreenTable, Needs>()

function needsOf(vocabulary: ScreenTable): Needs {
  let needs = NEEDS.get(vocabulary)
  if (needs === undefined) {
    needs = {
      catalogue: new Map((vocabulary.dataTypes ?? []).map((type) => [type.name, type])),
      members: new Map(),
      types: new Map(),
    }
    NEEDS.set(vocabulary, needs)
  }
  return needs
}

/** A named type and its arguments: `DataTableColumn<Row>`, `Array<SelectOption>`. */
const NAMED = /^([A-Za-z_$][\w$]*)(?:<(.*)>)?$/s

/** A union part without `readonly`, its list brackets and its parentheses: the type each item is. */
function itemType(part: string): string {
  let text = part.trim()
  for (;;) {
    const before = text
    if (text.startsWith('(') && text.endsWith(')')) text = text.slice(1, -1).trim()
    text = text.replace(/^readonly\s+/, '')
    if (text.endsWith('[]')) text = text.slice(0, -2).trim()
    const named = NAMED.exec(text)
    if (named !== null && (named[1] === 'Array' || named[1] === 'ReadonlyArray')) {
      text = (named[2] ?? '').trim()
    }
    if (text === before) return text
  }
}

/**
 * Where a printed type requires an address, as `Type.field`, or `null`: every
 * part of its union, other than `null`, is a data type (or a list of one)
 * whose required fields hold an address, directly or through another such
 * type.
 */
function typeNeed(needs: Needs, printed: string, seen: ReadonlySet<string>): string | null {
  const parts = unionParts(printed).filter((part) => part !== 'null')
  if (parts.length === 0) return null
  let first: string | null = null
  for (const part of parts) {
    const name = NAMED.exec(itemType(part))?.[1]
    const type = name === undefined ? undefined : needs.catalogue.get(name)
    const need = type === undefined ? null : dataTypeNeed(needs, type, seen)
    if (need === null) return null
    first ??= need
  }
  return first
}

/** Where a data type requires an address, as `Type.field`, or `null`. A union needs one where each of its types does. */
function dataTypeNeed(needs: Needs, type: TableDataType, seen: ReadonlySet<string>): string | null {
  if (needs.types.has(type.name)) return needs.types.get(type.name) ?? null
  if (seen.has(type.name)) return null
  const within = new Set([...seen, type.name])
  let need: string | null = null
  if (type.union !== undefined) {
    need = typeNeed(needs, type.union.join(' | '), within)
  } else {
    for (const field of type.fields) {
      if (field.optional) continue
      need = ADDRESS_KEYS.has(field.name)
        ? `${type.name}.${field.name}`
        : typeNeed(needs, field.type, within)
      if (need !== null) break
    }
  }
  // A reading made inside a cycle depends on where the cycle was entered, so only the outermost is kept.
  if (seen.size === 0) needs.types.set(type.name, need)
  return need
}

/**
 * Why a member or an exception primitive cannot be drawn by a host that
 * refuses addresses, as the end of a sentence about it, or `null` when it can:
 *
 *  - a prop it requires takes an address (a Link's `href`), or a data type
 *    whose required fields hold one (a SectionNav's `items`, each with its
 *    `href`). The member is drawn for its address, and one drawn without it is
 *    a link that goes nowhere or a picture of nothing;
 *  - it draws the links and pictures its own text writes (`ADDRESSES_FROM_TEXT`).
 *
 * A member whose address props are optional is drawn without them. A name the
 * vocabulary does not have needs nothing here; the validator reports it.
 */
export function addressNeed(vocabulary: ScreenTable, name: string): string | null {
  const needs = needsOf(vocabulary)
  const known = needs.members.get(name)
  if (known !== undefined) return known
  let need: string | null = null
  if (ADDRESSES_FROM_TEXT.includes(name)) {
    need = 'draws the links and pictures its text writes'
  } else {
    const entry: TableMember | TablePrimitive | undefined =
      vocabulary.components.find((member) => member.name === name) ??
      vocabulary.exceptions.primitives.find((primitive) => primitive.name === name)
    for (const prop of entry?.props ?? []) {
      if (prop.optional || prop.name.includes('.')) continue
      if (ADDRESS_KEYS.has(prop.name)) {
        need = `requires an address at \`${prop.name}\``
        break
      }
      const field = typeNeed(needs, prop.type, new Set())
      if (field !== null) {
        need = `requires an address at \`${prop.name}\` (\`${field}\`)`
        break
      }
    }
  }
  needs.members.set(name, need)
  return need
}
