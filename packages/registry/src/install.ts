import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

import { PREPAINT_SCRIPT } from '@polymorph/theme'
import ts from 'typescript'

import {
  FRAMEWORK_FOUNDATION,
  FRAMEWORK_NAMES,
  FRAMEWORK_VOCABULARY,
  frameworkFile,
  type FrameworkShell,
  type MappedFramework,
} from './frameworks'

/**
 * What an install needs, published here instead of left to the installer.
 *
 * The architecture rule is "one canonical registry, three thin fronts —
 * adapters never become sources of truth". A CLI that computed its own file
 * closure would give a second answer to "what is Button made of". If the two
 * answers disagreed, the registry would look wrong. So the closure is computed
 * here, next to the import graph it comes from, and `polymorph add` copies the
 * list it receives.
 *
 * Three facts live here. Without them the installer would have to invent each:
 *
 *  - the **file** closure. It is a strictly larger graph than the component
 *    closure that `vocabulary.ts` walks. Button depends on no other component
 *    but still cannot be copied alone, because its stylesheet composes the
 *    focus ring and the motion conventions from two files that belong to no
 *    component.
 *  - the **version ranges** for the external packages a component imports, so
 *    an install can write a `package.json` instead of a list of things to add.
 *    React's are read from the React manifests and each other framework's
 *    from its own, because the frameworks can range one package differently.
 *  - the **fonts** a system needs. Without them a theme installs and then
 *    renders in Times New Roman.
 *
 * The Vue, Svelte, Solid and Angular vocabularies are read the same way, each from its
 * own generated tree (`readShells` below), so an install of a Vue member copies
 * the files that member is made of in Vue, not a translation of the React
 * closure. The elements vocabulary is read from its tree too, and an install of
 * one of its members copies nothing: a page loads every element from the files
 * `polymorph init` copies (`NO_BUILD_FILES`).
 */

/** The vendorable tree. The `vendorable-imports` rule ensures no import leaves it. */
const VENDOR_ROOT = 'packages/react-ui/src'

/**
 * The recipes: the package a member imports its stylesheet from, and the tree
 * that package's specifiers name.
 *
 * A recipe has no framework in it, so it lives in its own package and every
 * framework's members import the same file:
 * `import styles from '@polymorph/recipes/controls/button.module.css'`. The
 * path after the package name is the file's path under `RECIPES_ROOT`, and it
 * is also the member's directory under `VENDOR_ROOT`. An install therefore
 * copies a recipe beside its member, and the import becomes the relative path
 * (`./button.module.css`), so a vendored copy needs no `@polymorph/recipes`.
 */
export const RECIPES_PACKAGE = '@polymorph/recipes'
export const RECIPES_ROOT = 'packages/recipes/src'

/**
 * The repo-relative file a recipe specifier names, or `null` for any other
 * specifier. A query such as `?raw` is not part of the path.
 *
 * `@polymorph/recipes/controls/button.module.css` ->
 * `packages/recipes/src/controls/button.module.css`.
 */
export function recipeFile(specifier: string): string | null {
  if (!specifier.startsWith(`${RECIPES_PACKAGE}/`)) return null
  return `${RECIPES_ROOT}/${specifier.slice(RECIPES_PACKAGE.length + 1).replace(/\?.*$/, '')}`
}

/* -------------------------------------------------------------------------- */
/* The file closure                                                           */
/* -------------------------------------------------------------------------- */

const TS_EXTENSIONS = ['.tsx', '.ts', '/index.ts', '/index.tsx']

/**
 * `composes: x y from './z.module.css'`, the second import graph.
 *
 * A CSS Modules `composes` acts as an import here. The class does not exist
 * without the file it names. A vendored stylesheet whose composed file is
 * missing fails at build time in the consumer's repository, not in this one.
 * The vocabulary's CSS has no `@import` and no `url()`, which
 * `registry.test.ts` asserts, so this stays a one-pattern reader instead of a
 * CSS parser.
 */
const COMPOSES = /composes:[^;]*?\bfrom\s+['"]([^'"]+)['"]/g

/**
 * A single-file component's script blocks, which hold every import it makes: a
 * Vue component's `<script setup>`, and a Svelte component's `<script module>`
 * and `<script>`.
 */
