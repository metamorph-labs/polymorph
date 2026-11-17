/**
 * ESLint's bundled types cover only ESTree, so the JSX shapes the rules need are
 * declared structurally here. The file also holds the checks for the two rung-4
 * boundaries, shared by every rule that respects the exception ladder
 * (`docs/rules.md`): a `<Bespoke>` zone and a `<ThirdParty>` boundary, read in
 * a Vue template, in Svelte markup and in an Angular template (`<pm-bespoke>`,
 * `<pm-third-party>`) as they are read in JSX. It also holds the check that
 * tells a Solid TSX file from a React one.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import type { Rule } from 'eslint'

import { markupTags, writtenAttribute } from '../markup.js'
import {
  angularLiteral,
  angularSelector,
  componentMetadata,
  isAngularTemplate,
  type AngularElement,
} from './angular'
import { isBareSpecifier, isStylesheet, pathOf } from './specifier'
import { svelteElementName, svelteLiteral, type SvelteElement } from './svelte'
import { importsOf, scriptImports, vueElementName, vueLiteral, type VueElement } from './vue'

export interface JsxName {
  type: string
  name?: string
}

export interface JsxAttribute {
  type: string
  name?: JsxName
  value?: unknown
  parent?: unknown
}

export interface JsxOpeningElement {
  type: string
  name: JsxName
  attributes: JsxAttribute[]
}

export function elementName(opening: JsxOpeningElement): string | null {
  return opening.name.type === 'JSXIdentifier' && opening.name.name ? opening.name.name : null
}

export function hasAttribute(opening: JsxOpeningElement, attrName: string): boolean {
  return opening.attributes.some(
    (attr) => attr.type === 'JSXAttribute' && attr.name?.name === attrName,
  )
}

/** The rung-4 zone. Named here so no rule spells it differently. */
export const BESPOKE_ELEMENT = 'Bespoke'

/**
 * The rung-4 boundary around another library's component. It names the
 * library (`library="leaflet"`), and it lifts less than a zone: what hosting
 * that library needs, and nothing else. It lifts that only in a file that
 * imports a binding from the library it names (`fileDeclares`).
 */
export const THIRD_PARTY_ELEMENT = 'ThirdParty'

type Boundary = typeof BESPOKE_ELEMENT | typeof THIRD_PARTY_ELEMENT

const BOUNDARIES: readonly Boundary[] = [BESPOKE_ELEMENT, THIRD_PARTY_ELEMENT]

const boundaryNamed = (name: string | null): Boundary | null =>
  BOUNDARIES.find((boundary) => boundary === name) ?? null

/**
 * The boundary an element is, in any of the four syntaxes, or `null` for any
 * other node: a JSX element, a tag Vue resolves to the name the script
 * imports (`<bespoke>`, `<Bespoke>`; `vueElementName`), a Svelte component of
 * that name, or the element the member's selector matches in an Angular
 * template (`<pm-bespoke>`, `<pm-third-party>`).
 */
function boundaryOf(node: { type: string }, imports: ReadonlySet<string>): Boundary | null {
  if (node.type === 'JSXElement') {
    const opening = (node as { openingElement?: JsxOpeningElement }).openingElement
    return opening ? boundaryNamed(elementName(opening)) : null
  }
  if (node.type === 'VElement') return boundaryNamed(vueElementName(node as VueElement, imports))
  if (node.type === 'SvelteElement') {
    return (node as SvelteElement).kind === 'component'
      ? boundaryNamed(svelteElementName(node as SvelteElement))
      : null
  }
  if (node.type === 'Element') {
    const name = (node as AngularElement).name
    return BOUNDARIES.find((boundary) => name === angularSelector(boundary)) ?? null
  }
  return null
}

/**
 * True when `node` is lexically inside a `<Bespoke>` element, the declared
 * rung-4 exception boundary. The inventory (`pnpm inventory`) lists these.
 */
export function insideBespoke(context: Rule.RuleContext, node: Rule.Node): boolean {
  const imports = importsOf(context)
  return context.sourceCode
    .getAncestors(node)
    .some((ancestor) => boundaryOf(ancestor, imports) === BESPOKE_ELEMENT)
}

