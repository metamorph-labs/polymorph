import type { Registry } from '@polymorph/registry'

import {
  platformMembers,
  renderedMembers,
  resolveContracts,
  wrap,
  type AppearanceModel,
  type Dialect,
  type EnumModel,
  type IconSymbols,
  type Mapped,
  type MemberModel,
  type NamedModel,
  type NativeMember,
  type StructModel,
  type UnionModel,
} from './mapping'
import { readRecipeNumbers, recipeSources, RECIPES, type RecipeNumber } from './recipes'
import {
  isRecord,
  SPEC_DEFAULTS,
  spokenOn,
  type SpecDefault,
  type SpecDefaultEntry,
} from './strings'
import { lex } from './swift-source'
import { BRAND_DRAWINGS, type BrandDrawing } from '../../engine/src/icon/brands'
import { phoneCodes, phoneTrunkZero, wrapList, type PhoneCode } from './phones'

export {
  FUNCTION_ALIASES,
  JSON_TYPES,
  LITERAL_ALIASES,
  NAMED_ONLY,
  SHAPES,
  UNIONS,
  type IconSymbols,
  type NativeMember,
  type Shape,
  type ShapeField,
  type Union,
  type UnionCase,
} from './mapping'

/**
 * The native contracts for iOS: every member's props as Swift types, generated
 * from the registry, for `platforms/ios/Sources/PolymorphUI`.
 *
 * A native member is written by hand, and the spec is its contract. So the
 * contract is not prose a renderer may drift from: it is a Swift type the
 * renderer must accept. For every member the iOS platform map marks `native`
 * or `adapted`, this module writes
 *
 * - `PM<Member>Props`, one field per prop, by the mapping below;
 * - an enum per literal-union prop, and for a member with a lawful variant ×
 *   tone grid one `PM<Member>Appearance` enum of the lawful cells only, as the
 *   web's `LawfulVariants` types them;
 * - `PM<Member>Rendering`, the protocol a rendering conforms to: a `View` built
 *   from `PM<Member>Props`.
 *
 * What each prop becomes is decided once, for every platform, by the resolver
 * in `mapping.ts`, from the tables there (`SHAPES`, `UNIONS`,
 * `LITERAL_ALIASES`); this module spells the result in Swift. `kotlin.ts`
 * spells the same resolution in Kotlin for Android. The mapping, from the type
 * the registry prints:
 *
 * | TypeScript | Swift |
 * | --- | --- |
 * | `string`, `number`, `boolean` | `String`, `Double`, `Bool` |
 * | a union of string literals | `PM<Member><Prop>: String` enum |
 * | a union of integer literals | `PM<Member><Prop>: Int` enum |
 * | `"sm" \| "md" \| "lg"` (`ControlSize`) | `PMControlSize` |
 * | every icon role (`IconRole`) | `PMIconRole`, generated from the registry's roles, each with its SF Symbol as `systemName` |
 * | `ReactNode`, an element type | `PMContent` |
 * | `T[]`, `readonly T[]` | `[T]` |
 * | `[A, B]` | `(A, B)` |
 * | `(a: A) => R` | `@MainActor (A) -> R`, by the same mapping |
 * | `void \| Promise<void>`, as a closure's result | `Void`: the member calls the closure and does not wait for it, because the app owns every task |
 * | a DOM event parameter (`MouseEvent<…>`, `KeyboardEvent<…>`, `ChangeEvent<…>`, `FormEvent<…>`, `FocusEvent<…>`, `PointerEvent<…>`, `Event`) | left out, the other parameters kept: `(event: MouseEvent<…>) => void` is `() -> Void`, `(value: string, event: ChangeEvent<…>) => void` is `(String) -> Void` |
 * | a name with no type arguments | `PM<Name>`, an opaque struct (`<Member>Props` is that member's props), counted by `contracts.test.ts` |
 * | a name with a shape in `SHAPES` | `PM<Name>`, a struct of its fields, generic where the web's is: `PMDataTableColumn<Row>` |
 * | a union in `UNIONS`, by its name or its branches (`CheckedState`, `SelectOption \| SelectOptionGroup`) | `PM<Name>`, an enum of one case per branch |
 * | a literal union the web names (`SpaceStep`, `SortDirection`), by its name or by its values | `PM<Name>`, one enum every use shares |
 * | `ReadonlySet<T>`, `Set<T>` | `Set<T>` |
 * | `Record<K, V>` | `[K: V]` |
 * | `File` | `PMFile`, declared in the foundation |
 * | `unknown` | `PMJSONValue`, any JSON value, declared in the foundation |
 * | a name in `JSON_TYPES` (`RichTextDocument`) | `PMJSONValue`: the JSON an app stored, which a tolerant reader reads |
 * | a function type in `FUNCTION_ALIASES` (`StepperSpoken`) | its definition, by the same mapping |
 * | an inline object type a shape with a `native` reason names | `PM<Name>`, that shape's struct |
 * | a member's type parameter (`DataTable`'s `Row`) | a generic parameter of its props and its rendering: `PMDataTableProps<Row>` |
 * | a union of string and integer literals (`Skeleton`'s `width`) | `PM<Member><Prop>: String` enum, each literal as written |
 * | `T \| null` | `T?` |
 * | an optional prop | an optional field; a required prop is not |
 *
 * A DOM event has no native meaning. On the web it carries the element, the
 * pointer and the key; a native member has none of them to give, and calling
 * the closure is itself the event. So the parameter is left out rather than
 * the whole prop: `Button`'s `onClick` is `(@MainActor () -> Void)?`, and a
 * screen binds an action to it as on the web. Every closure is `@MainActor`,
 * as a screen's actions are (`design/native/screen-contract.md`): a member
 * calls it from its view, on the main actor, so a screen's action binds to it
 * as it is.
 *
 * Anything else — a union of unlike types, a generic type, an inline object
 * type no shape names, a lone boolean literal, a type parameter used by a
 * compound part — becomes a field of type `PMUnsupported<Member><Prop>`,
 * declared in `Unsupported.swift` with the prop's TypeScript type and the
 * reason. The gap is visible in the contract and counted by
 * `contracts.test.ts`, never dropped.
 *
 * A member with a type parameter is generic in Swift: `DataTable<Row>` on the
 * web is `PMDataTableProps<Row>`, and its rendering protocol declares `Row` as
 * an associated type, so a screen hands it its own row type and the compiler
 * infers it. The parameter is unconstrained, as on the web: `getRowId` gives a
 * row its identity, so a row type need not be `Identifiable`.
 *
 * The registry prints a named object type by name (`StatDelta`), not by shape,
 * so a field of that type could be held but never read. `SHAPES` gives the
 * types the native members read a shape: each is the web's declaration, field
 * for field, written as the web writes it and mapped by the table above, and
 * `contracts.test.ts` holds each one to the web's source, so a shape cannot
 * drift from the type it stands for. A type not in `SHAPES` stays opaque: a
 * field of that type can be passed along but carries no value a member can
 * read, so `contracts.test.ts` counts the opaque types and holds every member
 * with a rendering to using none.
 *
 * Four files carry decisions made elsewhere rather than the props.
 * `Strings.swift` declares `PMStrings`, the English defaults the specs name
 * (`SPEC_DEFAULTS` in `strings.ts`), each looked up through
 * `String(localized:comment:)` in the app's main bundle, so an app translates
 * them in its own string catalog. `Recipes.swift` declares `PMRecipe`, the
 * numbers the recipes write that the members read (`RECIPE_NUMBERS` in
 * `recipes.ts`). `Brands.swift` holds the providers' marks, the engine's
 * `BRAND_DRAWINGS`, path for path, which the foundation's `PMBrandMark` draws.
 * `Phones.swift` holds PhoneInput's calling codes, the engine's table read
 * through its own lookups (`phones.ts`), which the foundation's `PMPhones` reads.
 *
 * A union of unlike types has no Swift type, unless `UNIONS` names it: then it
 * is an enum of one case per branch, a payload-free case for a literal and a
 * case with its value for a type. `Checkbox`'s `CheckedState` (`boolean |
 * 'indeterminate'`) is `PMCheckedState`, and `Select`'s option list, an array
 * of `SelectOption | SelectOptionGroup`, is `[PMSelectOptionEntry]`. A union
 * is recognised by its name where the registry prints one, and by its branches
 * where it prints them.
 *
 * Two fields come from the native contract rather than the spec: every page
 * archetype but `AppShell` takes `loadStatus: PMLoadStatus` first and an
 * optional `onRetry` second (`design/native/screen-contract.md`). Where it
 * does, the web's own state props, `ListPage`'s `empty` and `AuthPage`'s
 * `pending`, are left out: the status sets them, so a screen cannot bind one
 * against it.
 *
 * Apart from `SHAPES` and `UNIONS`, this is a front over the registry: it
 * reads what the registry publishes and nothing else, so the contract cannot
 * disagree with the catalogue an agent reads. The caller hands in the three
 * inputs the registry does not hold: the names of the states fixtures the
 * Swift sources declare, for `Fixtures.swift`; the SF Symbol each icon role
 * draws with, the `ios` field of `design/icons.json`, for
 * `PMIconRole.systemName`; and the `PM…` types the hand-written sources
 * declare, which no generated type may take (`readDeclaredTypes` in
 * `disk.ts`). The registry publishes a role as a meaning and leaves every
 * glyph out, so the symbols come from the decision itself (`readIconSymbols`
 * in `disk.ts`).
 */

