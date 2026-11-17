import type { ScreenInput, ScreenSpec } from './schema'
import {
  atom,
  block,
  branchesOf,
  call,
  camel,
  closes,
  comment,
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
  type Code,
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
  element,
} from './emit-native'
import { nativeDeclarations, SWIFT_KEYWORDS, type NativePackage } from './validate'

/**
 * Spec to SwiftUI.
 *
 * A screen spec whose `platform` is `ios` emits one Swift file, the stateless
 * view of two values that `design/native/screen-contract.md` describes:
 *
 * - `<Screen>Model`, a struct of the data the screen shows: `loadStatus` first,
 *   then every input whose type is not a function, in the spec's order;
 * - `<Screen>Actions`, a struct of `@MainActor` closures, one per function
 *   input, in the spec's order, with no defaults, so a missing action does
 *   not compile;
 * - `<Screen>View`, a `View` built from the two, whose body is the spec's
 *   tree: each member as `PM<Member>(props: .init(…))`, a binding in an event
 *   prop read from `actions`, any other binding from `model`, and the root
 *   page archetype handed `model.loadStatus`;
 * - `<Screen>Actions.inert`, every action doing nothing, so an app compiles
 *   against the view before it wires its store.
 *
 * **The member package decides every Swift name and type.** A member's props,
 * their order and their types are read from the generated contract
 * (`platforms/ios/Sources/PolymorphUI/Generated/Contracts.swift`, written from
 * the registry by `pnpm native:contracts`), which the caller passes in with
 * the members the package draws (`readNativePackage`). What the two emitters
 * share, the type table, the contract's model and the walk over the tree, is
 * `emit-native.ts`; this file is how Swift spells it.
 *
 * **Text is printed as text.** The purpose, each input's doc and each
 * exception's reason are line comments, which end only at a line break, so
 * every line of prose gets its own `//`. A string is a Swift string literal
 * with its backslashes, quotes and control characters escaped, so no text
 * becomes an interpolation.
 *
 * The output is laid out here, at 100 columns: a call that fits on its line
 * stays on it, and one that does not puts each argument on a line of its own.
 * The same spec and contract always give the same bytes.
 */

/** The Swift module the members come from: `@polymorph/react-ui` on iOS. */
export const SWIFT_MODULE = 'PolymorphUI'

/** A value the Swift contract has no place for. */
export class SwiftContractError extends NativeContractError {
  constructor(message: string) {
    super('Swift', message)
    this.name = 'SwiftContractError'
  }
}

/* -------------------------------------------------------------------------- */
/* Names and text                                                             */
/* -------------------------------------------------------------------------- */

/** A declared name, in backticks when Swift has taken the word. */
const declared = (name: string) => (SWIFT_KEYWORDS.has(name) ? `\`${name}\`` : name)

/** The three names a screen's file declares. */
export function swiftNames(name: string): { model: string; actions: string; view: string } {
  const [model, actions, view] = nativeDeclarations('ios', name) as [string, string, string]
  return { model, actions, view }
}

/** A Swift string literal that holds exactly `text`: no escape or interpolation survives. */
function swiftString(text: string): string {
  let out = ''
  for (const char of text) {
    const code = char.codePointAt(0) as number
    if (char === '\\') out += '\\\\'
    else if (char === '"') out += '\\"'
    else if (char === '\n') out += '\\n'
    else if (char === '\r') out += '\\r'
    else if (char === '\t') out += '\\t'
    else if (code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029)
      out += `\\u{${code.toString(16)}}`
    else out += char
  }
  return `"${out}"`
}

/* -------------------------------------------------------------------------- */
/* The type table, in Swift                                                   */
/* -------------------------------------------------------------------------- */

/** How Swift names the type table's enums and cases. */
export const SWIFT_RULES: TypeRules = {
  language: 'Swift',
  reservedTypes: new Set([
    'Any',
    'Array',
    'Bool',
    'Double',
    'Optional',
    'Protocol',
    'Self',
    'Set',
    'String',
    'Type',
    'Void',
  ]),
  // A literal whose camelCased name would start with a digit takes the input's name in front.
  caseName: (value, input) =>
    /^\d/.test(value) || value === '' ? `${camel(input)}${value}` : value,
  namedParams: false,
}

