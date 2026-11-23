#!/usr/bin/env node
/**
 * `pnpm size` measures what a consumer ships.
 *
 * It builds each fixture app in `scripts/size/` as a consumer's Vite would:
 * against the published builds (each package's `dist/`, so run
 * `pnpm build:packages` first), minified for production. A Solid fixture
 * (`solid-*`) is built the way a Vite application with Solid's plugin is
 * built: the Solid packages resolve by their `solid` export condition, to the
 * source they ship in `dist/source/`, and the plugin compiles its JSX. An
 * Angular fixture (`angular-*`) is linked as the Angular CLI links an
 * application: Angular's linker turns the partial declarations the Angular
 * packages ship into definitions. It reports the
 * gzipped JavaScript and CSS. With `--why` it also attributes the JavaScript
 * to the packages it came from.
 *
 * An elements fixture (`elements-*.html`) is a page with no build, so it is
 * not built: it is measured from the files `pnpm build:packages` writes into
 * `packages/elements-ui/dist/cdn/`, as a browser fetches them. Its scripts
 * and each module they import, each `poly-*` tag's chunk the loader imports
 * for the tags the page writes, the chunks the page's agent setting
 * (`<html data-agent>`) fetches at load, for a `<poly-screen>` the chunk it
 * imports and the chunk of each member its document names, and the
 * stylesheets it links, each file gzipped on its own, as each is a request of
 * its own.
 *
 * `scripts/size/budgets.json` holds a ceiling per fixture, and a fixture over
 * its ceiling fails the run. The ceilings catch a heavy dependency reaching
 * production code. Raise one only with the reason in the same commit.
 *
 * A fixture also fails when it ships the agent bridge (`@polymorph/engine/agent`)
 * without importing it, and when it imports it and the bridge's marker is not
 * found, because then the first check would read nothing.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import { svelte } from '@sveltejs/vite-plugin-svelte'
import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import { build } from 'vite'
import solid from 'vite-plugin-solid'

import { polymorphTheme } from '../packages/engine/dist/vite.js'
import { angularLinker, resolveFromVocabulary } from '../packages/angular-ui/scripts/linker.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURES = resolve(ROOT, 'scripts/size')
const why = process.argv.includes('--why')
const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const budgets = JSON.parse(readFileSync(resolve(FIXTURES, 'budgets.json'), 'utf8'))

const dist = (path) => resolve(ROOT, 'packages', path)

/** React from the vocabulary's own install: the fixtures are apps with no package.json. */
const fromVocabulary = createRequire(dist('react-ui/package.json'))
const packageDir = (name) => realpathSync(dirname(fromVocabulary.resolve(`${name}/package.json`)))

/**
 * A Solid package's entry points as its `solid` export condition resolves
 * them, which Solid's Vite plugin puts first: `publishConfig.exports`, the map
 * a registry install gets, read at the `solid` condition, or the plain target
 * for a stylesheet.
 */
function solidCondition(name) {
  const manifest = JSON.parse(readFileSync(dist(`${name}/package.json`), 'utf8'))
  return Object.entries(manifest.publishConfig.exports).map(([subpath, target]) => ({
    // A pattern (`./controls/*`) maps what its `*` matches into its target's `*`.
    find: new RegExp(
      `^@polymorph/${name}${subpath.slice(1).replaceAll('.', '\\.').replace('*', '(.+)')}$`,
    ),
    replacement: dist(
      `${name}/${(typeof target === 'string' ? target : target.solid).replace('*', '$1')}`,
    ),
  }))
}

/** Vue from the Vue vocabulary's install, for the same reason. */
const fromVueVocabulary = createRequire(dist('vue-ui/package.json'))
const vueDir = realpathSync(dirname(fromVueVocabulary.resolve('vue/package.json')))

