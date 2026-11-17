#!/usr/bin/env node
/**
 * The published build of a Svelte package, `@polymorph/svelte` or
 * `@polymorph/svelte-ui`: `node packages/svelte/scripts/package.mjs <package>`.
 *
 * A Svelte library ships its components as source, because the consumer's
 * Svelte compiles them for the browser and for a server render, each its own
 * way. So the build writes `dist/` as the source a consumer's toolchain reads:
 *
 *  - every `.svelte` component as it is, TypeScript included, which Svelte 5
 *    reads natively;
 *  - every TypeScript module as JavaScript, a rune module (`*.svelte.ts`) as
 *    `*.svelte.js`, which the consumer's Svelte compiles;
 *  - every stylesheet as it is: a member imports its recipe from
 *    `@polymorph/recipes`, which publishes its CSS Modules as source, and the
 *    consumer's bundler compiles each one beside the member that imports it;
 *  - the declarations, from `svelte2tsx` (a component's as `<Name>.svelte.d.ts`).
 *
 * Every relative import is made fully specified (`./dev.js`), so the files
 * resolve under Node's rules as well as a bundler's. Tests, states fixtures,
 * the galleries and the laws' mount helpers are not shipped.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'

import { emitDts } from 'svelte2tsx'
import ts from 'typescript'

const PACKAGE = resolve(process.argv[2] ?? '.')
const SRC = join(PACKAGE, 'src')
const DIST = join(PACKAGE, 'dist')
const require = createRequire(join(PACKAGE, 'package.json'))

/**
 * Test tooling, which stays out of the package. A browser test that fails writes
 * a screenshot into `__screenshots__/` beside it, so those directories are
 * tooling too.
 */
const shipped = (path) => {
  const local = relative(SRC, path)
  return !(
    /\.(test|states)\.(ts|svelte)$/.test(local) ||
    /(^|\/)(test-setup|mount|galleries)\.ts$/.test(local) ||
    /(^|\/)MountedEntry\.svelte$/.test(local) ||
    /(^|\/)__screenshots__\//.test(local) ||
    local.startsWith('conformance/') ||
    local.startsWith('testing/') ||
    local.endsWith('.d.ts')
  )
}

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

/**
 * A relative specifier made fully specified: a TypeScript module's becomes its
 * `.js`, a rune module's (`./slotted.svelte`) its `.svelte.js`, and a
 * component's or a stylesheet's stays.
 */
function specified(from, specifier) {
  if (!specifier.startsWith('.')) return specifier
  const target = resolve(dirname(from), specifier)
  if (/\.(svelte|css|js)$/.test(specifier) && existsSync(target)) return specifier
  if (existsSync(`${target}.ts`)) return `${specifier}.js`
  if (existsSync(join(target, 'index.ts'))) return `${specifier}/index.js`
  return specifier
}

/** Every relative module specifier in a module's text, made fully specified. */
function rewrite(from, text) {
  return text.replace(
    /(\bfrom\s+|\bimport\s+|\bimport\(\s*)(['"])(\.{1,2}\/[^'"]+)\2/g,
    (_, lead, quote, specifier) => `${lead}${quote}${specified(from, specifier)}${quote}`,
  )
}

rmSync(DIST, { recursive: true, force: true })
mkdirSync(DIST, { recursive: true })

for (const file of filesUnder(SRC).filter(shipped)) {
  const local = relative(SRC, file)
  const out = join(DIST, local)
  mkdirSync(dirname(out), { recursive: true })
  if (file.endsWith('.ts')) {
    const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        verbatimModuleSyntax: true,
      },
    })
    writeFileSync(out.replace(/\.ts$/, '.js'), rewrite(file, outputText))
  } else if (file.endsWith('.svelte')) {
    writeFileSync(out, rewrite(file, readFileSync(file, 'utf8')))
  } else {
    copyFileSync(file, out)
  }
}

await emitDts({
  declarationDir: relative(process.cwd(), DIST),
  svelteShimsPath: require.resolve('svelte2tsx/svelte-shims-v4.d.ts'),
  libRoot: relative(process.cwd(), SRC),
  tsconfig: join(PACKAGE, 'tsconfig.build.json'),
})

// The declarations' own relative imports, made fully specified as the modules' are.
for (const file of filesUnder(DIST).filter((path) => path.endsWith('.d.ts'))) {
  const source = join(SRC, relative(DIST, file)).replace(/\.d\.ts$/, '.ts')
  writeFileSync(file, rewrite(source, readFileSync(file, 'utf8')))
}