/** A type of the table, spelled in Swift. */
function swiftType(type: NativeType): string {
  switch (type.kind) {
    case 'string':
      return 'String'
    case 'number':
      return 'Double'
    case 'boolean':
      return 'Bool'
    case 'void':
      return 'Void'
    case 'list':
      return `[${swiftType(type.element)}]`
    case 'set':
      return `Set<${swiftType(type.element)}>`
    case 'named':
      return type.args.length === 0
        ? type.name
        : `${type.name}<${type.args.map(swiftType).join(', ')}>`
    case 'optional':
      return type.inner.kind === 'function'
        ? `(${swiftType(type.inner)})?`
        : `${swiftType(type.inner)}?`
    case 'function': {
      const result = swiftType(type.result)
      return `@MainActor (${type.params.map((param) => swiftType(param.type)).join(', ')}) -> ${
        type.result.kind === 'function' ? `(${result})` : result
      }`
    }
  }
}

/** The input's role in the records, from its mapped type. */
const roleOf = (mapped: MappedInput): InputRole =>
  mapped.role === 'data' ? 'data' : mapped.type.kind === 'optional' ? 'optionalAction' : 'action'

/* -------------------------------------------------------------------------- */
/* The contract, read                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The structs and enums of the generated contract. It is written by one
 * generator in one layout (`packages/native/src/contracts.ts`), so it is read
 * by that layout: a `public struct` and its `public init(` with one parameter
 * a line, a `public enum` and its `case` lines at two spaces.
 */
export function readSwiftContract(source: string): Contract {
  const structs = new Map<string, ContractStruct>()
  const enums = new Map<string, ContractEnum>()
  const lines = source.split('\n')
  let doc: string[] = []

  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at] as string
    if (line.startsWith('///')) {
      doc.push(line.slice(3).trim())
      continue
    }

    const struct = /^public struct (\w+)(?:<([^>]*)>)? \{$/.exec(line)
    if (struct !== null) {
      const params: ContractParam[] = []
      for (at += 1; at < lines.length && lines[at] !== '}'; at += 1) {
        if (lines[at] !== '  public init(') continue
        for (at += 1; at < lines.length && lines[at] !== '  ) {'; at += 1) {
          const param = /^ {4}(`?)(\w+)\1: (.+?)( = nil)?,?$/.exec(lines[at] as string)
          if (param === null) continue
          params.push({
            label: param[2] as string,
            type: (param[3] as string).replace(/^@escaping /, ''),
            defaulted: param[4] !== undefined,
          })
        }
      }
      structs.set(struct[1] as string, { params, generics: genericsOf(struct[2]) })
      doc = []
      continue
    }

    const enumeration = /^public enum (\w+)(?:: ([^{]+))? \{$/.exec(line)
    if (enumeration !== null) {
      const raw = /^(String|Int)\b/.exec(enumeration[2] ?? '')?.[1] ?? null
      const cases: ContractCase[] = []
      for (at += 1; at < lines.length && lines[at] !== '}'; at += 1) {
        const text = lines[at] as string
        const payload = /^ {2}case (\w+)\((.+)\)$/.exec(text)
        if (payload !== null) {
          cases.push({ name: payload[1] as string, raw: null, payload: payload[2] as string })
          continue
        }
        const plain = /^ {2}case (`?)(\w+)\1(?: = (.+))?$/.exec(text)
        if (plain === null) continue
        const name = plain[2] as string
        const value = plain[3]
        cases.push({
          name,
          raw:
            raw === 'Int'
              ? Number(value)
              : raw === 'String'
                ? value === undefined
                  ? name
                  : (JSON.parse(value) as string)
                : null,
          payload: null,
        })
      }
      enums.set(enumeration[1] as string, { cases, branches: branchesOf(doc, cases.length) })
      doc = []
      continue
    }

    doc = []
  }
  return { structs, enums }
}

/** A Swift type's shape: its base type, how many `?` wrap it, and whether it is a closure. */
function shapeOf(type: string): Shape {
  let base = type
  let level = 0
  while (base.endsWith('?') && !topLevelArrow(base)) {
    base = base.slice(0, -1)
    level += 1
  }
  if (base.startsWith('(') && base.endsWith(')') && closes(base) === base.length - 1) {
    base = base.slice(1, -1)
  }
  const closure = base.startsWith('@MainActor')
  return { base, optional: level, closure, content: base === 'PMContent', some: false }
}

/* -------------------------------------------------------------------------- */
/* The tree, in Swift                                                         */
/* -------------------------------------------------------------------------- */