/**
 * True when `node` is lexically inside a `<ThirdParty>` element that hosts its
 * library (`ThirdPartyBoundary.hosts`). A boundary that hosts nothing lifts
 * nothing, so what it holds is read as if the boundary were not there. The
 * inventory lists the boundaries with the library each names.
 */
export function insideThirdParty(context: Rule.RuleContext, node: Rule.Node): boolean {
  const { hosting } = fileDeclares(context)
  return context.sourceCode.getAncestors(node).some((ancestor) => hosting.has(ancestor))
}

/** The text a JSX attribute writes out: `library="leaflet"`, `library={'leaflet'}`. */
function jsxLiteral(opening: JsxOpeningElement, name: string): string | null {
  const attribute = opening.attributes.find(
    (candidate) => candidate.type === 'JSXAttribute' && candidate.name?.name === name,
  )
  let value = attribute?.value as { type: string; [key: string]: unknown } | null | undefined
  if (value?.type === 'JSXExpressionContainer') {
    value = value['expression'] as { type: string; [key: string]: unknown }
  }
  if (value?.type === 'Literal') {
    return typeof value['value'] === 'string' ? value['value'] : null
  }
  if (value?.type === 'TemplateLiteral' && (value['expressions'] as unknown[]).length === 0) {
    const [quasi] = value['quasis'] as { value: { cooked: string } }[]
    return quasi?.value.cooked ?? null
  }
  return null
}

/**
 * The library a `<ThirdParty>` element names, when it writes the name out. A
 * computed name is one no rule can compare with the file's imports, so it is
 * read as no name.
 */
function libraryOf(node: { type: string }): string | null {
  const written =
    node.type === 'JSXElement'
      ? jsxLiteral(
          (node as unknown as { openingElement: JsxOpeningElement }).openingElement,
          'library',
        )
      : node.type === 'VElement'
        ? vueLiteral(node as VueElement, 'library')
        : node.type === 'SvelteElement'
          ? svelteLiteral(node as SvelteElement, 'library')
          : angularLiteral(node as AngularElement, 'library')
  const library = written?.trim() ?? ''
  return library === '' ? null : library
}

export interface AstNode {
  type: string
  [key: string]: unknown
}

/**
 * An Angular component that lists `Bespoke` in its `imports`, the only way its
 * template can match `<pm-bespoke>`. The component's template is linted as a
 * file of its own, so the module that holds the import bans reads the zone
 * from the component's metadata.
 */
function importsBespoke(node: AstNode): boolean {
  const imports = componentMetadata(node as Parameters<typeof componentMetadata>[0])?.get('imports')
  const list = imports?.value
  if (list?.type !== 'ArrayExpression') return false
  return (list['elements'] as ({ type: string; name?: string } | null)[]).some(
    (element) => element?.type === 'Identifier' && element.name === BESPOKE_ELEMENT,
  )
}

/**
 * One `<ThirdParty>` a file writes: an element of the tree a rule walks, or a
 * tag in the template of an Angular component the file declares.
 */
export interface ThirdPartyBoundary {
  /** The name its `library` attribute writes out, or `null` when it writes none out. */
  library: string | null
  /** Whether it lifts anything (`fileDeclares`). */
  hosts: boolean
  /** The element, for a boundary in the tree. */
  node: AstNode | null
  /**
   * For a tag in an Angular component's template, read from the module: the
   * metadata property that holds the template or names its file.
   */
  property: AstNode | null
  /**
   * Where that tag is in the module's text, when the template is inline and
   * written with no escape, so its text is the module's own.
   */
  range: [number, number] | null
}

/** The file a tree is read from: its path, and its text. */
interface Source {
  filename: string
  text: string
}

/**
 * The `<pm-third-party>` tags of an Angular component's own template. The
 * template is linted as a file of its own, so the module that holds the
 * imports reads the boundaries from the component's metadata: an inline
 * `template`, or the file `templateUrl` names. Each tag is read attribute by
 * attribute (`markup.js`), as the template parser reads it, so only a `library`
 * attribute written out names a library: a `data-library`, a bound
 * `[library]` and the word inside a `reason` do not. A tag in a comment is
 * none.
 */