/** The published entry points, resolved to the builds a registry install would get. */
const alias = [
  { find: /^@polymorph\/engine$/, replacement: dist('engine/dist/index.js') },
  {
    find: /^@polymorph\/engine\/(motion|runtime|vite|qr|charts|markdown|rich-text|rich-text-editor|agent)$/,
    replacement: dist('engine/dist/$1.js'),
  },
  { find: /^@polymorph\/react$/, replacement: dist('react/dist/index.js') },
  { find: /^@polymorph\/react\/motion$/, replacement: dist('react/dist/motion.js') },
  { find: /^@polymorph\/react\/style\.css$/, replacement: dist('react/dist/react.css') },
  { find: /^@polymorph\/react-ui$/, replacement: dist('react-ui/dist/index.js') },
  {
    find: /^@polymorph\/react-ui\/(galleries|identity|identity-signup)$/,
    replacement: dist('react-ui/dist/$1.js'),
  },
  { find: /^@polymorph\/vue$/, replacement: dist('vue/dist/index.js') },
  { find: /^@polymorph\/vue\/motion$/, replacement: dist('vue/dist/motion.js') },
  { find: /^@polymorph\/vue\/style\.css$/, replacement: dist('vue/dist/vue.css') },
  { find: /^@polymorph\/vue-ui$/, replacement: dist('vue-ui/dist/index.js') },
  // Svelte's packages ship their components as source, which the fixture's own Svelte compiles.
  { find: /^@polymorph\/svelte$/, replacement: dist('svelte/dist/index.js') },
  { find: /^@polymorph\/svelte\/motion$/, replacement: dist('svelte/dist/motion/index.js') },
  { find: /^@polymorph\/svelte-ui$/, replacement: dist('svelte-ui/dist/index.js') },
  // Solid's packages resolve to the source they ship, which the fixture's own Solid compiles.
  ...solidCondition('solid'),
  ...solidCondition('solid-ui'),
  // Angular's packages ship partial declarations, which the fixture's build links.
  {
    find: /^@polymorph\/angular$/,
    replacement: dist('angular/dist/fesm2022/polymorph-angular.mjs'),
  },
  {
    find: /^@polymorph\/angular\/motion$/,
    replacement: dist('angular/dist/fesm2022/polymorph-angular-motion.mjs'),
  },
  {
    find: /^@polymorph\/angular-ui$/,
    replacement: dist('angular-ui/dist/fesm2022/polymorph-angular-ui.mjs'),
  },
  // Angular from the Angular vocabulary's install, as Vue is from Vue's.
  ...['core', 'common', 'platform-browser'].map((name) => ({
    find: new RegExp(`^@angular/${name}$`),
    replacement: resolveFromVocabulary(`@angular/${name}`),
  })),
  // The runtime build Vue's bundler entry points at, without the template compiler.
  { find: /^vue$/, replacement: `${vueDir}/dist/vue.runtime.esm-bundler.js` },
  { find: /^react-dom(\/.*)?$/, replacement: `${packageDir('react-dom')}$1` },
  { find: /^react(\/.*)?$/, replacement: `${packageDir('react')}$1` },
]

/** A fixture's entry: `<name>.tsx`, or `<name>.ts` for a fixture with no JSX. */
const fixtureFile = (fixture) => {
  const tsx = resolve(FIXTURES, `${fixture}.tsx`)
  return existsSync(tsx) ? tsx : resolve(FIXTURES, `${fixture}.ts`)
}

/**
 * The framework plugins a fixture's application has. Solid's plugin compiles
 * every JSX file Solid's way, so a Solid fixture is built with it alone; the
 * others with React's, Vue's and Svelte's.
 */
const frameworks = (fixture) =>
  fixture.startsWith('solid-')
    ? [solid()]
    : fixture.startsWith('angular-')
      ? [angularLinker()]
      : [
          react(),
          // Vue's compile-time flags, as a Vue application's build sets them.
          vue(),
          // Svelte's compiler, for the Svelte packages' components, as a Svelte application's build has it.
          svelte({ configFile: false }),
        ]

async function bundle(fixture, minify) {
  const output = await build({
    configFile: false,
    root: FIXTURES,
    logLevel: 'silent',
    mode: 'production',
    plugins: [
      ...frameworks(fixture),
      // The theme compiled at build time, as an application configures it.
      polymorphTheme({
        systems: ['../../design/systems/plain.json'],
        palettes: ['../../design/palettes/neutral.json'],
        fonts: false,
      }),
    ],
    resolve: { alias, dedupe: ['react', 'react-dom'] },
    build: {
      write: false,
      minify,
      cssCodeSplit: false,
      modulePreload: false,
      // A React fixture is TSX; a Vue fixture renders with `h` and is plain TypeScript.
      rollupOptions: { input: fixtureFile(fixture) },
    },
  })
  const files = (Array.isArray(output) ? output : [output]).flatMap((result) => result.output)
  const js = files
    .filter((file) => file.type === 'chunk')
    .map((file) => file.code)
    .join('\n')
  const css = files
    .filter((file) => file.type === 'asset' && file.fileName.endsWith('.css'))
    .map((file) => String(file.source))
    .join('\n')
  return { js, css }
}