const SCRIPT_BLOCK = /<script\b[^>]*>([\s\S]*?)<\/script>/g

/** Whether a file is a single-file component, whose imports are in its script blocks. */
const isComponentFile = (file: string): boolean => /\.(vue|svelte)$/.test(file)

/** The text of a file that TypeScript reads: a module, or a component's scripts. */
function scriptOf(file: string, source: string): string {
  if (!isComponentFile(file)) return source
  return [...source.matchAll(SCRIPT_BLOCK)].map((match) => match[1] as string).join('\n')
}

/** A file, parsed as TypeScript: a component's scripts are read as one module. */
const sourceFileOf = (file: string, source: string): ts.SourceFile =>
  ts.createSourceFile(
    isComponentFile(file) ? `${file}.ts` : file,
    scriptOf(file, source),
    ts.ScriptTarget.Latest,
    true,
  )

/** Every module specifier a file imports or re-exports. */
function specifiersOf(file: string, source: string): string[] {
  const parsed = sourceFileOf(file, source)
  const found: string[] = []
  for (const statement of parsed.statements) {
    if (
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      found.push(statement.moduleSpecifier.text)
    }
  }
  return found
}

function resolveTsPath(from: string, specifier: string): string | null {
  const base = resolve(dirname(from), specifier)
  for (const extension of TS_EXTENSIONS) {
    if (existsSync(base + extension)) return base + extension
  }
  return existsSync(base) ? base : null
}

/**
 * The specifiers whose files are copied with this one: relative ones, and a
 * member's recipe. Any other bare specifier is a package, and packages are not
 * vendored. A single-file component's edges are its scripts' imports.
 */
function copiedEdges(file: string, source: string): string[] {
  if (file.endsWith('.css')) {
    return [...source.matchAll(COMPOSES)]
      .map((match) => match[1] as string)
      .filter((specifier) => specifier.startsWith('.'))
  }
  return specifiersOf(file, source).filter(
    (specifier) => specifier.startsWith('.') || recipeFile(specifier) !== null,
  )
}

/**
 * Every file that must be copied with `seeds`, transitively, repo-relative.
 *
 * The walk stops at the first bare specifier other than a recipe. That is why
 * the packaging boundary exists. A component reaches the theme engine, the
 * motion engine and the icon gateway through its framework's foundation
 * (`@polymorph/react` in React), so the relative graph plus the recipes *is*
 * the vendorable set and nothing has to be excluded by name. If that stops
 * being true, the walk leaves its trees and throws, naming them. In the React
 * tree that is the same fault `vendorable-imports` reports as a lint error,
 * raised again where an installer would hit it. The rule reads only
 * `packages/react-ui/src`, so for another framework's tree this throw is the
 * only report.
 *
 * `trees` are the vendorable trees. The default is the React vocabulary's and
 * the recipes'; a Vue, Svelte, Solid or Angular member's closure is walked in
 * its framework's tree and the recipes' (`FRAMEWORK_TREES`).
 */
export function fileClosure(
  root: string,
  seeds: string[],
  trees: readonly string[] = [VENDOR_ROOT, RECIPES_ROOT],
): string[] {
  const found = new Set<string>()
  const absolute = trees.map((tree) => resolve(root, tree))

  const walk = (file: string): void => {
    const path = relative(root, file)
    if (found.has(path)) return

    if (absolute.every((tree) => relative(tree, file).startsWith('..'))) {
      throw new Error(
        `registry: ${path} is reachable by a relative import but sits outside ` +
          `${trees.join(' and ')} — it cannot be vendored` +
          (trees.includes(VENDOR_ROOT)
            ? ', and polymorph/vendorable-imports should have said so first'
            : ''),
      )
    }

    found.add(path)
    const source = readFileSync(file, 'utf8')
    for (const specifier of copiedEdges(file, source)) {
      const recipe = recipeFile(specifier)
      const target =
        recipe !== null
          ? resolve(root, recipe)
          : specifier.endsWith('.css')
            ? resolve(dirname(file), specifier)
            : resolveTsPath(file, specifier)
      if (target !== null && existsSync(target)) walk(target)
    }
  }

  for (const seed of seeds) walk(resolve(root, seed))
  return [...found].sort()
}

