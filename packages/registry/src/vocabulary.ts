import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'

import { compoundParts, PROP_TYPE_OVERRIDES, SPEC_FILE_OVERRIDES } from '@polymorph/rules/spec-api'
import ts from 'typescript'

import { readAgentContract, type AgentContract } from './agent'
import { readBehaviour, type Contract } from './behaviour'
import {
  frameworkFaults,
  frameworkFile,
  frameworksByMember,
  MAPPED_FRAMEWORKS,
  type FrameworkDocument,
  type MappedFramework,
  type MemberFrameworks,
} from './frameworks'
import { fileClosure, recipeFile } from './install'
import {
  PLATFORMS,
  platformFaults,
  platformFile,
  platformsByMember,
  type MemberPlatforms,
  type Platform,
  type PlatformDocument,
} from './platforms'

/**
 * The vocabulary, read from the source that ships it.
 *
 * Everything here is *derived*: prop surfaces from the exported types, lawful
 * cells from the typed grids, states from the states fixtures, dependency
 * closures from the import graph. Nothing is copied by hand. So the registry
 * can be generated at publish time and never committed, because there is no
 * second copy to drift and no freshness law to write.
 *
 * The component list comes from `GALLERIES`, read statically, for the same
 * reason the spec-staleness law reads it that way. A component added to the
 * vocabulary is added to the registry in the same commit, which a hand-kept
 * list cannot guarantee. The two laws share one spec-file mapping instead of
 * keeping one each.
 */

export interface RegistryProp {
  name: string
  type: string
  optional: boolean
  doc?: string
}

/** A compound part, as its member's export carries it: `Table.Row`, `AppShell.NavItem`. */
export interface RegistryPart {
  /** The property of the member's export that holds it (`Row`). */
  name: string
  /** The props its function takes. */
  props: RegistryProp[]
}

/**
 * Another callable export a call site uses with the member: Toast's
 * `ToastHost`, `ToastNotice`, `ToastViewportTarget` and `toast`.
 */
export interface RegistryExport {
  name: string
  /** `component` for a capitalised name, which React renders; `function` for one a call site calls. */
  kind: 'component' | 'function'
  /** A component's props, or the options a function takes as its first parameter. */
  props: RegistryProp[]
  /** The functions it carries, by name: `toast.success` is `success`. */
  members: string[]
}

/**
 * One `data-*` attribute of a component's published contract, with the values
 * its styling pins.
 *
 * `values` is absent, not empty, when the selectors match on presence alone.
 * `[data-icon-only]` is a boolean attribute, and an empty list would read as an
 * enumeration with no members.
 */
export interface RegistryAttribute {
  name: string
  values?: string[]
}

export interface RegistryComponent {
  name: string
  tier: string
  /**
   * Which side of the packaging boundary the component sits on. `installed`
   * ships in the React foundation (`@polymorph/react`) and is upgraded by
   * semver. `vendored` is copied into the consumer's repository and owned by
   * them. The installer reads this to know what to copy and what to depend on.
   */
  origin: 'installed' | 'vendored'
  /**
   * How the member renders on each platform: `native`, `adapted` (with how) or
   * `absent` (with why, and what to use instead). Read from
   * `design/platforms/*.json` and checked by `platformFaults`.
   */
  platforms: MemberPlatforms
  /**
   * Whether each web framework's vocabulary ships the member: `native`, or
   * `absent` with why. React is always native. Read from
   * `design/frameworks/*.json` and checked by `frameworkFaults`.
   */
  frameworks: MemberFrameworks
  purpose: string
  spec: string | null
  anatomy: string | null
  files: { source: string; styles: string | null; states: string | null }
  props: RegistryProp[]
  /**
   * Every compound part the member's export carries, with its props, read from
   * the export's type: a property that is itself a function is a part. `props`
   * also lists a part's props under the part's name (`Row.selected`) where the
   * member's spec table names the part, because the spec-staleness law and the
   * generated vocabularies read them there.
   */
  parts: RegistryPart[]
  /**
   * The member's other callable exports: those of `@polymorph/react-ui`
   * declared in a file beside the member's own that is named for the member and
   * declares no other member (`ToastNotice.tsx` and `toast-store.ts` for Toast).
   * Empty for a member that is one component.
   */
  exports: RegistryExport[]
  grid: Record<string, string[]> | null
  states: string[]
  requiredSelectors: string[]
  /**
   * Every `--pm-*` custom property the component's own stylesheet reads. This
   * is the component half of the token × component matrix, and answers "what
   * changes if this token changes". It covers the component's own file only,
   * deliberately: tokens reached through composed convention classes (focus,
   * motion) belong to the convention.
   */
  tokens: string[]
  dataAttributes: RegistryAttribute[]
  /**
   * The behaviour contract: the statements of the spec's ```contract fences
   * (`behaviour.ts`), which the conformance law runs against the shell. Empty
   * for a member with no keyboard, focus or dismissal behaviour.
   */
  behaviour: Contract[]
  /**
   * The agent contract: the statements of the spec's ```agent fence
   * (`agent.ts`), which say what an agent on the page may read from the member
   * and do with it. `null` for a member whose spec has no fence, which agents
   * cannot see.
   */
  agent: AgentContract | null
  dependencies: {
    components: string[]
    packages: string[]
    /**
     * Every repo-relative file that must be copied with this component,
     * including its own three. This is the closure an install copies. It is
     * strictly larger than `components`: Button depends on no other component
     * but still cannot be copied alone, because its stylesheet composes two
     * convention files that belong to no component. Empty for an `installed`
     * component, which is installed, not vendored.
     */
    files: string[]
  }
}

const UI = 'packages/react-ui'
/** The React foundation. A member declared here is installed, not vendored. */
const FOUNDATION = 'packages/react'
const SPEC_DIRS = ['design/components', 'design/archetypes']

/**
 * Always present, never installed. React is a peer dependency of the vocabulary
 * and of anything that could consume it, so listing it in every closure would
 * repeat the same fact fifty-six times.
 */
const AMBIENT = new Set(['react', 'react-dom'])

/**
 * Gallery entries whose component is not an export of that name.
 *
 * `Toast` is the only one, and the difference is real, not a naming slip.
 * There is no `<Toast>` to render. The API is `toast(options)` plus a
 * `<ToastHost>` mounted once, which mounts the viewport `Toaster.tsx` declares.
 * So the member's file is the Toaster's, and its props are `ToastOptions`.
 * That is why the spec-staleness law has the second half of this same override.
 */
const DECLARATION_OVERRIDES: Record<string, string> = { Toast: 'Toaster' }

/**
 * The parts whose props `props` also lists, prefixed with the part's name
 * (`Row.selected`). `parts` lists every part with its props; this is the
 * narrower set the native contracts are generated from (`packages/native`
 * reads `props`), so it names the parts SwiftUI and Compose render as parts.
 * Adding a part here adds it to both platforms' contracts. The registry test
 * holds every entry to a part the member's export carries.
 */
export const FLATTENED_PARTS: Readonly<Record<string, readonly string[]>> = {
  Table: ['Header', 'Row', 'Cell'],
  SettingsRow: ['Group'],
  Tabs: ['Content'],
  List: ['Item'],
  CommentThread: ['Comment'],
}

/* -------------------------------------------------------------------------- */
/* The program                                                                */
/* -------------------------------------------------------------------------- */

export interface UiProgram {
  program: ts.Program
  checker: ts.TypeChecker
  root: string
  /** Exported symbols of `@polymorph/react-ui`, by name. */
  exports: Map<string, ts.Symbol>
  /** What `GALLERIES` registers, in gallery order, with the fixture that declared it. */
  components: { name: string; fixture: string }[]
}

