#!/usr/bin/env node
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Emit the rules' declarations, flattened.
 *
 * `tsc` writes output relative to the common root of its inputs, and one of the
 * rules' inputs is outside the package. The icon rule's fix reads the role map
 * from `design/icons.json`, where that decision is owned. A copy inside the
 * package could drift from the original. The common root is therefore the
 * repository, and declarations land at `dist/.tsc/packages/rules/src/…`.
 *
 * This script flattens that path in one visible place. A `rootDir` would hide
 * the problem, and `tsc` would then reject the JSON import.
 *
 * The scratch directory is needed. Emitting into `dist/` directly would mix the
 * declarations with the modules the bundler writes there under
 * `preserveModules`, and the flattening step could not tell them apart.
 * `packaging.test.ts` runs the real build to catch a mistake like that.
 *
 * Nothing is bundled into the declarations. The one workspace package they may
 * name is `@polymorph/engine`, which is a peer the consumer installs.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE = resolve(HERE, '..')
const SCRATCH = resolve(PACKAGE, 'dist/.tsc')
const TYPES = resolve(PACKAGE, 'dist/types')
const NEXT = resolve(PACKAGE, 'dist/types.next')

/*
 * Where `tsc` rooted its output: the repository when a module reads from
 * `design/`, the package when one reads a file beside `src/` (the manifest, the
 * owner map), or `src/` itself. The first candidate holding the root entry wins,
 * so the script keeps working if the `design/` read goes away.
 */
const RAW = [resolve(SCRATCH, 'packages/rules/src'), resolve(SCRATCH, 'src'), SCRATCH].find(
  (candidate) => existsSync(resolve(candidate, 'index.d.ts')),
)

if (RAW === undefined) {
  console.error(`rules: no declarations under ${SCRATCH} — did \`tsc -p tsconfig.build.json\` run?`)
  process.exit(1)
}

/*
 * The new tree is copied next to the old one and then swapped in with a rename.
 *
 * Removing `dist/types` first would leave the declarations missing for the
 * whole of a many-file copy. The single-step swap covers every reader that may
 * be looking at the tree mid-build: `packaging.test.ts`, a second terminal
 * running the build, an editor's TypeScript server, or a watcher.
 */
rmSync(NEXT, { recursive: true, force: true })
cpSync(RAW, NEXT, { recursive: true })

/*
 * Hand-written declarations are inputs to `tsc`, not outputs. The rules that
 * run natively (the Stylelint plugin, the glob matcher, the inventory) are plain
 * JavaScript with a `.d.ts` beside each, so those are copied as they are.
 *
 * The filter reads the entry's name, not its path. Otherwise a checkout under a
 * directory with a dot in its name (a `.claude/` worktree, `polymorph-1.0/`)
 * would look like a file, and nothing below `src/` would be copied.
 */
cpSync(resolve(PACKAGE, 'src'), NEXT, {
  recursive: true,
  filter: (path) => {
    const name = basename(path)
    return !name.includes('.') || name.endsWith('.d.ts')
  },
})

const declarations = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return declarations(path)
    return entry.name.endsWith('.d.ts') ? [path] : []
  })

// Specifiers only. A doc comment that names a package is not an import.
const WORKSPACE = /(?:from|import\()\s*['"](@polymorph\/[^/'"]+)/g
const internal = declarations(NEXT).flatMap((file) =>
  [...readFileSync(file, 'utf8').matchAll(WORKSPACE)]
    .map((match) => match[1])
    .filter((name) => name !== '@polymorph/engine')
    .map((name) => `${relative(NEXT, file)}: ${name}`),
)
if (internal.length > 0) {
  console.error(
    `rules: declarations name a workspace package a consumer does not install:\n  ${internal.join('\n  ')}`,
  )
  process.exit(1)
}

/*
 * No declaration may import a file outside the package. `tsc` writes a relative
 * specifier as the source spelled it, so a declared type that named the
 * `design/` import would point at a file no consumer installs, and the type
 * would become `any` for them. The exported rule objects are annotated with
 * ESLint's own types instead, and `tsc` writes those out by name.
 */
const RELATIVE = /(?:from|import\()\s*(['"])(\.{1,2}\/[^'"]*)\1/g
const outside = declarations(NEXT).flatMap((file) =>
  [...readFileSync(file, 'utf8').matchAll(RELATIVE)]
    .map((match) => match[2])
    .filter((specifier) => relative(NEXT, resolve(dirname(file), specifier)).startsWith('..'))
    .map((specifier) => `${relative(NEXT, file)}: ${specifier}`),
)
if (outside.length > 0) {
  console.error(`rules: declarations import files outside the package:\n  ${outside.join('\n  ')}`)
  process.exit(1)
}

rmSync(TYPES, { recursive: true, force: true })
renameSync(NEXT, TYPES)
rmSync(SCRATCH, { recursive: true, force: true })

console.log('rules: declarations at dist/types/')