/** The command a generated file names as its writer. */
export const GENERATOR = 'pnpm native:contracts'

/** Where the hand-written members and the foundation live, relative to the root. */
export const SOURCES = 'platforms/ios/Sources/PolymorphUI'

/** The directory this module owns. A file there it does not return is removed. */
export const GENERATED = `${SOURCES}/Generated`

/**
 * The hand-written foundation: the types every member and the harness share,
 * and where the platform meets the tokens, so the token law leaves it out.
 */
export const FOUNDATION = 'PolymorphUI.swift'

/**
 * The foundation's further files, `PolymorphUI+<Topic>.swift`: drawing helpers
 * more than one member shares (the field box, the page column). They belong to
 * no member, so the conformance law leaves them out; they draw, so every other
 * law holds them.
 */
export const FOUNDATION_PART = /^PolymorphUI\+[A-Z][A-Za-z]*\.swift$/

/** The foundation or one of its further files: no member's file. */
export const isFoundation = (path: string) => path === FOUNDATION || FOUNDATION_PART.test(path)

/** The platform the contracts are for. */
export const PLATFORM = 'ios'

/** Swift keywords a field or case could collide with; such a name is written in backticks. */
const SWIFT_KEYWORDS = new Set([
  'Any',
  'Self',
  'Type',
  'as',
  'associatedtype',
  'break',
  'case',
  'catch',
  'class',
  'continue',
  'default',
  'defer',
  'deinit',
  'do',
  'else',
  'enum',
  'extension',
  'fallthrough',
  'false',
  'fileprivate',
  'for',
  'func',
  'guard',
  'if',
  'import',
  'in',
  'init',
  'inout',
  'internal',
  'is',
  'let',
  'nil',
  'operator',
  'private',
  'protocol',
  'public',
  'repeat',
  'rethrows',
  'return',
  'self',
  'static',
  'struct',
  'subscript',
  'super',
  'switch',
  'throw',
  'throws',
  'true',
  'try',
  'typealias',
  'var',
  'where',
  'while',
])