function templateBoundaries(node: AstNode, source: Source): ThirdPartyBoundary[] {
  const metadata = componentMetadata(node as Parameters<typeof componentMetadata>[0])
  if (!metadata) return []
  const written = (value: AstNode | undefined): string | null => {
    if (value?.type === 'Literal') return typeof value['value'] === 'string' ? value['value'] : null
    if (value?.type === 'TemplateLiteral' && (value['expressions'] as unknown[]).length === 0) {
      const [quasi] = value['quasis'] as { value: { cooked: string } }[]
      return quasi?.value.cooked ?? null
    }
    return null
  }
  const inline = metadata.get('template')
  const named = metadata.get('templateUrl')
  let template = written(inline?.value)
  let property = inline as AstNode | undefined
  // Where the template's text starts in the module, inside its quotes.
  let start: number | null = null
  if (template !== null) {
    const [from, to] = (inline?.value as { range?: [number, number] }).range ?? [0, 0]
    if (source.text.slice(from + 1, to - 1) === template) start = from + 1
  } else {
    const url = written(named?.value)
    if (url === null) return []
    property = named as AstNode | undefined
    try {
      template = readFileSync(resolve(dirname(source.filename), url), 'utf8')
    } catch {
      return []
    }
  }
  const selector = angularSelector(THIRD_PARTY_ELEMENT)
  return markupTags(template).flatMap((tag) => {
    if (tag.close || tag.name !== selector) return []
    const library = writtenAttribute(tag, 'library', 'angular')?.trim() ?? ''
    return [
      {
        library: library === '' ? null : library,
        hosts: false,
        node: null,
        property: property ?? null,
        range: start === null ? null : [start + tag.start, start + tag.end],
      },
    ]
  })
}

/**
 * The module a statement imports a binding from, without its `?query`, or
 * `null`. A binding is a value the file can use: a default, a name, a
 * namespace, what `import()` resolves to, or what TypeScript's
 * `import L = require('leaflet')` names. An import for its side effect brings
 * none in, a type is gone before the code runs, and a re-export hands the
 * module on without using it. A stylesheet's default export is its text or
 * its class names, not the library, so a stylesheet is never one.
 */
function bindingSource(node: AstNode): string | null {
  let source: unknown = null
  if (node.type === 'ImportDeclaration') {
    if (node['importKind'] === 'type') return null
    const specifiers = (node['specifiers'] ?? []) as { importKind?: string }[]
    if (!specifiers.some((specifier) => specifier.importKind !== 'type')) return null
    source = (node['source'] as { value?: unknown }).value
  } else if (node.type === 'ImportExpression') {
    const written = node['source'] as AstNode
    source = written.type === 'Literal' ? written['value'] : null
  } else if (node.type === 'TSImportEqualsDeclaration') {
    if (node['importKind'] === 'type') return null
    const reference = node['moduleReference'] as AstNode
    const written =
      reference.type === 'TSExternalModuleReference' ? (reference['expression'] as AstNode) : null
    source = written?.type === 'Literal' ? written['value'] : null
  }
  if (typeof source !== 'string' || isStylesheet(source)) return null
  return pathOf(source)
}

/** What one walk finds: the zone, every boundary, and the modules bindings come from. */
interface Found {
  bespoke: boolean
  boundaries: ThirdPartyBoundary[]
  bindings: string[]
}

/** What a file declares at rung 4: whether it holds a zone, and its boundaries. */
interface Declared {
  bespoke: boolean
  /** Every `<ThirdParty>` the file writes, hosting or not. */
  boundaries: readonly ThirdPartyBoundary[]
  /** The elements of the boundaries that host. */
  hosting: WeakSet<object>
  /** The libraries the hosting boundaries name, as written. */
  libraries: readonly string[]
  /** The modules the file imports a binding from (`bindingSource`). */
  bindings: readonly string[]
}

