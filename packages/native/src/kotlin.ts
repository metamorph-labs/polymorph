import type { Registry } from '@polymorph/registry'

import { lex } from './kotlin-source'
import {
  byCodePoint,
  capitalise,
  platformMembers,
  resolveContracts,
  Unsupported,
  wrap,
  type AppearanceModel,
  type Dialect,
  type EnumModel,
  type FieldModel,
  type IconSymbols,
  type Mapped,
  type MemberModel,
  type NamedModel,
  type NativeMember,
  type OpaqueModel,
  type StructModel,
  type UnionModel,
  type UnsupportedModel,
} from './mapping'
import { BRAND_DRAWINGS, type BrandDrawing } from '../../engine/src/icon/brands'
import { phoneCodes, phoneTrunkZero, wrapList, type PhoneCode } from './phones'
import { viewBoxSize } from './contracts'
import { readRecipeNumbers, recipeSources, RECIPES, type RecipeNumber } from './recipes'
import {
  isRecord,
  SPEC_DEFAULTS,
  spokenOn,
  type SpecDefault,
  type SpecDefaultEntry,
} from './strings'

/**
 * The native contracts for Android: every member's props as Kotlin types,
 * generated from the registry, for `platforms/android/ui`.
 *
 * The same resolution as the Swift contracts (`mapping.ts`), spelled in
 * Kotlin. For every member the Android platform map marks `native` or
 * `adapted`, `Contracts.kt` declares
 *
 * - `data class PM<Member>Props`, one property per prop, an optional one
 *   defaulted to `null`;
 * - an `enum class` per literal-union prop, its entries PascalCased with the
 *   literal as `value`, and for a member with a lawful variant × tone grid one
 *   `PM<Member>Appearance` of the lawful cells only;
 * - `PM<Member>Rendering`, the interface a rendering implements: a
 *   `@Composable fun Render(props: PM<Member>Props)`. The member's file
 *   declares `object PM<Member> : PM<Member>Rendering`, so the compiler holds
 *   the member to its props. It is a `fun interface`, so an app can hand a
 *   lambda where a rendering is wanted, except where the member is generic,
 *   because a `fun interface` cannot declare a generic function, or has
 *   compound parts: each part is drawn by a function of the rendering of its
 *   own, `RenderGroup(props: PMSettingsRowGroupProps)`, so the compiler holds
 *   a member with a rendering to its parts too.
 *
 * `Members.kt` gives every member with a rendering a composable function of the
 * same name that takes the props as arguments (`PMButton(label = "Save",
 * onClick = actions::onSave)`), `children` last so it can trail, as
 * `design/native/screen-contract.md` writes a Kotlin screen, and each of its
 * compound parts one named as the screen emitter joins it
 * (`PMSettingsRowGroup(title = "Appearance") { … }`). They are generated from
 * the props, so their parameters cannot drift from them.
 *
 * The mapping, from the type the registry prints:
 *
 * | TypeScript | Kotlin |
 * | --- | --- |
 * | `string`, `number`, `boolean` | `String`, `Double`, `Boolean` |
 * | a union of string literals | `enum class PM<Member><Prop>(val value: String)` |
 * | a union of integer literals | `enum class PM<Member><Prop>(val value: Int)`, entries `Columns1`… |
 * | `"sm" \| "md" \| "lg"` (`ControlSize`) | `PMControlSize`, declared in the foundation |
 * | every icon role (`IconRole`) | `PMIconRole`, each with its Material Symbols name as `symbolName` |
 * | `ReactNode`, an element type | `PMContent`, `@Composable () -> Unit` |
 * | `T[]`, `readonly T[]` | `List<T>` |
 * | `[A, B]`, `[A, B, C]` | `Pair<A, B>`, `Triple<A, B, C>` |
 * | `(a: A) => R` | `(A) -> R`, by the same mapping |
 * | `(a: A) => ReactNode` | `@Composable (A) -> Unit`: a slot that draws from its arguments |
 * | `(a: A) => ReactNode \| undefined` | `@Composable (A) -> Unit` too: a slot draws nothing where the web returns nothing |
 * | `void \| Promise<void>`, as a result | `Unit`: the member calls the function and does not wait for it |
 * | a DOM event parameter | left out, the other parameters kept: `Button`'s `onClick` is `(() -> Unit)?` |
 * | a name with no type arguments | `PM<Name>`, an opaque class, counted |
 * | a name with a shape in `SHAPES` | `data class PM<Name>`, generic where the web's is |
 * | a union in `UNIONS` | `PM<Name>`: an `enum class` when every branch is a literal, a `sealed interface` of one `data class` per branch otherwise |
 * | a literal union the web names | `PM<Name>`, one enum every use shares; a space step is `PMSpaceStep.S4` |
 * | `ReadonlySet<T>`, `Set<T>` | `Set<T>` |
 * | `Record<K, V>` | `Map<K, V>` |
 * | `File` | `PMFile`, declared in the foundation |
 * | `Blob` | `ByteArray`: ImageEditor's `onConfirm` hands over the framed image's bytes |
 * | `unknown` | `PMJSONValue`, any JSON value, declared in the foundation |
 * | a name in `JSON_TYPES` (`RichTextDocument`) | `PMJSONValue`: the JSON an app stored, which a tolerant reader reads |
 * | a function type in `FUNCTION_ALIASES` | its definition, by the same mapping |
 * | an inline object type a shape with a `native` reason names | `data class PM<Name>`, that shape's |
 * | a member's type parameter | a type parameter of its props and of its rendering's `Render`, and of a part's `Render<Part>` when the part's props carry one |
 * | `T \| null` | `T?` |
 * | an optional prop | a nullable property defaulted to `null`; a required prop has no default |
 * | an optional prop that also takes `null` | `PMSome<T?>?`: absent is `null`, and `PMSome(null)` is the value `null`, as Swift's `T??` |
 *
 * What the mapping cannot express is declared in `Unsupported.kt` as an empty
 * `PMUnsupported<Member><Prop>` class, listed with its TypeScript type and the
 * reason, exactly as on iOS.
 *
 * Four files carry decisions made elsewhere rather than the props: `Strings.kt`
 * declares `PMStrings`, the English defaults the specs name (`strings.ts`);
 * `Recipes.kt` declares `PMRecipe`, the numbers the recipes write that the
 * members read (`recipes.ts`); `Brands.kt` holds each provider's mark, the
 * engine's `BRAND_DRAWINGS`, path for path, which the foundation's
 * `PMBrandMark` draws; and `Phones.kt` holds PhoneInput's calling codes, the
 * engine's table read through its own lookups (`phones.ts`).
 */