/* -------------------------------------------------------------------------- */
/* The framework vocabularies                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Where a framework's vocabulary is read from. `pnpm shells` generates each
 * tree from the members' descriptions (`docs/shells.md`): a member's
 * component, the compound parts its index attaches to it (`TabsContent.vue`
 * is `Tabs.Content`), its states fixture, the entry that exports them, and the
 * list of fixtures.
 */
export interface FrameworkTree {
  /** The tree an install of its members copies from, and rebases as `VENDOR_ROOT` is rebased. */
  root: string
  /** The entry that exports every member. */
  index: string
  /** The module that imports every states fixture. */
  galleries: string
  /** The CSS Modules declaration a vendored member needs, as the React tree's `css-modules.d.ts`. */
  support: string[]
  /**
   * The framework itself: always present and never installed, because it is a
   * peer of its vocabulary and of the app that installs it, as React is of the
   * React vocabulary.
   */
  ambient: string
}

const frameworkTree = (root: string, ambient: string): FrameworkTree => ({
  root,
  index: `${root}/index.ts`,
  galleries: `${root}/galleries.ts`,
  support: [`${root}/css-modules.d.ts`],
  ambient,
})

/**
 * Each framework's tree. A Vue member is a `.vue` file, a Svelte member a
 * `.svelte` file whose types are in its `<script module>`, a Solid member the
 * default export of a `.tsx` module, and an Angular member a standalone
 * component class exported by name from a `.ts` module. An element is the
 * `Poly<Member>` class a `.ts` definition module exports, over the Solid
 * member. Nothing in the elements tree is vendored, so it has no support file.
 */
export const FRAMEWORK_TREES: Readonly<Record<MappedFramework, FrameworkTree>> = {
  vue: frameworkTree('packages/vue-ui/src', 'vue'),
  svelte: frameworkTree('packages/svelte-ui/src', 'svelte'),
  solid: frameworkTree('packages/solid-ui/src', 'solid-js'),
  angular: frameworkTree('packages/angular-ui/src', '@angular/core'),
  elements: { ...frameworkTree('packages/elements-ui/src', 'solid-js'), support: [] },
}

/**
 * The files a page with no build loads the elements from, and the command
 * that builds them in a checkout.
 *
 * `pnpm build:packages` writes them into `dist/cdn/` of `@polymorph/elements-ui`:
 * `polymorph.js`, which defines every tag and loads each member's chunk the
 * first time one of its elements connects, the chunks, `polymorph-all.js`,
 * `polymorph.css`, `prepaint.js` and a theme stylesheet per house system
 * (`themes/<system>.css`). No public URL serves them, because the packages are
 * published to a restricted registry, so `polymorph init --framework elements`
 * copies them into the app. The directory is a build output and is absent from
 * a checkout that has not built it.
 */
export const NO_BUILD_FILES = {
  dir: 'packages/elements-ui/dist/cdn',
  build: 'pnpm build:packages',
} as const

/** The prefix of the class each element's definition module exports: `PolyButton`. */
const ELEMENT_CLASS = /^Poly(?=[A-Z])/

/** One export of a framework vocabulary's entry. */
interface VocabularyExport {
  origin: 'installed' | 'vendored'
  sources: string[]
}

/** The repo-relative path a relative specifier in `from` names, with its extension. */
function relativeFile(root: string, from: string, specifier: string): string {
  const target = resolveTsPath(resolve(root, from), specifier)
  if (target === null) {
    throw new Error(`registry: ${from} imports ${specifier}, and no file answers it`)
  }
  return relative(root, target)
}

const parse = (root: string, file: string): ts.SourceFile =>
  sourceFileOf(file, readFileSync(resolve(root, file), 'utf8'))

/**
 * Each name a framework's vocabulary exports, with where it comes from.
 *
 * `export { default as Button } from './controls/Button.vue'` is one source.
 * `export const Tabs = Object.assign(TabsRoot, { Content: TabsContent })` is
 * the member and every part it attaches, in that order. `export { Icon } from
 * '@polymorph/vue'` is a member the foundation ships. Type-only exports name
 * no member and are skipped. The Svelte and Solid entries are written the same
 * way, with `.svelte` files and extensionless `.tsx` modules.
 */