/**
 * A string only the agent bridge's runtime holds, which a minifier keeps: the
 * name of the event a step dispatches (`AGENT_CHANGE_EVENT`), which every
 * bridge carries, with or without its tools. The engine's root holds the
 * registry the bridge reads, which every member registers with, and none of
 * the bridge, so a fixture that does not import the bridge holds no such name.
 */
const BRIDGE_MARKER = 'polymorph:agentchange'

/**
 * A string only the run-time screen's renderer holds, which a minifier keeps:
 * the event `<poly-screen>` dispatches for an action. `polymorph.js` imports
 * the renderer's chunk the first time a `<poly-screen>` connects, so a page
 * that writes one fetches it, and a page that does not fetches none of it.
 */
const SCREEN_MARKER = /["'`]poly-action["'`]/

/**
 * Strings only the run-time screen's other chunks hold: the validator's ("did
 * you mean") and the card's ("# Writing a screen"), which `polymorph.js`
 * imports when a page checks a document or calls `loadScreen`. None of them is
 * the agent setting's.
 */
const SCREEN_CODE = /["'`]poly-action["'`]|did you mean|# Writing a screen/

/** A component's tag, as `@polymorph/elements` names it: `Table.Row` is `poly-table-row`. */
const tagOf = (component) =>
  `poly-${component
    .replace('.', '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()}`

/** Every component a document in a page's `<script type="application/json">` names. */
function documentComponents(page) {
  const found = []
  const visit = (value) => {
    if (Array.isArray(value)) value.forEach(visit)
    else if (typeof value === 'object' && value !== null) {
      if (typeof value.component === 'string') found.push(value.component)
      Object.values(value).forEach(visit)
    }
  }
  for (const match of page.matchAll(
    /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    visit(JSON.parse(match[1]).root)
  }
  return found
}

/** A page with no build's agent setting, `<html data-agent>`, or `null` without one. */
const agentSetting = (page) => /<html\b[^>]*\bdata-agent="([^"]*)"/.exec(page)?.[1] ?? null

/**
 * Whether a fixture's page holds the bridge by its own choice. A bundled fixture does when its
 * source imports it. A page with no build does when it loads `polymorph-all.js`, which holds the
 * bridge with every member, as it holds every member a page does not use, and when its agent
 * setting is `eager`. `polymorph.js` keeps the bridge in a chunk a page fetches when it calls
 * `loadAgentBridge` or a tool, so a page that loads it with no setting, or with `on-call`, and
 * makes no call holds none.
 */
const importsBridge = (fixture) => {
  if (!fixture.startsWith('elements-'))
    return /['"]@polymorph\/engine\/agent['"]/.test(readFileSync(fixtureFile(fixture), 'utf8'))
  const page = readFileSync(resolve(FIXTURES, `${fixture}.html`), 'utf8')
  return /\bsrc="polymorph\/polymorph-all\.js"/.test(page) || agentSetting(page) === 'eager'
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`
const gzip = (text) => gzipSync(text, { level: 9 }).length

/* -------------------------------------------------------------------------- */
/* Elements fixtures: a page with no build                                     */
/* -------------------------------------------------------------------------- */

const CDN = dist('elements-ui/dist/cdn')
const isElements = (fixture) => fixture.startsWith('elements-')

/** Every file under `dir`, by its path relative to it, with its text. */
function filesOf(dir, root = dir, out = new Map()) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) filesOf(path, root, out)
    else out.set(relative(root, path), readFileSync(path, 'utf8'))
  }
  return out
}

/**
 * The no-build files built again without minifying, in memory, with the
 * vocabulary's own build, so `--why` can read each module's region markers.
 */
async function rawCdn() {
  const config = dist('elements-ui/vite.build.config.ts')
  const files = new Map()
  for (const mode of ['cdn', 'cdn-all']) {
    const output = await build({
      configFile: config,
      configLoader: 'runner',
      root: dist('elements-ui'),
      mode,
      logLevel: 'silent',
      build: { write: false, rollupOptions: { output: { minify: false } } },
    })
    for (const result of Array.isArray(output) ? output : [output]) {
      for (const file of result.output) {
        if (file.type === 'chunk') files.set(file.fileName, file.code)
        else if (/\.(css|js)$/.test(file.fileName)) files.set(file.fileName, String(file.source))
      }
    }
  }
  return files
}

/**
 * What a browser fetches for an elements fixture from `files` (the no-build
 * directory's files, by path): each script the page names and every module
 * it imports, each chunk the loader imports for a `poly-*` tag the page
 * writes and what that imports, the chunks its agent setting fetches at load
 * and what they import, and each stylesheet it links. The setting's chunks
 * are the script's other dynamic imports: with `on-call` each that holds no
 * bridge, and with `eager` the bridge's as well.
 */
function fetched(fixture, files) {
  const page = readFileSync(resolve(FIXTURES, `${fixture}.html`), 'utf8')
  const named = (pattern) => [...page.matchAll(pattern)].map((match) => match[1])
  const scripts = named(/<script\b[^>]*\bsrc="polymorph\/([^"]+)"/g)
  const sheets = named(/<link rel="stylesheet" href="polymorph\/([^"]+)"/g)
  const tags = new Set(named(/<(poly-[a-z-]+)/g))
  // A `<poly-screen>` draws the members its document names, each loaded as its element renders.
  const screens = tags.has('poly-screen')
  if (screens) for (const component of documentComponents(page)) tags.add(tagOf(component))
  const js = new Set()
  const text = (file) => {
    const found = files.get(file)
    if (found === undefined)
      throw new Error(`size: ${fixture} fetches ${file}, which the build did not write`)
    return found
  }
  const reach = (file) => {
    if (js.has(file)) return
    js.add(file)
    for (const match of text(file).matchAll(
      /(?:^|[;}\s])(?:import|export)\s*(?:[^'"`();]*?from\s*)?["'`](\.[^"'`]+)["'`]/g,
    )) {
      reach(posix.join(posix.dirname(file), match[1]))
    }
  }
  const setting = agentSetting(page)
  /** Whether a chunk the script imports is the run-time screen's: it, or a chunk it imports, holds its code. */
  const screenCode = (chunk, seen = new Set()) => {
    if (seen.has(chunk)) return false
    seen.add(chunk)
    if (SCREEN_CODE.test(text(chunk))) return true
    return [
      ...text(chunk).matchAll(
        /(?:^|[;}\s])(?:import|export)\s*(?:[^'"`();]*?from\s*)?["'`](\.[^"'`]+)["'`]/g,
      ),
    ].some((match) => screenCode(posix.join(posix.dirname(chunk), match[1]), seen))
  }
  for (const script of scripts) {
    reach(script)
    // The loader's table: each tag's chunk, imported the first time one of its elements renders.
    const table = new Set()
    for (const match of text(script).matchAll(
      /"(poly-[a-z-]+)":\s*\(\)\s*=>\s*import\(["'`](\.\/[^"'`]+)["'`]\)/g,
    )) {
      table.add(match[2])
      if (tags.has(match[1])) reach(posix.join(posix.dirname(script), match[2]))
    }
    // The renderer's chunk, which the first `<poly-screen>` to connect imports, and what it imports.
    if (screens) {
      for (const match of text(script).matchAll(/\bimport\(["'`](\.\/[^"'`]+)["'`]\)/g)) {
        const chunk = posix.join(posix.dirname(script), match[1])
        if (!table.has(match[1]) && SCREEN_MARKER.test(text(chunk))) reach(chunk)
      }
    }
    if (setting !== 'on-call' && setting !== 'eager') continue
    for (const match of text(script).matchAll(/\bimport\(["'`](\.\/[^"'`]+)["'`]\)/g)) {
      if (table.has(match[1])) continue
      const chunk = posix.join(posix.dirname(script), match[1])
      if (screenCode(chunk)) continue
      if (setting === 'eager' || !text(chunk).includes(BRIDGE_MARKER)) reach(chunk)
    }
  }
  return { js: [...js].sort(), css: sheets.map((sheet) => sheet) }
}

/** An elements fixture's gzipped sizes, each file on its own, from the built no-build files. */
function measureElements(fixture) {
  if (!existsSync(resolve(CDN, 'polymorph.js'))) {
    throw new Error('size: packages/elements-ui/dist/cdn is not built — run `pnpm build:packages`')
  }
  const files = filesOf(CDN)
  const { js, css } = fetched(fixture, files)
  const sum = (list) => list.reduce((total, file) => total + gzip(files.get(file)), 0)
  return { js: sum(js), css: sum(css), files: { js, css }, all: files }
}

/** Which package a region of the unminified no-build files belongs to. */
function elementsOwner(path) {
  const store = /node_modules\/\.pnpm\/[^/]+\/node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(path)
  if (store) return store[1]
  // Paths are relative to the directory the build ran in: the repository or the vocabulary.
  const workspace = /^(?:\.\.\/|packages\/)([^/]+)\//.exec(path)
  if (workspace) return `@polymorph/${workspace[1]}`
  if (/^(\.\.\/\.\.\/)?design\//.test(path)) return 'design/'
  return '@polymorph/elements-ui'
}

/** Which package a `//#region <path>` marker belongs to. */
function owner(path) {
  const store = /node_modules\/\.pnpm\/[^/]+\/node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(path)
  if (store) return store[1]
  const direct = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(path)
  if (direct) return direct[1]
  const workspace = /packages\/([^/]+)\/dist\/(packages\/([^/]+)\/)?/.exec(path)
  if (workspace)
    return workspace[3]
      ? `@polymorph/${workspace[1]} (bundled ${workspace[3]})`
      : `@polymorph/${workspace[1]}`
  return 'app'
}

function attribute(js) {
  const sizes = new Map()
  let current = 'runtime'
  for (const line of js.split('\n')) {
    const region = /^\/\/#region (.+)$/.exec(line)
    if (region) {
      current = owner(region[1])
      continue
    }
    if (line.startsWith('//#endregion')) continue
    sizes.set(current, (sizes.get(current) ?? 0) + line.length + 1)
  }
  return [...sizes].sort((a, b) => b[1] - a[1])
}

const fixtures = Object.keys(budgets).filter((name) => only.length === 0 || only.includes(name))
let over = 0

for (const fixture of fixtures) {
  const measured = isElements(fixture) ? measureElements(fixture) : null
  const built = measured === null ? await bundle(fixture, true) : null
  const size =
    built === null
      ? { js: measured.js, css: measured.css }
      : { js: gzip(built.js), css: gzip(built.css) }
  const budget = budgets[fixture]
  const bridged = importsBridge(fixture)
  // The JavaScript the page runs: the bundle, or each file a page with no build fetches.
  const js = built?.js ?? measured.files.js.map((file) => measured.all.get(file)).join('\n')
  const marked = js.includes(BRIDGE_MARKER)
  const fails = size.js > budget.js * 1024 || size.css > budget.css * 1024 || marked !== bridged
  if (fails) over += 1
  console.log(
    `${fails ? '✗' : '✓'} ${basename(fixture).padEnd(14)} js ${kb(size.js).padStart(9)} / ${budget.js} kB` +
      `   css ${kb(size.css).padStart(8)} / ${budget.css} kB`,
  )
  if (marked && !bridged) {
    console.error(`    ships the agent bridge, and neither imports it nor loads polymorph-all.js`)
  }
  if (bridged && !marked) {
    console.error(
      `    imports the agent bridge, and holds no ${BRIDGE_MARKER}: the marker no longer marks it`,
    )
  }

  if (why && measured !== null) {
    // Each file the page fetches, then the packages the unminified build attributes them to.
    for (const file of [...measured.files.js, ...measured.files.css]) {
      console.log(`    ${file.padEnd(42)} ${kb(gzip(measured.all.get(file))).padStart(9)} gz`)
    }
    const raw = await rawCdn()
    const { js } = fetched(fixture, raw)
    const sizes = new Map()
    let total = 0
    for (const file of js) {
      let current = '@polymorph/elements-ui'
      for (const line of raw.get(file).split('\n')) {
        const region = /^\/\/#region (.+)$/.exec(line)
        if (region) current = elementsOwner(region[1])
        else if (line.startsWith('//#endregion')) current = '@polymorph/elements-ui'
        else {
          sizes.set(current, (sizes.get(current) ?? 0) + line.length + 1)
          total += line.length + 1
        }
      }
    }
    for (const [name, bytes] of [...sizes].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
      console.log(
        `    ${name.padEnd(42)} ${((bytes / total) * 100).toFixed(1).padStart(5)}%  ${kb(bytes)} raw`,
      )
    }
  } else if (why) {
    const raw = await bundle(fixture, false)
    const total = raw.js.length
    for (const [name, bytes] of attribute(raw.js).slice(0, 12)) {
      console.log(
        `    ${name.padEnd(42)} ${((bytes / total) * 100).toFixed(1).padStart(5)}%  ${kb(bytes)} raw`,
      )
    }
  }
}

if (over > 0) {
  console.error(
    `size: ${over} fixture(s) over budget or shipping the agent bridge unasked — see scripts/size/budgets.json`,
  )
  process.exit(1)
}
