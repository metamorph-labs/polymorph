import { sep } from 'node:path'

import type { ScreenInput, ScreenSpec } from './schema'
import {
  atom,
  block,
  branchesOf,
  call,
  camel,
  capitalise,
  codeOnly,
  comment,
  element,
  genericsOf,
  layout,
  mapInput,
  modulesOf,
  NativeContractError,
  nativeJudges,
  topLevelArrow,
  Unmapped,
  unparenthesised,
  violationsIn,
  WIDTH,
  wrapped,
  type Contract,
  type ContractCase,
  type ContractEnum,
  type ContractParam,
  type ContractStruct,
  type Dialect,
  type Forbidden,
  type InputRole,
  type MappedInput,
  type NativeType,
  type Shape,
  type TypeRules,
  type Walk,
} from './emit-native'
import { KOTLIN_KEYWORDS, nativeDeclarations, type NativePackage } from './validate'

/**
 * Spec to Jetpack Compose.
 *
 * A screen spec whose `platform` is `android` emits one Kotlin file, the
 * stateless view of two values that `design/native/screen-contract.md`
 * describes:
 *
 * - `data class <Screen>Model`, the data the screen shows: `loadStatus` first,
 *   then every input whose type is not a function, in the spec's order, and
 *   an empty `companion object`, which the app extends with values of its own
 *   (`InboxModel.placeholder`);
 * - `interface <Screen>Actions`, one function per function input, in the
 *   spec's order, with the web's name and payload, so an implementation that
 *   leaves one out does not compile. An action the app may leave unset,
 *   `(() => void) | null`, is a property of a nullable function type. No
 *   function is `suspend`: the app owns every coroutine;
 * - `@Composable fun <Screen>Screen(model, actions)`, whose body is the spec's
 *   tree: each member as the composable its member package declares
 *   (`Members.kt`), its props as named arguments and its children as a
 *   trailing lambda, a binding in an event prop read from `actions`, any other
 *   from `model`, and the root page archetype handed `model.loadStatus`;
 * - `object <Screen>Inert : <Screen>Actions`, every action doing nothing, so an
 *   app compiles against the screen before it wires its store.
 *
 * **The member package decides every Kotlin name and type.** A member's props,
 * their order and their types are read from the generated contract
 * (`platforms/android/ui/src/generated/kotlin/dev/polymorph/ui/Contracts.kt`,
 * written from the registry by `pnpm native:contracts`). A member's composable
 * takes the props of `PM<Member>Props` as arguments, `children` last, as
 * `Members.kt` declares it; a compound part's is joined (`PMSettingsRowGroup`).
 * The walk over the tree, the type table and the contract's model are shared
 * with the SwiftUI emitter (`emit-native.ts`); this file is how Kotlin spells
 * them.
 *
 * **Text is printed as text.** The purpose and each input's doc are KDoc,
 * whose block comments nest in Kotlin, so a star beside a slash is written as
 * the entity `&#42;`; each exception's reason is line comments. A string is a
 * Kotlin string literal with its backslashes, quotes, dollar signs and control
 * characters escaped, so no text becomes a template.
 *
 * **The package is the file's directory.** A file written under a source root
 * (`…/kotlin/dev/acme/inbox/InboxScreen.kt`, or under `java/`) declares the
 * package its directory names (`dev.acme.inbox`), so the app's own types,
 * which `types` names from the app's modules, need no import. A file written
 * anywhere else, or printed, declares none.
 *
 * The output is laid out here, at 100 columns, with Kotlin's four-space
 * indent and trailing commas: a call that fits on its line stays on it, and
 * one that does not puts each argument on a line of its own. The same spec,
 * contract and path always give the same bytes.
 */

/** The Kotlin package every member and contract type is declared in. */
export const KOTLIN_PACKAGE = 'dev.polymorph.ui'

/** A value the Kotlin contract has no place for. */
export class KotlinContractError extends NativeContractError {
  constructor(message: string) {
    super('Kotlin', message)
    this.name = 'KotlinContractError'
  }
}