/* -------------------------------------------------------------------------- */
/* Members                                                                    */
/* -------------------------------------------------------------------------- */

/** Every member and ladder primitive with its iOS entry, sorted by name. */
export function iosMembers(registry: Registry): NativeMember[] {
  return platformMembers(registry, PLATFORM)
}

/** The members that render on iOS, natively or adapted: the ones with a contract. */
export function nativeMembers(registry: Registry): NativeMember[] {
  return renderedMembers(registry, PLATFORM)
}

/* -------------------------------------------------------------------------- */
/* Swift                                                                      */
/* -------------------------------------------------------------------------- */

/** A declaration-safe identifier: a keyword is written in backticks. */
const identifier = (name: string) => (SWIFT_KEYWORDS.has(name) ? `\`${name}\`` : name)

/** A Swift string literal. */
function swiftString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
}

/** A doc comment, wrapped at 100 columns. */
function doc(text: string, indent: string): string[] {
  return wrap(text, 100 - indent.length - 4).map((line) =>
    line === '' ? `${indent}///` : `${indent}/// ${line}`,
  )
}

/** How Swift spells each type the resolver produces. */
const SWIFT: Dialect = {
  language: 'Swift',
  platformName: 'iOS',
  string: 'String',
  number: 'Double',
  boolean: 'Bool',
  void: 'Void',
  list: (element) => `[${element}]`,
  set: (element) => `Set<${element}>`,
  tuple: (elements) => `(${elements.join(', ')})`,
  function: (params, returns: Mapped) =>
    `@MainActor (${params.join(', ')}) -> ${returns.isFunction ? `(${returns.text})` : returns.text}`,
  optional: (mapped) => (mapped.isFunction ? `(${mapped.text})?` : `${mapped.text}?`),
  record: (key, value) => `[${key}: ${value}]`,
  unknown: 'PMJSONValue',
  // `Blob` is bytes the member made (ImageEditor's export), in the media type
  // its props named: Foundation's `Data`.
  equivalents: { Blob: 'Data', Date: 'Date', File: 'PMFile' },
}

export interface UnsupportedProp {
  member: string
  /** The prop as the registry names it: `onClick`, `Header.onSort`. */
  prop: string
  typescript: string
  reason: string
  /** The opaque type the field is declared as. */
  swift: string
}

function enumSource(
  name: string,
  rawType: 'String' | 'Int',
  cases: { name: string; raw: string | number }[],
  summary: string,
): string[] {
  const seen = new Set<string>()
  const lines = [...doc(summary, ''), `public enum ${name}: ${rawType}, CaseIterable, Sendable {`]
  for (const entry of cases) {
    if (seen.has(entry.name)) {
      throw new Error(`native contracts: ${name} has two cases named ${entry.name}`)
    }
    seen.add(entry.name)
    const raw =
      rawType === 'Int'
        ? ` = ${entry.raw}`
        : entry.name === entry.raw
          ? ''
          : ` = ${swiftString(String(entry.raw))}`
    lines.push(`  case ${identifier(entry.name)}${raw}`)
  }
  lines.push('}')
  return lines
}

const enumModelSource = (model: EnumModel) =>
  enumSource(model.name, model.raw === 'int' ? 'Int' : 'String', model.cases, model.summary)

function structSource({ name, summary, fields, parameters }: StructModel): string[] {
  const generics = parameters.length === 0 ? '' : `<${parameters.join(', ')}>`
  const lines = [...doc(summary, ''), `public struct ${name}${generics} {`]
  for (const field of fields) {
    if (field.doc) lines.push(...doc(field.doc, '  '))
    lines.push(`  public var ${identifier(field.name)}: ${field.type}`)
  }
  if (fields.length > 0) lines.push('')
  const params = fields.map((field) => {
    const type = field.isFunction ? `@escaping ${field.type}` : field.type
    return `${identifier(field.name)}: ${type}${field.optional ? ' = nil' : ''}`
  })
  if (params.length === 0) {
    lines.push('  public init() {}')
  } else {
    lines.push(
      '  public init(',
      ...params.map((param, index) => `    ${param}${index < params.length - 1 ? ',' : ''}`),
      '  ) {',
    )
    for (const field of fields)
      lines.push(`    self.${identifier(field.name)} = ${identifier(field.name)}`)
    lines.push('  }')
  }
  lines.push('}')
  return lines
}

