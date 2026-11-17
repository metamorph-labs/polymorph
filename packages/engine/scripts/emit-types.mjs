#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Emit the engine's declarations, flattened.
 *
 * `tsc` writes output relative to the common root of its inputs, and some of
 * the engine's inputs are outside the package. The motion registry and the icon
 * roles are read from `design/`, where those decisions are owned. A copy inside
 * the package could drift from the original. The common root is therefore the
 * repository, and declarations land at `dist/.tsc/packages/engine/src/…`.
 *
 * This script flattens that path in one visible place. A `rootDir` would hide
 * the problem, and `tsc` would then reject the JSON imports.
 *
 * The scratch directory is needed. Emitting into `dist/` and then deleting
 * `dist/packages` would also delete the bundled theme modules that Rollup puts
 * there under `preserveModules`. `packaging.test.ts` runs the real build to
 * catch a mistake like that.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE = resolve(HERE, '..')
const SCRATCH = resolve(PACKAGE, 'dist/.tsc')
const RAW = resolve(SCRATCH, 'packages/engine/src')
const TYPES = resolve(PACKAGE, 'dist/types')
const NEXT = resolve(PACKAGE, 'dist/types.next')

if (!existsSync(RAW)) {
  console.error(`engine: no declarations at ${RAW} — did \`tsc -p tsconfig.build.json\` run?`)
  process.exit(1)
}

/*
 * The new tree is copied next to the old one and then swapped in with a rename.
 *
 * Removing `dist/types` first would leave the declarations missing for the
 * whole of a many-file copy, and `packaging.test.ts` asserts they exist. The two
 * test files that build this package hold a lock over `dist`
 * (`packages/engine/dist-lock.ts`), which handles the concurrency among the tests.
 * The single-step swap also covers readers the lock does not know about: a
 * second terminal running `pnpm build:packages`, an editor's TypeScript server,
 * or a watcher.
 */
rmSync(NEXT, { recursive: true, force: true })
cpSync(RAW, NEXT, { recursive: true })
// Hand-written declarations are inputs to `tsc`, not outputs, so they are copied as is.
cpSync(resolve(PACKAGE, 'src/vite-env.d.ts'), resolve(NEXT, 'vite-env.d.ts'))

/*
 * Declarations for the package the engine bundles.
 *
 * The engine's JavaScript bundles `@polymorph/theme` (`vite.config.ts`), but its
 * declarations still say `export * from '@polymorph/theme'`. The theme package
 * is not published, so a consumer's TypeScript would find nothing there and
 * every re-exported name would be `any`. Its declarations are emitted into
 * `types/_internal/theme/`, and every specifier that names it is rewritten to a
 * relative path. The published types are then as self-contained as the
 * published code.
 */
const REPO = resolve(PACKAGE, '../..')
const TSC = resolve(REPO, 'node_modules/.bin/tsc')
const BUNDLED = ['theme']