/** How Swift writes what the shared walk produces. */
export const SWIFT: Dialect = {
  language: 'Swift',
  platform: 'ios',
  style: {
    indent: 2,
    label: (label) => `${label}: `,
    trailingComma: false,
    flatBlocks: false,
  },
  scalars: { string: 'String', number: 'Double', boolean: 'Bool' },
  // A compound part is nested in its owner's view, which draws it.
  drawnBy: (component) => `PM${component.split('.')[0] as string}`,
  member: (_, struct) => ({ params: struct.params, trailing: null }),
  call: (component, args, _, note) =>
    call(`PM${component}`, [{ label: 'props', value: call('.init', args) }], note),
  shape: shapeOf,
  unwrap: (type) =>
    type.endsWith('?') && !topLevelArrow(type) ? unparenthesised(type.slice(0, -1)) : null,
  sequence: (base) => {
    const list = /^\[(.+)\]$/.exec(base)?.[1]
    if (list !== undefined) return { element: list, set: false }
    const set = /^Set<(.+)>$/.exec(base)?.[1]
    return set === undefined ? null : { element: set, set: true }
  },
  string: swiftString,
  // A JSON number is finite, and its shortest form is a Swift literal.
  number: (value) => String(value),
  enumCase: (_, caseName) => `.${caseName}`,
  foundationCase: (_, raw) => `.${raw}`,
  none: (shape) =>
    shape.optional === 2 ? atom('.some(nil)') : shape.optional === 1 ? atom('nil') : null,
  given: (code, shape, source) =>
    source === 'model' && shape.optional === 2 && code.kind === 'atom'
      ? atom(`.some(${code.text})`)
      : code,
  list: (items) => ({ kind: 'array', items }),
  struct: (name, args) => call(name, args),
  unionCase: (_, caseName, payload) => call(`.${caseName}`, [{ label: null, value: payload }]),
  text: (value) => call('Text', [{ label: 'verbatim', value }]),
  content: (drawn, optional) => {
    if (drawn.length === 0) {
      return optional ? null : call('AnyView', [{ label: null, value: atom('EmptyView()') }])
    }
    const view = drawn.length === 1 ? (drawn[0] as Code) : block('Group ', drawn)
    return call('AnyView', [{ label: null, value: view }])
  },
  binding: (path, role) => `${role === 'data' ? 'model' : 'actions'}.${path}`,
}

/* -------------------------------------------------------------------------- */
/* The file                                                                   */
/* -------------------------------------------------------------------------- */

/** What an inert action returns: the empty value of its result, or a stop that names it. */
function inertResult(result: NativeType, action: string, names: { actions: string }): string {
  switch (result.kind) {
    case 'void':
      return ''
    case 'string':
      return ' ""'
    case 'number':
      return ' 0'
    case 'boolean':
      return ' false'
    case 'optional':
      return ' nil'
    case 'list':
    case 'set':
      return ' []'
    default:
      return ` fatalError(${swiftString(`${names.actions}.inert: \`${action}\` answers with a value it has no empty form of`)})`
  }
}

/**
 * The emitted file, from a lawful `ios` spec and the member package.
 * `marker` is the text every emitted file's header holds.
 */
export function swiftScreen(spec: ScreenSpec, native: NativePackage, marker: string): string {
  const contract = readSwiftContract(native.contract)
  const names = swiftNames(spec.name)
  const context = {
    modules: modulesOf(spec),
    contract,
    rules: SWIFT_RULES,
    taken: new Set([...Object.values(spec.types ?? {}).flat(), ...Object.values(names)]),
  }

  const inputs = spec.inputs.map((input) => {
    try {
      return { input, mapped: mapInput(input, context) }
    } catch (error) {
      if (error instanceof Unmapped) {
        throw new SwiftContractError(`the input \`${input.name}\`’s type ${error.message}`)
      }
      throw error
    }
  })
  const data = inputs.filter(({ mapped }) => mapped.role === 'data')
  const actions = inputs.filter(({ mapped }) => mapped.role === 'action')
  const walk: Walk = {
    dialect: SWIFT,
    contract,
    rendered: new Set(native.rendered),
    inputs: new Map(
      inputs.map(({ input, mapped }) => [
        input.name,
        { role: roleOf(mapped), printed: swiftType(mapped.type) },
      ]),
    ),
  }

  const enums = (list: typeof inputs) =>
    list.flatMap(({ mapped }) =>
      mapped.enumeration === null
        ? []
        : [
            `  enum ${mapped.enumeration.name}: String {`,
            `    case ${mapped.enumeration.cases
              .map((entry) =>
                entry.name === entry.value
                  ? declared(entry.name)
                  : `${declared(entry.name)} = ${swiftString(entry.value)}`,
              )
              .join(', ')}`,
            '  }',
            '',
          ],
    )
  const docOf = (input: ScreenInput) =>
    input.doc === undefined ? [] : comment(input.doc, 2, '///')

  const model = [
    ...comment(
      `What \`${names.view}\` shows. \`loadStatus\` says which of the four load states it is in.`,
      0,
      '///',
    ),
    `struct ${names.model} {`,
    ...enums(data),
    '  var loadStatus: PMLoadStatus',
    ...data.flatMap(({ input, mapped }) => [
      ...docOf(input),
      `  var ${declared(input.name)}: ${swiftType(mapped.type)}`,
    ]),
    '}',
  ]

  const actionsBlock = [
    ...comment(`The code the app supplies to \`${names.view}\`, one closure per action.`, 0, '///'),
    `struct ${names.actions} {`,
    ...enums(actions),
    ...actions.flatMap(({ input, mapped }) => [
      ...docOf(input),
      `  let ${declared(input.name)}: ${swiftType(mapped.type)}`,
    ]),
    '}',
  ]

  const body = layout(element(spec.root, walk), 4, SWIFT.style)
  const view = [
    ...comment(spec.purpose, 0, '///'),
    '@MainActor',
    `struct ${names.view}: View {`,
    `  let model: ${names.model}`,
    `  let actions: ${names.actions}`,
    '',
    '  var body: some View {',
    ...body,
    '  }',
    '}',
  ]

  const inertArgs = actions.map(({ input, mapped }, index) => {
    const closure = (mapped.type.kind === 'optional' ? mapped.type.inner : mapped.type) as Extract<
      NativeType,
      { kind: 'function' }
    >
    const params = closure.params.map(() => '_').join(', ')
    const result = inertResult(closure.result, input.name, names)
    const literal =
      params === '' ? (result === '' ? '{}' : `{${result} }`) : `{ ${params} in${result} }`
    return `    ${declared(input.name)}: ${literal}${index < actions.length - 1 ? ',' : ''}`
  })
  const inert = [
    `extension ${names.actions} {`,
    ...comment(
      'Every action doing nothing, so an app compiles against the view before it wires its ' +
        'store. An action that answers returns the empty value of its result.',
      2,
      '///',
    ),
    ...(actions.length === 0
      ? ['  @MainActor static let inert: Self = Self()']
      : ['  @MainActor static let inert: Self = Self(', ...inertArgs, '  )']),
    '}',
  ]

  const header = comment(
    `${marker} (\`${spec.spec}\`): \`${spec.name}\`, for iOS. The view is the spec's tree and ` +
      'nothing more: it holds no state, calls nothing asynchronous and navigates nowhere. The ' +
      'app renders it from a store that owns the model, its tasks and its router, and supplies ' +
      'the actions (`design/native/screen-contract.md`).',
    0,
  )

  return [
    ...header,
    '',
    `import ${SWIFT_MODULE}`,
    'import SwiftUI',
    '',
    ...model,
    '',
    ...actionsBlock,
    '',
    ...view,
    '',
    ...inert,
    '',
  ].join('\n')
}

