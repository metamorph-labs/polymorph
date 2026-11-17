import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import ts from 'typescript'

import {
  isBinding,
  isElement,
  isObjectValue,
  type ScreenInput,
  type ScreenSpec,
  type SpecElement,
  type SpecValue,
} from './schema'
import {
  EVENT_HANDLER_ALIAS,
  type NativePackage,
  type NativePlatform,
  type SpecJudges,
} from './validate'

/**
 * What the SwiftUI and Compose screen emitters share
 * (`design/native/screen-contract.md`): the member package each reads, the
 * contract's type table, the generated contract read as names and types, and
 * the walk that turns a spec's tree into calls. Each emitter supplies its
 * language's spelling (`emit-swift.ts`, `emit-kotlin.ts`); every rule the
 * contract states once for both platforms is decided here once.
 *
 * - **The member package** is the generated contract and the members the
 *   package draws (`readNativePackage`). A member it does not draw is a fault
 *   before anything is written, because the emitted call would not compile.
 * - **The type table** maps an input's TypeScript type to a type of the
 *   platform. It is parsed with the compiler's parser into a small tree
 *   (`NativeType`), which each language prints.
 * - **The contract** is read as the structs and enums it declares. A value
 *   the contract has no place for is a `NativeContractError`, never a guess:
 *   a prop the contract cannot express yet (`PMUnsupported…`), a binding whose
 *   input's type is not the prop's, a literal no case holds.
 */

/* -------------------------------------------------------------------------- */
/* The member package                                                         */
/* -------------------------------------------------------------------------- */

/** Where a checkout holds each native platform's generated contract and its list of drawn members. */
export const NATIVE_FILES: Readonly<
  Record<NativePlatform, { contract: string; drawn: string; unsupported: string }>
> = {
  ios: {
    contract: 'platforms/ios/Sources/PolymorphUI/Generated/Contracts.swift',
    drawn: 'platforms/ios/Sources/PolymorphUI/Generated/Fixtures.swift',
    unsupported: 'platforms/ios/Sources/PolymorphUI/Generated/Unsupported.swift',
  },
  android: {
    contract: 'platforms/android/ui/src/generated/kotlin/dev/polymorph/ui/Contracts.kt',
    drawn: 'platforms/android/ui/src/generated/kotlin/dev/polymorph/ui/Members.kt',
    unsupported: 'platforms/android/ui/src/generated/kotlin/dev/polymorph/ui/Unsupported.kt',
  },
}

/**
 * The members a generated file lists as drawn, by the name a screen calls.
 * On iOS, `Fixtures.swift` lists every member file's states fixture, and the
 * conformance law holds each member file to a view and a fixture both. On
 * Android, `Members.kt` declares the composable a screen calls for every
 * member with a rendering.
 */