/** Switch arms that share a result, as one arm: `case .solidAccent, .solidDanger: .solid`. */
function grouped<Cell extends { name: string }>(
  cells: Cell[],
  result: (cell: Cell) => string,
): string[] {
  const arms = new Map<string, string[]>()
  for (const cell of cells)
    arms.set(result(cell), [...(arms.get(result(cell)) ?? []), `.${cell.name}`])
  return [...arms].map(([value, names]) => `    case ${names.join(', ')}: .${value}`)
}

function appearanceSource(model: AppearanceModel): string[][] {
  const { name, cells } = model
  const lines = [
    ...doc(
      `${model.member}'s lawful variant × tone cells, and only those: the grid the web types as ` +
        '`LawfulVariants`. `lawful` lists them in grid order.',
      '',
    ),
    `public enum ${name}: String, CaseIterable, Sendable {`,
    ...cells.map((cell) => `  case ${identifier(cell.name)} = ${swiftString(cell.raw)}`),
    '',
    '  /// Every lawful cell, in grid order.',
    `  public static let lawful: [${name}] = [`,
    ...cells.map((cell, index) => `    .${cell.name}${index < cells.length - 1 ? ',' : ''}`),
    '  ]',
    '',
    '  /// The cell for a variant and a tone, or `nil` when the grid excludes the pair.',
    `  public init?(variant: ${model.variant.name}, tone: ${model.tone.name}) {`,
    '    self.init(rawValue: "\\(variant.rawValue)/\\(tone.rawValue)")',
    '  }',
    '',
    `  public var variant: ${model.variant.name} {`,
    '    switch self {',
    ...grouped(cells, (cell) => cell.variant),
    '    }',
    '  }',
    '',
    `  public var tone: ${model.tone.name} {`,
    '    switch self {',
    ...grouped(cells, (cell) => cell.tone),
    '    }',
    '  }',
    '}',
  ]
  return [lines, enumModelSource(model.variant), enumModelSource(model.tone)]
}

function memberSource(model: MemberModel): string {
  const { member } = model
  const lines: string[] = [`// MARK: - ${member.name}`, '']
  const blocks = model.declarations.flatMap((declaration) =>
    declaration.kind === 'appearance'
      ? appearanceSource(declaration)
      : [enumModelSource(declaration)],
  )
  for (const block of blocks) lines.push(...block, '')
  lines.push(...structSource(model.props), '')
  for (const part of model.parts) lines.push(...structSource(part), '')
  const generic = model.props.parameters
  lines.push(
    ...doc(
      `A view that renders ${member.name} from its props. The member's file declares \`PM${member.name}\`, ` +
        `which conforms to it.`,
      '',
    ),
    `public protocol ${model.rendering}: View {`,
    ...generic.map((name) => `  associatedtype ${name}`),
    `  init(props: ${model.props.name}${generic.length === 0 ? '' : `<${generic.join(', ')}>`})`,
    '}',
  )
  return lines.join('\n')
}

function unionSource(model: UnionModel): string {
  const cases = model.cases.flatMap((entry) => [
    ...(entry.doc ? doc(entry.doc, '  ') : []),
    entry.type === undefined
      ? `  case ${identifier(entry.name)}`
      : `  case ${identifier(entry.name)}(${entry.type})`,
  ])
  return [
    ...doc(model.summary, ''),
    `public enum ${model.name}${model.plain ? ': CaseIterable, Sendable' : ''} {`,
    ...cases,
    '}',
  ].join('\n')
}

function namedSource(model: NamedModel): string {
  switch (model.kind) {
    case 'shape':
      return [
        ...model.declarations.flatMap((declaration) => [...enumModelSource(declaration), '']),
        ...structSource(model.struct),
      ].join('\n')
    case 'union':
      return unionSource(model)
    case 'enum':
      return enumModelSource(model).join('\n')
  }
}

/* -------------------------------------------------------------------------- */
/* The files                                                                   */
/* -------------------------------------------------------------------------- */