export function openUiProgram(root: string): UiProgram {
  const uiDir = resolve(root, UI)
  const indexFile = resolve(uiDir, 'src/index.ts')
  const galleriesFile = resolve(uiDir, 'src/galleries.ts')

  const { config } = ts.readConfigFile(resolve(uiDir, 'tsconfig.json'), ts.sys.readFile)
  const options = {
    ...ts.parseJsonConfigFileContent(config, ts.sys, uiDir).options,
    noEmit: true,
  }

  const program = ts.createProgram({ rootNames: [indexFile, galleriesFile], options })
  const checker = program.getTypeChecker()

  const index = program.getSourceFile(indexFile)
  const indexSymbol = index && checker.getSymbolAtLocation(index)
  const exports = new Map<string, ts.Symbol>(
    indexSymbol
      ? checker.getExportsOfModule(indexSymbol).map((symbol) => [symbol.name, symbol])
      : [],
  )

  return {
    program,
    checker,
    root,
    exports,
    components: galleryComponents(program, checker, galleriesFile),
  }
}

function unwrap(node: ts.Expression | undefined): ts.Expression | undefined {
  let current = node
  while (
    current &&
    (ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isParenthesizedExpression(current))
  ) {
    current = current.expression
  }
  return current
}

function resolveAlias(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
}

/**
 * The component a states fixture declares, and the file that declares it.
 *
 * The file matters as much as the name, because a fixture is not always where
 * convention puts it (`<slug>.states.tsx` beside the component). `Icon` ships
 * from the React foundation, but the gallery that shows it stays with the
 * vocabulary, because the fixture composes `Inline`. Reading the registry's own
 * import graph is more reliable: the fixture is wherever the code that
 * registers it says.
 */
function fixtureComponent(
  checker: ts.TypeChecker,
  element: ts.Expression,
): { name: string; fixture: string } | null {
  const symbol = checker.getSymbolAtLocation(element)
  if (!symbol) return null
  const declaration = resolveAlias(checker, symbol).valueDeclaration
  if (!declaration || !ts.isVariableDeclaration(declaration)) return null
  const object = unwrap(declaration.initializer)
  if (!object || !ts.isObjectLiteralExpression(object)) return null
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    if (property.name.getText() !== 'component') continue
    if (ts.isStringLiteral(property.initializer)) {
      return { name: property.initializer.text, fixture: declaration.getSourceFile().fileName }
    }
  }
  return null
}

function galleryComponents(
  program: ts.Program,
  checker: ts.TypeChecker,
  file: string,
): { name: string; fixture: string }[] {
  const source = program.getSourceFile(file)
  if (!source) return []
  const found: { name: string; fixture: string }[] = []
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText() !== 'GALLERIES') continue
      const array = unwrap(declaration.initializer)
      if (!array || !ts.isArrayLiteralExpression(array)) continue
      for (const element of array.elements) {
        const entry = fixtureComponent(checker, element)
        if (entry) found.push(entry)
      }
    }
  }
  return found
}

/* -------------------------------------------------------------------------- */
/* Per component                                                              */
/* -------------------------------------------------------------------------- */

/** The file with the component's own declaration, which an install would vendor. */
function declarationFile(checker: ts.TypeChecker, symbol: ts.Symbol): ts.SourceFile | null {
  const resolved = resolveAlias(checker, symbol)
  const declaration = resolved.valueDeclaration ?? resolved.declarations?.[0]
  return declaration ? declaration.getSourceFile() : null
}

/**
 * One sentence of purpose, from the file's own opening comment.
 *
 * It is read from the *module* docstring, not from a JSDoc on the exported
 * function, because that is where this repo puts it. Every component file opens
 * with a block after its imports that says what the component is and explains
 * its decisions. The function below it is usually undocumented, so
 * `getDocumentationComment` returns nothing for it, and reading that would leave
 * nearly every component with no purpose.
 *
 * The spec citation is stripped. Every one of those blocks opens with
 * "… (`design/components/x.md`)", and the registry has a separate field for that
 * path. Repeating it would spend the system card's budget on punctuation.
 */