/** The command a generated file names as its writer. */
export const KOTLIN_GENERATOR = 'pnpm native:contracts'

/** The package every member and contract is declared in. */
export const KOTLIN_PACKAGE = 'dev.polymorph.ui'

/** Where the hand-written members and the foundation live, relative to the root. */
export const KOTLIN_SOURCES = 'platforms/android/ui/src/main/kotlin/dev/polymorph/ui'

/** The directory this module owns. A file there it does not return is removed. */
export const KOTLIN_GENERATED = 'platforms/android/ui/src/generated/kotlin/dev/polymorph/ui'

/**
 * The hand-written foundation: the types every member and the harness share,
 * the Material bridge, and where the platform meets the tokens, so the token
 * and literal laws leave it out.
 */
export const KOTLIN_FOUNDATION = 'PolymorphUI.kt'

/**
 * The foundation's further files, `PolymorphUI<Topic>.kt`: drawing parts more
 * than one member shares. They belong to no member, so the conformance law
 * leaves them out; they draw, so every other law holds them.
 */
export const KOTLIN_FOUNDATION_PART = /^PolymorphUI[A-Z][A-Za-z]*\.kt$/

/** The foundation or one of its further files: no member's file. */
export const isKotlinFoundation = (path: string) =>
  path === KOTLIN_FOUNDATION || KOTLIN_FOUNDATION_PART.test(path)

/** The platform the contracts are for. */
export const KOTLIN_PLATFORM = 'android'

/**
 * Material Symbols names whose glyph Compose's icon library holds under
 * `Icons.AutoMirrored`: the arrows and the other glyphs that point along the
 * reading direction, which a right-to-left layout draws mirrored. Every other
 * name is under `Icons.Outlined`. The Kotlin build checks both: a name missing
 * from its set does not compile, and one under the wrong set is deprecated,
 * which fails the build because the member module treats every warning as an
 * error (`platforms/android/ui/build.gradle.kts`).
 */
export const MIRRORED_SYMBOLS = new Set([
  'arrow_back',
  'arrow_forward',
  'comment',
  'compare_arrows',
  'format_list_bulleted',
  'help',
  'navigate_before',
  'navigate_next',
  'open_in_new',
  'receipt_long',
  'redo',
  'send',
  'sort',
  'undo',
  'view_sidebar',
])

/**
 * Material Symbols names whose filled glyph a member draws over the outline,
 * each with the name of that filled glyph: Rating's star outline
 * (`star_border`), filled up to the score with the star. Compose's icon
 * library holds the filled glyph under `Icons.Filled`, and `PMIconView` draws
 * it when a member asks for the role filled.
 */
export const FILLED_SYMBOLS: ReadonlyMap<string, string> = new Map([['star_border', 'star']])

/** Kotlin's hard keywords: a property named one is written in backticks. */
const KOTLIN_KEYWORDS = new Set([
  'as',
  'break',
  'class',
  'continue',
  'do',
  'else',
  'false',
  'for',
  'fun',
  'if',
  'in',
  'interface',
  'is',
  'null',
  'object',
  'package',
  'return',
  'super',
  'this',
  'throw',
  'true',
  'try',
  'typealias',
  'typeof',
  'val',
  'var',
  'when',
  'while',
])

const INDENT = '    '

/** A declaration-safe identifier: a keyword is written in backticks. */
const identifier = (name: string) => (KOTLIN_KEYWORDS.has(name) ? `\`${name}\`` : name)

/** An enum entry or a sealed case: the camel-cased name, PascalCased. */
const entryName = (name: string) => capitalise(name)

/** A Kotlin string literal. `$` is escaped, so a type is never read as a template. */
function kotlinString(text: string): string {
  return `"${text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/\n/g, '\\n')}"`
}

/**
 * A KDoc comment, wrapped at 100 columns: one line when it fits, a block
 * otherwise. Kotlin's block comments nest, so a slash and a star in the text
 * (`image/` and a star) would open another comment; such a star, and one before
 * a slash, is written as the entity `&#42;`.
 */