function vocabularyExports(root: string, tree: FrameworkTree): Map<string, VocabularyExport> {
  const index = parse(root, tree.index)
  const defaults = new Map<string, string>()
  const exported = new Map<string, VocabularyExport>()

  for (const statement of index.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.startsWith('.') &&
      statement.importClause?.name !== undefined &&
      !statement.importClause.isTypeOnly
    ) {
      defaults.set(
        statement.importClause.name.text,
        relativeFile(root, tree.index, statement.moduleSpecifier.text),
      )
    }
  }

  for (const statement of index.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly || !statement.moduleSpecifier) continue
      if (!ts.isStringLiteral(statement.moduleSpecifier)) continue
      if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue
      const specifier = statement.moduleSpecifier.text
      for (const element of statement.exportClause.elements) {
        if (element.isTypeOnly) continue
        exported.set(
          element.name.text,
          specifier.startsWith('.')
            ? { origin: 'vendored', sources: [relativeFile(root, tree.index, specifier)] }
            : { origin: 'installed', sources: [] },
        )
      }
    } else if (
      ts.isVariableStatement(statement) &&
      statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) continue
        const sources: string[] = []
        const visit = (node: ts.Node): void => {
          const file = ts.isIdentifier(node) ? defaults.get(node.text) : undefined
          if (file !== undefined && !sources.includes(file)) sources.push(file)
          ts.forEachChild(node, visit)
        }
        visit(declaration.initializer)
        if (sources.length > 0) exported.set(declaration.name.text, { origin: 'vendored', sources })
      }
    }
  }
  return exported
}

/**
 * Each member's states fixture in a framework's tree, by the member it names.
 * The gallery list imports every fixture, and a fixture names its member in
 * its `component`. A Svelte fixture is a component, read from its scripts.
 */
function vocabularyFixtures(root: string, tree: FrameworkTree): Map<string, string> {
  const fixtures = new Map<string, string>()
  for (const statement of parse(root, tree.galleries).statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue
    }
    const specifier = statement.moduleSpecifier.text
    if (!specifier.startsWith('.')) continue
    const file = relativeFile(root, tree.galleries, specifier)
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAssignment(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === 'component' &&
        ts.isStringLiteral(node.initializer)
      ) {
        fixtures.set(node.initializer.text, file)
        return
      }
      ts.forEachChild(node, visit)
    }
    visit(parse(root, file))
  }
  return fixtures
}

/** `@zag-js/vue` -> `@zag-js/vue`, `@polymorph/vue/motion` -> `@polymorph/vue`. */
const packageOf = (specifier: string): string =>
  specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/')

/** The packages a set of files imports, without the recipes and the framework itself. */
function packagesImported(root: string, files: readonly string[], ambient: string): string[] {
  const packages = new Set<string>()
  for (const file of files) {
    if (file.endsWith('.css') || file.endsWith('.d.ts')) continue
    const source = readFileSync(resolve(root, file), 'utf8')
    for (const specifier of specifiersOf(file, source)) {
      if (specifier.startsWith('.') || recipeFile(specifier) !== null) continue
      const name = packageOf(specifier)
      if (name !== ambient) packages.add(name)
    }
  }
  return [...packages].sort()
}

/**
 * What an install of each named member copies in a framework, read from that
 * framework's generated tree, and the members that install brings with it.
 *
 * `names` are the members the framework's map marks native. Each must be one
 * its vocabulary exports, or the map and the tree disagree and this throws. A
 * member's files are the closure of its sources and its fixture, walked in the
 * framework's tree and the recipes' as the React closure is walked in the
 * React tree, so a part its index attaches comes with it and a member only the
 * React member composes does not.
 *
 * `brings` is, for each member, every other member whose file the closure
 * copies, its fixture's included: the composition clause of the framework
 * map's law reads it (`frameworkFaults`).
 */
