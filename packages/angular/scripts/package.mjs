#!/usr/bin/env node
/**
 * The published build of an Angular package (`@polymorph/angular`,
 * `@polymorph/angular-ui`), run from the package's directory by its `build`
 * script.
 *
 * An Angular library ships partially compiled code (the Angular package
 * format's `compilationMode: "partial"`): the application's Angular CLI links
 * it to the Angular it runs, so one build serves every Angular of the major.
 * The CLI does not compile a stylesheet a TypeScript module imports, and a
 * member imports its recipe as a CSS Module, so the build compiles each recipe
 * here and hands its rules to the member's component as `styles`, which
 * Angular adds to the page once, the first time a member that uses them
 * renders. The steps:
 *
 *  1. Stage the shipped source under `dist/.stage`: no test, fixture, gallery,
 *     mount helper or adapter.
 *  2. Compile every CSS Module a staged module imports (a recipe, the icon
 *     stylesheet), with the recipes it composes from, into a TypeScript module
 *     that exports its class names and its rules; point the import at it and
 *     add the rules to the component's `styles`. A recipe is compiled through
 *     the reach-through transform, so a selector that reads a parent or a
 *     sibling also matches through a member's host.
 *  3. Compile with `ngc` in partial mode into `dist/`, with declarations. A
 *     workspace package the source imports is read from its published
 *     declarations, so only this package is emitted.
 *  4. Write every relative import fully specified (`./controls/Button.js`), so
 *     plain Node and every bundler resolve it.
 *  5. Bundle each entry point into one flat ES module, as the Angular package
 *     format ships one: `dist/fesm2022/polymorph-angular-ui.mjs`, and
 *     `polymorph-angular-motion.mjs` for `./motion`. A build that links only
 *     the Angular package format's bundles (Analog's Vite plugin links a module
 *     whose path holds `fesm20…`) links these, as the Angular CLI links any.
 *     Every package import stays external. The modules step 4 wrote are
 *     removed; their declarations stay, and the manifest's `types` name them.
 *
 * The vocabulary's base layer (`@polymorph/recipes/base.css`) ships as
 * `dist/base.css`, which an application lists among its global styles.
 */
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'

const PACKAGE = process.cwd()
const SRC = join(PACKAGE, 'src')
const DIST = join(PACKAGE, 'dist')
const STAGE = join(DIST, '.stage')
const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
const RECIPES = join(ROOT, 'packages/recipes/src')
const FOUNDATION_DIST = join(ROOT, 'packages/angular/dist')
const ENGINE_DIST = join(ROOT, 'packages/engine/dist/types')

const require = createRequire(join(PACKAGE, 'package.json'))
const { build, preprocessCSS, resolveConfig } = await import(require.resolve('vite'))
// The recipes as the Angular members need them: each selector that reads a
// parent or a sibling also matches through a member's host (`data-pm-host`).
const { ANGULAR_HOST, reachThroughCss } = await import(
  pathToFileURL(join(ROOT, 'packages/elements-ui/reach-through.ts')).href
)
const manifest = JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8'))

/** Test tooling, which never ships. */
const tooling = (local) =>
  /\.(test|states)\.ts$/.test(local) ||
  /(^|\/)(test-setup|mount|galleries)\.ts$/.test(local) ||
  local.startsWith(`conformance${sep}`) ||
  local.startsWith('conformance/')

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

rmSync(DIST, { recursive: true, force: true })
mkdirSync(STAGE, { recursive: true })

/* 1. stage --------------------------------------------------------------- */
const staged = []
for (const file of filesUnder(SRC)) {
  const local = relative(SRC, file)
  if (!file.endsWith('.ts') || tooling(local)) continue
  const target = join(STAGE, local)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, readFileSync(file, 'utf8'))
  staged.push(target)
}

/* 2. stylesheets ---------------------------------------------------------- */
const config = await resolveConfig({ root: ROOT, configFile: false, logLevel: 'silent' }, 'build')
/** Each compiled stylesheet, by its source path: its module's staged path, its rules, what it composes. */
const sheets = new Map()