function doc(source: string, indent: string): string[] {
  const text = source.replace(/\/\*/g, '/&#42;').replace(/\*\//g, '&#42;/')
  const single = `${indent}/** ${text} */`
  if (!text.includes('\n') && single.length <= 100) return [single]
  return [
    `${indent}/**`,
    ...wrap(text, 100 - indent.length - 3).map((line) =>
      line === '' ? `${indent} *` : `${indent} * ${line}`,
    ),
    `${indent} */`,
  ]
}

/** How Kotlin spells each type the resolver produces. */
const KOTLIN: Dialect = {
  language: 'Kotlin',
  platformName: 'Android',
  string: 'String',
  number: 'Double',
  boolean: 'Boolean',
  void: 'Unit',
  list: (element) => `List<${element}>`,
  set: (element) => `Set<${element}>`,
  tuple: (elements) => {
    if (elements.length === 2) return `Pair<${elements.join(', ')}>`
    if (elements.length === 3) return `Triple<${elements.join(', ')}>`
    throw new Unsupported('a tuple of more than three elements, which Kotlin has no type for')
  },
  // A result that is content, optional or not, is a composable slot: where the
  // web returns nothing, the slot draws nothing.
  function: (params, returns: Mapped) =>
    returns.isContent
      ? `@Composable (${params.join(', ')}) -> Unit`
      : `(${params.join(', ')}) -> ${returns.isFunction ? `(${returns.text})` : returns.text}`,
  optional: (mapped) =>
    mapped.isFunction
      ? `(${mapped.text})?`
      : mapped.text.endsWith('?')
        ? `PMSome<${mapped.text}>?`
        : `${mapped.text}?`,
  record: (key, value) => `Map<${key}, ${value}>`,
  unknown: 'PMJSONValue',
  // `Blob` is bytes the member made (ImageEditor's export), in the media type
  // its props named: Kotlin's `ByteArray`.
  equivalents: { Blob: 'ByteArray', File: 'PMFile' },
}

/* -------------------------------------------------------------------------- */
/* Declarations                                                               */
/* -------------------------------------------------------------------------- */

function enumSource(model: EnumModel): string[] {
  const seen = new Set<string>()
  const rawType = model.raw === 'int' ? 'Int' : 'String'
  const lines = [...doc(model.summary, ''), `enum class ${model.name}(val value: ${rawType}) {`]
  for (const entry of model.cases) {
    const name = entryName(entry.name)
    if (seen.has(name)) {
      throw new Error(`native contracts: ${model.name} has two entries named ${name}`)
    }
    seen.add(name)
    const raw = model.raw === 'int' ? String(entry.raw) : kotlinString(String(entry.raw))
    lines.push(`${INDENT}${name}(${raw}),`)
  }
  lines.push('}')
  return lines
}

function fieldLines(field: FieldModel, indent: string, defaults: boolean): string[] {
  return [
    ...(field.doc ? doc(field.doc, indent) : []),
    `${indent}val ${identifier(field.name)}: ${field.type}${defaults && field.optional ? ' = null' : ''},`,
  ]
}

function structSource({ name, summary, fields, parameters }: StructModel): string[] {
  const generics = parameters.length === 0 ? '' : `<${parameters.join(', ')}>`
  if (fields.length === 0) return [...doc(summary, ''), `class ${name}${generics}`]
  return [
    ...doc(summary, ''),
    `data class ${name}${generics}(`,
    ...fields.flatMap((field) => fieldLines(field, INDENT, true)),
    ')',
  ]
}

function appearanceSource(model: AppearanceModel): string[][] {
  const { name, cells } = model
  const variantOf = new Map(model.variant.cases.map((entry) => [entry.name, entryName(entry.name)]))
  const toneOf = new Map(model.tone.cases.map((entry) => [entry.name, entryName(entry.name)]))
  const lines = [
    ...doc(
      `${model.member}'s lawful variant × tone cells, and only those: the grid the web types as ` +
        '`LawfulVariants`. `lawful` lists them in grid order.',
      '',
    ),
    `enum class ${name}(`,
    `${INDENT}val value: String,`,
    `${INDENT}val variant: ${model.variant.name},`,
    `${INDENT}val tone: ${model.tone.name},`,
    ') {',
    ...cells.map(
      (cell) =>
        `${INDENT}${entryName(cell.name)}(${kotlinString(cell.raw)}, ${model.variant.name}.${variantOf.get(cell.variant)}, ` +
        `${model.tone.name}.${toneOf.get(cell.tone)}),`,
    ),
    `${INDENT};`,
    '',
    `${INDENT}companion object {`,
    `${INDENT.repeat(2)}/** Every lawful cell, in grid order. */`,
    `${INDENT.repeat(2)}val lawful: List<${name}> = listOf(`,
    ...cells.map((cell) => `${INDENT.repeat(3)}${entryName(cell.name)},`),
    `${INDENT.repeat(2)})`,
    '',
    `${INDENT.repeat(2)}/** The cell for a variant and a tone, or null when the grid excludes the pair. */`,
    `${INDENT.repeat(2)}fun of(variant: ${model.variant.name}, tone: ${model.tone.name}): ${name}? =`,
    `${INDENT.repeat(3)}entries.firstOrNull { it.variant == variant && it.tone == tone }`,
    `${INDENT}}`,
    '}',
  ]
  return [lines, enumSource(model.variant), enumSource(model.tone)]
}

/** A compound part's name in the member's: `Group` for `PMSettingsRowGroupProps`. */
function partStem(model: MemberModel, part: StructModel): string {
  return part.name.slice(`PM${model.member.name}`.length).replace(/Props$/, '')
}

function renderingSource(model: MemberModel): string[] {
  const { member, props, parts } = model
  const generic = props.parameters
  const summary =
    `Draws ${member.name} from its props. The member's file declares \`PM${member.name}\`, an ` +
    'object that implements it.'
  if (generic.length === 0 && parts.length === 0) {
    return [
      ...doc(summary, ''),
      `fun interface ${model.rendering} {`,
      `${INDENT}@Composable`,
      `${INDENT}fun Render(props: ${props.name})`,
      '}',
    ]
  }
  // A part is drawn by a function of the member's rendering, as Swift nests a
  // part's view in the member's, so a member with a rendering draws its parts.
  const notes = [
    ...(parts.length === 0
      ? []
      : [
          `Each compound part is drawn by a function of its own: ${parts
            .map((part) => `\`Render${partStem(model, part)}\``)
            .join(', ')}.`,
        ]),
    `Not a \`fun interface\`: ${
      generic.length === 0
        ? 'it declares a function per part.'
        : parts.length === 0
          ? 'its function is generic over the row.'
          : 'its function is generic over the row, and it declares a function per part.'
    }`,
  ]
  const parameters = generic.join(', ')
  return [
    ...doc([summary, ...notes].join(' '), ''),
    `interface ${model.rendering} {`,
    `${INDENT}@Composable`,
    generic.length === 0
      ? `${INDENT}fun Render(props: ${props.name})`
      : `${INDENT}fun <${parameters}> Render(props: ${props.name}<${parameters}>)`,
    ...parts.flatMap((part) => {
      // A part generic over a row is drawn by a function generic over it too.
      const own = part.parameters.join(', ')
      return [
        '',
        ...doc(`Draws ${member.name}'s \`${partStem(model, part)}\` part from its props.`, INDENT),
        `${INDENT}@Composable`,
        part.parameters.length === 0
          ? `${INDENT}fun Render${partStem(model, part)}(props: ${part.name})`
          : `${INDENT}fun <${own}> Render${partStem(model, part)}(props: ${part.name}<${own}>)`,
      ]
    }),
    '}',
  ]
}

function memberSource(model: MemberModel): string {
  const lines: string[] = [`// ${model.member.name}`, '']
  const blocks = model.declarations.flatMap((declaration) =>
    declaration.kind === 'appearance' ? appearanceSource(declaration) : [enumSource(declaration)],
  )
  for (const block of blocks) lines.push(...block, '')
  lines.push(...structSource(model.props), '')
  for (const part of model.parts) lines.push(...structSource(part), '')
  lines.push(...renderingSource(model))
  return lines.join('\n')
}

function unionSource(model: UnionModel): string {
  if (model.plain) {
    return [
      ...doc(model.summary, ''),
      `enum class ${model.name} {`,
      ...model.cases.flatMap((entry) => [
        ...(entry.doc ? doc(entry.doc, INDENT) : []),
        `${INDENT}${entryName(entry.name)},`,
      ]),
      '}',
    ].join('\n')
  }
  return [
    ...doc(model.summary, ''),
    `sealed interface ${model.name} {`,
    ...model.cases.flatMap((entry) => [
      ...(entry.doc ? doc(entry.doc, INDENT) : []),
      entry.type === undefined
        ? `${INDENT}data object ${entryName(entry.name)} : ${model.name}`
        : `${INDENT}data class ${entryName(entry.name)}(val value: ${entry.type}) : ${model.name}`,
    ]),
    '}',
  ].join('\n')
}

function namedSource(model: NamedModel): string {
  switch (model.kind) {
    case 'shape':
      return [
        ...model.declarations.flatMap((declaration) => [...enumSource(declaration), '']),
        ...structSource(model.struct),
      ].join('\n')
    case 'union':
      return unionSource(model)
    case 'enum':
      return enumSource(model).join('\n')
  }
}

/**
 * A composable a screen calls: a struct's properties as arguments, the same
 * names, types and defaults, with a `children` slot last so it can trail, and
 * a body that hands them to `draw` as the struct.
 */
function composableSource(
  struct: StructModel,
  name: string,
  draw: string,
  summary: (props: string, trailing: boolean) => string,
): string[] {
  const fields = [...struct.fields]
  const slot = fields.findIndex(
    (field) => field.name === 'children' && /^PMContent\??$/.test(field.type),
  )
  if (slot !== -1) fields.push(...fields.splice(slot, 1))
  const generic = struct.parameters.length === 0 ? '' : `<${struct.parameters.join(', ')}> `
  const propsType =
    struct.parameters.length === 0 ? struct.name : `${struct.name}<${struct.parameters.join(', ')}>`
  const call =
    fields.length === 0
      ? `${struct.name}()`
      : `${struct.name}(${fields.map((field) => `${identifier(field.name)} = ${identifier(field.name)}`).join(', ')})`
  return [
    ...doc(summary(propsType, slot !== -1), ''),
    '@Composable',
    fields.length === 0 ? `fun ${generic}${name}() {` : `fun ${generic}${name}(`,
    ...(fields.length === 0
      ? []
      : [
          ...fields.map(
            (field) =>
              `${INDENT}${identifier(field.name)}: ${field.type}${field.optional ? ' = null' : ''},`,
          ),
          ') {',
        ]),
    `${INDENT}${draw}(${call})`,
    '}',
  ]
}

/**
 * The composables a screen calls for a member and each of its compound parts:
 * `PMSettingsRow(…)` and `PMSettingsRowGroup(…)`, the part's named as the
 * screen emitter joins it (`packages/spec/src/emit-kotlin.ts`).
 */
function memberFunctionSource(model: MemberModel): string[] {
  const { member } = model
  const rendering = `PM${member.name}`
  const trailing = (slot: boolean) => (slot ? ', with `children` last' : '')
  return [
    ...composableSource(
      model.props,
      rendering,
      `${rendering}.Render`,
      (props, slot) =>
        `${member.name}, drawn by \`${rendering}\` from its props given as arguments: the ` +
        `properties of \`${props}\`${trailing(slot)}.`,
    ),
    ...model.parts.flatMap((part) => {
      const stem = partStem(model, part)
      return [
        '',
        ...composableSource(
          part,
          `${rendering}${stem}`,
          `${rendering}.Render${stem}`,
          (props, slot) =>
            `${member.name}'s \`${stem}\` part, drawn by \`${rendering}\` from its props given ` +
            `as arguments: the properties of \`${props}\`${trailing(slot)}.`,
        ),
      ]
    }),
  ]
}

/* -------------------------------------------------------------------------- */
/* The files                                                                  */
/* -------------------------------------------------------------------------- */

/** A generated file's opening comment and its package: who writes it, from what. */
const header = (what: string, imports: readonly string[] = []) =>
  [
    ...wrap(`Generated by \`${KOTLIN_GENERATOR}\` ${what}.`, 97).map((line) => `// ${line}`),
    '// Never edit it by hand: the mapping from TypeScript to Kotlin is described in',
    '// `packages/native/src/kotlin.ts`.',
    '',
    `package ${KOTLIN_PACKAGE}`,
    '',
    ...(imports.length === 0 ? [] : [...imports.map((name) => `import ${name}`), '']),
  ].join('\n')

/** `arrow_back` → `ArrowBack`, the name Compose's icon library gives a Material Symbols glyph. */
const vectorName = (symbol: string) =>
  symbol
    .split('_')
    .map((word) => capitalise(word))
    .join('')

/** The camel-cased case of an icon role: `sort-asc` → `sortAsc`. */
const roleCase = (role: string) =>
  role
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word, index) => (index === 0 ? word.toLowerCase() : capitalise(word)))
    .join('')