/** Thrown when the directory an emitted file is written to names no Kotlin package. */
export class KotlinPackageError extends Error {
  constructor(directory: string) {
    super(
      `A Kotlin file declares the package its directory under the source root names, and ` +
        `\`${directory}\` is no package name — every segment is a lower-case identifier, and no ` +
        'Kotlin keyword. Write the screen to another directory.',
    )
    this.name = 'KotlinPackageError'
  }
}

/* -------------------------------------------------------------------------- */
/* Names and text                                                             */
/* -------------------------------------------------------------------------- */

const INDENT = '    '

/** A declared or labelled name, in backticks when Kotlin has taken the word. */
const declared = (name: string) => (KOTLIN_KEYWORDS.has(name) ? `\`${name}\`` : name)

/** The four names a screen's file declares. */
export function kotlinNames(name: string): {
  model: string
  actions: string
  screen: string
  inert: string
} {
  const [model, actions, screen, inert] = nativeDeclarations('android', name) as [
    string,
    string,
    string,
    string,
  ]
  return { model, actions, screen, inert }
}

/** A Kotlin string literal that holds exactly `text`: no escape or template survives. */
function kotlinString(text: string): string {
  let out = ''
  for (const char of text) {
    const code = char.codePointAt(0) as number
    if (char === '\\') out += '\\\\'
    else if (char === '"') out += '\\"'
    else if (char === '$') out += '\\$'
    else if (char === '\n') out += '\\n'
    else if (char === '\r') out += '\\r'
    else if (char === '\t') out += '\\t'
    else if (char === '\b') out += '\\b'
    else if (code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029)
      out += `\\u${code.toString(16).padStart(4, '0')}`
    else out += char
  }
  return `"${out}"`
}

/** A JSON number as a Kotlin `Double` literal: `1` is `1.0`, because an `Int` is no `Double`. */
const kotlinDouble = (value: number) => {
  const text = String(value)
  return /^-?\d+$/.test(text) ? `${text}.0` : text
}

/**
 * Prose as KDoc: one line when it fits, a block wrapped at the width
 * otherwise. Kotlin's block comments nest, so a slash and a star that would
 * open or close one are written with the star as the entity `&#42;`.
 */