/** The validator's judges for an `ios` screen, with the member package when it is at hand. */
export const swiftJudges = (native: NativePackage | undefined) =>
  nativeJudges(SWIFT, SWIFT_RULES, readSwiftContract, native, (name) =>
    nativeDeclarations('ios', name),
  )

/* -------------------------------------------------------------------------- */
/* The emitter's law                                                          */
/* -------------------------------------------------------------------------- */

/**
 * What an emitted view may not hold (`design/native/screen-contract.md`, "The
 * view"): state of its own, an asynchronous call, navigation, a theme or a
 * token. Each is a construct and the reason it is refused. A name is read as
 * a construct only where it is used as one: `Task` called, opened or reached
 * into, a modifier followed by its arguments or its closure, so a model field
 * or an app type of the same name is not. An input cannot be named `async` or
 * `await` (`SWIFT_KEYWORDS`).
 */
export const SWIFT_FORBIDDEN: readonly Forbidden[] = [
  {
    pattern: /@(?:State|StateObject|ObservedObject|Bindable|Environment|EnvironmentObject)\b/,
    what: 'state of its own',
  },
  {
    pattern: /(?<![.\w])(?:Task\s*[({.]|async\b|await\b|URLSession\b)|\.(?:task|onAppear)\s*[({]/,
    what: 'an asynchronous call',
  },
  {
    pattern:
      /(?<![.\w])(?:NavigationLink|NavigationStack|openURL)\b|\.(?:navigationDestination|sheet)\s*[({]/,
    what: 'navigation',
  },
  {
    pattern: /(?<![.\w])(?:PMTheme|PolymorphTokens)\b|\.pm[A-Z]\w*\s*\(/,
    what: 'a theme or a token',
  },
]

/**
 * Every construct the view may not hold, found in emitted Swift: `'<construct>'
 * (<what>)`. Empty for every file the emitter writes; the checked emitter
 * refuses a file for which it is not.
 */
export function swiftScreenViolations(source: string): string[] {
  return violationsIn(source, SWIFT_FORBIDDEN)
}