/**
 * `PMIconRole`, every role with its Material Symbols name, and `Icons.kt`, the
 * vector Compose's icon library draws each with. A role without a name, or a
 * name for a role the registry does not publish, is refused rather than written.
 */
function iconRoleSources(
  roles: readonly string[],
  symbols: IconSymbols,
): { contract: string[]; icons: string } {
  const unnamed = roles.filter((role) => typeof symbols[role] !== 'string' || symbols[role] === '')
  if (unnamed.length > 0) {
    throw new Error(
      `native contracts: no Material Symbols name for the icon role ${unnamed.join(', ')}: ` +
        'give each role an "android" in design/icons.json',
    )
  }
  const strays = Object.keys(symbols).filter((role) => !roles.includes(role))
  if (strays.length > 0) {
    throw new Error(
      `native contracts: a Material Symbols name for ${strays.join(', ')}, which is no icon role`,
    )
  }
  const cases = roles.map((role) => ({
    name: entryName(roleCase(role)),
    role,
    symbol: symbols[role] as string,
  }))
  const contract = [
    ...doc(
      'Every icon role: a meaning, never a glyph. The registry publishes the closed set from ' +
        '`design/icons.json`; `PMIconView` draws each by its `symbolName`, the role’s `android` ' +
        'there: a Material Symbols name chosen for the meaning the web’s glyph draws.',
      '',
    ),
    'enum class PMIconRole(val value: String, val symbolName: String) {',
    ...cases.map(
      (entry) =>
        `${INDENT}${entry.name}(${kotlinString(entry.role)}, ${kotlinString(entry.symbol)}),`,
    ),
    '}',
  ]
  const where = (symbol: string) =>
    MIRRORED_SYMBOLS.has(symbol) ? 'automirrored.outlined' : 'outlined'
  const filled = cases.filter((entry) => FILLED_SYMBOLS.has(entry.symbol))
  const imports = [
    'androidx.compose.material.icons.Icons',
    ...[
      ...[...new Set(cases.map((entry) => entry.symbol))].map(
        (symbol) => `androidx.compose.material.icons.${where(symbol)}.${vectorName(symbol)}`,
      ),
      ...[...new Set(filled.map((entry) => FILLED_SYMBOLS.get(entry.symbol) ?? ''))].map(
        (symbol) => `androidx.compose.material.icons.filled.${vectorName(symbol)}`,
      ),
    ].sort(byCodePoint),
    'androidx.compose.ui.graphics.vector.ImageVector',
  ]
  const icons = [
    header('from `design/icons.json`: the vector each icon role is drawn with', imports),
    ...doc(
      'The glyph that draws the role: its Material Symbols name in the outlined set of Compose’s ' +
        'Material icons, under `AutoMirrored` where a right-to-left layout mirrors it ' +
        '(`MIRRORED_SYMBOLS` in `packages/native/src/kotlin.ts`).',
      '',
    ),
    'internal val PMIconRole.vector: ImageVector',
    `${INDENT}get() = when (this) {`,
    ...cases.map(
      (entry) =>
        `${INDENT.repeat(2)}PMIconRole.${entry.name} -> Icons.${MIRRORED_SYMBOLS.has(entry.symbol) ? 'AutoMirrored.Outlined' : 'Outlined'}.${vectorName(entry.symbol)}`,
    ),
    `${INDENT}}`,
    '',
    ...doc(
      'The filled glyph of a role a member draws filled, from the filled set of Compose’s ' +
        'Material icons (`FILLED_SYMBOLS` in `packages/native/src/kotlin.ts`), and `null` for ' +
        'every other role.',
      '',
    ),
    'internal val PMIconRole.filledVector: ImageVector?',
    `${INDENT}get() = when (this) {`,
    ...filled.map(
      (entry) =>
        `${INDENT.repeat(2)}PMIconRole.${entry.name} -> Icons.Filled.${vectorName(FILLED_SYMBOLS.get(entry.symbol) ?? '')}`,
    ),
    `${INDENT.repeat(2)}else -> null`,
    `${INDENT}}`,
    '',
  ].join('\n')
  return { contract, icons }
}