function kdoc(text: string, indent: number): string[] {
  const pad = ' '.repeat(indent)
  const safe = text.replace(/\/\*/g, '/&#42;').replace(/\*\//g, '&#42;/')
  const single = `${pad}/** ${safe} */`
  if (!/[\r\n]/.test(safe) && single.length <= WIDTH) return [single]
  return [
    `${pad}/**`,
    ...wrapped(safe, WIDTH - indent - 3).map((line) =>
      line === '' ? `${pad} *` : `${pad} * ${line}`,
    ),
    `${pad} */`,
  ]
}

/**
 * The package a Kotlin file at `filepath` declares: its directory below the
 * last `kotlin` or `java` directory, dotted, or `null` when it is under
 * neither or there is no path.
 */
export function kotlinPackageOf(filepath: string | undefined): string | null {
  if (filepath === undefined) return null
  const segments = filepath.split(/[\\/]/).filter(Boolean)
  segments.pop()
  let root = -1
  segments.forEach((segment, index) => {
    if (segment === 'kotlin' || segment === 'java') root = index
  })
  if (root === -1) return null
  const parts = segments.slice(root + 1)
  if (parts.length === 0) return null
  if (parts.some((part) => !/^[a-z_][a-z0-9_]*$/.test(part) || KOTLIN_KEYWORDS.has(part))) {
    throw new KotlinPackageError(parts.join(sep))
  }
  return parts.join('.')
}

/* -------------------------------------------------------------------------- */
/* The type table, in Kotlin                                                  */
/* -------------------------------------------------------------------------- */

/** How Kotlin names the type table's enums and cases. */
export const KOTLIN_RULES: TypeRules = {
  language: 'Kotlin',
  reservedTypes: new Set([
    'Any',
    'Boolean',
    'Companion',
    'Double',
    'List',
    'Nothing',
    'Set',
    'String',
    'Unit',
  ]),
  // An entry is PascalCased; one that would start with a digit takes the input's name in front.
  caseName: (value, input) =>
    capitalise(/^\d/.test(value) || value === '' ? `${camel(input)}${value}` : value),
  namedParams: true,
}

/**
 * A type of the table, spelled in Kotlin. A nested enum is written as its
 * record names it, or, outside the record, through `owner`: `InboxActions.Stage`.
 */
function kotlinType(type: NativeType, owner: string | null = null): string {
  const spell = (inner: NativeType) => kotlinType(inner, owner)
  switch (type.kind) {
    case 'string':
      return 'String'
    case 'number':
      return 'Double'
    case 'boolean':
      return 'Boolean'
    case 'void':
      return 'Unit'
    case 'list':
      return `List<${spell(type.element)}>`
    case 'set':
      return `Set<${spell(type.element)}>`
    case 'named': {
      const name = type.nested === true && owner !== null ? `${owner}.${type.name}` : type.name
      return type.args.length === 0 ? name : `${name}<${type.args.map(spell).join(', ')}>`
    }
    case 'optional':
      return type.inner.kind === 'function' ? `(${spell(type.inner)})?` : `${spell(type.inner)}?`
    case 'function':
      return `(${type.params.map((param) => spell(param.type)).join(', ')}) -> ${spell(type.result)}`
  }
}

/** The input's role in the records, from its mapped type. */
const roleOf = (mapped: MappedInput): InputRole =>
  mapped.role === 'data' ? 'data' : mapped.type.kind === 'optional' ? 'optionalAction' : 'action'

/* -------------------------------------------------------------------------- */
/* The contract, read                                                         */
/* -------------------------------------------------------------------------- */

/** A Kotlin string literal's text, as `kotlinString` in `packages/native/src/kotlin.ts` escapes it. */
const unescaped = (text: string) =>
  text.replace(/\\(.)/g, (_, char: string) => (char === 'n' ? '\n' : char === 't' ? '\t' : char))

/** An enum entry's first argument, its raw value: a string, an integer, or nothing. */
function rawOf(args: string | undefined): string | number | null {
  if (args === undefined) return null
  const text = /^"((?:[^"\\]|\\.)*)"/.exec(args)
  if (text !== null) return unescaped(text[1] as string)
  const number = /^-?\d+/.exec(args)
  return number === null ? null : Number(number[0])
}

/**
 * The structs and enums of the generated contract. It is written by one
 * generator in one layout (`packages/native/src/kotlin.ts`), so it is read by
 * that layout: a `data class` with one `val` a line at four spaces, an opaque
 * `class`, an `enum class` with one entry a line, and a `sealed interface`
 * with one `data class` or `data object` a line, each under its KDoc.
 */
