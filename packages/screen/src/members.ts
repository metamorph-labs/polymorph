import { DEFAULT_FRAMEWORK, unionParts, type Framework } from '@polymorph/registry/frameworks'
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
 * embed: a law in `packages/screen/src/parity.test.ts` reads every prop, every
 * part's prop and every data type field to hold that.
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

/**
 * How a member takes its children, read from its `children` prop's type:
 *
 *  - `nodes`: any number of nodes (`ReactNode`). A renderer passes them as a
 *    list, even one, so a second child that arrives while a document streams
 *    joins the first instead of replacing it.
 *  - `element`: one element the member reads (FormField's control, which it
 *    clones with an id). A renderer passes it as itself.
 *  - `text`: one text the member reads (Heading's words). A renderer passes
 *    it as itself.
 */
export type ChildrenKind = 'nodes' | 'element' | 'text'

/** A type a member draws as any node: an element, a text, or a list of them. */
const NODES = /^(?:React\.)?(?:ReactNode|ReactPortal)\b|^JSX\.Element\b/
/** A type a member reads as one element. */
const ELEMENT = /^(?:React\.)?ReactElement\b/

/** How the props' `children` is taken, or `null` for a member that takes none. */
function childrenKindOf(props: readonly TableProp[]): ChildrenKind | null {
  const children = props.find((prop) => prop.name === 'children')
  if (children === undefined) return null
  const parts = unionParts(children.type)
  if (parts.some((part) => NODES.test(part))) return 'nodes'
  if (parts.length > 0 && parts.every((part) => ELEMENT.test(part))) return 'element'
  if (parts.length > 0 && parts.every((part) => part === 'string' || part === 'number')) {
    return 'text'
  }
  return 'nodes'
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
  /** How it takes its children, or `null` when it takes none. */
  childrenKind: ChildrenKind | null
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
    const props = primitive.props.filter((prop) => !prop.name.includes('.'))
    return {
      member: name,
      part: null,
      props,
      controlled: primitive.controlled,
      childrenKind: childrenKindOf(props),
      entry: primitive,
    }
  }
  const member = members.get(name)
  if (member !== undefined) {
    const props = member.props.filter((prop) => !prop.name.includes('.'))
    return {
      member: name,
      part: null,
      props,
      controlled: member.controlled,
      childrenKind: childrenKindOf(props),
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
    childrenKind: childrenKindOf(part.props),
    entry: compound,
  }
}

/**
 * The longest key a document may write: a prop's name or a structured
 * object's field. The longest any member, part or data type declares is 21
 * characters (`maximumFractionDigits`). Every node below a key carries it in
 * its path, so a longer one would cost its length for each of them on every
 * drawing: it is a fault at its parent, and what it holds is not read.
 */
export const MAX_KEY_LENGTH = 100

/** The fault's words for a key longer than `MAX_KEY_LENGTH`. */
export const keyTooLong = (length: number): string =>
  `a key of ${length} characters is longer than any a member reads (${MAX_KEY_LENGTH} at most); ` +
  'what it holds is left out'

/** The prop a named control's value is in: `value`, or a checkbox's `checked`. `null` for a member that is no control. */
export function formPropOf(surface: Pick<ScreenSurface, 'controlled'>): 'value' | 'checked' | null {
  if ('value' in surface.controlled) return 'value'
  if ('checked' in surface.controlled) return 'checked'
  return null
}

/**
 * The names a control may not have, as the values of a screen's named controls are an object a
 * host reads and copies: each is a name every object has already, and
 * `Object.assign(target, { __proto__: … })` sets the target's prototype.
 */
export const INHERITED_NAMES: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
])

/** The fault for a control named a name every object has. */
export const inheritedNameFault = (name: string): string =>
  `a control may not be named \`${name}\`, a name every object has, as a host reads \`values\` ` +
  'as an object; it is left out of `values`'

/** The fault for a control named as one before it is, at `before`. */
export const sharedNameFault = (name: string, before: string): string =>
  `the control at \`${before}\` is named \`${name}\` too; \`values\` holds the last of them, ` +
  'this one'

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