/* -------------------------------------------------------------------------- */
/* The spec defaults and the recipe numbers                                   */
/* -------------------------------------------------------------------------- */

/** A Kotlin string template of a default's text: `{count}` is `${count.toInt()}`, `{name}` `$name`. */
function kotlinTemplate(entry: SpecDefault, text = entry.english): string {
  const types = new Map(
    (entry.parameters ?? []).map((parameter) => [parameter.name, parameter.type]),
  )
  const parts = text.split(/(\{\w+\})/)
  return `"${parts
    .map((part) => {
      const parameter = /^\{(\w+)\}$/.exec(part)?.[1]
      if (parameter === undefined) return kotlinString(part).slice(1, -1)
      const type = types.get(parameter)
      if (type === undefined) {
        throw new Error(
          `native contracts: the default ${entry.name} writes {${parameter}}, which it does not declare`,
        )
      }
      return type === 'number' ? `\${${parameter}.toInt()}` : `\${${parameter}}`
    })
    .join('')}"`
}

/**
 * A default's value: its text, or a function of its parameters for a template,
 * which says its form for one when `count` is one. An app's `PMStrings` replaces
 * the whole function, so its own is called for every count.
 */
function kotlinDefault(entry: SpecDefault): string {
  const parameters = entry.parameters ?? []
  if (parameters.length === 0) return kotlinString(entry.english)
  const body =
    entry.one === undefined
      ? kotlinTemplate(entry)
      : `if (count == 1.0) ${kotlinTemplate(entry, entry.one)} else ${kotlinTemplate(entry)}`
  return `{ ${parameters.map((parameter) => parameter.name).join(', ')} -> ${body} }`
}

/** A default's Kotlin type: `String`, or a function of its parameters returning one. */
function kotlinDefaultType(entry: SpecDefault): string {
  const parameters = entry.parameters ?? []
  if (parameters.length === 0) return 'String'
  const types = parameters.map(
    (parameter) => `${parameter.name}: ${parameter.type === 'number' ? 'Double' : 'String'}`,
  )
  return `(${types.join(', ')}) -> String`
}