export function purposeOf(source: ts.SourceFile): string {
  const imports = source.statements.filter(ts.isImportDeclaration)
  const after = imports.length === 0 ? 0 : (imports[imports.length - 1] as ts.Node).getEnd()

  const text = source.getFullText()
  const open = text.indexOf('/**', after)
  const close = open === -1 ? -1 : text.indexOf('*/', open)
  if (open === -1 || close === -1) return ''

  const body = text
    .slice(open + 3, close)
    .split('\n')
    .map((line) => line.replace(/^\s*\*ic?/, '').replace(/^\s*\*/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  const [first = ''] = body.split(/\.(?:\s|$)/)
  return (
    first
      // The citation is stripped wherever it sits, not only at the end. Half the
      // files write "Horizontal counterpart of Stack (`…/inline.md`) — rows", and
      // a rule that only checked the end would publish the path in the middle of
      // those sentences.
      .replace(/\s*\([^)]*`design\/[^`]+`[^)]*\)/g, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\.$/, '')
      .trim()
  )
}

/**
 * The exception primitives: the components that implement the ladder's rungs.
 *
 * `DensityScope`, `ToneScope` and `Bespoke` are the components a spec uses at
 * rungs 2 and 4. They are not gallery members, so `readVocabulary` never sees
 * them. A spec validator has to *check* a declared exception. If it could not
 * look up `DensityScope`'s props, it would need its own copy of them, which is
 * the second source of truth the registry exists to prevent.
 *
 * Their props come from the *function signature*, not from a `<Name>Props`
 * type, because the scopes share one generic `ScopeProps<Value>` that is
 * deliberately not exported. The checker resolves it either way, and reading
 * the signature works for both shapes.
 */
export interface ExceptionPrimitive {
  name: string
  /** Which rung of the exception ladder this component *is*. */
  rung: number
  /** As for a member. A screen spec for a platform can open a rung only where it renders. */
  platforms: MemberPlatforms
  /** As for a member. A primitive the framework file does not name is absent there. */
  frameworks: MemberFrameworks
  purpose: string
  props: RegistryProp[]
  /**
   * Where it lives and which files must be copied with it. A vendored member
   * publishes these two facts for the installer, and a primitive publishes
   * them for the same reader. A consumer who vendors the vocabulary has no
   * package root to import a rung from. A primitive the catalogue described but
   * could not place would be a rung that the shipped rules point at and that
   * `polymorph add` cannot install. No `states`: a primitive is not a gallery
   * member and has no states fixture.
   */
  files: { source: string; styles: string | null }
  dependencies: { packages: string[]; files: string[] }
}

const PRIMITIVE_RUNGS: Record<string, number> = {
  DensityScope: 2,
  ToneScope: 2,
  Bespoke: 4,
  ThirdParty: 4,
}

/**
 * Every name the platform map must cover: the gallery members, in gallery
 * order, then the ladder's primitives. A spec composes both, so a platform has
 * to say how it renders each.
 */
export function vocabularyNames(ui: UiProgram): string[] {
  return [
    ...ui.components.map(({ name }) => name),
    ...Object.keys(PRIMITIVE_RUNGS).sort((a, b) => a.localeCompare(b)),
  ]
}

/** Each platform's file, parsed, or `undefined` where the file does not exist. */
export function readPlatformDocuments(root: string): Partial<Record<Platform, unknown>> {
  const documents: Partial<Record<Platform, unknown>> = {}
  for (const platform of PLATFORMS) {
    const path = resolve(root, platformFile(platform))
    if (existsSync(path)) documents[platform] = JSON.parse(readFileSync(path, 'utf8')) as unknown
  }
  return documents
}

/**
 * The platform map, read from `design/platforms/` and checked before it is
 * used.
 *
 * It fails loudly, as `readVocabulary` does for a member it cannot resolve. A
 * member with no entry has no honest default: calling it native would publish
 * a claim nobody made, and leaving it out would make the field optional for
 * every reader. The faults are the law's own sentences (`platformFaults`), so
 * the build and `platforms.test.ts` say the same thing about the same file.
 */
export function readPlatformMap(
  root: string,
  members: readonly string[],
): Map<string, MemberPlatforms> {
  const documents = readPlatformDocuments(root)
  const faults = platformFaults(members, documents)
  if (faults.length > 0) {
    throw new Error(`registry: the platform map is not lawful:\n  ${faults.join('\n  ')}`)
  }
  return platformsByMember(members, documents as Record<Platform, PlatformDocument>)
}

/** Each mapped framework's file, parsed, or `undefined` where the file does not exist. */
export function readFrameworkDocuments(root: string): Partial<Record<MappedFramework, unknown>> {
  const documents: Partial<Record<MappedFramework, unknown>> = {}
  for (const framework of MAPPED_FRAMEWORKS) {
    const path = resolve(root, frameworkFile(framework))
    if (existsSync(path)) documents[framework] = JSON.parse(readFileSync(path, 'utf8')) as unknown
  }
  return documents
}

/**
 * The framework map, read from `design/frameworks/` and checked before it is
 * used, as the platform map is. `members` are the gallery members, each of
 * which has an entry; the ladder's primitives may have one.
 */
export function readFrameworkMap(ui: UiProgram): Map<string, MemberFrameworks> {
  const members = ui.components.map(({ name }) => name)
  const primitives = Object.keys(PRIMITIVE_RUNGS)
  const documents = readFrameworkDocuments(ui.root)
  const faults = frameworkFaults(members, documents, primitives)
  if (faults.length > 0) {
    throw new Error(`registry: the framework map is not lawful:\n  ${faults.join('\n  ')}`)
  }
  return frameworksByMember(
    [...members, ...primitives],
    documents as Record<MappedFramework, FrameworkDocument>,
  )
}

/** One name's framework entries. A name the map does not cover is a bug in the caller. */
function frameworksOf(frameworks: Map<string, MemberFrameworks>, name: string): MemberFrameworks {
  const entries = frameworks.get(name)
  if (!entries) throw new Error(`registry: ${name} is not in the framework map it was read with`)
  return entries
}

/** One member's entries. A name the map does not cover is a bug in the caller. */
function platformsOf(platforms: Map<string, MemberPlatforms>, name: string): MemberPlatforms {
  const entries = platforms.get(name)
  if (!entries) throw new Error(`registry: ${name} is not in the platform map it was read with`)
  return entries
}

export function readExceptionPrimitives(
  ui: UiProgram,
  platforms: Map<string, MemberPlatforms>,
  frameworks: Map<string, MemberFrameworks> = readFrameworkMap(ui),
): ExceptionPrimitive[] {
  const { checker, exports, root } = ui

  return Object.entries(PRIMITIVE_RUNGS)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, rung]) => {
      const symbol = exports.get(name)
      const file = symbol ? declarationFile(checker, symbol) : null
      if (!symbol || !file) {
        throw new Error(
          `registry: ${name} is a rung-${rung} primitive but the vocabulary does not export it`,
        )
      }

      // The primitive must be vendored, and this is checked here instead of
      // left to the walk. `fileClosure` rejects a file outside the vendorable
      // tree with a message about an escaped import. That message is right for
      // a member and misleading for a seed. A primitive that moved into the
      // React foundation would be reachable through the boundary the way `Icon`
      // is, but it would first need an `origin` published here. This check
      // raises that decision here instead of three commands later.
      const sourcePath = relative(root, file.fileName)
      if (!sourcePath.startsWith(`${UI}/src/`)) {
        throw new Error(
          `registry: ${name} is declared at ${sourcePath}, outside the vendorable tree — the ` +
            'ladder’s primitives are vendored source, or an install cannot land the rung its ' +
            'own rules point at',
        )
      }

      const stylesPath = stylesheetOf(root, file)
      // Seeded like a member's closure, with source and stylesheet together, so
      // both graphs the walk follows start from the same place.
      const files = fileClosure(root, [sourcePath, ...(stylesPath ? [stylesPath] : [])])

      return {
        name,
        rung,
        platforms: platformsOf(platforms, name),
        frameworks: frameworksOf(frameworks, name),
        purpose: purposeOf(file),
        props: propsOfComponent(checker, symbol),
        files: { source: sourcePath, styles: stylesPath },
        dependencies: { packages: packagesIn(root, files), files },
      }
    })
}

/**
 * The repo-relative file that declares a member, which the registry publishes
 * as its `files.source`, or `null` when the vocabulary exports no declaration
 * of it.
 */
export function memberSource(ui: UiProgram, name: string): string | null {
  const symbol = ui.exports.get(DECLARATION_OVERRIDES[name] ?? name)
  const file = symbol ? declarationFile(ui.checker, symbol) : null
  return file ? relative(ui.root, file.fileName) : null
}

/** The props a component function accepts, read off its first parameter. */
function propsOfComponent(checker: ts.TypeChecker, symbol: ts.Symbol): RegistryProp[] {
  const resolved = resolveAlias(checker, symbol)
  const declaration = resolved.valueDeclaration
  if (!declaration) return []

  const [signature] = checker.getSignaturesOfType(
    checker.getTypeOfSymbolAtLocation(resolved, declaration),
    ts.SignatureKind.Call,
  )
  const parameter = signature?.parameters[0]
  if (!parameter) return []

  return propsOfType(checker, checker.getTypeOfSymbolAtLocation(parameter, declaration))
}

/** Every public prop of an exported type, with what it is and what it means. */
function propsOf(checker: ts.TypeChecker, symbol: ts.Symbol | undefined): RegistryProp[] {
  if (!symbol) return []
  return propsOfType(checker, checker.getDeclaredTypeOfSymbol(resolveAlias(checker, symbol)))
}

/** The type of a value, or `null` for a symbol that declares no value. */
function valueType(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Type | null {
  const resolved = resolveAlias(checker, symbol)
  const declaration = resolved.valueDeclaration
  return declaration ? checker.getTypeOfSymbolAtLocation(resolved, declaration) : null
}

/** The properties of a value that are themselves functions, in the order they are declared. */
function callableProperties(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol[] {
  const type = valueType(checker, symbol)
  if (type === null) return []
  return checker.getPropertiesOfType(type).filter((property) => {
    const own = valueType(checker, property)
    return own !== null && checker.getSignaturesOfType(own, ts.SignatureKind.Call).length > 0
  })
}

/**
 * A member's compound parts, read from its export by the function the
 * spec-staleness law reads them with (`compoundParts`): a callable property
 * named in PascalCase. `Object.assign(Root, { Row })` and
 * `AppShell.NavItem = NavItem` both give one. The part's props are its
 * function's first parameter, as a ladder primitive's are.
 */
function partsOf(checker: ts.TypeChecker, symbol: ts.Symbol): RegistryPart[] {
  return compoundParts(checker, symbol).map((part) => ({
    name: part.name,
    props: part.props === null ? [] : propsOfType(checker, part.props),
  }))
}

/** A file's name without its extension or separators, lowercased: `toast-store.ts` is `toaststore`. */
const squashed = (file: string) =>
  basename(file)
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()

/**
 * The member's other callable exports, found from the files that declare them.
 * A file counts when it sits beside the member's own, is named for the member
 * (`ToastNotice.tsx` and `toast-store.ts` for Toast, whose export is the
 * `Toaster`), and declares no other gallery member, so `CheckboxGroup.tsx` is
 * not Checkbox's. A constant (`TOAST_MAX_VISIBLE`) is not a call site's to
 * use, so only what can be called is listed.
 */
function exportsOf(
  ui: UiProgram,
  name: string,
  own: ts.Symbol,
  componentByFile: Map<string, string>,
): RegistryExport[] {
  const { checker, exports } = ui
  const home = declarationFile(checker, own)
  if (home === null) return []
  const self = resolveAlias(checker, own)
  const stem = name.toLowerCase()
  const found: RegistryExport[] = []
  for (const [exported, symbol] of exports) {
    if (resolveAlias(checker, symbol) === self) continue
    const file = declarationFile(checker, symbol)
    if (file === null || dirname(file.fileName) !== dirname(home.fileName)) continue
    if (!squashed(file.fileName).startsWith(stem)) continue
    const owner = componentByFile.get(file.fileName)
    if (owner !== undefined && owner !== name) continue
    const type = valueType(checker, symbol)
    if (type === null || checker.getSignaturesOfType(type, ts.SignatureKind.Call).length === 0)
      continue
    found.push({
      name: exported,
      kind: /^[A-Z]/.test(exported) ? 'component' : 'function',
      props: propsOfComponent(checker, symbol),
      members: callableProperties(checker, symbol).map((property) => property.name),
    })
  }
  return found.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The properties of a type, with unions flattened.
 *
 * Split out of `propsOf` so the exception primitives can reach it from a
 * function signature instead of a declared `<Name>Props`. Both entry points use
 * the same checker in the same way.
 */
/**
 * The prop type, printed in full.
 *
 * Two printer defaults would make the registry omit information.
 * **Truncation**: long literal unions are elided. An icon prop would read
 * `"copy" | … 42 more … | "mode-system"`, which the composer's inspector cannot
 * parse and `valueFault` cannot check, because it skips what it cannot parse
 * (so `trailingIcon: "floop"` would validate). **Alias folding**: enum-like
 * aliases such as `BadgeTone` and `HeadingLevel` print by name, which hides the
 * choices a designer most wants offered. So the printer never truncates, and
 * expands an alias *only when it resolves to a union of literals*. `boolean`
 * stays `boolean` and `ReactNode` stays `ReactNode`, so domain shapes keep
 * their names. A list of choices must be printed in full, because both the
 * inspector and the validator act on it.
 */
function printPropType(checker: ts.TypeChecker, type: ts.Type): string {
  const whole = ts.TypeFormatFlags.NoTruncation

  // Check for a literal union first, because an optional prop arrives as
  // `Alias | undefined`. That union's printed form keeps the alias name, while
  // its branches are already the flattened literals.
  if (type.isUnion()) {
    const literal = type.types.every(
      (branch) =>
        branch.isStringLiteral() ||
        branch.isNumberLiteral() ||
        (branch.flags &
          (ts.TypeFlags.BooleanLiteral | ts.TypeFlags.Undefined | ts.TypeFlags.Null)) !==
          0,
    )
    if (literal) {
      // `undefined` is dropped from the print, because the `optional` flag
      // already records optionality, and a choice list that starts with
      // "undefined" is noise to every reader (the inspector, the validator,
      // the docs). `null` stays, because it is a *value* a prop takes (a
      // cleared Select).
      return type.types
        .filter((branch) => (branch.flags & ts.TypeFlags.Undefined) === 0)
        .map((branch) => checker.typeToString(branch, undefined, whole))
        .join(' | ')
    }
  }

  return checker.typeToString(type, undefined, whole)
}

function propsOfType(checker: ts.TypeChecker, type: ts.Type): RegistryProp[] {
  // A discriminated union is one surface with several shapes, and the registry
  // prints the surface. Every branch is read. A prop's type is the union of
  // what the branches declare for it. A prop that some branch lacks is
  // optional, because a call site on that branch may omit it, and the flag
  // means "may omit". Reading only the first branch would report Button as
  // `variant: "solid"` and drop Accordion's multiple-selection branch.
  const branches: ts.Type[] = []
  const collect = (current: ts.Type): void => {
    if (current.isUnion()) {
      for (const part of current.types) collect(part)
      return
    }
    branches.push(current)
  }
  collect(type)

  type Draft = { types: string[]; presentIn: number; optional: boolean; doc: string }
  const props = new Map<string, Draft>()

  for (const branch of branches) {
    for (const property of checker.getPropertiesOfType(branch)) {
      const declaration = property.valueDeclaration ?? property.declarations?.[0]
      const printed = declaration
        ? printPropType(checker, checker.getTypeOfSymbolAtLocation(property, declaration))
        : 'unknown'
      const doc = ts
        .displayPartsToString(property.getDocumentationComment(checker))
        .replace(/\s+/g, ' ')
        .trim()

      const draft = props.get(property.name) ?? {
        types: [],
        presentIn: 0,
        optional: false,
        doc: '',
      }
      if (!draft.types.includes(printed)) draft.types.push(printed)
      draft.presentIn += 1
      // `Symbol.Optional`, not a `?` in the printed type. A union with
      // `undefined` and an optional property are different declarations, and
      // only the optional property may be omitted at a call site.
      draft.optional ||= (property.flags & ts.SymbolFlags.Optional) !== 0
      if (draft.doc === '') draft.doc = doc
      props.set(property.name, draft)
    }
  }

  return [...props.entries()]
    .map(([name, draft]) => ({
      name,
      type: joinPrinted(draft.types),
      optional: draft.optional || draft.presentIn < branches.length,
      ...(draft.doc === '' ? {} : { doc: draft.doc }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Joins the printed types from several branches into one. Distinct simple
 * prints (no parens, arrows or braces) are split on the union bar and deduped,
 * so `"solid"` from one branch and `"solid" | "soft"` from another become one
 * flat union, not a union of unions. Structural types are joined verbatim,
 * because splitting a function or object type on `|` would break it.
 */
function joinPrinted(printed: string[]): string {
  if (printed.length === 1) return printed[0] as string
  const simple = printed.every((text) => !/[(){}=>]/.test(text))
  if (!simple) return printed.join(' | ')
  const parts: string[] = []
  for (const text of printed) {
    for (const part of text.split('|').map((item) => item.trim())) {
      // The optional flag records `undefined`, not the type. Removing it here
      // keeps `"solid" | undefined | "soft"` out of the registry.
      if (part !== '' && part !== 'undefined' && !parts.includes(part)) parts.push(part)
    }
  }
  return parts.length === 0 ? 'undefined' : parts.join(' | ')
}

/**
 * The lawful cells, read as data from the typed grid beside the component.
 *
 * It reads the AST statically instead of importing the module. A generator
 * that executed `Button.tsx` would need React, a DOM and every stylesheet in
 * the package to learn eight strings.
 */
function gridIn(source: ts.SourceFile): Record<string, string[]> | null {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    if (!statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue

    for (const declaration of statement.declarationList.declarations) {
      if (!/_GRID$/.test(declaration.name.getText())) continue
      const object = unwrap(declaration.initializer)
      if (!object || !ts.isObjectLiteralExpression(object)) continue

      const grid: Record<string, string[]> = {}
      for (const property of object.properties) {
        if (!ts.isPropertyAssignment(property)) continue
        const value = unwrap(property.initializer)
        if (!value || !ts.isArrayLiteralExpression(value)) continue
        grid[property.name.getText().replace(/['"]/g, '')] = value.elements
          .filter(ts.isStringLiteral)
          .map((literal) => literal.text)
      }
      if (Object.keys(grid).length > 0) return grid
    }
  }
  return null
}

export interface FixtureFacts {
  states: string[]
  requiredSelectors: string[]
}

/**
 * What the states fixture declares: the states it renders and the selectors its
 * stylesheet must style.
 *
 * An entry is named by a string literal, or by a template literal inside the
 * callback of a `.map` or `.flatMap` over a list of literals the fixture
 * declares (`...GROUP_ORDER.map((group) => ({ name: \`all ${group} roles\` }))`),
 * which names one entry per item. A name read from anything else (a grid's
 * cells, which the lawful grid lists) is not a state here.
 *
 * Two facts, and deliberately not a third. Reading `dataAttributes` from
 * `requiredSelectors` would make one fixture field answer two questions with two
 * definitions: "the states no prop can reach" for the selectors law, and
 * "everything this component exposes" for the catalogue. Timeline shows the
 * difference. Its states are all reachable by props, so its `requiredSelectors`
 * is correctly empty, while its stylesheet keys on seven attributes. The
 * attribute contract comes from the stylesheet (`attributeContract`), and this
 * function keeps the one meaning the fixture's own consumers give it.
 */
export function fixtureFacts(source: ts.SourceFile | undefined): FixtureFacts {
  const empty = { states: [], requiredSelectors: [] }
  if (!source) return empty

  const states: string[] = []
  const requiredSelectors: string[] = []

  const walk = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node)) {
      const key = node.name.getText().replace(/['"]/g, '')
      const value = unwrap(node.initializer)

      if (key === 'requiredSelectors' && value && ts.isArrayLiteralExpression(value)) {
        for (const element of value.elements) {
          if (ts.isStringLiteral(element)) requiredSelectors.push(element.text)
        }
      }
      if (key === 'name' && value && isEntry(node)) {
        if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))
          states.push(value.text)
        else if (ts.isTemplateExpression(value)) states.push(...templateNames(value, source))
      }
    }
    ts.forEachChild(node, walk)
  }
  walk(source)

  return { states, requiredSelectors }
}

/** The literals a list holds: an array of string and number literals, or a `const` naming one. */
function literalList(node: ts.Expression, source: ts.SourceFile): string[] | null {
  let list = unwrap(node)
  if (list && ts.isIdentifier(list)) {
    const name = list.text
    let found: ts.Expression | undefined
    const find = (child: ts.Node): void => {
      if (
        ts.isVariableDeclaration(child) &&
        ts.isIdentifier(child.name) &&
        child.name.text === name &&
        child.initializer !== undefined &&
        ts.isVariableDeclarationList(child.parent) &&
        (child.parent.flags & ts.NodeFlags.Const) !== 0
      )
        found = child.initializer
      else ts.forEachChild(child, find)
    }
    find(source)
    list = unwrap(found)
  }
  if (list === undefined || !ts.isArrayLiteralExpression(list)) return null
  const values: string[] = []
  for (const element of list.elements) {
    const item = unwrap(element as ts.Expression)
    if (item && (ts.isStringLiteral(item) || ts.isNumericLiteral(item))) values.push(item.text)
    else return null
  }
  return values
}

/**
 * The names a template literal writes, one per combination of the items its
 * substitutions range over: each substitution is the parameter of an enclosing
 * `.map` or `.flatMap` callback over a list of literals. Empty when a
 * substitution is anything else.
 */
function templateNames(template: ts.TemplateExpression, source: ts.SourceFile): string[] {
  const ranges = new Map<string, string[]>()
  for (let node: ts.Node = template; node.parent !== undefined; node = node.parent) {
    const callback = node.parent
    if (!(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) continue
    if (callback.body !== node && !callback.parameters.some((parameter) => parameter === node))
      continue
    const call = callback.parent
    const parameter = callback.parameters[0]
    if (
      !ts.isCallExpression(call) ||
      call.arguments[0] !== callback ||
      !ts.isPropertyAccessExpression(call.expression) ||
      !['map', 'flatMap'].includes(call.expression.name.text) ||
      parameter === undefined ||
      !ts.isIdentifier(parameter.name)
    )
      continue
    const items = literalList(call.expression.expression, source)
    if (items !== null && !ranges.has(parameter.name.text)) ranges.set(parameter.name.text, items)
  }
  let names = [template.head.text]
  for (const span of template.templateSpans) {
    const expression = unwrap(span.expression)
    const items =
      expression && ts.isIdentifier(expression) ? ranges.get(expression.text) : undefined
    if (items === undefined) return []
    names = names.flatMap((name) => items.map((item) => `${name}${item}${span.literal.text}`))
  }
  return names
}

/** A `name:` inside an entry object, identified by a sibling `render`. */
function isEntry(node: ts.PropertyAssignment): boolean {
  const parent = node.parent
  if (!ts.isObjectLiteralExpression(parent)) return false
  return parent.properties.some(
    (property) => property.name?.getText().replace(/['"]/g, '') === 'render',
  )
}

/* -------------------------------------------------------------------------- */
/* The attribute contract                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The `data-*` attributes a component's styling keys on, read from the
 * stylesheet that keys on them.
 *
 * The stylesheet is the only reliable source. A fixture says what a state *is
 * called* and what a test should assert. It does not list every attribute, and
 * reading it for that would publish a component with no attribute contract.
 * The stylesheet cannot be wrong in the same way. An attribute a rule matches
 * on is one the component's appearance depends on. An attribute no rule
 * matches is one the vocabulary makes no promise about.
 *
 * **Scoped by class, not by file**, because three layout primitives share
 * `layout.module.css`, and a whole-file read would tell an agent that `Stack`
 * takes `data-columns`. An attribute counts when it sits in a compound that
 * also has a class the component puts on the DOM. `.event[data-tone]` is
 * Timeline's, and `.grid[data-columns]` is not Stack's. `composes` extends the
 * class set into the sheet it borrows from, which is how `Card` gets the
 * padding table it composes instead of restating. As a result, and the schema
 * says so too, this is what the *styling* honours. For a composed table that
 * is a superset of what the props can reach.
 *
 * A `:global(…)` selector is skipped entirely, because that is CSS Modules'
 * marker for "not this module's". `[data-motion='none']` inside one is the
 * theme runtime's attribute on the document element, and a component that
 * listed it would publish the runtime's contract as its own.
 *
 * It uses regexes over selectors instead of postcss. The registry's four
 * dependencies are `@polymorph/rules`, `@polymorph/theme`, `jiti` and
 * `typescript`, and none is a CSS parser. Once comments and `:global` are
 * removed, a selector is a flat string with no nesting, so a parser would add
 * precision this task does not need. The repo writes no nested CSS and no
 * `composes` without a `from`, and `registry.test.ts` checks both.
 */

const CSS_COMMENT = /\/\*[\s\S]*?\*\//g
const CSS_GLOBAL = /:global\([^)]*\)/g
const CSS_CLASS = /\.(-?[_a-zA-Z][\w-]*)/g
const CSS_COMPOSES = /composes:\s*([^;]*?)\s+from\s+['"]([^'"]+)['"]/g
/** `[data-x]`, `[data-x='y']`, `[data-x="y"]`, `[data-x=y]`. The value is optional. */
const CSS_ATTRIBUTE = /\[\s*(data-[a-zA-Z0-9-]+)\s*(?:=\s*("[^"]*"|'[^']*'|[^\]\s]+))?[^\]]*\]/g

/** Every `--pm-*` read in the component's own stylesheet, sorted, unique. */
function tokensIn(root: string, stylesPath: string | null): string[] {
  if (stylesPath === null) return []
  const path = resolve(root, stylesPath)
  if (!existsSync(path)) return []
  const css = readFileSync(path, 'utf8')
  return [
    ...new Set([...css.matchAll(/var\((--pm-[a-z0-9-]+)/g)].map((m) => m[1] as string)),
  ].sort()
}

/** The classes a component puts on the DOM, read from its own source. */
function appliedClasses(source: ts.SourceFile): Set<string> {
  const bindings = new Set<string>()
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue
    if (!statement.moduleSpecifier.text.endsWith('.module.css')) continue
    const binding = statement.importClause?.name
    if (binding) bindings.add(binding.text)
  }

  const classes = new Set<string>()
  const walk = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      if (bindings.has(node.expression.text)) classes.add(node.name.text)
    }
    if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const key = node.argumentExpression
      if (bindings.has(node.expression.text) && ts.isStringLiteralLike(key)) classes.add(key.text)
    }
    ts.forEachChild(node, walk)
  }
  walk(source)
  return classes
}

/**
 * Style rules as `{ selector, body }`, including the rules inside at-rules.
 *
 * A `@media` or `@container` block holds its own rules, and a component that
 * styles `[data-side]` only under a breakpoint still styles it.
 */
export function cssRules(css: string): { selector: string; body: string }[] {
  const found: { selector: string; body: string }[] = []

  const walk = (text: string): void => {
    let depth = 0
    let prelude = ''
    let open = 0

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index]
      if (character === '{') {
        depth += 1
        if (depth === 1) open = index + 1
        continue
      }
      if (character === '}') {
        depth -= 1
        if (depth === 0) {
          const body = text.slice(open, index)
          const selector = prelude.trim()
          if (selector.startsWith('@')) walk(body)
          else found.push({ selector, body })
          prelude = ''
        }
        continue
      }
      // A `;` at the top level ends an at-rule with no block (`@import`), so the
      // prelude restarts rather than absorbing the next rule's selector.
      if (depth === 0) prelude = character === ';' ? '' : prelude + character
    }
  }

  walk(css)
  return found
}

/**
 * A complex selector split into its compounds. A combinator character splits
 * only outside `()` and `[]`, so `:not([data-disabled], [data-x])` is one
 * compound with two attributes in it.
 */
export function cssCompounds(selector: string): string[] {
  const parts: string[] = []
  let current = ''
  let parens = 0
  let brackets = 0

  for (const character of selector) {
    if (character === '(') parens += 1
    if (character === ')') parens -= 1
    if (character === '[') brackets += 1
    if (character === ']') brackets -= 1
    if (parens === 0 && brackets === 0 && /[\s>+~,]/.test(character)) {
      parts.push(current)
      current = ''
      continue
    }
    current += character
  }

  parts.push(current)
  return parts.filter((part) => part !== '')
}

/** Sorts `'10'` after `'9'`, not after `'1'`, because space steps are numbers. */
function compareValues(a: string, b: string): number {
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) return Number(a) - Number(b)
  return a.localeCompare(b)
}

export function attributeContract(
  root: string,
  source: ts.SourceFile,
  stylesPath: string | null,
): RegistryAttribute[] {
  // No stylesheet means no contract. `ConfirmDialog` composes Dialog and styles
  // nothing of its own, so a contract invented for it would be Dialog's, listed
  // under the wrong name.
  if (stylesPath === null) return []

  const found = new Map<string, Set<string>>()
  const queue: { file: string; classes: Set<string> }[] = [
    { file: stylesPath, classes: appliedClasses(source) },
  ]
  const seen = new Set<string>()

  while (queue.length > 0) {
    const { file, classes } = queue.shift() as { file: string; classes: Set<string> }
    const key = `${file}::${[...classes].sort().join(' ')}`
    if (seen.has(key) || classes.size === 0) continue
    seen.add(key)

    const path = resolve(root, file)
    if (!existsSync(path)) continue
    const css = readFileSync(path, 'utf8').replace(CSS_COMMENT, ' ')

    for (const { selector, body } of cssRules(css)) {
      const local = selector.replace(CSS_GLOBAL, ' ')
      let mine = false

      for (const compound of cssCompounds(local)) {
        const names = [...compound.matchAll(CSS_CLASS)].map((match) => match[1] as string)
        if (!names.some((name) => classes.has(name))) continue
        mine = true

        for (const match of compound.matchAll(CSS_ATTRIBUTE)) {
          const name = match[1] as string
          const values = found.get(name) ?? new Set<string>()
          const raw = match[2]
          if (raw !== undefined) values.add(raw.replace(/^['"]|['"]$/g, ''))
          found.set(name, values)
        }
      }

      if (!mine) continue
      for (const match of body.matchAll(CSS_COMPOSES)) {
        const composed = (match[1] as string).trim().split(/\s+/)
        const target = relative(root, resolve(dirname(path), match[2] as string))
        queue.push({ file: target, classes: new Set(composed) })
      }
    }
  }

  return [...found.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, values]) => ({
      name,
      ...(values.size === 0 ? {} : { values: [...values].sort(compareValues) }),
    }))
}

/* -------------------------------------------------------------------------- */
/* The import graph                                                           */
/* -------------------------------------------------------------------------- */

const EXTENSIONS = ['.tsx', '.ts', '/index.ts', '/index.tsx']

function resolveRelative(from: string, specifier: string): string | null {
  const base = resolve(dirname(from), specifier)
  if (/\.(css|json)$/.test(specifier)) return null
  for (const extension of EXTENSIONS) {
    if (existsSync(base + extension)) return base + extension
  }
  return existsSync(base) ? base : null
}

/** `@radix-ui/react-dialog/x` -> `@radix-ui/react-dialog`; `motion/react` -> `motion`. */
function packageOf(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] as string)
}

