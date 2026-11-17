import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'

import { declaredTypesIn, GENERATED, isFoundation, SOURCES, type IconSymbols } from './contracts'
import {
  isKotlinFoundation,
  KOTLIN_SOURCES,
  kotlinDeclaredTypesIn,
  kotlinFixturesIn,
  renderingsIn,
  type KotlinSources,
} from './kotlin'
import { RECIPE_NUMBERS, RECIPES } from './recipes'

/**
 * The generator's reads and writes, kept apart from the generator so that
 * `contracts.ts` stays a function of what it is handed: the registry, the
 * states fixtures' names and the icon roles' SF Symbols.
 */

/**
 * Every file ending in `extension` under `dir` (relative to the root), by path
 * relative to `dir`, in path order. A subdirectory named in `skip` is left out.
 */
function readTree(
  root: string,
  dir: string,
  extension: string,
  skip: readonly string[] = [],
): Record<string, string> {
  const base = resolve(root, dir)
  const sources: Record<string, string> = {}
  const walk = (relative: string) => {
    for (const entry of readdirSync(resolve(base, relative), { withFileTypes: true })) {
      const path = relative === '' ? entry.name : `${relative}/${entry.name}`
      if (entry.isDirectory()) {
        if (!skip.includes(path)) walk(path)
      } else if (entry.name.endsWith(extension)) {
        sources[path] = readFileSync(resolve(base, path), 'utf8')
      }
    }
  }
  if (existsSync(base)) walk('')
  return Object.fromEntries(
    Object.entries(sources).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  )
}

/**
 * Every Swift file under `dir` (relative to the root), by path relative to
 * `dir`, in path order. A subdirectory named in `skip` is left out.
 */
export function readSwiftTree(
  root: string,
  dir: string,
  skip: readonly string[] = [],
): Record<string, string> {
  return readTree(root, dir, '.swift', skip)
}

/** Every Kotlin file under `dir` (relative to the root), by path relative to `dir`, in path order. */
export function readKotlinTree(root: string, dir: string): Record<string, string> {
  return readTree(root, dir, '.kt')
}

/** The hand-written Swift sources under `Sources/PolymorphUI`: `Generated/` left out. */
export function readSwiftSources(root: string): Record<string, string> {
  return readSwiftTree(root, SOURCES, ['Generated'])
}

/** The member files: every hand-written source but the foundation and its further files. */
export function readMemberSources(root: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(readSwiftSources(root)).filter(([path]) => !isFoundation(path)),
  )
}

/** The token package's sources, relative to the root. */
export const TOKEN_SOURCES = 'platforms/ios/Sources/PolymorphTokens'

/**
 * The `PM…` types the hand-written PolymorphUI sources and the whole of
 * PolymorphTokens declare: the names no generated type may take.
 */
export function readDeclaredTypes(root: string): string[] {
  return declaredTypesIn({
    ...Object.fromEntries(
      Object.entries(readSwiftSources(root)).map(([path, source]) => [`ui/${path}`, source]),
    ),
    ...Object.fromEntries(
      Object.entries(readSwiftTree(root, TOKEN_SOURCES)).map(([path, source]) => [
        `tokens/${path}`,
        source,
      ]),
    ),
  })
}

/** Where the icon roles are decided, relative to the root. */
export const ICONS = 'design/icons.json'

/** Each icon role's `field` in `design/icons.json`; a role without one is left out. */
function readIconField(root: string, field: 'ios' | 'android'): IconSymbols {
  const { roles } = JSON.parse(readFileSync(resolve(root, ICONS), 'utf8')) as {
    roles: Record<string, Record<string, unknown>>
  }
  const symbols: Record<string, string> = {}
  for (const [role, meta] of Object.entries(roles)) {
    const value = meta[field]
    if (typeof value === 'string') symbols[role] = value
  }
  return symbols
}

/**
 * Each icon role's SF Symbol, the `ios` field of its entry in `design/icons.json`.
 * A role without one is left out, and the generator refuses it by name.
 */
export function readIconSymbols(root: string): IconSymbols {
  return readIconField(root, 'ios')
}

/**
 * Each icon role's Material Symbols name, the `android` field of its entry in
 * `design/icons.json`. A role without one is left out, and the Kotlin
 * generator refuses it by name.
 */
export function readMaterialSymbols(root: string): IconSymbols {
  return readIconField(root, 'android')
}

/**
 * Each generated file that is missing, differs from `files`, or is on disk but
 * no longer generated, as a path relative to the root. `generated` is the
 * directory the files belong in: the Swift contracts' unless another is named.
 */
export function staleFiles(
  root: string,
  files: Record<string, string>,
  generated: string = GENERATED,
): string[] {
  const dir = resolve(root, generated)
  const present = existsSync(dir) ? readdirSync(dir) : []
  const stale: string[] = []
  for (const [name, contents] of Object.entries(files)) {
    const path = resolve(dir, name)
    if (!existsSync(path) || readFileSync(path, 'utf8') !== contents)
      stale.push(`${generated}/${name}`)
  }
  for (const name of present) if (!(name in files)) stale.push(`${generated}/${name}`)
  return stale.sort()
}