/** A doc sentence with the spec it cites, in parentheses before its full stop. */
const cited = (sentence: string, spec: string) => `${sentence.replace(/\.$/, '')} (\`${spec}\`).`

/**
 * `Strings.kt`: `PMStrings`, the defaults the specs name (`SPEC_DEFAULTS` in
 * `strings.ts`) that the Compose members speak.
 */
export function kotlinStringsSource(entries: readonly SpecDefaultEntry[] = SPEC_DEFAULTS): string {
  const field = (entry: SpecDefaultEntry): string[] => {
    if (isRecord(entry)) {
      return [
        ...doc(cited(entry.doc, entry.spec), INDENT),
        `${INDENT}val ${entry.name}: PM${entry.type} = PM${entry.type}(`,
        ...entry.fields.map(
          (inner) => `${INDENT.repeat(2)}${inner.name} = ${kotlinDefault(inner)},`,
        ),
        `${INDENT}),`,
      ]
    }
    const line = `${INDENT}val ${entry.name}: ${kotlinDefaultType(entry)} = ${kotlinDefault(entry)},`
    return [
      ...doc(cited(entry.doc, entry.spec), INDENT),
      ...(line.length <= 100
        ? [line]
        : [
            `${INDENT}val ${entry.name}: ${kotlinDefaultType(entry)} =`,
            `${INDENT.repeat(2)}${kotlinDefault(entry)},`,
          ]),
    ]
  }
  return [
    header('from `packages/native/src/strings.ts`: the defaults the specs name', [
      'androidx.compose.runtime.Immutable',
    ]),
    ...doc(
      'Every default a spec names for text a member speaks when the prop that carries it is ' +
        'absent, in English. A member uses one only when its prop is absent. An app translates ' +
        'them by providing its own `PMStrings` through `LocalPMStrings`, built from its string ' +
        'resources, as a localized web host passes its catalogue’s value for the prop. The list ' +
        'is `SPEC_DEFAULTS` in `packages/native/src/strings.ts`, which holds each to its spec.',
      '',
    ),
    '@Immutable',
    'data class PMStrings(',
    ...entries.filter((entry) => spokenOn(entry, 'android')).flatMap(field),
    ')',
    '',
  ].join('\n')
}

/**
 * A recipe number as Kotlin: an integer multiple or part of a token, a
 * breakpoint in dp, a fraction, or a length in dp.
 */
function recipeDeclaration(number: RecipeNumber, value: number): string[] {
  const where = recipeSources(number)
  switch (number.unit) {
    case 'space10':
      return [
        ...doc(`${number.doc} In multiples of \`space.10\`: ${value}, from ${where}.`, INDENT),
        `${INDENT}const val ${number.name}: Int = ${value}`,
      ]
    case 'rem':
      return [
        ...doc(`${number.doc} ${value}rem, from ${where}.`, INDENT),
        `${INDENT}val ${number.name}: Dp get() = PMGeometry.rem * ${value}`,
      ]
    case 'percent':
      return [
        ...doc(`${number.doc} ${value}%, from ${where}.`, INDENT),
        `${INDENT}const val ${number.name}: Float = ${String(value / 100)}f`,
      ]
    case 'multiple':
      return [
        ...doc(
          `${number.doc} In multiples of \`${number.of ?? ''}\`: ${value}, from ${where}.`,
          INDENT,
        ),
        `${INDENT}const val ${number.name}: Int = ${value}`,
      ]
    case 'divisor':
      return [
        ...doc(
          `${number.doc} In parts of \`${number.of ?? ''}\`: ${value}, from ${where}.`,
          INDENT,
        ),
        `${INDENT}const val ${number.name}: Int = ${value}`,
      ]
    case 'fraction':
      return [
        ...doc(`${number.doc} ${value}, from ${where}.`, INDENT),
        `${INDENT}const val ${number.name}: Float = ${String(value)}f`,
      ]
    case 'px':
      return [
        ...doc(`${number.doc} ${value}px, a dp each, from ${where}.`, INDENT),
        `${INDENT}val ${number.name}: Dp get() = ${value}.dp`,
      ]
  }
}

/** `Recipes.kt`: `PMRecipe`, the numbers the recipes write that the members read (`recipes.ts`). */
export function kotlinRecipesSource(recipes: Readonly<Record<string, string>>): string {
  const numbers = readRecipeNumbers(recipes)
  return [
    header(`from the recipes in \`${RECIPES}\`: the numbers the members read`, [
      'androidx.compose.ui.unit.Dp',
      'androidx.compose.ui.unit.dp',
    ]),
    ...doc(
      'The numbers the recipes write that the members read: a measure as a multiple or a part ' +
        'of a token, which a member multiplies or divides the density’s step by; a breakpoint, ' +
        'which is geometry and not theme, in dp; a height as a fraction of the window; an ' +
        'opacity or a share as a fraction; and a length the content decides, in dp. Each is ' +
        'read from its recipe, or from the web member’s source it names, by `RECIPE_NUMBERS` ' +
        'in `packages/native/src/recipes.ts`.',
      '',
    ),
    'object PMRecipe {',
    ...numbers.flatMap(({ number, value }, index) => [
      ...(index === 0 ? [] : ['']),
      ...recipeDeclaration(number, value),
    ]),
    '}',
    '',
  ].join('\n')
}

/** A brand mark's fill as Kotlin: the provider's hex code as an opaque `Color`, or `null` for the text colour. */
function brandFill(name: string, fill: string): string {
  if (fill === 'currentColor') return 'null'
  const hex = /^#([0-9a-f]{6})$/i.exec(fill)?.[1]
  if (hex === undefined) {
    throw new Error(
      `native contracts: the brand mark ${name} has the fill "${fill}"; ` +
        'a mark is filled with a six-digit hex code or `currentColor`',
    )
  }
  return `Color(0xFF${hex.toUpperCase()})`
}

/**
 * `Brands.kt`: each provider's mark, the engine's `BRAND_DRAWINGS`
 * (`packages/engine/src/icon/brands.ts`) path for path, its fill the hex code
 * the provider publishes, or `null` for `currentColor`, the text colour. A
 * provider is an entry of ProviderButton's `provider`, and the `when` names
 * every entry, so the compiler holds the marks and the enum to the same set.
 */