function importsOf(source: ts.SourceFile): string[] {
  const found: string[] = []
  for (const statement of source.statements) {
    const specifier =
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : null
    if (specifier !== null) found.push(specifier)
  }
  return found
}

/**
 * The CSS Module a source file imports, if it imports one that exists. This is
 * the stylesheet a member or a primitive owns. The vocabulary's assembly and the
 * ladder's primitives both find their stylesheet through this function. A
 * member imports its recipe from `@polymorph/recipes`, which names a file under
 * `packages/recipes/src`; a relative import names a file beside the source.
 */
function stylesheetOf(root: string, source: ts.SourceFile): string | null {
  return (
    importsOf(source)
      .filter((specifier) => specifier.endsWith('.module.css'))
      .map(
        (specifier) =>
          recipeFile(specifier) ?? relative(root, resolve(dirname(source.fileName), specifier)),
      )
      .find((path) => existsSync(resolve(root, path))) ?? null
  )
}

/**
 * The recipe of a compound member whose root and parts are a client module.
 *
 * Such a member's own file carries no `'use client'`, so a server component can
 * read its parts from it (`Tabs.tsx`). The root and the parts are in a module
 * beside it, named for it (`tabs-parts.tsx`), and that module imports the
 * recipe, because it is the one that writes the class names.
 */
