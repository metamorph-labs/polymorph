import { DEFAULT_FRAMEWORK, type Framework } from '@polymorph/registry/frameworks'
import { DEFAULT_PLATFORM } from '@polymorph/registry/platforms'
import type {
  ScreenTable,
  TableMember,
  TablePart,
  TablePrimitive,
  TableProp,
} from '@polymorph/registry/screen-table'

/**
 * Which members a screen may use, and what a name in a document resolves to.
 *
 * Every function here takes the vocabulary as an argument and none imports
 * the generated table, so the walk, which a renderer hands a table, loads
 * none of it through this module.
 */

/** The vocabulary a screen is checked and drawn with: the generated table (`vocabulary.ts`) or another of its shape. */
export type ScreenVocabulary = ScreenTable
export type { TableMember, TablePart, TablePrimitive, TableProp }

/**
 * The members that host another library's code, which a host allows only by
 * naming them in `members`. `ThirdParty` is the boundary around another
 * library's component: drawn from a document, it would hold whatever the host
 * puts there for it. No other member takes markup, a script's address or an
 * embed (`vocabulary.test.ts` reads every prop to hold that).
 */
export const CODE_HOSTS: readonly string[] = ['ThirdParty']

/** Which members a screen may use: a framework's, or a host's own list. */
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
}

/**
 * The members a framework draws from a document when the host names none:
 * every member and primitive the framework ships, without the code hosts and,
 * in React, without a member React draws through a function.
 */
export function defaultMembers(
  vocabulary: ScreenVocabulary,
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

/** Every member and exception primitive the vocabulary has, by name. */
export function memberNames(vocabulary: ScreenVocabulary): string[] {
  return [
    ...vocabulary.components.map((member) => member.name),
    ...vocabulary.exceptions.primitives.map((primitive) => primitive.name),
  ]
}

/** The members a screen may use, by name: the host's list, or the framework's default. */
export function allowedMembers(
  vocabulary: ScreenVocabulary,
  options: MemberOptions = {},
): ReadonlySet<string> {
  return new Set(options.members ?? defaultMembers(vocabulary, options.framework))
}

/** A member, a compound part or an exception primitive, as a document names it. */
export interface ScreenSurface {
  /** The member it belongs to: `Table` for `Table.Row`. */
  member: string
  /** The part's name in its member (`Row`), or `null` for the member itself. */
  part: string | null
  /** The props it takes: a member's own, without a part's dotted ones. */
  props: readonly TableProp[]
  /** Each controlled prop with the event prop that reports its change. */
  controlled: Readonly<Record<string, string>>
  /** The table entry of the member or the primitive. */
  entry: TableMember | TablePrimitive
}

/** Each vocabulary's members and primitives by name, made once. */
const INDEXES = new WeakMap<
  ScreenVocabulary,
  { members: Map<string, TableMember>; primitives: Map<string, TablePrimitive> }
>()

function indexOf(vocabulary: ScreenVocabulary) {
  let index = INDEXES.get(vocabulary)
  if (index === undefined) {
    index = {
      members: new Map(vocabulary.components.map((member) => [member.name, member])),
      primitives: new Map(
        vocabulary.exceptions.primitives.map((primitive) => [primitive.name, primitive]),
      ),
    }
    INDEXES.set(vocabulary, index)
  }
  return index
}

/**
 * What a name resolves to, by the validator's rule (`surfaceOf` in
 * `packages/spec/src/validate.ts`): an exception primitive, a member, or
 * exactly two segments naming a member and a part its export carries. `null`
 * for a name the vocabulary does not have.
 */
export function surfaceOf(vocabulary: ScreenVocabulary, name: string): ScreenSurface | null {
  const { members, primitives } = indexOf(vocabulary)
  const primitive = primitives.get(name)
  if (primitive !== undefined) {
    return {
      member: name,
      part: null,
      props: primitive.props.filter((prop) => !prop.name.includes('.')),
      controlled: primitive.controlled,
      entry: primitive,
    }
  }
  const member = members.get(name)
  if (member !== undefined) {
    return {
      member: name,
      part: null,
      props: member.props.filter((prop) => !prop.name.includes('.')),
      controlled: member.controlled,
      entry: member,
    }
  }
  const segments = name.split('.')
  const [owner, partName] = segments
  if (segments.length !== 2 || owner === undefined || partName === undefined) return null
  const compound = members.get(owner)
  const part = compound?.parts.find((candidate) => candidate.name === partName)
  if (compound === undefined || part === undefined) return null
  return {
    member: owner,
    part: partName,
    props: part.props,
    controlled: part.controlled,
    entry: compound,
  }
}

/**
 * The fault for a member the host does not allow, in the validator's voice.
 * `null` for an allowed one, and for a name the vocabulary does not have,
 * which the validator reports.
 */
export function memberFault(
  vocabulary: ScreenVocabulary,
  component: string,
  allowed: ReadonlySet<string>,
): string | null {
  const surface = surfaceOf(vocabulary, component)
  if (surface === null || allowed.has(surface.member)) return null
  const owner =
    surface.part === null ? '' : `\`${component}\` is a part of \`${surface.member}\`, and `
  const subject = owner === '' ? `\`${component}\`` : `\`${surface.member}\``
  const reason = CODE_HOSTS.includes(surface.member)
    ? 'hosts another library’s code, which this host does not allow'
    : 'is not one of the members this host draws'
  return `${owner}${subject} ${reason} — compose the screen from the members the card lists`
}