for (const name of BUNDLED) {
  const source = resolve(REPO, 'packages', name)
  const scratch = resolve(PACKAGE, `dist/.tsc-${name}`)
  rmSync(scratch, { recursive: true, force: true })
  mkdirSync(scratch, { recursive: true })
  writeFileSync(
    resolve(scratch, 'tsconfig.json'),
    JSON.stringify({
      extends: resolve(source, 'tsconfig.json'),
      compilerOptions: {
        noEmit: false,
        emitDeclarationOnly: true,
        declaration: true,
        incremental: false,
        outDir: resolve(scratch, 'out'),
      },
      include: [resolve(source, 'src/**/*.ts')],
      exclude: [resolve(source, 'src/**/*.test.ts')],
    }),
  )
  execFileSync(TSC, ['-p', resolve(scratch, 'tsconfig.json')], { stdio: 'inherit' })

  // `tsc` roots its output at the common root of its inputs. That is `src/`
  // itself, the package when a module reads a file beside `src/`, or the
  // repository when a module reads from `design/`.
  const out = resolve(scratch, 'out')
  const emitted = [resolve(out, 'packages', name, 'src'), resolve(out, 'src'), out].find(
    (candidate) => existsSync(resolve(candidate, 'index.d.ts')),
  )
  if (emitted === undefined) {
    console.error(`engine: @polymorph/${name} emitted no index.d.ts under ${out}`)
    process.exit(1)
  }
  const target = resolve(NEXT, '_internal', name)
  cpSync(emitted, target, { recursive: true })
  // Hand-written declarations beside JavaScript modules are inputs, not outputs.
  // The filter reads the entry's name, not its path. Otherwise a checkout under
  // a directory with a dot in its name (a `.claude/` worktree, `polymorph-1.0/`)
  // would look like a file, and nothing below `src/` would be copied.
  cpSync(resolve(source, 'src'), target, {
    recursive: true,
    filter: (path) => {
      const name = basename(path)
      return !name.includes('.') || name.endsWith('.d.ts')
    },
  })
  rmSync(scratch, { recursive: true, force: true })
}

const subpathTarget = (name, subpath) => {
  const { exports } = JSON.parse(
    readFileSync(resolve(REPO, 'packages', name, 'package.json'), 'utf8'),
  )
  const file = exports[subpath === '' ? '.' : `.${subpath}`]
  if (typeof file !== 'string')
    throw new Error(`engine: @polymorph/${name}${subpath} is not exported`)
  return file.replace(/^\.\/src\//, '').replace(/\.(?:ts|js)$/, '')
}

const declarations = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return declarations(path)
    return entry.name.endsWith('.d.ts') ? [path] : []
  })

const SPECIFIER = /(['"])@polymorph\/(theme)(\/[^'"]*)?\1/g
for (const file of declarations(NEXT)) {
  const text = readFileSync(file, 'utf8')
  const rewritten = text.replace(SPECIFIER, (_, quote, name, subpath = '') => {
    const to = relative(
      dirname(file),
      resolve(NEXT, '_internal', name, subpathTarget(name, subpath)),
    )
    return `${quote}${to.startsWith('.') ? to : `./${to}`}${quote}`
  })
  if (rewritten !== text) writeFileSync(file, rewritten)
}

// Specifiers only. A doc comment that names a package is not an import.
const leftover = declarations(NEXT).filter((file) =>
  /(?:from|import\()\s*['"]@polymorph\//.test(readFileSync(file, 'utf8')),
)
if (leftover.length > 0) {
  console.error(`engine: declarations still name a workspace package:\n  ${leftover.join('\n  ')}`)
  process.exit(1)
}

/*
 * No declaration may import a file outside the package. `tsc` writes a relative
 * specifier as the source spelled it, so a declared type that names one of the
 * `design/` imports points at a file no consumer installs. That type, a closed
 * enum here, then becomes `string | number | symbol` for the consumer. The types
 * derive from the engine's own constants instead (`icon/roles.ts`, `motion/values.ts`),
 * and `tsc` writes their shapes out in full.
 */
const RELATIVE = /(?:from|import\()\s*(['"])(\.{1,2}\/[^'"]*)\1/g
const outside = declarations(NEXT).flatMap((file) =>
  [...readFileSync(file, 'utf8').matchAll(RELATIVE)]
    .map((match) => match[2])
    .filter((specifier) => relative(NEXT, resolve(dirname(file), specifier)).startsWith('..'))
    .map((specifier) => `${relative(NEXT, file)}: ${specifier}`),
)
if (outside.length > 0) {
  console.error(`engine: declarations import files outside the package:\n  ${outside.join('\n  ')}`)
  process.exit(1)
}

rmSync(TYPES, { recursive: true, force: true })
renameSync(NEXT, TYPES)
rmSync(SCRATCH, { recursive: true, force: true })

console.log('engine: declarations at dist/types/, with theme inside')