function partsStylesheetOf(
  program: ts.Program,
  root: string,
  source: ts.SourceFile,
): string | null {
  for (const specifier of importsOf(source)) {
    if (!/^\.\/[a-z-]+-parts$/.test(specifier)) continue
    const parts = program.getSourceFile(resolve(dirname(source.fileName), `${specifier}.tsx`))
    const stylesheet = parts ? stylesheetOf(root, parts) : null
    if (stylesheet !== null) return stylesheet
  }
  return null
}

/**
 * Everything a component needs, transitively.
 *
 * The walk follows the *internal* graph and reports two things: the vocabulary
 * members it reaches, and the external packages every file along the way
 * imports. Because of the second, the walk does not stop at a component
 * boundary. Button reaches Icon, and Icon is the only reason `lucide-react` is
 * in Button's closure.
 */
export function closureOf(
  program: ts.Program,
  entry: ts.SourceFile,
  componentByFile: Map<string, string>,
  self: string,
): { components: string[]; packages: string[] } {
  const seen = new Set<string>()
  const components = new Set<string>()
  const packages = new Set<string>()

  const walk = (file: ts.SourceFile): void => {
    if (seen.has(file.fileName)) return
    seen.add(file.fileName)

    for (const specifier of importsOf(file)) {
      // A recipe is a file copied with the member, not a package to install.
      if (recipeFile(specifier) !== null) continue
      if (!specifier.startsWith('.')) {
        const name = packageOf(specifier)
        if (!AMBIENT.has(name)) packages.add(name)
        continue
      }

      const target = resolveRelative(file.fileName, specifier)
      if (target === null) continue
      const owner = componentByFile.get(target)
      if (owner !== undefined && owner !== self) components.add(owner)
      const next = program.getSourceFile(target)
      if (next) walk(next)
    }
  }

  walk(entry)
  return { components: [...components].sort(), packages: [...packages].sort() }
}