export function kotlinBrandsSource(
  drawings: Readonly<Record<string, BrandDrawing>> = BRAND_DRAWINGS,
): string {
  const cases = Object.entries(drawings).flatMap(([name, drawing]) => {
    const { width, height } = viewBoxSize(name, drawing)
    return [
      `${INDENT.repeat(2)}PMProviderButtonProvider.${entryName(name)} -> PMBrandDrawing(`,
      `${INDENT.repeat(3)}width = ${width}f,`,
      `${INDENT.repeat(3)}height = ${height}f,`,
      `${INDENT.repeat(3)}paths = listOf(`,
      ...drawing.paths.map(
        (path) =>
          `${INDENT.repeat(4)}PMBrandPath(${kotlinString(path.d)}, ${brandFill(name, path.fill)}),`,
      ),
      `${INDENT.repeat(3)}),`,
      `${INDENT.repeat(2)})`,
    ]
  })
  return [
    header('from `packages/engine/src/icon/brands.ts`: the providers’ marks', [
      'androidx.compose.ui.graphics.Color',
    ]),
    ...doc(
      'The mark of a provider: the engine’s `BRAND_DRAWINGS`, path for path, each path’s fill ' +
        'the provider’s published colour, or `null` for the text colour.',
      '',
    ),
    'internal val PMProviderButtonProvider.brandDrawing: PMBrandDrawing',
    `${INDENT}get() = when (this) {`,
    ...cases,
    `${INDENT}}`,
    '',
  ].join('\n')
}

/**
 * `Phones.kt`: PhoneInput's calling codes, the engine's table read through its own lookups
 * (`phones.ts`): each code and the regions that dial it, its main region first, and the regions
 * that dial a trunk zero. The hand-written `PMPhones` reads them.
 */
export function kotlinPhonesSource(
  codes: readonly PhoneCode[] = phoneCodes(),
  trunkZero: readonly string[] = phoneTrunkZero(),
): string {
  return [
    header('from `packages/engine/src/conventions/phone.ts`: the calling codes'),
    ...doc(
      'Each calling code and the regions that dial it, by ISO 3166-1 alpha-2 code, its main ' +
        'region first, in the engine’s order.',
      '',
    ),
    'internal val PMPhoneCodes: List<Pair<String, List<String>>> = listOf(',
    ...codes.flatMap(({ code, regions }) => [
      `${INDENT}${kotlinString(code)} to listOf(`,
      ...wrapList(regions.map(kotlinString), INDENT.repeat(2)),
      `${INDENT}),`,
    ]),
    ')',
    '',
    ...doc('The regions that dial a trunk zero before a national number.', ''),
    'internal val PMPhoneTrunkZero: Set<String> = setOf(',
    ...wrapList(trunkZero.map(kotlinString), INDENT),
    ')',
    '',
  ].join('\n')
}

export interface KotlinUnsupportedProp {
  member: string
  prop: string
  typescript: string
  reason: string
  /** The opaque class the property is declared as. */
  kotlin: string
}

export interface KotlinOpaqueType {
  kotlin: string
  typescript: string
  usedBy: string[]
}

export interface KotlinContractSet {
  /** File name in the generated directory → its contents. */
  files: Record<string, string>
  members: NativeMember[]
  unsupported: KotlinUnsupportedProp[]
  opaque: KotlinOpaqueType[]
  /** Each member's contract source, by member name, as it appears in `Contracts.kt`. */
  contracts: Record<string, string>
}

/** What the hand-written Kotlin sources declare that the generated files list. */
export interface KotlinSources {
  /** The `<Member>States` objects, for `Fixtures.kt`. */
  fixtures: readonly string[]
  /** The members with a rendering object, for `Members.kt`. */
  renderings: readonly string[]
}

/**
 * Every generated Kotlin file, from the registry, what the member files declare
 * (`kotlinFixturesIn`, `renderingsIn`), each icon role's Material Symbols name
 * (`readMaterialSymbols`), and the `PM…` types the hand-written sources and the
 * token module declare (`kotlinDeclaredTypesIn`), which no generated type may
 * take.
 */