/**
 * Reads the tree for real `<Bespoke>` and `<ThirdParty>` tags, paired or
 * self-closing.
 *
 * This is an AST walk, not a text match. `<Bespoke` in a comment or a string
 * literal is text about the ladder. If text could exempt a file, the inventory
 * could not see the exception, and an undeclared exception is the only kind
 * this system forbids.
 */
function readDeclared(
  root: AstNode,
  visitorKeys: Record<string, string[]>,
  imports: ReadonlySet<string>,
  source: Source,
  into: Found,
  seen: Set<AstNode>,
): void {
  const pending: AstNode[] = [root]
  while (pending.length > 0) {
    const node = pending.pop() as AstNode
    // A Vue template is walked by itself, and a parser's keys may reach it too.
    if (seen.has(node)) continue
    seen.add(node)
    const boundary = boundaryOf(node, imports)
    if (boundary === BESPOKE_ELEMENT || importsBespoke(node)) into.bespoke = true
    if (boundary === THIRD_PARTY_ELEMENT) {
      into.boundaries.push({
        library: libraryOf(node),
        hosts: false,
        node,
        property: null,
        range: null,
      })
    }
    into.boundaries.push(...templateBoundaries(node, source))
    const binding = bindingSource(node)
    if (binding !== null) into.bindings.push(binding)
    // Unknown node types fall back to every own key. `parent` is skipped
    // because that back-reference would make the walk loop.
    for (const key of visitorKeys[node.type] ?? Object.keys(node)) {
      if (key === 'parent') continue
      const value = node[key]
      for (const child of Array.isArray(value) ? value : [value]) {
        if (child && typeof (child as AstNode).type === 'string') pending.push(child as AstNode)
      }
    }
  }
}

/**
 * The keys a template walk follows: elements, their tags and attributes, and
 * the expressions inside them. Back-references (`parent`) and the parser's
 * scope records (`variables`, `references`) are left out.
 */
const TEMPLATE_KEYS: Record<string, string[]> = {
  VElement: ['startTag', 'children'],
  VStartTag: ['attributes'],
  VAttribute: ['value'],
  VExpressionContainer: [],
  VText: [],
  VLiteral: [],
}

/**
 * The packages each web framework ships as its runtime: the module its
 * components, its reactivity and its renderer are imported from. Angular's
 * are the packages of the framework's own repository. A component library
 * published in a framework's scope (`@angular/cdk`, `@angular/material`,
 * `@angular/google-maps`) is not one of them, and neither is a router or a
 * meta-framework published apart from the framework (`vue-router`, `next`).
 */
const FRAMEWORK_RUNTIMES: ReadonlySet<string> = new Set([
  'react',
  'react-dom',
  'vue',
  '@vue/runtime-core',
  '@vue/runtime-dom',
  '@vue/reactivity',
  '@vue/shared',
  '@vue/server-renderer',
  'svelte',
  'solid-js',
  '@angular/core',
  '@angular/common',
  '@angular/compiler',
  '@angular/forms',
  '@angular/router',
  '@angular/animations',
  '@angular/platform-browser',
  '@angular/platform-browser-dynamic',
  '@angular/platform-server',
  '@angular/elements',
  '@angular/service-worker',
  '@angular/localize',
  '@angular/upgrade',
])

/**
 * Whether `library` names a package no boundary can host: one of polymorph's
 * own (`@polymorph/*`), or a framework's runtime (`FRAMEWORK_RUNTIMES`), at
 * the package or any path inside it (`react-dom/client`, `svelte/store`).
 *
 * A boundary hosts what the file imports a binding from, and a file imports
 * these whether it hosts anything or not: the import of `ThirdParty` is itself
 * a binding from the vocabulary, and a component is written with its
 * framework. A boundary that named one would host in every file, which is a
 * zone for `style`, a class and a length with a library's name on it. None of
 * them is another library's component either.
 */
export function ownPackage(library: string): 'polymorph' | 'framework' | null {
  const name = packageOf(library).toLowerCase()
  if (name.startsWith('@polymorph/')) return 'polymorph'
  return FRAMEWORK_RUNTIMES.has(name) ? 'framework' : null
}