/**
 * The external packages imported by the file set that is *copied* with a
 * component.
 *
 * A vendored component's packages are read from `dependencies.files`, not from
 * `closureOf`'s walk, because the two graphs differ by exactly the fixture. The
 * file closure is seeded with the states fixture and the source walk is not.
 * Dialog's fixture builds a form, the form's field mounts a ToastNotice, and
 * the Toaster behind that imports `@radix-ui/react-visually-hidden`. Packages read from
 * the source walk would leave the install copying a file whose dependency it
 * never declared. The consumer's typecheck would then fail on a module that
 * this repository's hoisting always resolves. The `package.json` an install
 * writes must cover the files that install copies, so the packages come from
 * those files.
 */
function packagesIn(root: string, files: string[]): string[] {
  const packages = new Set<string>()
  for (const file of files) {
    if (!/\.tsx?$/.test(file)) continue
    const source = ts.createSourceFile(
      file,
      readFileSync(resolve(root, file), 'utf8'),
      ts.ScriptTarget.Latest,
    )
    for (const specifier of importsOf(source)) {
      if (specifier.startsWith('.') || recipeFile(specifier) !== null) continue
      const name = packageOf(specifier)
      if (!AMBIENT.has(name)) packages.add(name)
    }
  }
  return [...packages].sort()
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                   */
/* -------------------------------------------------------------------------- */

const slug = (component: string) =>
  component
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()

/**
 * A member's spec, repo-relative: the file its slug names, else the one whose
 * name matches it with separators and case removed. `null` for a member with
 * no spec.
 */
export function specFor(root: string, component: string): string | null {
  const base = SPEC_FILE_OVERRIDES[component] ?? component
  const wanted = base.replace(/[^a-z0-9]/gi, '').toLowerCase()
  for (const dir of SPEC_DIRS) {
    for (const candidate of [`${dir}/${slug(base)}.md`]) {
      if (existsSync(resolve(root, candidate))) return candidate
    }
    // A spec whose filename is not the slug. It is matched the way the staleness
    // law matches, on the name with separators and case removed.
    const full = resolve(root, dir)
    if (!existsSync(full)) continue
    for (const file of ts.sys.readDirectory(full, ['.md']).sort()) {
      const name = file.split('/').pop() as string
      if (
        name
          .slice(0, -3)
          .replace(/[^a-z0-9]/gi, '')
          .toLowerCase() === wanted
      ) {
        return `${dir}/${name}`
      }
    }
  }
  return null
}

/** The spec's contract, checked against the states the fixture renders. */
function behaviourIn(root: string, spec: string | null, states: readonly string[]): Contract[] {
  if (spec === null) return []
  return readBehaviour(readFileSync(resolve(root, spec), 'utf8'), spec, states)
}

/**
 * The spec's agent fence, checked against the states the fixture renders and
 * the props the member's API declares, or `null` for a spec with none.
 */
function agentIn(
  root: string,
  spec: string | null,
  states: readonly string[],
  props: readonly RegistryProp[],
): AgentContract | null {
  if (spec === null) return null
  return readAgentContract(readFileSync(resolve(root, spec), 'utf8'), spec, states, props)
}

/** The spec's `## Anatomy` fence: the element tree as the spec draws it. */
function anatomyIn(root: string, spec: string | null): string | null {
  if (spec === null) return null
  const lines = readFileSync(resolve(root, spec), 'utf8').split('\n')
  const start = lines.findIndex((line) => /^##\s.*\bAnatomy\b/.test(line))
  if (start === -1) return null

  const rest = lines.slice(start + 1)
  const open = rest.findIndex((line) => line.startsWith('```'))
  if (open === -1) return null
  const close = rest.slice(open + 1).findIndex((line) => line.startsWith('```'))
  if (close === -1) return null
  return rest
    .slice(open + 1, open + 1 + close)
    .join('\n')
    .trim()
}

export function readVocabulary(
  ui: UiProgram,
  platforms: Map<string, MemberPlatforms>,
  frameworks: Map<string, MemberFrameworks> = readFrameworkMap(ui),
): RegistryComponent[] {
  const { program, checker, root, exports } = ui

  // File -> the component it declares, so the import walk can name what it
  // reaches. Built first, because every closure needs the whole map.
  const componentByFile = new Map<string, string>()
  const sources = new Map<string, ts.SourceFile>()
  const symbols = new Map<string, ts.Symbol>()
  for (const { name } of ui.components) {
    const symbol = exports.get(DECLARATION_OVERRIDES[name] ?? name)
    const file = symbol ? declarationFile(checker, symbol) : null
    // Fail loudly. A component the generator cannot resolve would otherwise
    // disappear from the catalogue. A registry missing a component is worse
    // than one that fails to build, because nothing downstream can tell "not in
    // the system" from "not found".
    if (!symbol || !file) {
      throw new Error(
        `registry: ${name} is in GALLERIES but the vocabulary exports no declaration for it`,
      )
    }
    componentByFile.set(file.fileName, name)
    sources.set(name, file)
    symbols.set(name, symbol)
  }

  return ui.components
    .map(({ name, fixture }): RegistryComponent | null => {
      const source = sources.get(name)
      const symbol = symbols.get(name)
      if (!source || !symbol) return null

      const sourcePath = relative(root, source.fileName)
      const tier = sourcePath.split('/')[3] as string
      const origin = sourcePath.startsWith(`${FOUNDATION}/`) ? 'installed' : 'vendored'
      const stylesPath = stylesheetOf(root, source) ?? partsStylesheetOf(program, root, source)

      const statesPath = relative(root, fixture)
      const statesFile = program.getSourceFile(fixture)

      // The fixture is copied with the component, so it seeds the closure
      // alongside the source. That is why installing Dialog also installs Input
      // and FormField. This is intended: a states fixture that does not compile
      // is a broken install, and the fixture is the consumer's only record of
      // the states their CSS must keep styling.
      const vendorSeeds =
        origin === 'installed'
          ? []
          : [sourcePath, ...(stylesPath ? [stylesPath] : []), ...(statesFile ? [statesPath] : [])]

      const spec = specFor(root, name)
      const facts = fixtureFacts(statesFile)
      const propType = PROP_TYPE_OVERRIDES[name] ?? `${name}Props`
      const parts = partsOf(checker, symbol)

      // A compound component's parts are part of its surface. `Table.Row`'s
      // props are listed under Table with a prefix, because an agent asking
      // about Table needs to know a row takes `selected` and a cell does not.
      const props = [
        ...propsOf(checker, exports.get(propType)),
        ...(FLATTENED_PARTS[name] ?? []).flatMap((flattened) =>
          (parts.find((part) => part.name === flattened)?.props ?? []).map((prop) => ({
            ...prop,
            name: `${flattened}.${prop.name}`,
          })),
        ),
      ]

      const closure = closureOf(program, source, componentByFile, name)
      const files = fileClosure(root, vendorSeeds)

      return {
        name,
        tier,
        origin,
        platforms: platformsOf(platforms, name),
        frameworks: frameworksOf(frameworks, name),
        purpose: purposeOf(source),
        spec,
        anatomy: anatomyIn(root, spec),
        files: {
          source: sourcePath,
          styles: stylesPath,
          states: statesFile ? statesPath : null,
        },
        props,
        parts,
        exports: exportsOf(ui, name, symbol, componentByFile),
        grid: gridIn(source),
        states: facts.states,
        requiredSelectors: facts.requiredSelectors,
        tokens: tokensIn(root, stylesPath),
        dataAttributes: attributeContract(root, source, stylesPath),
        behaviour: behaviourIn(root, spec, facts.states),
        agent: agentIn(root, spec, facts.states, props),
        dependencies: {
          // `components` is the source walk's result on purpose. It means
          // "what the component itself composes", and `plan.ts` reads the
          // fixture-widened membership from the files instead. `packages`
          // cannot make that distinction, because every copied file must
          // resolve where it lands. So for a vendored component the packages
          // come from the whole file set, and for an installed one (which
          // copies no files) from the walk that found its imports.
          components: closure.components,
          packages: origin === 'installed' ? closure.packages : packagesIn(root, files),
          files,
        },
      }
    })
    .filter((component): component is RegistryComponent => component !== null)
}

/* -------------------------------------------------------------------------- */
/* Data types                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A named data type a member's props take: an option, a column, a stat, a
 * menu entry. A prop's printed type names it (`options: SelectOption[]`), and
 * a reader with no compiler, such as a model writing a screen from the
 * run-time card, needs its fields to write one.
 */
export interface RegistryDataType {
  name: string
  /** Its type parameters, as its declaration names them: `Row` for `DataTableColumn<Row>`. */
  params: string[]
  /**
   * For a type that is a union of other named types (`MenuEntry`), their
   * names. Each is a data type of its own, and `fields` is empty.
   */
  union?: string[]
  /** Its fields, one level, each typed as a prop's type is printed. */
  fields: RegistryProp[]
}

/** Whether a declaration is the repository's own: a package's source, not a dependency's or the language's. */
function ownDeclaration(root: string, declaration: ts.Declaration | undefined): boolean {
  if (declaration === undefined) return false
  const file = declaration.getSourceFile().fileName
  return file.startsWith(`${resolve(root, 'packages')}/`) && !file.includes('/node_modules/')
}

/** A type's literal branches, which a printed prop type spells out, so they are no data type. */
const isLiteral = (type: ts.Type): boolean =>
  type.isStringLiteral() ||
  type.isNumberLiteral() ||
  (type.flags & (ts.TypeFlags.BooleanLiteral | ts.TypeFlags.Undefined | ts.TypeFlags.Null)) !== 0

/**
 * Every named data type the members' props reach, the parts' and the
 * exception primitives' included, sorted by name.
 *
 * It walks each prop's type through unions, lists, records, `Readonly` and
 * the other wrappers of the language, and records each named type the
 * repository declares that holds fields: an interface, or an alias of an
 * object type or of a union of them. It reads a recorded type's fields one
 * level down and walks their types in turn, so a nested type is recorded
 * too. A type a dependency declares (`ReactNode`, `CalendarDate`) is not read
 * at all, and a function's parameters are not data.
 * An alias of a union of literals is spelled out where it is printed, and is
 * not recorded. Two declarations of one name would print as one, so they
 * fail the build.
 */
export function readDataTypes(ui: UiProgram): RegistryDataType[] {
  const { checker, exports, root } = ui
  const found = new Map<string, { symbol: ts.Symbol; type: RegistryDataType }>()
  const seen = new Set<ts.Type>()

  const typeOfProperty = (property: ts.Symbol): ts.Type | null => {
    const declaration = property.valueDeclaration ?? property.declarations?.[0]
    return declaration ? checker.getTypeOfSymbolAtLocation(property, declaration) : null
  }

  /** The named, own symbol of a type's declaration, when it declares fields or a union. */
  const ownNamed = (symbol: ts.Symbol | undefined): ts.Symbol | null => {
    const declaration = symbol?.declarations?.[0]
    if (symbol === undefined || !ownDeclaration(root, declaration)) return null
    return declaration !== undefined &&
      (ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration))
      ? symbol
      : null
  }

  const visitFields = (type: ts.Type): void => {
    for (const property of checker.getPropertiesOfType(type)) {
      const field = typeOfProperty(property)
      if (field !== null) visit(field)
    }
    for (const index of checker.getIndexInfosOfType(type)) visit(index.type)
  }

  const record = (symbol: ts.Symbol): void => {
    const name = symbol.name
    const known = found.get(name)
    if (known !== undefined) {
      if (known.symbol !== symbol) {
        throw new Error(
          `registry: two data types are named ${name}, and a reader cannot tell them apart`,
        )
      }
      return
    }
    const declaration = symbol.declarations?.[0] as
      ts.InterfaceDeclaration | ts.TypeAliasDeclaration
    const declared = checker.getDeclaredTypeOfSymbol(symbol)
    if (checker.getSignaturesOfType(declared, ts.SignatureKind.Call).length > 0) return
    const branches = declared.isUnion() ? declared.types : [declared]
    if (branches.every(isLiteral)) return
    const params = (declaration.typeParameters ?? []).map((parameter) => parameter.name.text)
    const named = branches
      .filter((branch) => !isLiteral(branch))
      .map((branch) => ownNamed(branch.aliasSymbol) ?? ownNamed(branch.symbol))
    if (declared.isUnion() && named.every((branch) => branch !== null)) {
      const union = named.map((branch) => (branch as ts.Symbol).name)
      found.set(name, { symbol, type: { name, params, union, fields: [] } })
      for (const branch of named) record(branch as ts.Symbol)
      return
    }
    found.set(name, { symbol, type: { name, params, fields: propsOfType(checker, declared) } })
    for (const branch of branches) visitFields(branch)
  }

  const visit = (type: ts.Type): void => {
    if (seen.has(type)) return
    seen.add(type)
    const alias = ownNamed(type.aliasSymbol)
    if (alias !== null) {
      record(alias)
      for (const argument of type.aliasTypeArguments ?? []) visit(argument)
      return
    }
    if (type.isUnionOrIntersection()) {
      for (const branch of type.types) visit(branch)
      return
    }
    if ((type.flags & ts.TypeFlags.Object) === 0) return
    if (checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0) return
    const reference = type as ts.TypeReference
    const argumentsOf = reference.target === undefined ? [] : checker.getTypeArguments(reference)
    const symbol = ownNamed(type.symbol)
    if (symbol !== null) {
      record(symbol)
      for (const argument of argumentsOf) visit(argument)
      return
    }
    // A type the language names (`ReadonlyArray`, `Readonly`, `Record`, `Set`) is read through its
    // arguments, and an object written in place through its fields. A type a dependency names
    // (`ReactElement<FormFieldControlProps>`, `CalendarDate`) is read no further: what its
    // arguments say is not data a document writes.
    const foreign = type.aliasSymbol ?? type.symbol
    const declaration = foreign?.declarations?.[0]
    const written = foreign === undefined || foreign.name.startsWith('__')
    const language =
      declaration !== undefined &&
      ui.program.isSourceFileDefaultLibrary(declaration.getSourceFile())
    if (written || language) {
      for (const argument of [...argumentsOf, ...(type.aliasTypeArguments ?? [])]) visit(argument)
    }
    if (written || (language && checker.getIndexInfosOfType(type).length > 0)) visitFields(type)
  }

  const visitProps = (type: ts.Type): void => {
    for (const branch of type.isUnion() ? type.types : [type]) visitFields(branch)
  }

  for (const { name } of ui.components) {
    const props = exports.get(PROP_TYPE_OVERRIDES[name] ?? `${name}Props`)
    if (props !== undefined)
      visitProps(checker.getDeclaredTypeOfSymbol(resolveAlias(checker, props)))
    const symbol = exports.get(DECLARATION_OVERRIDES[name] ?? name)
    if (symbol === undefined) continue
    for (const part of compoundParts(checker, symbol))
      if (part.props !== null) visitProps(part.props)
  }
  for (const name of Object.keys(PRIMITIVE_RUNGS)) {
    const symbol = exports.get(name)
    const declaration =
      symbol === undefined ? undefined : resolveAlias(checker, symbol).valueDeclaration
    if (symbol === undefined || declaration === undefined) continue
    const resolved = resolveAlias(checker, symbol)
    const [signature] = checker.getSignaturesOfType(
      checker.getTypeOfSymbolAtLocation(resolved, declaration),
      ts.SignatureKind.Call,
    )
    const parameter = signature?.parameters[0]
    if (parameter !== undefined)
      visitProps(checker.getTypeOfSymbolAtLocation(parameter, declaration))
  }

  return [...found.values()].map(({ type }) => type).sort((a, b) => a.name.localeCompare(b.name))
}