export function readShells(
  root: string,
  framework: MappedFramework,
  names: readonly string[],
): { shells: Map<string, FrameworkShell>; brings: Record<string, string[]> } {
  const tree = FRAMEWORK_TREES[framework]
  const elements = framework === 'elements'
  const read = vocabularyExports(root, tree)
  // An element's class is the member's name after `Poly` (`PolyButton` is Button's).
  const exported = elements
    ? new Map(
        [...read]
          .filter(([name]) => ELEMENT_CLASS.test(name))
          .map(([name, entry]) => [name.replace(ELEMENT_CLASS, ''), entry] as const),
      )
    : read
  const fixtures = vocabularyFixtures(root, tree)
  const trees = [tree.root, RECIPES_ROOT]

  // An Angular part is a component of its own, which the index exports beside its member
  // (`TabsContent` beside `Tabs`, from `TabsContent.ts` in the same directory), and a part's
  // element is an element of its own (`PolyTabsContent`). It joins the sources of the longest
  // member name it starts with, as another framework's index attaches a part to its member,
  // and it is no export of its own.
  if (framework === 'angular' || elements) {
    for (const [part, partEntry] of [...exported]) {
      const file = partEntry.sources[0]
      if (names.includes(part) || file === undefined || !file.endsWith(`/${part}.ts`)) continue
      const owner = names
        .filter((name) => part.startsWith(name))
        .sort((a, b) => a.length - b.length)
        .map((name) => exported.get(name))
        .filter((entry) => entry?.sources[0] !== undefined)
        .filter((entry) => dirname(entry?.sources[0] ?? '') === dirname(file))
        .at(-1)
      if (owner === undefined) continue
      owner.sources.push(file)
      exported.delete(part)
    }
  }

  const owners = new Map<string, string[]>()
  for (const [name, entry] of exported) {
    for (const source of entry.sources) owners.set(source, [...(owners.get(source) ?? []), name])
  }
  const ownersOf = (files: readonly string[], self: string): string[] =>
    [...new Set(files.flatMap((file) => owners.get(file) ?? []))]
      .filter((owner) => owner !== self)
      .sort()

  const shells = new Map<string, FrameworkShell>()
  const brings: Record<string, string[]> = {}
  for (const name of names) {
    const entry = exported.get(name)
    if (entry === undefined) {
      throw new Error(
        `registry: ${name} is native in ${frameworkFile(framework)}, and ${tree.index} does not ` +
          'export it — mark it absent with a reason, run `pnpm shells`, then mark it native',
      )
    }
    const states = fixtures.get(name) ?? null
    // An element copies nothing: the page loads it with every other element.
    if (elements) {
      shells.set(name, {
        origin: 'installed',
        sources: entry.sources,
        states,
        dependencies: { components: [], packages: [], files: [] },
      })
      brings[name] = []
      continue
    }
    if (entry.origin === 'installed') {
      shells.set(name, {
        origin: 'installed',
        sources: [],
        states,
        dependencies: { components: [], packages: [], files: [] },
      })
      brings[name] = []
      continue
    }
    const own = fileClosure(root, entry.sources, trees)
    const files = fileClosure(root, [...entry.sources, ...(states === null ? [] : [states])], trees)
    shells.set(name, {
      origin: 'vendored',
      sources: entry.sources,
      states,
      dependencies: {
        components: ownersOf(own, name),
        packages: packagesImported(root, files, tree.ambient),
        files,
      },
    })
    brings[name] = ownersOf(files, name)
  }
  return { shells, brings }
}

/* -------------------------------------------------------------------------- */
/* Package versions                                                           */
/* -------------------------------------------------------------------------- */

interface Manifest {
  version?: string
  dependencies?: Record<string, string>
}

function manifestAt(root: string, pkg: string): Manifest {
  return JSON.parse(readFileSync(resolve(root, pkg, 'package.json'), 'utf8')) as Manifest
}

/**
 * The packages this repository publishes, by workspace name, with the name each
 * one has at the registry.
 *
 * GitHub Packages requires a package's scope to be the organisation that owns
 * it, so `@polymorph/engine` is published as `@metamorph-labs/polymorph-engine`.
 * A consumer installs it under its workspace name with an `npm:` alias, so no
 * import changes. This is the one table of those names:
 * `scripts/publish-packages.mjs` renames each package with it, and
 * `polymorph init` writes a new app's aliases from it.
 */