export function drawnIn(platform: NativePlatform, source: string): string[] {
  return platform === 'ios'
    ? [...source.matchAll(/^\s+(\w+)States\(\),?$/gm)].map((match) => `PM${match[1] as string}`)
    : [...source.matchAll(/^fun (?:<[^>]*> )?(PM\w+)\(/gm)].map((match) => match[1] as string)
}

/** A checkout's member package for a native platform: its contract and the members it draws. */
export function readNativePackage(root: string, platform: NativePlatform): NativePackage {
  const files = NATIVE_FILES[platform]
  const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
  return {
    platform,
    contract: read(files.contract),
    rendered: drawnIn(platform, read(files.drawn)),
  }
}

/** Thrown when a native screen is emitted without its platform's member package. */
export class MissingContractError extends Error {
  constructor(platform: NativePlatform, given?: NativePlatform) {
    super(
      given === undefined
        ? `A screen for ${platform} is emitted against its member package, which declares every ` +
            'member’s props — pass `native` (`readNativePackage(root, ' +
            `'${platform}')\`, the text of \`${NATIVE_FILES[platform].contract}\` and the members ` +
            'it draws).'
        : `A screen for ${platform} is emitted against ${platform}’s member package, and the one ` +
            `passed as \`native\` is ${given}’s.`,
    )
    this.name = 'MissingContractError'
  }
}

/**
 * Thrown when the contract has no place for something the spec says: a member
 * with no props, or none the package draws, a prop the contract does not
 * declare or cannot express yet, a value of a kind its type cannot hold.
 */
export class NativeContractError extends Error {
  constructor(language: string, message: string) {
    super(`The ${language} contract cannot express this screen: ${message}`)
    this.name = 'NativeContractError'
  }
}

/* -------------------------------------------------------------------------- */
/* Names and text                                                             */
/* -------------------------------------------------------------------------- */

/** The width every emitted file is laid out at. */
export const WIDTH = 100

/** The vocabulary module whose types are `PM` + their name on a native platform. */
export const VOCABULARY = '@polymorph/react-ui'

export const capitalise = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`

/** `aria-label` → `ariaLabel`, `in-progress` → `inProgress`, as the contract generators name. */
export function camel(text: string): string {
  const words = text.split(/[^A-Za-z0-9]+/).filter(Boolean)
  const joined = words.map((word, index) => (index === 0 ? word : capitalise(word))).join('')
  return `${joined.charAt(0).toLowerCase()}${joined.slice(1)}`
}

/** Prose wrapped to fit `width` columns, one entry per line, a blank line kept as `''`. */
export function wrapped(text: string, width: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\r\n|\n|\r/)) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line !== '' && line.length + 1 + word.length > width) {
        lines.push(line)
        line = word
      } else {
        line = line === '' ? word : `${line} ${word}`
      }
    }
    lines.push(line)
  }
  return lines
}

/** Prose as line comments, `marker` before each line, wrapped to the width at `indent`. */
export function comment(text: string, indent: number, marker = '//'): string[] {
  const pad = ' '.repeat(indent)
  return wrapped(text, WIDTH - indent - marker.length - 1).map((line) =>
    line === '' ? `${pad}${marker}` : `${pad}${marker} ${line}`,
  )
}

/* -------------------------------------------------------------------------- */
/* The type table                                                             */
/* -------------------------------------------------------------------------- */

/** DOM event types. A parameter of one is left out, because a native member has no DOM event. */
const DOM_EVENTS = new Set([
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'ChangeEvent',
  'FormEvent',
  'FocusEvent',
  'PointerEvent',
])

/** A type the table does not map: why, as the end of a sentence. */
export class Unmapped extends Error {}

/** A type of the platform, by the contract's table, before a language spells it. */
export type NativeType =
  | { kind: 'string' }
  | { kind: 'number' }
  | { kind: 'boolean' }
  | { kind: 'void' }
  | { kind: 'named'; name: string; args: NativeType[]; nested?: boolean }
  | { kind: 'list'; element: NativeType }
  | { kind: 'set'; element: NativeType }
  | { kind: 'optional'; inner: NativeType }
  | { kind: 'function'; params: NativeParam[]; result: NativeType }

export interface NativeParam {
  /** The TypeScript signature's name for it, or `null` for a destructured one. */
  name: string | null
  type: NativeType
}

/** `T | null` once, however many times the source says it. */
export const optional = (type: NativeType): NativeType =>
  type.kind === 'optional' ? type : { kind: 'optional', inner: type }

/** An enum a union of string literals becomes, nested in the record that holds its input. */
export interface NativeEnum {
  name: string
  /** Each case's name in the language and the literal it stands for. */
  cases: { name: string; value: string }[]
}

/** An input's place in the two records, and its type. */
export interface MappedInput {
  role: 'action' | 'data'
  type: NativeType
  enumeration: NativeEnum | null
}

/** What a language decides about the type table. */
export interface TypeRules {
  language: string
  /** Type names a nested enum cannot take, because the records use them. */
  reservedTypes: ReadonlySet<string>
  /** A literal's case name, `value` already camelCased; `input` names the enum's input. */
  caseName: (value: string, input: string) => string
  /** Whether an action's parameters need names, as a Kotlin function's do. */
  namedParams: boolean
}

/**
 * What the table reads beside the type: the module `types` names each
 * identifier under, and the contract, when it is at hand, which says which
 * `PM…` names exist and which enum holds a union of vocabulary types.
 */
export interface TypeContext {
  modules: ReadonlyMap<string, string>
  contract: Contract | null
  rules: TypeRules
  /** Names a nested enum cannot take beyond the language's: the spec's `types` and declarations. */
  taken: ReadonlySet<string>
}

/** Type name → the module `types` names it under. */
export function modulesOf(spec: Pick<ScreenSpec, 'types'>): Map<string, string> {
  const modules = new Map<string, string>()
  for (const [module, names] of Object.entries(spec.types ?? {})) {
    for (const name of names) modules.set(name, module)
  }
  return modules
}

/** Types the member package's foundation declares beside the contract, by their web name. */
const FOUNDATION_TYPES: ReadonlyMap<string, readonly string[]> = new Map([
  ['PMControlSize', ['sm', 'md', 'lg']],
])

/** The text of a node, for a fault. */
const textOf = (node: ts.Node, file: ts.SourceFile) => node.getText(file).replace(/\s+/g, ' ')

function stripParens(node: ts.TypeNode): ts.TypeNode {
  let inner = node
  while (ts.isParenthesizedTypeNode(inner)) inner = inner.type
  return inner
}

const isNullish = (node: ts.TypeNode) => {
  const inner = stripParens(node)
  return (
    inner.kind === ts.SyntaxKind.UndefinedKeyword ||
    (ts.isLiteralTypeNode(inner) && inner.literal.kind === ts.SyntaxKind.NullKeyword)
  )
}

/** A reference's name, `React.` dropped: `MouseEvent`, `ReactEventHandler`. */
function referenceName(type: ts.TypeReferenceNode): string | null {
  if (ts.isIdentifier(type.typeName)) return type.typeName.text
  return ts.isIdentifier(type.typeName.left) && type.typeName.left.text === 'React'
    ? type.typeName.right.text
    : null
}

/** A DOM event type, `React.` or not, alone or with `undefined`. */
function isDomEvent(node: ts.TypeNode): boolean {
  const inner = stripParens(node)
  const solid = ts.isUnionTypeNode(inner) ? inner.types.filter((part) => !isNullish(part)) : [inner]
  return (
    solid.length > 0 &&
    solid.every((part) => {
      const type = stripParens(part)
      return ts.isTypeReferenceNode(type) && DOM_EVENTS.has(referenceName(type) ?? '')
    })
  )
}

/** `void`, or a `Promise<void>` the member does not wait for: an action's result that is nothing. */
function isNothing(node: ts.TypeNode): boolean {
  const type = stripParens(node)
  if (type.kind === ts.SyntaxKind.VoidKeyword) return true
  return (
    ts.isTypeReferenceNode(type) &&
    referenceName(type) === 'Promise' &&
    type.typeArguments?.length === 1 &&
    stripParens(type.typeArguments[0] as ts.TypeNode).kind === ts.SyntaxKind.VoidKeyword
  )
}

/** Whether the contract, or the foundation beside it, declares a type of this name. */
const declares = (contract: Contract, name: string) =>
  contract.structs.has(name) || contract.enums.has(name) || FOUNDATION_TYPES.has(name)

/**
 * One input's type, by the contract's table. Throws `Unmapped` for a type the
 * table does not map; `nativeInputFault` turns that into the validator's fault.
 */
export function mapInput(input: ScreenInput, context: TypeContext): MappedInput {
  const { modules, contract, rules } = context
  const file = ts.createSourceFile(
    'input.ts',
    `type T = ${input.type}`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const [alias] = file.statements
  if (alias === undefined || !ts.isTypeAliasDeclaration(alias)) {
    throw new Unmapped('is not a type')
  }

  let enumeration: NativeEnum | null = null

  const literalUnion = (values: string[]): NativeType => {
    if (enumeration !== null) {
      throw new Unmapped(
        'holds two unions of string literals, and each would be an enum named after the input — ' +
          'name one in `types`',
      )
    }
    const name = capitalise(camel(input.name))
    if (rules.reservedTypes.has(name) || context.taken.has(name)) {
      throw new Unmapped(
        `is a union of string literals, which becomes an enum named \`${name}\` after the input, ` +
          `and the file already uses that name — name the union in \`types\``,
      )
    }
    const seen = new Set<string>()
    const cases = values.map((value) => {
      const caseName = rules.caseName(camel(value), input.name)
      if (seen.has(caseName)) {
        throw new Unmapped(
          `has two literals that are both the case \`${caseName}\` once ${
            rules.language === 'Swift' ? 'camelCased' : 'PascalCased'
          } — ${rules.language} needs one name per case`,
        )
      }
      seen.add(caseName)
      return { name: caseName, value }
    })
    enumeration = { name, cases }
    return { kind: 'named', name, args: [], nested: true }
  }

  const map = (node: ts.TypeNode, position: 'value' | 'result'): NativeType => {
    const type = stripParens(node)

    if (ts.isUnionTypeNode(type)) {
      const solid = type.types.filter((part) => !isNullish(part))
      const nullable = solid.length < type.types.length
      if (solid.length === 0) {
        throw new Unmapped(
          `is \`null\` or \`undefined\` alone, which has no ${rules.language} type`,
        )
      }
      // `void | Promise<void>`: the member calls the function and does not wait for it.
      if (position === 'result' && solid.every(isNothing)) {
        return nullable ? optional({ kind: 'void' }) : { kind: 'void' }
      }
      let mapped: NativeType
      const strings = solid.map(stripParens)
      const literals = strings.every((part) => ts.isLiteralTypeNode(part))
      if (
        literals &&
        !strings.every((part) => ts.isStringLiteral((part as ts.LiteralTypeNode).literal))
      ) {
        throw new Unmapped(
          `holds the literals \`${textOf(type, file)}\`; only a union of string literals maps, as an enum`,
        )
      }
      if (literals) {
        mapped = literalUnion(
          strings.map((part) => ((part as ts.LiteralTypeNode).literal as ts.StringLiteral).text),
        )
      } else if (solid.length === 1) {
        mapped = map(solid[0] as ts.TypeNode, position)
      } else {
        const names = strings.map((part) =>
          ts.isTypeReferenceNode(part) &&
          ts.isIdentifier(part.typeName) &&
          part.typeArguments === undefined &&
          modules.get(part.typeName.text) === VOCABULARY
            ? part.typeName.text
            : null,
        )
        if (names.some((name) => name === null)) {
          throw new Unmapped(
            `is a union of unlike types (\`${textOf(type, file)}\`), which no one ${rules.language} ` +
              'type holds — name one type for it: a vocabulary type such as `CheckedState`, or one ' +
              'of the app’s, in `types`',
          )
        }
        const branches = names as string[]
        const named =
          contract === null ? `PM${branches.join('Or')}` : unionNamed(contract, branches)
        if (named === null) {
          throw new Unmapped(
            `is a union of ${branches.map((name) => `\`${name}\``).join(', ')}, and the member ` +
              'package declares no enum of those branches',
          )
        }
        mapped = { kind: 'named', name: named, args: [] }
      }
      return nullable ? optional(mapped) : mapped
    }

    if (isNullish(type)) {
      throw new Unmapped(`is \`null\` or \`undefined\` alone, which has no ${rules.language} type`)
    }
    if (ts.isLiteralTypeNode(type)) {
      if (ts.isStringLiteral(type.literal)) return literalUnion([type.literal.text])
      throw new Unmapped(
        `holds the literal \`${textOf(type, file)}\`; only a union of string literals maps, as an enum`,
      )
    }

    switch (type.kind) {
      case ts.SyntaxKind.StringKeyword:
        return { kind: 'string' }
      case ts.SyntaxKind.NumberKeyword:
        return { kind: 'number' }
      case ts.SyntaxKind.BooleanKeyword:
        return { kind: 'boolean' }
      // Any JSON value: the member packages' `PMJSONValue`, as their contracts
      // map a member's `unknown`.
      case ts.SyntaxKind.UnknownKeyword:
        return { kind: 'named', name: 'PMJSONValue', args: [] }
      case ts.SyntaxKind.VoidKeyword:
        if (position === 'result') return { kind: 'void' }
        break
      default:
        break
    }

    if (ts.isArrayTypeNode(type)) {
      return { kind: 'list', element: map(type.elementType, 'value') }
    }
    if (
      ts.isTypeOperatorNode(type) &&
      type.operator === ts.SyntaxKind.ReadonlyKeyword &&
      ts.isArrayTypeNode(stripParens(type.type))
    ) {
      return map(type.type, 'value')
    }

    if (ts.isTypeReferenceNode(type)) {
      const name = referenceName(type)
      // React's handler aliases are each a function of one DOM event, which a
      // native member has none of: an action that takes nothing.
      if (name !== null && EVENT_HANDLER_ALIAS.test(name)) {
        return { kind: 'function', params: [], result: { kind: 'void' } }
      }
      if (name !== null && ts.isIdentifier(type.typeName)) {
        if (position === 'result' && isNothing(type)) return { kind: 'void' }
        const args = (type.typeArguments ?? []).map((arg) => map(arg, 'value'))
        if ((name === 'Array' || name === 'ReadonlyArray') && args.length === 1) {
          return { kind: 'list', element: args[0] as NativeType }
        }
        if ((name === 'Set' || name === 'ReadonlySet') && args.length === 1) {
          return { kind: 'set', element: args[0] as NativeType }
        }
        const module = modules.get(name)
        // The web's `File`, a file a person chose: the member packages' `PMFile`,
        // unless `types` names an app's own type of that name.
        if (module === undefined && name === 'File' && args.length === 0) {
          return { kind: 'named', name: 'PMFile', args: [] }
        }
        if (module === undefined) {
          throw new Unmapped(
            `names \`${name}\`, which \`types\` does not declare — a vocabulary type is named under ` +
              `\`${VOCABULARY}\`, and the app’s own under its module`,
          )
        }
        return { kind: 'named', name: namedType(name, module, contract), args }
      }
    }

    if (ts.isFunctionTypeNode(type)) {
      if (type.typeParameters !== undefined) {
        throw new Unmapped('is a generic function, which a closure cannot be')
      }
      const params = type.parameters
        .filter((param) => param.type === undefined || !isDomEvent(param.type))
        .map((param): NativeParam => {
          if (param.dotDotDotToken !== undefined) {
            throw new Unmapped('takes a rest parameter, which a closure cannot')
          }
          if (param.type === undefined) {
            throw new Unmapped(`has a parameter with no type, \`${textOf(param, file)}\``)
          }
          const name = ts.isIdentifier(param.name) ? param.name.text : null
          if (name === null && rules.namedParams) {
            throw new Unmapped(
              `has a destructured parameter, \`${textOf(param, file)}\`, and ${rules.language} ` +
                'declares each of an action’s parameters by name — name it',
            )
          }
          const mapped = map(param.type, 'value')
          return { name, type: param.questionToken === undefined ? mapped : optional(mapped) }
        })
      return { kind: 'function', params, result: map(type.type, 'result') }
    }

    if (ts.isTypeLiteralNode(type)) {
      throw new Unmapped(
        `is an object type literal — ${rules.language} types by name, so name the structure: a ` +
          'vocabulary type such as `FilterResultCount`, or one of the app’s, in `types`',
      )
    }

    throw new Unmapped(
      `holds \`${textOf(type, file)}\`, which the contract’s type table does not map`,
    )
  }

  /**
   * A name `types` declares, in the platform's terms: a vocabulary type is
   * `PM` + its name, which the member package must declare when it is at
   * hand; a type from a package the member package also declares (`CalendarDate`
   * from `@internationalized/date`) is the package's; any other is the app's.
   */
  function namedType(name: string, module: string, known: Contract | null): string {
    const vocabulary = `PM${name}`
    if (module === VOCABULARY) {
      if (known !== null && !declares(known, vocabulary)) {
        throw new Unmapped(
          `names \`${name}\`, and the member package declares no \`${vocabulary}\` — use a ` +
            'vocabulary type the package declares, or one of the app’s',
        )
      }
      return vocabulary
    }
    return !module.startsWith('.') && known !== null && declares(known, vocabulary)
      ? vocabulary
      : name
  }

  // An action is a function alone or with `null` or `undefined`: the mapping
  // keeps its signature exactly then, and makes it a value of the record
  // inside an array or a type argument.
  const mapped = map(alias.type, 'value')
  const solid = mapped.kind === 'optional' ? mapped.inner : mapped
  return { role: solid.kind === 'function' ? 'action' : 'data', type: mapped, enumeration }
}