async function sheet(path) {
  const known = sheets.get(path)
  if (known !== undefined) return known
  const source = readFileSync(path, 'utf8')
  const result = await preprocessCSS(
    path.startsWith(RECIPES) ? reachThroughCss(source, ANGULAR_HOST) : source,
    path,
    config,
  )
  const local = path.startsWith(RECIPES)
    ? join('recipes', relative(RECIPES, path))
    : join('styles', relative(SRC, path))
  const module = join(STAGE, `${local}.ts`)
  const entry = {
    module,
    css: result.code,
    deps: [...(result.deps ?? [])].filter((dep) => dep.endsWith('.css')),
  }
  sheets.set(path, entry)
  mkdirSync(dirname(module), { recursive: true })
  writeFileSync(
    module,
    [
      `/** The class names of \`${relative(ROOT, path)}\`, compiled, and its rules. */`,
      `const classes: { readonly [name: string]: string } = ${JSON.stringify(result.modules ?? {})}`,
      'export default classes',
      `export const css = ${JSON.stringify(result.code)}`,
      '',
    ].join('\n'),
  )
  for (const dep of entry.deps) await sheet(dep)
  return entry
}

/** A stylesheet's rules, after those of every stylesheet it composes from. */
function rules(path, seen = new Set()) {
  if (seen.has(path)) return []
  seen.add(path)
  const entry = sheets.get(path)
  return [...entry.deps.flatMap((dep) => rules(dep, seen)), path]
}

const IMPORT = /^import (\w+) from '([^']+\.module\.css)'$/gm

for (const file of staged) {
  let text = readFileSync(file, 'utf8')
  const imports = [...text.matchAll(IMPORT)]
  if (file === join(STAGE, 'index.ts'))
    text = text.replace("import '@polymorph/recipes/base.css'\n", '')
  if (imports.length === 0) {
    writeFileSync(file, text)
    continue
  }
  const used = []
  /** The last recipe import, rewritten: a line of its own, which the rules' imports follow. */
  let after = ''
  for (const [statement, binding, specifier] of imports) {
    const source = specifier.startsWith('@polymorph/recipes/')
      ? join(RECIPES, specifier.slice('@polymorph/recipes/'.length))
      : resolve(dirname(join(SRC, relative(STAGE, file))), specifier)
    const entry = await sheet(source)
    let path = relative(dirname(file), entry.module).replace(/\.ts$/, '').split(sep).join('/')
    if (!path.startsWith('.')) path = `./${path}`
    after = `import ${binding} from '${path}'`
    text = text.replace(statement, () => after)
    used.push(...rules(source))
  }
  // Every rule the component's classes need, each stylesheet once, composed ones first.
  const names = []
  const lines = []
  for (const path of [...new Set(used)]) {
    const entry = sheets.get(path)
    let module = relative(dirname(file), entry.module).replace(/\.ts$/, '').split(sep).join('/')
    if (!module.startsWith('.')) module = `./${module}`
    const name = `rules${names.length}`
    names.push(name)
    lines.push(`import { css as ${name} } from '${module}'`)
  }
  const at = text.indexOf('\n@Component({')
  if (at === -1)
    throw new Error(
      `package: ${relative(STAGE, file)} imports a stylesheet and declares no component`,
    )
  const placed = text.replace(`\n${after}\n`, (line) => `${line}${lines.join('\n')}\n`)
  if (placed === text)
    throw new Error(`package: ${relative(STAGE, file)} has no recipe import on a line of its own`)
  text = placed
  text = text.replace(
    '  encapsulation: ViewEncapsulation.None,\n',
    `  encapsulation: ViewEncapsulation.None,\n  styles: [${names.join(', ')}],\n`,
  )
  if (!text.includes(`styles: [${names.join(', ')}]`)) {
    throw new Error(`package: ${relative(STAGE, file)} sets no encapsulation for its styles`)
  }
  writeFileSync(file, text)
}