export function generateKotlinContracts(
  registry: Registry,
  sources: KotlinSources,
  symbols: IconSymbols,
  reserved: readonly string[] = [],
  /** The recipes `RECIPE_NUMBERS` reads (`readRecipes`); without them `Recipes.kt` is not written. */
  recipes?: Readonly<Record<string, string>>,
): KotlinContractSet {
  const contracts: Record<string, string> = {}
  const resolution = resolveContracts(registry, KOTLIN_PLATFORM, KOTLIN, reserved, (model) => {
    contracts[model.member.name] = memberSource(model)
  })
  const members = resolution.members.map((model) => model.member)
  const { contract: iconRole, icons } = iconRoleSources(
    registry.icons.roles.map((role) => role.name),
    symbols,
  )

  const opaqueSource = resolution.opaque.flatMap(({ type, typescript, usedBy }: OpaqueModel) => [
    ...doc(
      `The web's \`${typescript}\`, opaque here: the registry prints it by name, not by shape. ` +
        `Used by ${usedBy.join(', ')}.`,
      '',
    ),
    `class ${type}`,
    '',
  ])

  const contractsFile = [
    header('from the registry: every native or adapted member’s props and rendering', [
      'androidx.compose.runtime.Composable',
    ]),
    '// Icon roles',
    '',
    ...iconRole,
    '',
    ...members.map((member) => `${contracts[member.name]}\n`),
    '// Shapes',
    '',
    ...resolution.named.map((model) => `${namedSource(model)}\n`),
    '// Opaque types',
    '',
    ...opaqueSource,
  ]
    .join('\n')
    .replace(/\n+$/, '\n')

  const allMembers = platformMembers(registry, KOTLIN_PLATFORM)
  const status = (value: string) => `PMPlatformStatus.${capitalise(value)}`
  const catalogueFile = [
    header('from the registry: every member’s status on Android'),
    '/** Every member of the vocabulary and how it renders on Android, by name. */',
    'val PMCatalogue.members: List<PMCatalogueEntry>',
    `${INDENT}get() = catalogueMembers`,
    '',
    'private val catalogueMembers: List<PMCatalogueEntry> = listOf(',
    ...allMembers.map((member) => {
      const args = [
        `name = ${kotlinString(member.name)}`,
        `status = ${status(member.entry.status)}`,
      ]
      if (member.entry.as !== undefined) args.push(`rendersAs = ${kotlinString(member.entry.as)}`)
      if (member.entry.substitute !== undefined)
        args.push(`substitute = ${kotlinString(member.entry.substitute)}`)
      return `${INDENT}PMCatalogueEntry(${args.join(', ')}),`
    }),
    ')',
    '',
  ].join('\n')

  const unsupported = resolution.unsupported.map(({ type, ...entry }: UnsupportedModel) => ({
    ...entry,
    kotlin: type,
  }))
  const unsupportedFile = [
    header('from the registry: every prop whose type the contract mapping cannot express'),
    '// Each is a property of its own opaque class, so the gap shows in the contract',
    '// rather than being dropped. `kotlin.test.ts` counts them.',
    '',
    ...unsupported.flatMap((entry) => [
      ...doc(`\`${entry.member}.${entry.prop}\`: \`${entry.typescript}\` — ${entry.reason}.`, ''),
      `class ${entry.kotlin}`,
      '',
    ]),
    '/** Every prop the contracts cannot express yet, in member order. */',
    'val PMUnsupported.props: List<PMUnsupportedProp>',
    `${INDENT}get() = unsupportedProps`,
    '',
    'private val unsupportedProps: List<PMUnsupportedProp> = listOf(',
    ...unsupported.map(
      (entry) =>
        `${INDENT}PMUnsupportedProp(member = ${kotlinString(entry.member)}, prop = ${kotlinString(entry.prop)}, ` +
        `typescript = ${kotlinString(entry.typescript)}, reason = ${kotlinString(entry.reason)}),`,
    ),
    ')',
    '',
  ].join('\n')

  const fixtures = [...sources.fixtures].sort(byCodePoint)
  const fixturesFile = [
    header('from the member files present: every states fixture they declare'),
    `/** Every member’s states fixture in \`src/main/kotlin\`, by member name. */`,
    'val PMFixtures.all: List<PMStates>',
    ...(fixtures.length === 0
      ? [`${INDENT}get() = emptyList()`]
      : [
          `${INDENT}get() = listOf(`,
          ...fixtures.map((name) => `${INDENT.repeat(2)}${name},`),
          `${INDENT})`,
        ]),
    '',
  ].join('\n')

  const drawn = new Set(sources.renderings)
  const drawnModels = resolution.members.filter((model) => drawn.has(model.member.name))
  const membersFile = [
    header('from the member files present: a composable for every member with a rendering', [
      'androidx.compose.runtime.Composable',
    ]),
    '/** Every member with a rendering in `src/main/kotlin`, by name, in the catalogue’s order. */',
    'val PMRenderings.names: List<String>',
    ...(drawnModels.length === 0
      ? [`${INDENT}get() = emptyList()`]
      : [
          `${INDENT}get() = listOf(`,
          ...drawnModels.map((model) => `${INDENT.repeat(2)}${kotlinString(model.member.name)},`),
          `${INDENT})`,
        ]),
    '',
    ...drawnModels.flatMap((model) => [...memberFunctionSource(model), '']),
  ]
    .join('\n')
    .replace(/\n+$/, '\n')

  return {
    files: {
      'Brands.kt': kotlinBrandsSource(),
      'Catalogue.kt': catalogueFile,
      'Contracts.kt': contractsFile,
      'Fixtures.kt': fixturesFile,
      'Phones.kt': kotlinPhonesSource(),
      'Icons.kt': icons,
      'Members.kt': membersFile,
      ...(recipes === undefined ? {} : { 'Recipes.kt': kotlinRecipesSource(recipes) }),
      'Strings.kt': kotlinStringsSource(),
      'Unsupported.kt': unsupportedFile,
    },
    members,
    unsupported,
    opaque: resolution.opaque.map(({ type, typescript, usedBy }) => ({
      kotlin: type,
      typescript,
      usedBy,
    })),
    contracts,
  }
}

/** The states fixtures a set of Kotlin sources declares: every `object <Member>States : PMStates`. */
export function kotlinFixturesIn(sources: Record<string, string>): string[] {
  const names = new Set<string>()
  for (const source of Object.values(sources)) {
    const { code } = lex(source)
    for (const match of code.matchAll(/\bobject\s+(\w+States)\s*:\s*[^{]*\bPMStates\b/g)) {
      names.add(match[1] as string)
    }
  }
  return [...names].sort(byCodePoint)
}

/** The members a set of Kotlin sources draws: every `object PM<Member> : PM<Member>Rendering`. */
export function renderingsIn(sources: Record<string, string>): string[] {
  const names = new Set<string>()
  for (const source of Object.values(sources)) {
    const { code } = lex(source)
    for (const match of code.matchAll(/\bobject\s+PM(\w+)\s*:\s*[^{]*\bPM(\w+)Rendering\b/g)) {
      if (match[1] === match[2]) names.add(match[1] as string)
    }
  }
  return [...names].sort(byCodePoint)
}

/**
 * The `PM…` names a set of Kotlin sources declares at the top level or inside
 * a type: every class, interface, object and type alias named `PM…`, comments
 * and strings left out. A generated type of one of these names would not
 * compile, so the generator refuses it.
 */
export function kotlinDeclaredTypesIn(sources: Record<string, string>): string[] {
  const names = new Set<string>()
  for (const source of Object.values(sources)) {
    const { code } = lex(source)
    for (const match of code.matchAll(/\b(?:class|interface|object|typealias)\s+(PM\w+)/g)) {
      names.add(match[1] as string)
    }
  }
  return [...names].sort(byCodePoint)
}