/**
 * Writes `files` into `generated` (the Swift contracts' `Generated/` unless
 * another is named) and removes what is there and not among them.
 */
export function writeGenerated(
  root: string,
  files: Record<string, string>,
  generated: string = GENERATED,
): void {
  const dir = resolve(root, generated)
  mkdirSync(dir, { recursive: true })
  for (const name of readdirSync(dir)) {
    if (!(name in files)) rmSync(resolve(dir, name), { recursive: true })
  }
  for (const [name, contents] of Object.entries(files)) writeFileSync(resolve(dir, name), contents)
}

/**
 * Where the web declares the types `SHAPES` stands for, relative to the root:
 * the vocabulary, its foundation, and the engine's framework-free conventions
 * (`LayoutPatch`).
 */
export const WEB_SOURCES = ['packages/react-ui/src', 'packages/react/src', 'packages/engine/src']

/** One field of a web interface, as its source writes it. */
export interface WebField {
  name: string
  optional: boolean
  type: string
}

/** The web's exported interfaces and type aliases, by name. */
export interface WebDeclarations {
  interfaces: Record<string, { parameters: string[]; fields: WebField[] }>
  aliases: Record<string, string>
}

/**
 * The exported interfaces and type aliases of the web's sources, read from the
 * text: enough for `contracts.test.ts` to hold each shape in `SHAPES` to the
 * declaration it stands for. A field is one `name?: type` member at the top
 * level of the interface's braces; comments are left out. An interface that
 * extends another of them (`extends CalendarMessages`, `extends
 * Omit<ValueFormat, 'style'>`) has that one's fields first, less the omitted
 * ones and those it declares again, then its own.
 */