export const PUBLISHED_NAMES: Readonly<Record<string, string>> = {
  '@polymorph/engine': '@metamorph-labs/polymorph-engine',
  '@polymorph/react': '@metamorph-labs/polymorph-react',
  '@polymorph/react-ui': '@metamorph-labs/polymorph-react-ui',
  '@polymorph/recipes': '@metamorph-labs/polymorph-recipes',
  '@polymorph/rules': '@metamorph-labs/polymorph-rules',
  '@polymorph/solid': '@metamorph-labs/polymorph-solid',
  '@polymorph/solid-ui': '@metamorph-labs/polymorph-solid-ui',
  '@polymorph/svelte': '@metamorph-labs/polymorph-svelte',
  '@polymorph/svelte-ui': '@metamorph-labs/polymorph-svelte-ui',
  '@polymorph/vue': '@metamorph-labs/polymorph-vue',
  '@polymorph/vue-ui': '@metamorph-labs/polymorph-vue-ui',
  '@polymorph/angular': '@metamorph-labs/polymorph-angular',
  '@polymorph/angular-ui': '@metamorph-labs/polymorph-angular-ui',
  '@polymorph/elements': '@metamorph-labs/polymorph-elements',
  '@polymorph/elements-ui': '@metamorph-labs/polymorph-elements-ui',
  '@polymorph/screen': '@metamorph-labs/polymorph-screen',
}

/**
 * The Vue foundation and vocabulary. The registry ranges them in
 * `vendor.frameworks.vue.packages`, read from their own manifests
 * (`readFrameworkPackageVersions`), and a React install never names them.
 */
export const VUE_PACKAGES: readonly string[] = ['@polymorph/vue', '@polymorph/vue-ui']

/** The Svelte foundation and vocabulary, ranged in `vendor.frameworks.svelte.packages`. */
export const SVELTE_PACKAGES: readonly string[] = ['@polymorph/svelte', '@polymorph/svelte-ui']

/** The Solid foundation and vocabulary, ranged in `vendor.frameworks.solid.packages`. */
export const SOLID_PACKAGES: readonly string[] = ['@polymorph/solid', '@polymorph/solid-ui']

/** The Angular foundation and vocabulary, ranged in `vendor.frameworks.angular.packages`. */
export const ANGULAR_PACKAGES: readonly string[] = ['@polymorph/angular', '@polymorph/angular-ui']

/**
 * The elements foundation and vocabulary, ranged in `vendor.frameworks.elements.packages`,
 * for an app with a build that imports the elements instead of loading the no-build files.
 */
export const ELEMENTS_PACKAGES: readonly string[] = [
  '@polymorph/elements',
  '@polymorph/elements-ui',
]

/** Every framework's foundation and vocabulary but React's: published, ranged with its framework, and never in a React install. */
export const FRAMEWORK_PACKAGES: readonly string[] = [
  ...VUE_PACKAGES,
  ...SVELTE_PACKAGES,
  ...SOLID_PACKAGES,
  ...ANGULAR_PACKAGES,
  ...ELEMENTS_PACKAGES,
]

/**
 * The packages published for a host that draws a screen a model writes, at
 * run time: `@polymorph/screen`, the core every run-time renderer shares. No
 * app install names it. A renderer that draws at run time depends on it, and a
 * host that only checks documents or builds a prompt installs it by name.
 */
export const RUNTIME_PACKAGES: readonly string[] = ['@polymorph/screen']

/** The npm registry the published names live in. A consumer's `.npmrc` points their scope here. */
export const PUBLISHED_REGISTRY = 'https://npm.pkg.github.com'

/**
 * The packages a consumer installs by name: every package this repository
 * publishes except the recipes. A vendored install takes three of them.
 * Vendored members import `@polymorph/react`, the lint configs an install
 * generates import `@polymorph/rules`, and the theme module it generates
 * imports the engine's runtime. It replaces the fourth, `@polymorph/react-ui`,
 * with source the consumer owns. An app that installs the vocabulary instead
 * takes all four. Each one's range is its own version, because each is
 * published from here.
 *
 * `@polymorph/recipes` is published and never named by a consumer. An app that
 * installs the vocabulary gets it as the vocabulary's dependency, and a
 * vendored install copies each recipe beside its member. The Vue, Svelte,
 * Solid, Angular and elements packages (`FRAMEWORK_PACKAGES`) are published too. Each is
 * ranged with its own framework (`readFrameworkPackageVersions`), and a React
 * install never names them. Nor does it name the run-time packages
 * (`RUNTIME_PACKAGES`).
 */