export function readKotlinContract(source: string): Contract {
  const structs = new Map<string, ContractStruct>()
  const enums = new Map<string, ContractEnum>()
  const lines = source.split('\n')
  let doc: string[] = []

  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at] as string
    if (line.startsWith('/**')) {
      doc = []
      const single = /^\/\*\* (.*) \*\/$/.exec(line)
      if (single !== null) {
        doc.push(single[1] as string)
        continue
      }
      for (at += 1; at < lines.length && lines[at] !== ' */'; at += 1) {
        doc.push((lines[at] as string).replace(/^ \*\s?/, ''))
      }
      continue
    }

    const data = /^data class (\w+)(?:<([^>]*)>)?\($/.exec(line)
    if (data !== null) {
      const params: ContractParam[] = []
      for (at += 1; at < lines.length && !(lines[at] as string).startsWith(')'); at += 1) {
        const param = /^ {4}val (`?)(\w+)\1: (.+?)( = null)?,$/.exec(lines[at] as string)
        if (param === null) continue
        params.push({
          label: param[2] as string,
          type: param[3] as string,
          defaulted: param[4] !== undefined,
        })
      }
      structs.set(data[1] as string, { params, generics: genericsOf(data[2]) })
      doc = []
      continue
    }

    const opaque = /^class (\w+)(?:<([^>]*)>)?$/.exec(line)
    if (opaque !== null) {
      structs.set(opaque[1] as string, { params: [], generics: genericsOf(opaque[2]) })
      doc = []
      continue
    }

    const enumeration = /^enum class (\w+)(\(.*\))?( \{|\()$/.exec(line)
    if (enumeration !== null) {
      if (enumeration[3] === '(') {
        while (at < lines.length && lines[at] !== ') {') at += 1
      }
      const cases: ContractCase[] = []
      let entries = true
      for (at += 1; at < lines.length && lines[at] !== '}'; at += 1) {
        const text = lines[at] as string
        if (text === `${INDENT};`) entries = false
        const entry = entries ? /^ {4}(\w+)(?:\((.*)\))?,$/.exec(text) : null
        if (entry === null) continue
        cases.push({ name: entry[1] as string, raw: rawOf(entry[2]), payload: null })
      }
      enums.set(enumeration[1] as string, { cases, branches: branchesOf(doc, cases.length) })
      doc = []
      continue
    }

    const sealed = /^sealed interface (\w+) \{$/.exec(line)
    if (sealed !== null) {
      const cases: ContractCase[] = []
      for (at += 1; at < lines.length && lines[at] !== '}'; at += 1) {
        const text = lines[at] as string
        const carrying = /^ {4}data class (\w+)\(val value: (.+)\) : \w+$/.exec(text)
        const bare = /^ {4}data object (\w+) : \w+$/.exec(text)
        if (carrying !== null) {
          cases.push({ name: carrying[1] as string, raw: null, payload: carrying[2] as string })
        } else if (bare !== null) {
          cases.push({ name: bare[1] as string, raw: null, payload: null })
        }
      }
      enums.set(sealed[1] as string, { cases, branches: branchesOf(doc, cases.length) })
      doc = []
      continue
    }

    doc = []
  }
  return { structs, enums }
}

/** A Kotlin type's shape: its base type, its optional levels (`?` and `PMSome`), and what it is. */
function shapeOf(type: string): Shape {
  let base = type.trim()
  let level = 0
  let some = false
  for (;;) {
    if (topLevelArrow(base)) break
    if (base.endsWith('?')) {
      base = base.slice(0, -1)
      level += 1
      continue
    }
    const inner = unparenthesised(base)
    if (inner !== base) {
      base = inner
      continue
    }
    const wrapped = /^PMSome<(.+)>$/.exec(base)
    if (wrapped !== null) {
      base = wrapped[1] as string
      level += 1
      some = true
      continue
    }
    break
  }
  return {
    base,
    optional: level,
    closure: topLevelArrow(base),
    content: base === 'PMContent',
    some,
  }
}

/* -------------------------------------------------------------------------- */
/* The tree, in Kotlin                                                        */
/* -------------------------------------------------------------------------- */

/** A member's or a compound part's composable: `PMButton`, `PMSettingsRowGroup`. */
const composable = (component: string) => `PM${component.replace('.', '')}`

/** How Kotlin writes what the shared walk produces. */
export const KOTLIN: Dialect = {
  language: 'Kotlin',
  platform: 'android',
  style: {
    indent: 4,
    label: (label) => `${declared(label)} = `,
    trailingComma: true,
    flatBlocks: true,
  },
  scalars: { string: 'String', number: 'Double', boolean: 'Boolean' },
  drawnBy: composable,
  // `Members.kt` moves a `children` slot last, so it trails the call.
  member: (_, struct) => {
    const slot = struct.params.find(
      (param) => param.label === 'children' && /^PMContent\??$/.test(param.type),
    )
    return {
      params: struct.params.filter((param) => param !== slot),
      trailing: slot ?? null,
    }
  },
  call: (component, args, trailing, note) => call(composable(component), args, note, trailing),
  shape: shapeOf,
  unwrap: (type) => {
    if (topLevelArrow(type)) return null
    if (type.endsWith('?')) return unparenthesised(type.slice(0, -1))
    return /^PMSome<(.+)>$/.exec(type)?.[1] ?? null
  },
  sequence: (base) => {
    const sequence = /^(List|Set)<(.+)>$/.exec(base)
    return sequence === null ? null : { element: sequence[2] as string, set: sequence[1] === 'Set' }
  },
  string: kotlinString,
  number: kotlinDouble,
  enumCase: (enumName, caseName) => `${enumName}.${caseName}`,
  foundationCase: (enumName, raw) => `${enumName}.${capitalise(raw)}`,
  none: (shape) =>
    shape.some
      ? call('PMSome', [{ label: null, value: atom('null') }])
      : shape.optional > 0
        ? atom('null')
        : null,
  given: (code, shape, source) =>
    shape.some && source !== 'action' ? call('PMSome', [{ label: null, value: code }]) : code,
  list: (items, set) =>
    call(
      set ? 'setOf' : 'listOf',
      items.map((value) => ({ label: null, value })),
    ),
  struct: (name, args) => call(name, args),
  unionCase: (enumName, caseName, payload) =>
    call(`${enumName}.${caseName}`, [{ label: null, value: payload }]),
  text: (value) => call('Text', [{ label: null, value }]),
  content: (drawn, optional) => (drawn.length === 0 && optional ? null : block('', drawn)),
  binding: (path, role) =>
    role === 'data' ? `model.${path}` : role === 'action' ? `actions::${path}` : `actions.${path}`,
}

/* -------------------------------------------------------------------------- */
/* The file                                                                   */
/* -------------------------------------------------------------------------- */

type FunctionType = Extract<NativeType, { kind: 'function' }>

/** What an inert action returns: the empty value of its result, or a stop that names it. */
function inertResult(result: NativeType, action: string, inert: string): string | null {
  switch (result.kind) {
    case 'void':
      return null
    case 'string':
      return '""'
    case 'number':
      return '0.0'
    case 'boolean':
      return 'false'
    case 'optional':
      return 'null'
    case 'list':
      return 'emptyList()'
    case 'set':
      return 'emptySet()'
    default:
      return `error(${kotlinString(`${inert}: \`${action}\` answers with a value it has no empty form of`)})`
  }
}

/**
 * A function's declaration at `indent`: `fun name(a: A, b: B): R` on one line
 * when it fits, its parameters a line each when it does not.
 */
function declaration(
  head: string,
  params: string[],
  result: string,
  tail: string,
  indent: number,
): string[] {
  const pad = ' '.repeat(indent)
  const one = `${pad}${head}(${params.join(', ')})${result}${tail}`
  if (one.length <= WIDTH || params.length === 0) return [one]
  return [
    `${pad}${head}(`,
    ...params.map((param) => `${pad}${INDENT}${param},`),
    `${pad})${result}${tail}`,
  ]
}

/** Names of the member package the code uses, so the file imports each. */
function packageNames(code: string, own: ReadonlySet<string>): string[] {
  const names = new Set<string>()
  for (const match of codeOnly(code).matchAll(/(?<![.\w])(PM[A-Z]\w*)/g)) {
    const name = match[1] as string
    if (!own.has(name)) names.add(name)
  }
  return [...names]
}

/**
 * The emitted file, from a lawful `android` spec and the member package.
 * `marker` is the text every emitted file's header holds, and `kotlinPackage`
 * the package the file declares, if any (`kotlinPackageOf`).
 */
export function kotlinScreen(
  spec: ScreenSpec,
  native: NativePackage,
  marker: string,
  kotlinPackage: string | null,
): string {
  const contract = readKotlinContract(native.contract)
  const names = kotlinNames(spec.name)
  const context = {
    modules: modulesOf(spec),
    contract,
    rules: KOTLIN_RULES,
    taken: new Set([...Object.values(spec.types ?? {}).flat(), ...Object.values(names)]),
  }

  const inputs = spec.inputs.map((input) => {
    try {
      return { input, mapped: mapInput(input, context) }
    } catch (error) {
      if (error instanceof Unmapped) {
        throw new KotlinContractError(`the input \`${input.name}\`’s type ${error.message}`)
      }
      throw error
    }
  })
  const data = inputs.filter(({ mapped }) => mapped.role === 'data')
  const actions = inputs.filter(({ mapped }) => mapped.role === 'action')
  const walk: Walk = {
    dialect: KOTLIN,
    contract,
    rendered: new Set(native.rendered),
    inputs: new Map(
      inputs.map(({ input, mapped }) => [
        input.name,
        { role: roleOf(mapped), printed: kotlinType(mapped.type) },
      ]),
    ),
  }

  const enums = (list: typeof inputs) =>
    list.flatMap(({ mapped }) =>
      mapped.enumeration === null
        ? []
        : [
            '',
            `${INDENT}enum class ${mapped.enumeration.name}(val value: String) {`,
            ...mapped.enumeration.cases.map(
              (entry) => `${INDENT.repeat(2)}${entry.name}(${kotlinString(entry.value)}),`,
            ),
            `${INDENT}}`,
          ],
    )
  const docOf = (input: ScreenInput, indent: number) =>
    input.doc === undefined ? [] : kdoc(input.doc, indent)

  const modelEnums = enums(data)
  const model = [
    ...kdoc(
      `What \`${names.screen}\` shows. \`loadStatus\` says which of the four load states it is in.`,
      0,
    ),
    `data class ${names.model}(`,
    `${INDENT}val loadStatus: PMLoadStatus,`,
    ...data.flatMap(({ input, mapped }) => [
      ...docOf(input, 4),
      `${INDENT}val ${declared(input.name)}: ${kotlinType(mapped.type)},`,
    ]),
    ') {',
    ...modelEnums.slice(1),
    ...(modelEnums.length === 0 ? [] : ['']),
    ...kdoc(
      `The app extends it with values of its own: \`${names.model}.placeholder\`, the model ` +
        'before anything loads.',
      4,
    ),
    `${INDENT}companion object`,
    '}',
  ]

  /** An action as the interface declares it, or as the inert object overrides it. */
  const actionLines = (input: ScreenInput, mapped: MappedInput, inert: boolean): string[] => {
    const owner = inert ? names.actions : null
    const name = declared(input.name)
    const override = inert ? 'override ' : ''
    if (mapped.type.kind === 'optional') {
      const property = `${INDENT}${override}val ${name}: ${kotlinType(mapped.type, owner)}`
      if (!inert) return [property]
      const signature = mapped.type.inner as FunctionType
      const params = signature.params.map(() => '_').join(', ')
      const result = inertResult(signature.result, input.name, names.inert)
      const lambda =
        params === ''
          ? result === null
            ? '{}'
            : `{ ${result} }`
          : `{ ${params} ->${result === null ? '' : ` ${result}`} }`
      return [`${property} = ${lambda}`]
    }
    const signature = mapped.type as FunctionType
    const params = signature.params.map(
      (param) => `${declared(param.name as string)}: ${kotlinType(param.type, owner)}`,
    )
    const answers = signature.result.kind !== 'void'
    const result = answers ? `: ${kotlinType(signature.result, owner)}` : ''
    if (!inert) return declaration(`fun ${name}`, params, result, '', 4)
    const value = inertResult(signature.result, input.name, names.inert)
    return declaration(
      `override fun ${name}`,
      params,
      result,
      value === null ? ' {}' : ` = ${value}`,
      4,
    )
  }

  const actionsBlock = [
    ...kdoc(`The code the app supplies to \`${names.screen}\`, one function per action.`, 0),
    ...(actions.length === 0
      ? [`interface ${names.actions}`]
      : [
          `interface ${names.actions} {`,
          ...actions.flatMap(({ input, mapped }) => [
            ...docOf(input, 4),
            ...actionLines(input, mapped, false),
          ]),
          ...enums(actions),
          '}',
        ]),
  ]

  const body = layout(element(spec.root, walk), 4, KOTLIN.style)
  const screen = [
    ...kdoc(spec.purpose, 0),
    '@Composable',
    `fun ${names.screen}(model: ${names.model}, actions: ${names.actions}) {`,
    ...body,
    '}',
  ]

  const inert = [
    ...kdoc(
      'Every action doing nothing, so an app compiles against the screen before it wires its ' +
        'store. An action that answers returns the empty value of its result.',
      0,
    ),
    ...(actions.length === 0
      ? [`object ${names.inert} : ${names.actions}`]
      : [
          `object ${names.inert} : ${names.actions} {`,
          ...actions.flatMap(({ input, mapped }) => actionLines(input, mapped, true)),
          '}',
        ]),
  ]

  const code = [...model, '', ...actionsBlock, '', ...screen, '', ...inert].join('\n')
  const imports = [
    ...(/(?<![.\w])Text\(/.test(codeOnly(code)) ? ['androidx.compose.material3.Text'] : []),
    'androidx.compose.runtime.Composable',
    ...packageNames(code, new Set(Object.values(names))).map((name) => `${KOTLIN_PACKAGE}.${name}`),
  ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

  const header = comment(
    `${marker} (\`${spec.spec}\`): \`${spec.name}\`, for Android. The screen is the spec's tree ` +
      'and nothing more: it holds no state, launches nothing and navigates nowhere. The app ' +
      'renders it from a store that owns the model, its coroutines and its router, and ' +
      'implements the actions (`design/native/screen-contract.md`).',
    0,
  )

  return [
    ...header,
    '',
    ...(kotlinPackage === null ? [] : [`package ${kotlinPackage}`, '']),
    ...imports.map((name) => `import ${name}`),
    '',
    code,
    '',
  ].join('\n')
}

/** The validator's judges for an `android` screen, with the member package when it is at hand. */
export const kotlinJudges = (native: NativePackage | undefined) =>
  nativeJudges(KOTLIN, KOTLIN_RULES, readKotlinContract, native, (name) =>
    nativeDeclarations('android', name),
  )

/* -------------------------------------------------------------------------- */
/* The emitter's law                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Not a function's declaration, a reference to one (`actions::launch`), or a
 * member reached through a dot: a name used as a call of its own.
 */
const CALLED = String.raw`(?<![.\w:]|\bfun\s+)`

/**
 * What an emitted screen may not hold (`design/native/screen-contract.md`,
 * "The view"): state of its own, a coroutine, navigation, a theme or a token.
 * Each is a construct and the reason it is refused. A name is read as a
 * construct only where it is used as one, called, opened or declared with,
 * so an action of the same name (`fun navigate()`, `actions::navigate`) or a
 * model field is not.
 */
export const KOTLIN_FORBIDDEN: readonly Forbidden[] = [
  {
    pattern: new RegExp(
      `${CALLED}(?:remember|rememberSaveable|rememberUpdatedState|mutableStateOf|mutableStateListOf|mutableStateMapOf|derivedStateOf|produceState|collectAsState)\\s*[({<]`,
    ),
    what: 'state of its own',
  },
  {
    pattern: new RegExp(
      `\\bsuspend\\s+(?:fun\\b|\\()|${CALLED}(?:LaunchedEffect|DisposableEffect|SideEffect|rememberCoroutineScope|runBlocking|withContext)\\s*[({]|(?<![\\w:]|\\bfun\\s+)(?:launch|async)\\s*[({]`,
    ),
    what: 'an asynchronous call',
  },
  {
    pattern: new RegExp(
      `(?<![.\\w:])(?:NavHost|NavController|rememberNavController)\\b|(?<![\\w:]|\\bfun\\s+)navigate\\s*\\(`,
    ),
    what: 'navigation',
  },
  {
    pattern:
      /(?<![.\w:])(?:PMTheme|PMThemes|LocalPMTheme|LocalPMDark|ProvidePMTheme|PMMaterialTheme|MaterialTheme)\b|\bPM\.(?:theme|dark)\b|\bdev\.polymorph\.tokens\b/,
    what: 'a theme or a token',
  },
]

/**
 * Every construct the screen may not hold, found in emitted Kotlin:
 * `'<construct>' (<what>)`. Empty for every file the emitter writes; the
 * checked emitter refuses a file for which it is not.
 */
export function kotlinScreenViolations(source: string): string[] {
  return violationsIn(source, KOTLIN_FORBIDDEN)
}