export function readWebDeclarations(root: string): WebDeclarations {
  const declarations: WebDeclarations = { interfaces: {}, aliases: {} }
  const bases: Record<string, string> = {}
  for (const dir of WEB_SOURCES) {
    const base = resolve(root, dir)
    const files = (readdirSync(base, { recursive: true }) as string[])
      .filter((file) => /\.tsx?$/.test(file) && !/\.(?:test|states)\.tsx?$/.test(file))
      .sort()
    for (const file of files) {
      const source = readFileSync(resolve(base, file), 'utf8').replace(
        /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
        '',
      )
      for (const match of source.matchAll(
        /export interface (\w+)(?:<([^>]*)>)?(?:\s+extends([^{]*))?\s*\{/g,
      )) {
        const name = match[1] as string
        if (name in declarations.interfaces) continue
        if (match[3] !== undefined) bases[name] = match[3].trim()
        const open = match.index + match[0].length
        declarations.interfaces[name] = {
          parameters: (match[2] ?? '')
            .split(',')
            .map((parameter) => parameter.trim())
            .filter(Boolean),
          fields: interfaceFields(source.slice(open, closingBrace(source, open))),
        }
      }
      for (const match of source.matchAll(/export type (\w+) =[ \t]*([^\n]*)/g)) {
        const name = match[1] as string
        if (!(name in declarations.aliases))
          declarations.aliases[name] = aliasDefinition(
            source,
            match.index + match[0].length - (match[2] as string).length,
          )
      }
    }
  }
  const inherited = (name: string, seen: ReadonlySet<string>): WebField[] => {
    const own = declarations.interfaces[name]?.fields ?? []
    const clause = bases[name]
    if (clause === undefined || seen.has(name)) return own
    const from = topLevel(clause).flatMap((base) => {
      const omit = /^Omit<\s*(\w+)\s*,(.*)>$/.exec(base)
      const parent = omit?.[1] ?? base
      if (!(parent in declarations.interfaces)) return []
      const omitted = new Set(
        [...(omit?.[2] ?? '').matchAll(/['"](\w+)['"]/g)].map((key) => key[1]),
      )
      return inherited(parent, new Set([...seen, name])).filter((field) => !omitted.has(field.name))
    })
    const redeclared = new Set(own.map((field) => field.name))
    return [...from.filter((field) => !redeclared.has(field.name)), ...own]
  }
  for (const name of Object.keys(bases)) {
    const declaration = declarations.interfaces[name]
    if (declaration !== undefined) declaration.fields = inherited(name, new Set())
  }
  return declarations
}

/** A list split at its top-level commas: `A, Omit<B, 'x' | 'y'>` is two entries. */
function topLevel(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of list) {
    if ('(<{['.includes(char)) depth += 1
    if (')>}]'.includes(char)) depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim() !== '') parts.push(current.trim())
  return parts
}

/**
 * The fields a class of a package outside the vocabulary declares, as its type
 * declarations write them: each `readonly name: type` at the top level of
 * `declare class <name> { … }` in the package's `.d.ts` files. The package is
 * the one the web vocabulary installs, which depends on it
 * (`@internationalized/date`'s `CalendarDate`). `undefined` when no declaration
 * file declares the class.
 */
export function readLibraryClass(
  root: string,
  module: string,
  name: string,
): WebField[] | undefined {
  const installed = resolve(root, 'packages/react-ui/node_modules', module)
  if (!existsSync(installed)) return undefined
  const base = realpathSync(installed)
  const files = (readdirSync(base, { recursive: true }) as string[])
    .filter((file) => file.endsWith('.d.ts') && !file.split(/[\\/]/).includes('node_modules'))
    .sort()
  for (const file of files) {
    const source = readFileSync(resolve(base, file), 'utf8').replace(
      /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
      '',
    )
    const match = new RegExp(`declare class ${name}\\b[^{]*\\{`).exec(source)
    if (match === null) continue
    const open = match.index + match[0].length
    return interfaceFields(source.slice(open, closingBrace(source, open)))
  }
  return undefined
}

/**
 * An alias's definition, from its first line: that line, and the lines after it
 * while a bracket the definition opens is still open, so a function type whose
 * parameter is an object written over several lines reads whole, or while the
 * next line starts a union's branch with `|`, so a union written one branch per
 * line (`ChartAnnotation`) reads whole too.
 */
function aliasDefinition(source: string, start: number): string {
  let depth = 0
  let index = start
  for (; index < source.length; index += 1) {
    const char = source[index] as string
    if ('({['.includes(char)) depth += 1
    if (')}]'.includes(char)) depth -= 1
    if (char === '\n' && depth <= 0 && !/^\s*\|/.test(source.slice(index + 1))) break
  }
  return source.slice(start, index).trim()
}

/** The offset of the brace that closes the one opened just before `from`. */
function closingBrace(source: string, from: number): number {
  let depth = 1
  for (let index = from; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return index
  }
  return source.length
}

/** The members of an interface body, split at its top level. */
function interfaceFields(body: string): WebField[] {
  const members: string[] = []
  let depth = 0
  let current = ''
  for (const char of body) {
    if ('({[<'.includes(char)) depth += 1
    if (')}]'.includes(char) || (char === '>' && !current.endsWith('='))) depth -= 1
    if (depth === 0 && (char === '\n' || char === ';')) {
      members.push(current)
      current = ''
    } else {
      current += char
    }
  }
  members.push(current)
  return members
    .map((member) => member.replace(/\s+/g, ' ').trim())
    .map((member) => /^(?:readonly )?(\w+)(\?)?: (.+?)[,;]?$/.exec(member))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({
      name: match[1] as string,
      optional: match[2] === '?',
      type: match[3] as string,
    }))
}

/* -------------------------------------------------------------------------- */
/* Kotlin                                                                     */
/* -------------------------------------------------------------------------- */

/** The hand-written Kotlin sources of the member module: the foundation and the members. */
export function readKotlinSources(root: string): Record<string, string> {
  return readKotlinTree(root, KOTLIN_SOURCES)
}

/** The Kotlin member files: every hand-written source but the foundation and its further files. */
export function readKotlinMemberSources(root: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(readKotlinSources(root)).filter(([path]) => !isKotlinFoundation(path)),
  )
}

/** What the Kotlin member files declare that the generated files list. */
export function readKotlinMembers(root: string): KotlinSources {
  const members = readKotlinMemberSources(root)
  return { fixtures: kotlinFixturesIn(members), renderings: renderingsIn(members) }
}

/** The Kotlin token module's sources, relative to the root: its types and its generated pairings. */
export const KOTLIN_TOKEN_SOURCES = 'platforms/android/tokens/src'

/**
 * The `PM…` names the hand-written Kotlin sources and the whole token module
 * declare: the names no generated type may take, since both are one package
 * apart and an app imports both.
 */
export function readKotlinDeclaredTypes(root: string): string[] {
  return kotlinDeclaredTypesIn({
    ...Object.fromEntries(
      Object.entries(readKotlinSources(root)).map(([path, source]) => [`ui/${path}`, source]),
    ),
    ...Object.fromEntries(
      Object.entries(readKotlinTree(root, KOTLIN_TOKEN_SOURCES)).map(([path, source]) => [
        `tokens/${path}`,
        source,
      ]),
    ),
  })
}

/**
 * The files `RECIPE_NUMBERS` reads, by path under each number's `root`
 * (`packages/recipes/src` unless it names another): the text the generated
 * `PMRecipe` numbers come from.
 */
export function readRecipes(root: string): Record<string, string> {
  const files = new Map<string, string>()
  for (const number of RECIPE_NUMBERS) {
    for (const path of number.recipes) files.set(path, resolve(root, number.root ?? RECIPES, path))
  }
  return Object.fromEntries(
    [...files.keys()].sort().map((path) => [path, readFileSync(files.get(path) as string, 'utf8')]),
  )
}