/* 3. compile -------------------------------------------------------------- */
const engineSubpaths = ['motion', 'qr', 'charts', 'markdown']
const paths = {
  '@polymorph/engine': [join(ENGINE_DIST, 'index.d.ts')],
  ...Object.fromEntries(
    engineSubpaths.map((name) => [
      `@polymorph/engine/${name}`,
      [join(ENGINE_DIST, name, 'index.d.ts')],
    ]),
  ),
  '@polymorph/angular': [join(FOUNDATION_DIST, 'index.d.ts')],
  '@polymorph/angular/motion': [join(FOUNDATION_DIST, 'motion/index.d.ts')],
}
writeFileSync(
  join(STAGE, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        lib: ['ES2023', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        moduleResolution: 'bundler',
        types: [],
        strict: true,
        noUncheckedIndexedAccess: true,
        skipLibCheck: true,
        isolatedModules: true,
        verbatimModuleSyntax: true,
        declaration: true,
        sourceMap: true,
        rootDir: '.',
        outDir: '..',
        paths,
      },
      angularCompilerOptions: {
        compilationMode: 'partial',
        strictTemplates: true,
        strictInjectionParameters: true,
      },
      include: ['./**/*.ts'],
      exclude: ['./**/*.d.ts'],
    },
    null,
    2,
  ),
)
const ngc = join(PACKAGE, 'node_modules/.bin/ngc')
execFileSync(
  existsSync(ngc) ? ngc : join(ROOT, 'packages/angular-ui/node_modules/.bin/ngc'),
  ['-p', join(STAGE, 'tsconfig.json')],
  {
    stdio: 'inherit',
  },
)
rmSync(STAGE, { recursive: true, force: true })

/* 4. fully specified imports ---------------------------------------------- */
const SPECIFIER = /(from\s+|import\s*\(\s*|import\s+)(['"])(\.{1,2}\/[^'"]+)\2/g
for (const file of filesUnder(DIST)) {
  if (!/\.(js|d\.ts)$/.test(file)) continue
  const text = readFileSync(file, 'utf8')
  const next = text.replace(SPECIFIER, (match, head, quote, specifier) => {
    if (/\.(js|json)$/.test(specifier)) return match
    const base = resolve(dirname(file), specifier)
    const full =
      existsSync(`${base}.js`) || existsSync(`${base}.d.ts`)
        ? `${specifier}.js`
        : existsSync(join(base, 'index.js'))
          ? `${specifier}/index.js`
          : specifier
    return `${head}${quote}${full}${quote}`
  })
  if (next !== text) writeFileSync(file, next)
}

/* 5. flat bundles --------------------------------------------------------- */
const FESM = join(DIST, 'fesm2022')
// The flat module's name is the package's, as the Angular package format names it:
// `@polymorph/angular-ui` is `polymorph-angular-ui`, and its `./motion` adds `-motion`.
const flat = manifest.name.replace(/^@/, '').replace('/', '-')
const entries = Object.fromEntries(
  Object.keys(manifest.exports)
    .filter((subpath) => !subpath.endsWith('.css'))
    .map((subpath) =>
      subpath === '.'
        ? [flat, join(DIST, 'index.js')]
        : [
            `${flat}-${subpath.slice(2).replace(/\//g, '-')}`,
            join(DIST, subpath.slice(2), 'index.js'),
          ],
    ),
)
await build({
  configFile: false,
  logLevel: 'silent',
  root: PACKAGE,
  build: {
    outDir: FESM,
    emptyOutDir: false,
    minify: false,
    sourcemap: true,
    target: 'es2022',
    lib: { entry: entries, formats: ['es'], fileName: (_format, name) => `${name}.mjs` },
    rollupOptions: {
      external: (id) => !id.startsWith('.') && !isAbsolute(id) && !id.startsWith('\0'),
      output: { chunkFileNames: '[name]-[hash].mjs' },
    },
  },
})
for (const file of filesUnder(DIST)) {
  if (file.startsWith(`${FESM}${sep}`)) continue
  if (file.endsWith('.js') || file.endsWith('.js.map')) rmSync(file)
}

if (
  existsSync(join(SRC, 'index.ts')) &&
  readFileSync(join(SRC, 'index.ts'), 'utf8').includes("'@polymorph/recipes/base.css'")
) {
  cpSync(join(RECIPES, 'base.css'), join(DIST, 'base.css'))
}
console.log(`package: ${relative(ROOT, DIST)} written`)