/** One result per file, so every rule that asks reuses the same walk. */
const declared = new WeakMap<object, Declared>()

/**
 * What the file declares at rung 4, and which of its boundaries host.
 *
 * A boundary hosts when its `library` is written out, names an npm package
 * that is not polymorph's or a framework's own (`ownPackage`), and the file
 * imports a binding from it: from that specifier, or from a path inside it
 * (`chart.js/auto` under `chart.js`). The import is what ties the name to
 * code. Without it a boundary could name any package, or none that exists, and
 * lift the bans for whatever it wraps, and the inventory would list a library
 * the file does not use. A wrapper's own package is another package:
 * `react-leaflet` brings no binding from `leaflet`.
 *
 * An Angular template is a program of its own and sees no import, so there a
 * boundary hosts when it names a package a boundary can host, and the module
 * that declares the component reads the same tag beside its imports
 * (`templateBoundaries`). The rule that reports a boundary that hosts nothing
 * (`no-raw-styles`) reports the missing import on the module.
 */
function fileDeclares(context: Rule.RuleContext): Declared {
  const ast = context.sourceCode.ast as unknown as AstNode
  const cached = declared.get(ast)
  if (cached !== undefined) return cached
  // A Vue file's template is not part of the program ESLint walks; the parser
  // hangs it on the program as `templateBody`. Svelte markup is part of the
  // program, and the parser's visitor keys reach it.
  const template = ast['templateBody'] as AstNode | null | undefined
  // A tag in the template resolves against what the program imports.
  const imports = scriptImports(ast as { body?: unknown[] })
  const source: Source = { filename: context.filename, text: context.sourceCode.text }
  const found: Found = { bespoke: false, boundaries: [], bindings: [] }
  const seen = new Set<AstNode>()
  readDeclared(ast, context.sourceCode.visitorKeys, imports, source, found, seen)
  if (template != null) readDeclared(template, TEMPLATE_KEYS, imports, source, found, seen)

  const sightless = isAngularTemplate(context)
  const hosting = new WeakSet<object>()
  const libraries: string[] = []
  for (const boundary of found.boundaries) {
    const library = boundary.library
    if (library === null || !isPackageSpecifier(library)) continue
    if (ownPackage(library) !== null) continue
    const bound = found.bindings.some(
      (binding) => binding === library || binding.startsWith(`${library}/`),
    )
    if (!sightless && !bound) continue
    boundary.hosts = true
    libraries.push(library)
    if (boundary.node !== null) hosting.add(boundary.node)
  }
  const result: Declared = {
    bespoke: found.bespoke,
    boundaries: found.boundaries,
    hosting,
    libraries,
    bindings: found.bindings,
  }
  declared.set(ast, result)
  return result
}

/**
 * Import bans apply per file, because an import cannot be scoped to an element.
 * A file that declares a `<Bespoke>` zone is therefore exempt as a whole. The
 * zone is still declared and listed in the inventory.
 */
export function fileDeclaresBespoke(context: Rule.RuleContext): boolean {
  return fileDeclares(context).bespoke
}

/**
 * The libraries the file hosts: the names of its `<ThirdParty>` boundaries
 * that host, as written. Empty for a file with none.
 */
export function hostedLibraries(context: Rule.RuleContext): readonly string[] {
  return fileDeclares(context).libraries
}

/** Every `<ThirdParty>` the file writes, with whether each hosts. */
export function thirdPartyBoundaries(context: Rule.RuleContext): readonly ThirdPartyBoundary[] {
  return fileDeclares(context).boundaries
}

/**
 * Whether the file imports a binding from the package a specifier is inside:
 * `leaflet` for `leaflet/dist/leaflet.css`. The stylesheet of such a package
 * can be lifted, by a boundary that names it.
 */
export function importsBindingFrom(context: Rule.RuleContext, source: string): boolean {
  const imported = packageOf(source)
  return fileDeclares(context).bindings.some((binding) => packageOf(binding) === imported)
}