/** A generated file's opening comment: who writes it, from what, and that nobody else does. */
const header = (what: string) =>
  [
    ...doc(`Generated by \`${GENERATOR}\` ${what}.`, '').map((line) =>
      line.replace(/^\/\/\//, '//'),
    ),
    '// Never edit it by hand: the mapping from TypeScript to Swift is described in',
    '// `packages/native/src/contracts.ts`.',
    '',
  ].join('\n')

/** A named type the contracts hold opaque, and the props that use it. */
export interface OpaqueType {
  swift: string
  typescript: string
  /** `Member.prop`, `Member.Part.prop`. */
  usedBy: string[]
}

export interface ContractSet {
  /** File name in `Generated/` → its contents. */
  files: Record<string, string>
  members: NativeMember[]
  unsupported: UnsupportedProp[]
  /** Every opaque type, by Swift name. */
  opaque: OpaqueType[]
  /** Each member's contract source, by member name, as it appears in `Contracts.swift`. */
  contracts: Record<string, string>
}

/**
 * `PMIconRole`: every role the registry publishes, and its `systemName`, the SF
 * Symbol `symbols` gives it. A role without a symbol, or a symbol for a role
 * the registry does not publish, is refused rather than written.
 */
function iconRoleSource(roles: readonly string[], symbols: IconSymbols): string[] {
  const unnamed = roles.filter((role) => typeof symbols[role] !== 'string' || symbols[role] === '')
  if (unnamed.length > 0) {
    throw new Error(
      `native contracts: no SF Symbol for the icon role ${unnamed.join(', ')}: ` +
        'give each role an "ios" in design/icons.json',
    )
  }
  const strays = Object.keys(symbols).filter((role) => !roles.includes(role))
  if (strays.length > 0) {
    throw new Error(
      `native contracts: an SF Symbol for ${strays.join(', ')}, which is no icon role`,
    )
  }
  const cases = roles.map((role) => ({ name: caseNameOf(role), raw: role }))
  const declaration = enumSource(
    'PMIconRole',
    'String',
    cases,
    'Every icon role: a meaning, never a glyph. The registry publishes the closed set from ' +
      '`design/icons.json`; `PMIconView` draws each as its `systemName`.',
  )
  return [
    ...declaration.slice(0, -1),
    '',
    ...doc(
      "The SF Symbol that draws the role on Apple platforms: the role's `ios` in " +
        "`design/icons.json`, chosen for the meaning the web's glyph draws. The rendering " +
        'harness checks that every one exists.',
      '  ',
    ),
    '  public var systemName: String {',
    '    switch self {',
    ...cases.map(
      (entry) => `    case .${entry.name}: ${swiftString(symbols[entry.raw] as string)}`,
    ),
    '    }',
    '  }',
    '}',
  ]
}

/** An icon role's case: `sort-asc` is `sortAsc`. */
function caseNameOf(role: string): string {
  return role
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word, index) =>
      index === 0
        ? `${word.charAt(0).toLowerCase()}${word.slice(1)}`
        : `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
    )
    .join('')
}

/* -------------------------------------------------------------------------- */
/* The spec defaults, the recipe numbers and the brand marks                  */
/* -------------------------------------------------------------------------- */

/**
 * A default's text as the body of a `String(localized:)` literal: `"` and `\`
 * escaped, a `{count}` number interpolated as `\(Int(count))` (`%lld` in the
 * string catalog) and a `{name}` string as `\(name)` (`%@`). `key` writes the
 * string catalog's key instead, each parameter as its format specifier.
 */
function swiftTemplate(entry: SpecDefault, text = entry.english, key = false): string {
  const types = new Map(
    (entry.parameters ?? []).map((parameter) => [parameter.name, parameter.type]),
  )
  return text
    .split(/(\{\w+\})/)
    .map((part) => {
      const parameter = /^\{(\w+)\}$/.exec(part)?.[1]
      if (parameter === undefined) {
        const literal = swiftString(part).slice(1, -1)
        return key ? literal.replace(/%/g, '%%') : literal
      }
      const type = types.get(parameter)
      if (type === undefined) {
        throw new Error(
          `native contracts: the default ${entry.name} writes {${parameter}}, which it does not declare`,
        )
      }
      if (key) return type === 'number' ? '%lld' : '%@'
      return type === 'number' ? `\\(Int(${parameter}))` : `\\(${parameter})`
    })
    .join('')
}

/** The parameters a default's text writes, in order. */
const written = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string)

/**
 * `String(localized: "…", comment: "…")` after `lead` (a field's label, or
 * nothing), on one line at `indent`, or over three when one is too long. A
 * default with a form for one is looked up by its text's key, and its default
 * value is that form when `count` is one, so the app's translation of the key
 * receives every count, one included.
 */
function localized(entry: SpecDefault, indent: string, lead = ''): string[] {
  const comment = swiftString(entry.comment)
  if (entry.one !== undefined) {
    if (written(entry.one).join() !== written(entry.english).join()) {
      throw new Error(
        `native contracts: the default ${entry.name}'s form for one writes other parameters than its text`,
      )
    }
    const one = `"${swiftTemplate(entry, entry.one)}"`
    const other = `"${swiftTemplate(entry)}"`
    const choice = `${indent}  defaultValue: count == 1 ? ${one} : ${other},`
    return [
      `${indent}${lead}String(`,
      `${indent}  localized: "${swiftTemplate(entry, entry.english, true)}",`,
      ...(choice.length <= 100
        ? [choice]
        : [
            `${indent}  defaultValue: count == 1`,
            `${indent}    ? ${one}`,
            `${indent}    : ${other},`,
          ]),
      `${indent}  comment: ${comment})`,
    ]
  }
  const value = `"${swiftTemplate(entry)}"`
  const line = `${indent}${lead}String(localized: ${value}, comment: ${comment})`
  if (line.length <= 100) return [line]
  return [
    `${indent}${lead}String(`,
    `${indent}  localized: ${value},`,
    `${indent}  comment: ${comment})`,
  ]
}

/** A default's parameters as Swift: a number is `Double`, as the contracts write one. */
const swiftParameters = (entry: SpecDefault) =>
  (entry.parameters ?? []).map(
    (parameter) =>
      `${identifier(parameter.name)}: ${parameter.type === 'number' ? 'Double' : 'String'}`,
  )

/** A doc sentence with the spec it cites, in parentheses before its full stop. */
const cited = (sentence: string, spec: string) => `${sentence.replace(/\.$/, '')} (\`${spec}\`).`