export const INSTALLED_PACKAGES = Object.keys(PUBLISHED_NAMES).filter(
  (name) =>
    name !== RECIPES_PACKAGE &&
    !FRAMEWORK_PACKAGES.includes(name) &&
    !RUNTIME_PACKAGES.includes(name),
)

/** The directory a workspace package lives in: `@polymorph/vue` -> `packages/vue`. */
const directoryOf = (name: string): string => name.replace('@polymorph/', 'packages/')

/**
 * The manifests React's ranges are read from: the vocabulary, its foundation
 * and the workbench.
 *
 * The workbench is included only for the webfonts. Apps load fonts and the
 * library never bundles them, so `@fontsource-variable/*` appears in no
 * package manifest. The workbench is the one app that renders every system,
 * so its versions are the ones the systems were designed with.
 */
const REACT_MANIFESTS: readonly string[] = ['packages/react-ui', 'packages/react', 'apps/workbench']

/**
 * Every range a set of manifests declares, merged into one record.
 *
 * Each package in `published` is declared `workspace:*` before any manifest is
 * read, because this repository publishes it. Two declarations of one name
 * must agree, or this throws and names both. An install writes one range per
 * package, and letting the last manifest win would make that range depend on
 * the order the manifests are read in. Two `workspace:` ranges agree, because
 * each resolves to the package's own version.
 */
function declaredRanges(
  root: string,
  published: readonly string[],
  manifests: readonly string[],
): Record<string, string> {
  const declared = new Map<string, { range: string; by: string }>(
    published.map((name) => [name, { range: 'workspace:*', by: 'the workspace' }]),
  )
  const agree = (a: string, b: string): boolean =>
    a === b || (a.startsWith('workspace:') && b.startsWith('workspace:'))
  for (const pkg of manifests) {
    const by = `${pkg}/package.json`
    for (const [name, range] of Object.entries(manifestAt(root, pkg).dependencies ?? {})) {
      const earlier = declared.get(name)
      if (earlier === undefined) {
        declared.set(name, { range, by })
      } else if (!agree(earlier.range, range)) {
        throw new Error(
          `registry: ${earlier.by} declares ${name} at ${earlier.range} and ${by} declares it ` +
            `at ${range} — an install writes one range for it, so make them agree`,
        )
      }
    }
  }
  return Object.fromEntries([...declared].map(([name, { range }]) => [name, range]))
}

/**
 * Each of `names` at the range `declared` gives it, sorted by name.
 *
 * `workspace:*` means nothing outside this repository, so it becomes a caret on
 * the package's real version. A name with no declared range throws `fault`'s
 * sentence, which names it.
 */
function rangesOf(
  root: string,
  declared: Readonly<Record<string, string>>,
  names: readonly string[],
  fault: (missing: string) => string,
): Record<string, string> {
  const missing = names.filter((name) => declared[name] === undefined)
  if (missing.length > 0) throw new Error(fault(missing.join(', ')))

  const resolveRange = (name: string, range: string): string =>
    range.startsWith('workspace:')
      ? `^${manifestAt(root, directoryOf(name)).version ?? '0.0.0'}`
      : range

  return Object.fromEntries(
    [...names]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => [name, resolveRange(name, declared[name] as string)]),
  )
}

/**
 * The version range a consumer should install each named package at: the
 * installed packages, what React's vendored members and the ladder's
 * primitives import, and the webfonts.
 *
 * Ranges are read from the manifests of the React vocabulary and its
 * foundation, the packages a React member can import from, and from the
 * workbench for the fonts (`REACT_MANIFESTS`). So an install writes the range
 * the vocabulary was built and tested against, not whatever `latest` is on the
 * day of the install. Another framework's ranges are read from that
 * framework's own manifests (`readFrameworkPackageVersions`).
 *
 * The caller **passes in** the list, and this function does not enumerate it.
 * `build.ts` passes exactly the packages the vendored components import, plus
 * the installed packages and the fonts. Enumerating the foundation's manifest
 * instead would publish whatever it depends on as things to install. Those are
 * its internals, which `polymorph/vendorable-imports` forbids a component from
 * naming.
 *
 * A name with no declared range throws, because it is an undeclared
 * dependency. The import resolves here only because pnpm hoisted something,
 * and it would not resolve in the consumer's repository. Two manifests that
 * declare one name at different ranges throw too (`declaredRanges`).
 *
 * For the installed packages the range is a caret on the package's own
 * version, and it is the install boundary itself, so they are the only lines
 * in a consumer's `package.json` that an upgrade changes.
 */