/**
 * Why an input's type has no type by the contract's table, as the end of a
 * sentence, or `null` when it maps. The validator's judge for a native
 * screen (`SpecJudges.nativeType`), with the contract when it is at hand.
 */
export function nativeInputFault(
  input: ScreenInput,
  spec: ScreenSpec,
  rules: TypeRules,
  contract: Contract | null,
  declared: readonly string[],
): string | null {
  try {
    mapInput(input, {
      modules: modulesOf(spec),
      contract,
      rules,
      taken: new Set([...Object.values(spec.types ?? {}).flat(), ...declared]),
    })
    return null
  } catch (error) {
    if (error instanceof Unmapped) return error.message
    throw error
  }
}

/**
 * The union enum of `branches`, by its payloads: `SelectOption |
 * SelectOptionGroup` is the enum whose cases hold `PMSelectOption` and
 * `PMSelectOptionGroup`.
 */
function unionNamed(contract: Contract, branches: string[]): string | null {
  const wanted = new Set(branches.map((name) => `PM${name}`))
  for (const [name, union] of contract.enums) {
    const payloads = union.cases.map((entry) => entry.payload)
    if (
      payloads.length === wanted.size &&
      payloads.every((payload) => payload !== null && wanted.has(payload))
    ) {
      return name
    }
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* The contract, read                                                         */
/* -------------------------------------------------------------------------- */

export interface ContractParam {
  label: string
  type: string
  /** It has a default, so a call may leave it out. */
  defaulted: boolean
}

export interface ContractStruct {
  params: ContractParam[]
  /** Its type parameters: `Row` for `PMDataTableProps<Row>`. */
  generics: string[]
}

export interface ContractCase {
  name: string
  raw: string | number | null
  payload: string | null
}

export interface ContractEnum {
  cases: ContractCase[]
  /** For a union of payload-free cases: each case's web branch (`true`, `'indeterminate'`), in order. */
  branches: string[] | null
}

/** The structs and enums a generated contract declares, by name. */
export interface Contract {
  structs: Map<string, ContractStruct>
  enums: Map<string, ContractEnum>
}

/**
 * A union enum's branches, from the doc comment the generators write above it:
 * "The web's `CheckedState`: `false`, `true`, `'indeterminate'`, one case
 * each". `null` for any other enum, or when the count does not match.
 */
export function branchesOf(doc: string[], count: number): string[] | null {
  const text = doc.join(' ')
  const end = text.indexOf(', one case each')
  if (end === -1) return null
  const head = text.slice(0, end)
  const list = head.includes('`: ') ? head.slice(head.indexOf('`: ') + 3) : head
  const branches = [...list.matchAll(/`([^`]+)`/g)].map((match) => match[1] as string)
  return branches.length === count ? branches : null
}

/** `PMDataTableColumn<Row>` → `PMDataTableColumn`. */
export const withoutGenerics = (type: string) => type.replace(/<.*>$/, '')

/** `Row, Column` → `['Row', 'Column']`. */
export const genericsOf = (text: string | undefined) =>
  text === undefined ? [] : text.split(',').map((name) => name.trim())

/* -------------------------------------------------------------------------- */
/* Code, and how it is laid out                                               */
/* -------------------------------------------------------------------------- */

export type Code =
  | { kind: 'atom'; text: string }
  | { kind: 'call'; callee: string; args: Arg[]; trailing: Code | null; comment: string | null }
  | { kind: 'block'; opener: string; items: Code[] }
  | { kind: 'array'; items: Code[] }

export interface Arg {
  label: string | null
  value: Code
}

export const atom = (text: string): Code => ({ kind: 'atom', text })
export const call = (
  callee: string,
  args: Arg[],
  note: string | null = null,
  trailing: Code | null = null,
): Code => ({ kind: 'call', callee, args, trailing, comment: note })
export const block = (opener: string, items: Code[]): Code => ({ kind: 'block', opener, items })

/** How a language writes the parts of a call. */
export interface Style {
  /** Spaces per level. */
  indent: number
  /** What precedes a labelled argument's value: `label: ` or `label = `. */
  label: (label: string) => string
  /** Whether the last argument of a call laid out on many lines takes a comma too. */
  trailingComma: boolean
  /** Whether a block of one item may sit on one line: `{ PMButton(…) }`. */
  flatBlocks: boolean
}

/** The code on one line, or `null` when it holds a comment or a block, which take lines of their own. */
function flat(code: Code, style: Style): string | null {
  switch (code.kind) {
    case 'atom':
      return code.text
    case 'block': {
      if (!style.flatBlocks || code.opener !== '') return null
      if (code.items.length === 0) return '{}'
      if (code.items.length > 1) return null
      const only = flat(code.items[0] as Code, style)
      return only === null ? null : `{ ${only} }`
    }
    case 'array': {
      const items = code.items.map((item) => flat(item, style))
      return items.includes(null) ? null : `[${items.join(', ')}]`
    }
    case 'call': {
      if (code.comment !== null) return null
      const args = flatArgs(code.args, style)
      if (args === null) return null
      if (code.trailing === null) return `${code.callee}(${args})`
      const trailing = flat(code.trailing, style)
      if (trailing === null) return null
      return code.args.length === 0
        ? `${code.callee} ${trailing}`
        : `${code.callee}(${args}) ${trailing}`
    }
  }
}

function flatArgs(args: Arg[], style: Style): string | null {
  const written = args.map((arg) => {
    const value = flat(arg.value, style)
    return value === null ? null : `${arg.label === null ? '' : style.label(arg.label)}${value}`
  })
  return written.includes(null) ? null : written.join(', ')
}

/**
 * The code's lines at `indent`, with `lead` (an argument's label) before it and
 * `tail` (a comma) after. A call that fits stays on one line; one that does
 * not puts each argument on its own line. A comment goes on the lines above.
 */
export function layout(code: Code, indent: number, style: Style, lead = '', tail = ''): string[] {
  const pad = ' '.repeat(indent)
  const inner = indent + style.indent
  const above = code.kind === 'call' && code.comment !== null ? comment(code.comment, indent) : []
  const oneLine = flat(code, style)
  if (oneLine !== null && pad.length + lead.length + oneLine.length + tail.length <= WIDTH) {
    return [...above, `${pad}${lead}${oneLine}${tail}`]
  }
  const items = (list: Code[]) => list.flatMap((item) => layout(item, inner, style))
  switch (code.kind) {
    case 'atom':
      return [`${pad}${lead}${code.text}${tail}`]
    case 'block':
      return [`${pad}${lead}${code.opener}{`, ...items(code.items), `${pad}}${tail}`]
    case 'array':
      return [
        `${pad}${lead}[`,
        ...code.items.flatMap((item) => layout(item, inner, style, '', ',')),
        `${pad}]${tail}`,
      ]
    case 'call': {
      const args = code.args.flatMap((arg, index) =>
        layout(
          arg.value,
          inner,
          style,
          arg.label === null ? '' : style.label(arg.label),
          style.trailingComma || index < code.args.length - 1 ? ',' : '',
        ),
      )
      if (code.trailing === null) {
        return [...above, `${pad}${lead}${code.callee}(`, ...args, `${pad})${tail}`]
      }
      const body = code.trailing.kind === 'block' ? items(code.trailing.items) : []
      const together = flatArgs(code.args, style)
      const head =
        code.args.length === 0
          ? [`${pad}${lead}${code.callee} {`]
          : together !== null &&
              pad.length + lead.length + code.callee.length + together.length + 4 <= WIDTH
            ? [`${pad}${lead}${code.callee}(${together}) {`]
            : [`${pad}${lead}${code.callee}(`, ...args, `${pad}) {`]
      return [...above, ...head, ...body, `${pad}}${tail}`]
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Types the contract writes                                                  */
/* -------------------------------------------------------------------------- */

/** A contract type's shape: its base type, how many optional levels wrap it, and what it is. */
export interface Shape {
  base: string
  optional: number
  closure: boolean
  /** It draws: `PMContent`. */
  content: boolean
  /** On Android, the second level is `PMSome<T?>`, which every given value is wrapped in. */
  some: boolean
}

/** The index of the bracket that closes the one at 0, or -1. */
export function closes(text: string): number {
  let depth = 0
  for (let at = 0; at < text.length; at += 1) {
    if ('(<['.includes(text[at] as string)) depth += 1
    else if (')>]'.includes(text[at] as string) && !(text[at] === '>' && text[at - 1] === '-')) {
      depth -= 1
      if (depth === 0) return at
    }
  }
  return -1
}

/**
 * Whether a type is a function at its top level: an arrow outside every
 * bracket. `(Row) -> String?` is a function whose result is optional, and
 * `((Row) -> String)?` an optional function.
 */
export function topLevelArrow(text: string): boolean {
  let depth = 0
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at] as string
    if (char === '-' && text[at + 1] === '>') {
      if (depth === 0) return true
      at += 1
    } else if ('(<['.includes(char)) depth += 1
    else if (')>]'.includes(char)) depth -= 1
  }
  return false
}

/** The text without the parentheses around all of it. */
export function unparenthesised(text: string): string {
  let inner = text.trim()
  while (inner.startsWith('(') && closes(inner) === inner.length - 1) inner = inner.slice(1, -1)
  return inner
}

/**
 * Whether a contract type, as a language prints it, fits an input's printed
 * type: the same type once whitespace is ignored, with the member's type
 * parameters standing for any type and the prop's optional levels taken off
 * one by one, because a value fits where an optional one is wanted.
 */
export function fits(
  given: string,
  wanted: string,
  generics: readonly string[],
  unwrap: (type: string) => string | null,
): boolean {
  const normal = (text: string) => text.replace(/\s+/g, ' ').trim()
  const target = normal(given)
  for (let type: string | null = normal(wanted); type !== null; type = unwrap(type)) {
    if (matches(target, type, generics)) return true
  }
  return false
}

function matches(given: string, wanted: string, generics: readonly string[]): boolean {
  if (generics.length === 0) return given === wanted
  const seen = new Set<string>()
  const escaped = wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = escaped.replace(new RegExp(`\\b(${generics.join('|')})\\b`, 'g'), (name) => {
    if (seen.has(name)) return `\\k<${name}>`
    seen.add(name)
    return `(?<${name}>[^()]+?)`
  })
  return new RegExp(`^${pattern}$`).test(given)
}

/* -------------------------------------------------------------------------- */
/* The tree                                                                   */
/* -------------------------------------------------------------------------- */

/** How a language spells what the walk produces. */
export interface Dialect {
  language: string
  platform: NativePlatform
  style: Style
  scalars: { string: string; number: string; boolean: string }
  /** The name a member or a compound part is drawn by, as `NativePackage.rendered` lists it. */
  drawnBy: (component: string) => string
  /** A member's call: its arguments in the contract's order, and a slot that trails, if any. */
  member: (
    component: string,
    struct: ContractStruct,
  ) => { params: ContractParam[]; trailing: ContractParam | null }
  /** The call of a member, from its arguments and the slot that trails. */
  call: (component: string, args: Arg[], trailing: Code | null, note: string | null) => Code
  shape: (type: string) => Shape
  /** One optional level off a contract type, or `null` when it has none. */
  unwrap: (type: string) => string | null
  /** The element type of a list or a set the contract writes, or `null`. */
  sequence: (base: string) => { element: string; set: boolean } | null
  string: (text: string) => string
  number: (value: number) => string
  /** `PMGridColumns`'s case `columns4`: `.columns4` or `PMGridColumns.Columns4`. */
  enumCase: (enumName: string, caseName: string) => string
  /** A foundation enum's case for a literal, which is the case's name. */
  foundationCase: (enumName: string, raw: string) => string
  /** `null` where the type is optional at `level`. */
  none: (shape: Shape) => Code | null
  /** A value placed in a type: a model value, a literal or an action. */
  given: (code: Code, shape: Shape, source: 'model' | 'literal' | 'action') => Code
  list: (items: Code[], set: boolean) => Code
  struct: (name: string, args: Arg[]) => Code
  unionCase: (enumName: string, caseName: string, payload: Code) => Code
  /** Text drawn where a view goes, as the web draws a text node. */
  text: (value: Code) => Code
  /** What a content slot draws, or `null` when it draws nothing and may be left out. */
  content: (drawn: Code[], optional: boolean) => Code | null
  /** The code a binding to an input reads. */
  binding: (path: string, role: InputRole) => string
}

/** A binding's input: model data, an action, or an action the app may leave unset. */
export type InputRole = 'data' | 'action' | 'optionalAction'

/** What the walk reads beside the tree. */
export interface Walk {
  dialect: Dialect
  contract: Contract
  rendered: ReadonlySet<string>
  /** Each input's role and its type as the language prints it, so a binding is checked. */
  inputs: ReadonlyMap<string, { role: InputRole; printed: string }>
}

/** A value the contract has no place for. */
const fault = (walk: Walk, message: string): never => {
  throw new NativeContractError(walk.dialect.language, message)
}

/** `onSave` → its role and printed type; a dotted path into model data has neither. */
function inputOf(path: string, walk: Walk) {
  const [head = path, ...rest] = path.split('.')
  const input = walk.inputs.get(head)
  return { role: input?.role ?? 'data', printed: rest.length === 0 ? input?.printed : undefined }
}

/** A binding, checked against the type the contract wants where it lands. */
function bound(
  path: string,
  type: string,
  generics: readonly string[],
  where: string,
  walk: Walk,
): { code: string; role: InputRole } {
  const { role, printed } = inputOf(path, walk)
  if (printed !== undefined && !fits(printed, type, generics, walk.dialect.unwrap)) {
    fault(walk, `${where} is \`${type}\`, and \`${path}\` is \`${printed}\``)
  }
  return { code: walk.dialect.binding(path, role), role }
}

/** One member, as the call its member package declares. */
export function element(node: SpecElement, walk: Walk): Code {
  const { dialect } = walk
  const [owner = node.component, part] = node.component.split('.')
  const propsName = `PM${owner}${part ?? ''}Props`
  const struct = walk.contract.structs.get(propsName)
  if (struct === undefined) {
    return fault(walk, `the contract declares no \`${propsName}\` for \`${node.component}\``)
  }
  if (!walk.rendered.has(dialect.drawnBy(node.component))) {
    fault(
      walk,
      `\`${node.component}\` has no ${dialect.platform === 'ios' ? 'SwiftUI' : 'Compose'} ` +
        'rendering yet, so a call to it would not compile',
    )
  }

  const given = new Map<string, { name: string; value: SpecValue }>()
  const halves: { variant?: SpecValue; tone?: SpecValue } = {}
  const paired = struct.params.some((param) => param.label === 'appearance')
  for (const [name, value] of Object.entries(node.props ?? {})) {
    if (paired && (name === 'variant' || name === 'tone')) halves[name] = value
    else given.set(camel(name), { name, value })
  }
  if ((node.children ?? []).length > 0) {
    given.set('children', { name: 'children', value: node.children as SpecValue[] })
  }

  const { params, trailing } = dialect.member(node.component, struct)
  const valueFor = (param: ContractParam): Code | null => {
    const where = `\`${node.component}\`’s \`${param.label}\``
    let value: Code | null = null
    if (param.label === 'loadStatus') {
      value = atom('model.loadStatus')
    } else if (param.label === 'appearance' && paired) {
      value = appearance(owner, halves, param.type, walk)
    } else {
      const prop = given.get(param.label)
      given.delete(param.label)
      if (prop !== undefined) value = valueOf(prop.value, param.type, struct.generics, where, walk)
      // A page or a group with no children still takes its content: nothing.
      else if (param.label === 'children') {
        value = valueOf([], param.type, struct.generics, where, walk)
      }
    }
    if (value === null && !param.defaulted) {
      fault(walk, `${where} is required, and the spec gives it nothing to hold`)
    }
    return value
  }

  const args: Arg[] = []
  for (const param of params) {
    const value = valueFor(param)
    if (value !== null) args.push({ label: param.label, value })
  }
  const trailed = trailing === null ? null : valueFor(trailing)
  for (const [label, prop] of given) {
    fault(walk, `\`${propsName}\` declares no \`${label}\` for the prop \`${prop.name}\``)
  }

  const reason =
    node.exception === undefined
      ? null
      : `Rung ${node.exception.rung}, declared: ${node.exception.because}`
  return dialect.call(node.component, args, trailed, reason)
}

/** A grid member's `variant` and `tone`, as the one lawful cell of its `Appearance` enum. */
function appearance(
  owner: string,
  halves: { variant?: SpecValue; tone?: SpecValue },
  type: string,
  walk: Walk,
): Code | null {
  if (halves.variant === undefined && halves.tone === undefined) return null
  const name = walk.dialect.shape(type).base
  const cells = walk.contract.enums.get(name)?.cases ?? []
  const variant = halves.variant
  const tone = halves.tone
  if (
    (variant !== undefined && typeof variant !== 'string') ||
    (tone !== undefined && typeof tone !== 'string')
  ) {
    fault(
      walk,
      `\`${owner}\`’s variant and tone are one lawful cell, \`${name}\`, written as literals`,
    )
  }
  const matches = cells.filter((cell) => {
    const [cellVariant, cellTone] = String(cell.raw).split('/')
    return (
      (variant === undefined || cellVariant === variant) &&
      (tone === undefined || cellTone === tone)
    )
  })
  if (matches.length !== 1) {
    fault(
      walk,
      `\`${owner}\` has ${matches.length === 0 ? 'no' : 'more than one'} lawful cell for ` +
        `${[variant, tone].filter((half) => half !== undefined).join(' and ')} in \`${name}\``,
    )
  }
  return atom(walk.dialect.enumCase(name, (matches[0] as ContractCase).name))
}

/**
 * A spec value where the contract declares `type`, or `null` when the value
 * draws nothing in an optional place and the argument is left out.
 */
function valueOf(
  raw: SpecValue,
  type: string,
  generics: readonly string[],
  where: string,
  walk: Walk,
): Code | null {
  const { dialect } = walk
  const shape = dialect.shape(type)
  const { base } = shape
  const refuse = (what: string): never =>
    fault(walk, `${where} is \`${type}\`, and the spec gives it ${what}`)

  if (base.startsWith('PMUnsupported')) {
    fault(
      walk,
      `${where} is \`${type}\`, a prop the ${dialect.language} contract cannot express yet ` +
        `(\`${NATIVE_FILES[dialect.platform].unsupported}\`) — leave it out`,
    )
  }
  if (shape.content) {
    return content(Array.isArray(raw) ? raw : [raw], shape.optional > 0, where, walk)
  }

  if (isBinding(raw)) {
    const { code, role } = bound(raw.$, type, generics, where, walk)
    return dialect.given(atom(code), shape, role === 'data' ? 'model' : 'action')
  }
  if (raw === null) return dialect.none(shape) ?? refuse('`null`')

  const literal = (): Code | null => {
    if (Array.isArray(raw)) {
      if (base === dialect.scalars.string) return textOnly(raw, where, walk)
      const sequence = dialect.sequence(base)
      if (sequence === null)
        return payloadCase(base, raw, generics, where, walk) ?? refuse('a list')
      return dialect.list(
        raw.map(
          (item) =>
            valueOf(item, sequence.element, generics, where, walk) ?? refuse('an empty item'),
        ),
        sequence.set,
      )
    }
    if (isElement(raw)) return refuse(`the element \`${raw.component}\``)
    if (isObjectValue(raw)) return structured(raw.$object, base, where, walk) ?? refuse('an object')

    if (typeof raw === 'boolean') {
      if (base === dialect.scalars.boolean) return atom(String(raw))
      return branch(base, String(raw), where, walk) ?? refuse(`\`${String(raw)}\``)
    }
    if (typeof raw === 'number') {
      if (base === dialect.scalars.number) return atom(dialect.number(raw))
      if (base === dialect.scalars.string) return atom(dialect.string(String(raw)))
      return (
        enumCase(base, raw, where, walk) ??
        payloadCase(base, raw, generics, where, walk) ??
        refuse(`the number ${String(raw)}`)
      )
    }
    if (base === dialect.scalars.string) return atom(dialect.string(raw))
    return (
      enumCase(base, raw, where, walk) ??
      payloadCase(base, raw, generics, where, walk) ??
      branch(base, `'${raw}'`, where, walk) ??
      refuse(`the text ${JSON.stringify(raw)}`)
    )
  }
  const code = literal()
  return code === null ? null : dialect.given(code, shape, 'literal')
}

/** A literal as the case of an enum whose raw value it is. */
function enumCase(base: string, raw: string | number, where: string, walk: Walk): Code | null {
  const declaredEnum = walk.contract.enums.get(base)
  if (declaredEnum === undefined) {
    // The foundation declares `PMControlSize` beside the contract, a case per
    // size named as the size is. Nothing else is assumed to be an enum.
    const foundation = FOUNDATION_TYPES.get(base)
    if (foundation === undefined) return null
    if (typeof raw !== 'string' || !foundation.includes(raw)) {
      return fault(walk, `${where} has no case for ${JSON.stringify(raw)} in \`${base}\``)
    }
    return atom(walk.dialect.foundationCase(base, raw))
  }
  const found = declaredEnum.cases.find(
    (entry) => entry.raw === raw || (typeof raw === 'number' && entry.raw === String(raw)),
  )
  if (found === undefined) {
    if (declaredEnum.cases.some((entry) => entry.raw !== null)) {
      fault(walk, `${where} has no case for ${JSON.stringify(raw)} in \`${base}\``)
    }
    return null
  }
  return atom(walk.dialect.enumCase(base, found.name))
}

/** A literal as the case of a union enum whose web branch it is: `true` → `.checked`. */
function branch(base: string, written: string, where: string, walk: Walk): Code | null {
  const union = walk.contract.enums.get(base)
  if (union?.branches == null) return null
  const alternatives = new Set([written, written.replace(/^'(.*)'$/, '"$1"')])
  const index = union.branches.findIndex((entry) => alternatives.has(entry))
  if (index === -1) {
    fault(walk, `${where} has no case for ${written} in \`${base}\``)
  }
  return atom(walk.dialect.enumCase(base, (union.cases[index] as ContractCase).name))
}

/**
 * A number, a text or a list as the one case of a union enum whose payload
 * takes it, as the web's union takes the value itself: `40` as
 * `PMSliderValue.Single(40.0)`, `"billing"` as `PMChoiceValue.Single`, a list
 * as `PMChoiceValue.Multiple`. Null when no case takes it, or more than one.
 */
function payloadCase(
  base: string,
  raw: string | number | SpecValue[],
  generics: readonly string[],
  where: string,
  walk: Walk,
): Code | null {
  const { dialect } = walk
  const union = walk.contract.enums.get(withoutGenerics(base))
  if (union === undefined) return null
  const takes = (payload: string): boolean =>
    Array.isArray(raw)
      ? dialect.sequence(payload) !== null
      : payload === (typeof raw === 'number' ? dialect.scalars.number : dialect.scalars.string)
  const [chosen, ...others] = union.cases.filter(
    (entry) => entry.payload !== null && takes(entry.payload),
  )
  if (chosen === undefined || others.length > 0) return null
  const payload = valueOf(raw, chosen.payload as string, generics, where, walk)
  return payload === null ? null : dialect.unionCase(withoutGenerics(base), chosen.name, payload)
}

/**
 * A structured object as the struct its type names, or as the one case of a
 * union enum whose payload takes it: `PMEmptyStateProps(…)`,
 * `.option(PMSelectOption(…))`.
 */
function structured(
  object: Record<string, SpecValue>,
  base: string,
  where: string,
  walk: Walk,
): Code | null {
  const name = withoutGenerics(base)
  const struct = walk.contract.structs.get(name)
  if (struct !== undefined) {
    const given = new Map(Object.entries(object).map(([key, value]) => [camel(key), value]))
    const args: Arg[] = []
    for (const param of struct.params) {
      const value = given.get(param.label)
      given.delete(param.label)
      const code =
        value === undefined
          ? null
          : valueOf(value, param.type, struct.generics, `${where}’s \`${param.label}\``, walk)
      if (code !== null) args.push({ label: param.label, value: code })
      else if (!param.defaulted) {
        fault(walk, `${where}’s \`${param.label}\` is required in \`${name}\``)
      }
    }
    const [stray] = given.keys()
    if (stray !== undefined) {
      fault(walk, `${where} is \`${name}\`, which declares no \`${stray}\``)
    }
    return walk.dialect.struct(name, args)
  }

  const union = walk.contract.enums.get(name)
  if (union === undefined) return null
  const keys = Object.keys(object).map(camel)
  const candidates = union.cases.filter((entry) => {
    const payload = entry.payload === null ? undefined : walk.contract.structs.get(entry.payload)
    return (
      payload !== undefined &&
      keys.every((key) => payload.params.some((param) => param.label === key)) &&
      payload.params.every((param) => param.defaulted || keys.includes(param.label))
    )
  })
  if (candidates.length !== 1) {
    fault(
      walk,
      `${where} is \`${name}\`, and ${candidates.length === 0 ? 'no' : 'more than one'} case ` +
        `takes an object with ${keys.map((key) => `\`${key}\``).join(', ')}`,
    )
  }
  const chosen = candidates[0] as ContractCase
  const payload = structured(object, chosen.payload as string, where, walk) as Code
  return walk.dialect.unionCase(name, chosen.name, payload)
}

/** What one content slot draws: each element's call, and each text as text. */
function content(items: SpecValue[], optional: boolean, where: string, walk: Walk): Code | null {
  const { dialect } = walk
  const drawn = (items.flat(Infinity as 1) as SpecValue[])
    .filter((item) => item !== null && typeof item !== 'boolean')
    .map((item): Code => {
      if (isElement(item)) return element(item, walk)
      if (typeof item === 'string') return dialect.text(atom(dialect.string(item)))
      if (typeof item === 'number') return dialect.text(atom(dialect.string(String(item))))
      if (isBinding(item)) {
        return dialect.text(atom(bound(item.$, dialect.scalars.string, [], where, walk).code))
      }
      return fault(walk, `${where} draws views, and the spec gives it a structured object`)
    })
  return dialect.content(drawn, optional)
}

/** Children a member takes as one string: one text, one number, or one binding. */
function textOnly(items: SpecValue[], where: string, walk: Walk): Code {
  const { dialect } = walk
  const kind = dialect.scalars.string
  const texts = (items.flat(Infinity as 1) as SpecValue[]).filter((item) => item !== null)
  const [only] = texts
  if (texts.length !== 1 || only === undefined) {
    return fault(
      walk,
      `${where} is one \`${kind}\`, and the spec gives it ${texts.length} children`,
    )
  }
  if (typeof only === 'string') return atom(dialect.string(only))
  if (typeof only === 'number') return atom(dialect.string(String(only)))
  if (isBinding(only)) return atom(bound(only.$, kind, [], where, walk).code)
  return fault(walk, `${where} is one \`${kind}\`, and the spec gives it a view`)
}