/** A field of a record default: its text, or a closure of its parameters. */
function recordField(field: SpecDefault): string[] {
  const parameters = field.parameters ?? []
  if (parameters.length === 0) return localized(field, '      ', `${field.name}: `)
  return [
    `      ${field.name}: { ${parameters.map((parameter) => parameter.name).join(', ')} in`,
    ...localized(field, '        '),
    '      }',
  ]
}

/**
 * `Strings.swift`: `PMStrings`, the defaults the specs name (`SPEC_DEFAULTS` in
 * `strings.ts`) that the SwiftUI members speak. A default is a static
 * property, a template a static function of its parameters, and a record the
 * contract's struct with each field's default; every text is looked up when it
 * is read, so the locale in force then is the one it is in.
 */
export function swiftStringsSource(entries: readonly SpecDefaultEntry[] = SPEC_DEFAULTS): string {
  const declaration = (entry: SpecDefaultEntry): string[] => {
    if (isRecord(entry)) {
      const fields = entry.fields.map(recordField)
      return [
        ...doc(cited(entry.doc, entry.spec), '  '),
        `  static var ${identifier(entry.name)}: PM${entry.type} {`,
        `    PM${entry.type}(`,
        ...fields.flatMap((lines, index) =>
          index < fields.length - 1
            ? [...lines.slice(0, -1), `${lines.at(-1) ?? ''},`]
            : [...lines.slice(0, -1), `${lines.at(-1) ?? ''})`],
        ),
        '  }',
      ]
    }
    const parameters = swiftParameters(entry)
    const opening =
      parameters.length === 0
        ? `  static var ${identifier(entry.name)}: String {`
        : `  static func ${identifier(entry.name)}(${parameters.join(', ')}) -> String {`
    return [...doc(cited(entry.doc, entry.spec), '  '), opening, ...localized(entry, '    '), '  }']
  }
  return [
    header('from `packages/native/src/strings.ts`: the defaults the specs name'),
    'import Foundation',
    '',
    ...doc(
      'Every default a spec names for text a member speaks when the prop that carries it is ' +
        'absent, in English. A member uses one only when its prop is absent. Each is looked up ' +
        'in the app’s main bundle when it is read, so an app translates them in its own string ' +
        'catalog, as a localized web host passes its catalogue’s value for the prop. The list is ' +
        '`SPEC_DEFAULTS` in `packages/native/src/strings.ts`, which holds each to its spec.',
      '',
    ),
    'enum PMStrings {',
    ...entries
      .filter((entry) => spokenOn(entry, 'ios'))
      .flatMap((entry, index) => [...(index === 0 ? [] : ['']), ...declaration(entry)]),
    '}',
    '',
  ].join('\n')
}

/** A recipe number as Swift: a multiple, a breakpoint in points, or a fraction. */
function swiftRecipeDeclaration(number: RecipeNumber, value: number): string[] {
  const where = recipeSources(number)
  switch (number.unit) {
    case 'space10':
      return [
        ...doc(`${number.doc} In multiples of \`space.10\`: ${value}, from ${where}.`, '  '),
        `  static let ${number.name}: CGFloat = ${value}`,
      ]
    case 'multiple':
      return [
        ...doc(
          `${number.doc} In multiples of \`${number.of ?? ''}\`: ${value}, from ${where}.`,
          '  ',
        ),
        `  static let ${number.name}: CGFloat = ${value}`,
      ]
    case 'rem':
      return [
        ...doc(`${number.doc} ${value}rem, from ${where}.`, '  '),
        `  static let ${number.name}: CGFloat = ${value} * PMGeometry.rem`,
      ]
    case 'percent':
      return [
        ...doc(`${number.doc} ${value}%, from ${where}.`, '  '),
        `  static let ${number.name}: CGFloat = ${String(value / 100)}`,
      ]
    case 'divisor':
      return [
        ...doc(`${number.doc} In parts of \`${number.of ?? ''}\`: ${value}, from ${where}.`, '  '),
        `  static let ${number.name}: CGFloat = ${value}`,
      ]
    case 'fraction':
      return [
        ...doc(`${number.doc} ${value}, from ${where}.`, '  '),
        `  static let ${number.name}: CGFloat = ${value}`,
      ]
    case 'px':
      return [
        ...doc(`${number.doc} ${value}px, a point each, from ${where}.`, '  '),
        `  static let ${number.name}: CGFloat = ${value}`,
      ]
  }
}

/** `Recipes.swift`: `PMRecipe`, the numbers the recipes write that the members read (`recipes.ts`). */
export function swiftRecipesSource(recipes: Readonly<Record<string, string>>): string {
  const numbers = readRecipeNumbers(recipes)
  return [
    header(`from the recipes in \`${RECIPES}\`: the numbers the members read`),
    'import Foundation',
    '',
    ...doc(
      'The numbers the recipes write that the members read: a measure as a multiple or a part ' +
        'of a token, which a member multiplies or divides the density’s step by; a breakpoint, ' +
        'which is geometry and not theme, in points; a height as a fraction of the window; an ' +
        'opacity or a share as a fraction; and a length the content decides, in points. Each is ' +
        'read from its recipe, or from the web member’s source it names, by `RECIPE_NUMBERS` ' +
        'in `packages/native/src/recipes.ts`.',
      '',
    ),
    'enum PMRecipe {',
    ...numbers.flatMap(({ number, value }, index) => [
      ...(index === 0 ? [] : ['']),
      ...swiftRecipeDeclaration(number, value),
    ]),
    '}',
    '',
  ].join('\n')
}