/**
 * A specifier spelled as an npm package name: `leaflet`, `@tiptap/react/menus`.
 * An alias no package name can spell is not one (`@/styles/app.css`,
 * `~/styles.css`, `$lib/app.css`), so a stylesheet behind it is never read as
 * a library's. An alias spelled as a package name (`styles/app.css`) cannot be
 * told from a package here. A boundary hosts only what the file imports a
 * binding from (`fileDeclares`), which a stylesheet alone never gives.
 */
export function isPackageSpecifier(source: string): boolean {
  return (
    isBareSpecifier(source) &&
    /^(@[a-z0-9-][a-z0-9-._]*\/)?[a-z0-9-][a-z0-9-._]*(\/|$)/i.test(source)
  )
}

/** `leaflet/dist/leaflet.css` is `leaflet`; `@tiptap/react/menus` is `@tiptap/react`. */
export function packageOf(source: string): string {
  const [first = '', second] = source.split('/')
  return first.startsWith('@') && second !== undefined ? `${first}/${second}` : first
}

/**
 * Whether a stylesheet is the one of a library the file hosts: of the package
 * a hosting `<ThirdParty>` names, at any path inside it
 * (`leaflet/dist/leaflet.css`). An import cannot be scoped to an element, so
 * the file that declares the boundary is where the library's stylesheet may be
 * imported.
 *
 * Another package of the same npm scope is another library. A scope is a
 * publisher's namespace, not one library published in parts:
 * `@angular/google-maps` does not host `@angular/material`.
 */
export function importsHostedLibrary(context: Rule.RuleContext, source: string): boolean {
  if (!isPackageSpecifier(source)) return false
  const imported = packageOf(source)
  return hostedLibraries(context).some(
    (library) => isPackageSpecifier(library) && packageOf(library) === imported,
  )
}

/**
 * Whether a hosting boundary names `banned`, an entry of a rule's banned list,
 * exactly as the list writes it. A ban is lifted for the one package the boundary
 * declares and for nothing near it: not a sibling in its scope
 * (`@swimlane/ngx-charts` beside `@swimlane/ngx-datatable`). A framework's
 * own motion modules (`svelte/transition`, `@angular/animations`) are never
 * lifted, because no boundary hosts a framework's runtime (`ownPackage`).
 */
export function hostsBanned(context: Rule.RuleContext, banned: string): boolean {
  return hostedLibraries(context).includes(banned)
}

/** The boundary that hosts `library`, as every message names it. */
export const thirdPartySpan = (library: string): string =>
  `\`<${THIRD_PARTY_ELEMENT} library="${library}" reason="…">\``

/**
 * The modules whose import makes a TSX file Solid: the framework itself, any
 * of its subpaths (`solid-js/web`), and polymorph's Solid foundation and
 * vocabulary.
 */
export const SOLID_MODULES = ['solid-js', '@polymorph/solid', '@polymorph/solid-ui']

/** One answer per file, so every rule that asks reuses the same read. */
const solidByProgram = new WeakMap<object, boolean>()

/**
 * Whether a TSX file is Solid rather than React. Both write JSX, so the file
 * says which: the config's settings (`settings: { polymorph: { framework:
 * 'solid' } }`, which a Solid app's config sets for every file), or an import
 * from `SOLID_MODULES`. A file that does neither is read as React.
 */
export function isSolidFile(context: Rule.RuleContext): boolean {
  const settings = (context.settings as { polymorph?: { framework?: unknown } } | undefined)
    ?.polymorph
  if (settings?.framework === 'solid') return true
  const program = context.sourceCode.ast as unknown as { body?: unknown[] }
  const cached = solidByProgram.get(program)
  if (cached !== undefined) return cached
  const solid = (program.body ?? []).some((statement) => {
    const node = statement as { type: string; source?: { value?: unknown } }
    if (node.type !== 'ImportDeclaration') return false
    const source = String(node.source?.value)
    return SOLID_MODULES.some((module) => source === module || source.startsWith(`${module}/`))
  })
  solidByProgram.set(program, solid)
  return solid
}