/* -------------------------------------------------------------------------- */
/* The judges                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The validator's judges for a native screen: its inputs' types by the
 * contract's table, and, with the member package, the names the package
 * declares and the members it draws.
 */
export function nativeJudges(
  dialect: Pick<Dialect, 'drawnBy'>,
  rules: TypeRules,
  read: ((source: string) => Contract) | null,
  native: NativePackage | undefined,
  declarations: (name: string) => string[],
): Pick<SpecJudges, 'nativeType' | 'renders'> {
  const contract = native === undefined || read === null ? null : read(native.contract)
  const drawn = native === undefined ? null : new Set(native.rendered)
  return {
    nativeType: (input, spec) =>
      nativeInputFault(input, spec, rules, contract, declarations(spec.name)),
    ...(drawn === null
      ? {}
      : { renders: (component: string) => drawn.has(dialect.drawnBy(component)) }),
  }
}

/* -------------------------------------------------------------------------- */
/* The emitter's law                                                          */
/* -------------------------------------------------------------------------- */

/** A construct an emitted view may not hold, and why. */
export interface Forbidden {
  pattern: RegExp
  what: string
}

/**
 * The source with every comment and string literal emptied, so only code is
 * read. Block comments nest, as Kotlin's do; the emitters write no raw or
 * multi-line string.
 */