/** A mark's `viewBox`, `0 0 w h`, as its width and height; a box with another origin is refused. */
export function viewBoxSize(
  name: string,
  drawing: BrandDrawing,
): { width: number; height: number } {
  const [x, y, width, height, ...rest] = drawing.viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  if (
    x !== 0 ||
    y !== 0 ||
    width === undefined ||
    height === undefined ||
    !(width > 0) ||
    !(height > 0) ||
    rest.length > 0
  ) {
    throw new Error(
      `native contracts: the brand mark ${name} has the viewBox "${drawing.viewBox}"; ` +
        'a mark is drawn from the origin of a box of positive size',
    )
  }
  return { width, height }
}

/**
 * `Brands.swift`: each provider's mark, the engine's `BRAND_DRAWINGS`
 * (`packages/engine/src/icon/brands.ts`) path for path, its fill a hex code
 * the provider publishes, or `nil` for `currentColor`, the text colour. A
 * provider is a case of ProviderButton's `provider`, so the compiler holds the
 * marks and the enum to the same set.
 */
export function swiftBrandsSource(
  drawings: Readonly<Record<string, BrandDrawing>> = BRAND_DRAWINGS,
): string {
  const cases = Object.entries(drawings).flatMap(([name, drawing]) => {
    const { width, height } = viewBoxSize(name, drawing)
    return [
      `    case .${caseNameOf(name)}:`,
      '      PMBrandDrawing(',
      `        viewBox: CGSize(width: ${width}, height: ${height}),`,
      '        paths: [',
      ...drawing.paths.map(
        (path, index) =>
          `          PMBrandPath(d: ${swiftString(path.d)}, fill: ${
            path.fill === 'currentColor' ? 'nil' : swiftString(path.fill)
          })${index < drawing.paths.length - 1 ? ',' : ''}`,
      ),
      '        ])',
    ]
  })
  return [
    header('from `packages/engine/src/icon/brands.ts`: the providers’ marks'),
    'import SwiftUI',
    '',
    'extension PMBrandMark {',
    ...doc(
      'The mark of `provider`: the engine’s `BRAND_DRAWINGS`, path for path, each path’s fill ' +
        'the provider’s published colour, or `nil` for the text colour.',
      '  ',
    ),
    '  static func drawing(_ provider: PMProviderButtonProvider) -> PMBrandDrawing {',
    '    switch provider {',
    ...cases,
    '    }',
    '  }',
    '}',
    '',
  ].join('\n')
}

/**
 * `Phones.swift`: PhoneInput's calling codes, the engine's table read through its own lookups
 * (`phones.ts`): each code and the regions that dial it, its main region first, and the regions
 * that dial a trunk zero. The hand-written `PMPhones` reads them.
 */
export function swiftPhonesSource(
  codes: readonly PhoneCode[] = phoneCodes(),
  trunkZero: readonly string[] = phoneTrunkZero(),
): string {
  return [
    header('from `packages/engine/src/conventions/phone.ts`: the calling codes'),
    'extension PMPhones {',
    ...doc(
      'Each calling code and the regions that dial it, by ISO 3166-1 alpha-2 code, its main ' +
        'region first, in the engine’s order.',
      '  ',
    ),
    '  static let codes: [(code: String, regions: [String])] = [',
    ...codes.flatMap(({ code, regions }) => [
      `    (${swiftString(code)}, [`,
      ...wrapList(regions.map(swiftString), '      '),
      '    ]),',
    ]),
    '  ]',
    '',
    ...doc('The regions that dial a trunk zero before a national number.', '  '),
    '  static let trunkZero: Set<String> = [',
    ...wrapList(trunkZero.map(swiftString), '    '),
    '  ]',
    '}',
    '',
  ].join('\n')
}

/**
 * Every generated file, from the registry, the names of the states fixtures
 * the member files declare (`fixturesIn`), each icon role's SF Symbol
 * (`readIconSymbols`), the `PM…` types the hand-written sources declare
 * (`declaredTypesIn`), which no generated type may take, and the recipes
 * `RECIPE_NUMBERS` reads (`readRecipes`).
 */