export function readPackageVersions(
  root: string,
  names: readonly string[],
): Record<string, string> {
  return rangesOf(
    root,
    declaredRanges(root, INSTALLED_PACKAGES, REACT_MANIFESTS),
    names,
    (missing) =>
      `registry: the vocabulary imports ${missing} but no package manifest declares ` +
      'a version for it — an install would resolve nothing',
  )
}

/**
 * The version range an install in `framework` writes each named package at:
 * the framework's foundation and vocabulary, and every package its members
 * import.
 *
 * They are read from the framework's foundation and vocabulary manifests and
 * no others. Every vocabulary but React's imports the Zag machines, and each
 * framework can need its own range for them. The Solid foundation interprets
 * every machine with its own `@zag-js/core`, pinned exactly, so the Solid
 * vocabulary pins each machine to that version, while the Vue vocabulary takes
 * a caret range. One record for every framework would give each of them the
 * range of whichever manifest was read last.
 *
 * A package the framework's members import that neither manifest declares
 * throws. React's manifests are not read in its place, because their range is
 * not one this framework's vocabulary was built with.
 */
export function readFrameworkPackageVersions(
  root: string,
  framework: MappedFramework,
  names: readonly string[],
): Record<string, string> {
  const own = [FRAMEWORK_FOUNDATION[framework], FRAMEWORK_VOCABULARY[framework]]
  const name = FRAMEWORK_NAMES[framework]
  return rangesOf(
    root,
    declaredRanges(root, own, own.map(directoryOf)),
    names,
    (missing) =>
      `registry: the ${name} vocabulary imports ${missing} but neither ${own.join(' nor ')} ` +
      `declares a version for it — an install of the ${name} vocabulary would not resolve it`,
  )
}

/**
 * The release's version, which is the semver line a consumer upgrades along.
 * Every package carries it (`install.test.ts`), so it is read from one
 * manifest: `@polymorph/react`'s, the package every vendored member imports.
 */
export function readVersion(root: string): string {
  return manifestAt(root, 'packages/react').version ?? '0.0.0'
}

/* -------------------------------------------------------------------------- */
/* Fonts                                                                      */
/* -------------------------------------------------------------------------- */

export interface FontRequirement {
  /** Which type roles this family serves. Often more than one: pastel sets both. */
  roles: string[]
  family: string
  package: string
}

/**
 * The family -> fontsource-package derivation lives beside the font seeds it
 * reads (`@polymorph/theme`). This front consumes it like every other engine
 * fact. It is still checked here: `registry.test.ts` asserts that every
 * package it produces is one the workbench installs.
 */
import { fontPackage } from '@polymorph/theme'

export { fontPackage }

/**
 * The webfonts a system needs, one entry per family. Fonts belong to the
 * system, never the palette. A serif display face is part of a system's
 * character, and a palette sets only colour.
 *
 * Entries are deduplicated because pastel and terminal set body and display to
 * the same family, and listing it twice would write a duplicate dependency.
 * The roles are kept, so merging the entries loses nothing.
 */
export function fontsFor(fonts: Record<string, { family: string }>): FontRequirement[] {
  const byPackage = new Map<string, FontRequirement>()

  for (const [role, spec] of Object.entries(fonts).sort(([a], [b]) => a.localeCompare(b))) {
    const pkg = fontPackage(spec.family)
    const existing = byPackage.get(pkg)
    if (existing) existing.roles.push(role)
    else byPackage.set(pkg, { roles: [role], family: spec.family, package: pkg })
  }

  return [...byPackage.values()].sort((a, b) => a.package.localeCompare(b.package))
}

/**
 * The script that resolves theme, mode, density and temperament before first
 * paint. It is republished here so a front can install a theme without
 * importing the theme engine. It is a decision-free constant built from the
 * storage keys and attribute names in `@polymorph/theme`, so both readers use
 * one source.
 */
export const PREPAINT = PREPAINT_SCRIPT