export function codeOnly(source: string): string {
  let code = ''
  for (let at = 0; at < source.length; at += 1) {
    const char = source[at] as string
    if (char === '/' && source[at + 1] === '/') {
      while (at < source.length && source[at] !== '\n') at += 1
      code += '\n'
    } else if (char === '/' && source[at + 1] === '*') {
      let depth = 0
      for (; at < source.length; at += 1) {
        if (source[at] === '/' && source[at + 1] === '*') {
          depth += 1
          at += 1
        } else if (source[at] === '*' && source[at + 1] === '/') {
          depth -= 1
          at += 1
          if (depth === 0) break
        } else if (source[at] === '\n') code += '\n'
      }
    } else if (char === '"') {
      for (at += 1; at < source.length && source[at] !== '"'; at += 1) {
        if (source[at] === '\\') at += 1
      }
      code += '""'
    } else {
      code += char
    }
  }
  return code
}

/** Every forbidden construct found in a source's code: `'<construct>' (<what>)`. */
export function violationsIn(source: string, forbidden: readonly Forbidden[]): string[] {
  const code = codeOnly(source)
  return forbidden.flatMap(({ pattern, what }) => {
    const found = new RegExp(pattern.source, 'g')
    return [...code.matchAll(found)].map((match) => `\`${match[0]}\` (${what})`)
  })
}