export function generateContracts(
  registry: Registry,
  fixtures: readonly string[],
  symbols: IconSymbols,
  reserved: readonly string[] = [],
  /** The recipes `RECIPE_NUMBERS` reads (`readRecipes`); without them `Recipes.swift` is not written. */
  recipes?: Readonly<Record<string, string>>,
): ContractSet {
  const contracts: Record<string, string> = {}
  const resolution = resolveContracts(registry, PLATFORM, SWIFT, reserved, (model) => {
    contracts[model.member.name] = memberSource(model)
  })
  const members = resolution.members.map((model) => model.member)
  const named = resolution.named.map((model) => `${namedSource(model)}\n`)

  const iconRole = iconRoleSource(
    registry.icons.roles.map((role) => role.name),
    symbols,
  )

  const opaqueSource = resolution.opaque.flatMap(({ type, typescript, usedBy }) => [
    ...doc(
      `The web's \`${typescript}\`, opaque here: the registry prints it by name, not by shape. ` +
        `Used by ${usedBy.join(', ')}.`,
      '',
    ),
    `public struct ${type} {`,
    '  public init() {}',
    '}',
    '',
  ])

  const contractsFile = [
    header('from the registry: every native or adapted member’s props and rendering protocol'),
    'import SwiftUI',
    '',
    '// MARK: - Icon roles',
    '',
    ...iconRole,
    '',
    ...members.map((member) => `${contracts[member.name]}\n`),
    '// MARK: - Shapes',
    '',
    ...named,
    '// MARK: - Opaque types',
    '',
    ...opaqueSource,
  ]
    .join('\n')
    .replace(/\n+$/, '\n')

  const allMembers = iosMembers(registry)
  const catalogueFile = [
    header('from the registry: every member’s status on iOS'),
    'extension PMCatalogue {',
    '  /// Every member of the vocabulary and how it renders on iOS, by name.',
    '  public static let members: [PMCatalogueEntry] = [',
    ...allMembers.map((member, index) => {
      const args = [`name: ${swiftString(member.name)}`, `status: .${member.entry.status}`]
      if (member.entry.as !== undefined) args.push(`rendersAs: ${swiftString(member.entry.as)}`)
      if (member.entry.substitute !== undefined)
        args.push(`substitute: ${swiftString(member.entry.substitute)}`)
      return `    PMCatalogueEntry(${args.join(', ')})${index < allMembers.length - 1 ? ',' : ''}`
    }),
    '  ]',
    '}',
    '',
  ].join('\n')

  const unsupported: UnsupportedProp[] = resolution.unsupported.map(({ type, ...entry }) => ({
    ...entry,
    swift: type,
  }))
  const unsupportedFile = [
    header('from the registry: every prop whose type the contract mapping cannot express'),
    '// Each is a field of its own opaque type, so the gap shows in the contract',
    '// rather than being dropped. `contracts.test.ts` counts them.',
    '',
    ...unsupported.flatMap((entry) => [
      ...doc(`\`${entry.member}.${entry.prop}\`: \`${entry.typescript}\` — ${entry.reason}.`, ''),
      `public struct ${entry.swift} {`,
      '  public init() {}',
      '}',
      '',
    ]),
    'extension PMUnsupported {',
    '  /// Every prop the contracts cannot express yet, in member order.',
    '  public static let props: [PMUnsupportedProp] = [',
    ...unsupported.map(
      (entry, index) =>
        `    PMUnsupportedProp(member: ${swiftString(entry.member)}, prop: ${swiftString(entry.prop)}, ` +
        `typescript: ${swiftString(entry.typescript)}, reason: ${swiftString(entry.reason)})` +
        `${index < unsupported.length - 1 ? ',' : ''}`,
    ),
    '  ]',
    '}',
    '',
  ].join('\n')

  const sortedFixtures = [...fixtures].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const fixturesFile = [
    header('from the member files present: every states fixture they declare'),
    'extension PMFixtures {',
    '  /// Every member’s states fixture in `Sources/PolymorphUI`, by member name.',
    '  public static var all: [any PMStates] {',
    '    [',
    ...sortedFixtures.map(
      (name, index) => `      ${name}()${index < sortedFixtures.length - 1 ? ',' : ''}`,
    ),
    '    ]',
    '  }',
    '}',
    '',
  ].join('\n')

  return {
    files: {
      'Brands.swift': swiftBrandsSource(),
      'Catalogue.swift': catalogueFile,
      'Contracts.swift': contractsFile,
      'Fixtures.swift': fixturesFile,
      'Phones.swift': swiftPhonesSource(),
      ...(recipes === undefined ? {} : { 'Recipes.swift': swiftRecipesSource(recipes) }),
      'Strings.swift': swiftStringsSource(),
      'Unsupported.swift': unsupportedFile,
    },
    members,
    unsupported,
    opaque: resolution.opaque.map(({ type, typescript, usedBy }) => ({
      swift: type,
      typescript,
      usedBy,
    })),
    contracts,
  }
}

/**
 * The states fixtures a set of Swift sources declares: every
 * `struct <Member>States: … PMStates`, by type name. `sources` maps a file name
 * to its contents; generated files and the foundation are the caller's to leave
 * out.
 */
export function fixturesIn(sources: Record<string, string>): string[] {
  const names = new Set<string>()
  for (const source of Object.values(sources)) {
    for (const match of source.matchAll(/\bstruct\s+(\w+States)\s*:\s*[^{]*\bPMStates\b/g)) {
      names.add(match[1] as string)
    }
  }
  return [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * The `PM…` types a set of Swift sources declares, at any access level:
 * every `struct`, `enum`, `class`, `actor`, `protocol` and `typealias` named
 * `PM…`, comments and strings left out. A generated type of one of these
 * names would not compile, so the generator refuses it.
 */
export function declaredTypesIn(sources: Record<string, string>): string[] {
  const names = new Set<string>()
  for (const source of Object.values(sources)) {
    const { code } = lex(source)
    for (const match of code.matchAll(
      /\b(?:struct|enum|class|actor|protocol|typealias)\s+(PM\w+)/g,
    )) {
      names.add(match[1] as string)
    }
  }
  return [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}
