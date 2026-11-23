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
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Emit the screen package's declarations, with those of the modules it
 * inlines.
 *
 * The build inlines the pure modules of `@polymorph/spec` and
 * `@polymorph/registry` (`vite.build.config.ts`), and neither package is
 * published, so a declaration that still named `@polymorph/spec/validate`
 * would leave a consumer's TypeScript with nothing there, and every type it
 * names would be `any`. As the engine does for the theme
 * (`packages/engine/scripts/emit-types.mjs`), the declarations of those
 * modules are emitted into `types/_internal/<package>/`, and every specifier
 * that names one is rewritten to a relative path. The published types are
 * then as self-contained as the published code.
 *
 * `tsc -p tsconfig.build.json` has written the package's own declarations to
 * `dist/.tsc/`. They are copied next to the old tree and swapped in with a
 * rename, so `dist/types` is never half written.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE = resolve(HERE, '..')
const REPO = resolve(PACKAGE, '../..')
const TSC = resolve(REPO, 'node_modules/.bin/tsc')
const SCRATCH = resolve(PACKAGE, 'dist/.tsc')
const TYPES = resolve(PACKAGE, 'dist/types')
const NEXT = resolve(PACKAGE, 'dist/types.next')

if (!existsSync(resolve(SCRATCH, 'index.d.ts'))) {
  console.error(`screen: no declarations at ${SCRATCH} — did \`tsc -p tsconfig.build.json\` run?`)
  process.exit(1)
}

rmSync(NEXT, { recursive: true, force: true })
cpSync(SCRATCH, NEXT, { recursive: true })

/** The workspace packages the build inlines, by name, with the subpaths the source imports. */
const INLINED = ['spec', 'registry']

const exportsOf = (name) =>
  JSON.parse(readFileSync(resolve(REPO, 'packages', name, 'package.json'), 'utf8')).exports

/** The source file a subpath of an inlined package names: `validate` for `@polymorph/spec/validate`. */
const subpathTarget = (name, subpath) => {
  const file = exportsOf(name)[subpath === '' ? '.' : `.${subpath}`]
  if (typeof file !== 'string')
    throw new Error(`screen: @polymorph/${name}${subpath} is not exported`)
  return file.replace(/^\.\/src\//, '').replace(/\.(?:ts|js)$/, '')
}

const declarations = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return declarations(path)
    return entry.name.endsWith('.d.ts') ? [path] : []
  })

const SPECIFIER = /(['"])@polymorph\/([a-z-]+)(\/[^'"]*)?\1/g

/** Every subpath of an inlined package a declaration names, by package. */
const named = (files) => {
  const found = new Map(INLINED.map((name) => [name, new Set()]))
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
      found.get(match[2])?.add(match[3] ?? '')
    }
  }
  return found
}

/*
 * The inlined modules' declarations: each subpath a declaration names, and
 * each its own declarations name in turn, until none is new. `tsc` emits a
 * module another package reaches through `node_modules` as a library it does
 * not own, so every subpath is a root of its own. It roots its output at the
 * common directory of its inputs, `packages/`, so each package's
 * declarations are under `<package>/src/`.
 */
const scratch = resolve(PACKAGE, 'dist/.tsc-inlined')
const emitted = (name) => resolve(scratch, 'out', name, 'src')
let roots = new Set()
for (;;) {
  const reached = [resolve(NEXT), ...INLINED.map(emitted).filter((dir) => existsSync(dir))]
  const next = new Set(
    [...named(reached.flatMap(declarations))].flatMap(([name, subpaths]) =>
      [...subpaths].map((subpath) =>
        resolve(REPO, 'packages', name, 'src', `${subpathTarget(name, subpath)}.ts`),
      ),
    ),
  )
  if ([...next].every((root) => roots.has(root))) break
  roots = new Set([...roots, ...next])
  rmSync(scratch, { recursive: true, force: true })
  mkdirSync(scratch, { recursive: true })
  writeFileSync(
    resolve(scratch, 'tsconfig.json'),
    JSON.stringify({
      extends: resolve(PACKAGE, 'tsconfig.json'),
      compilerOptions: {
        noEmit: false,
        emitDeclarationOnly: true,
        declaration: true,
        declarationMap: false,
        incremental: false,
        rootDir: resolve(REPO, 'packages'),
        outDir: resolve(scratch, 'out'),
      },
      files: [...roots].sort(),
      include: [],
    }),
  )
  execFileSync(TSC, ['-p', resolve(scratch, 'tsconfig.json')], { stdio: 'inherit' })
}
for (const name of INLINED) {
  if (existsSync(emitted(name)))
    cpSync(emitted(name), resolve(NEXT, '_internal', name), { recursive: true })
}
rmSync(scratch, { recursive: true, force: true })

for (const file of declarations(NEXT)) {
  const text = readFileSync(file, 'utf8')
  const rewritten = text.replace(SPECIFIER, (whole, quote, name, subpath = '') => {
    if (!INLINED.includes(name)) return whole
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
  console.error(`screen: declarations still name a workspace package:\n  ${leftover.join('\n  ')}`)
  process.exit(1)
}

/* No declaration may import a file outside the package, which no consumer installs. */
const RELATIVE = /(?:from|import\()\s*(['"])(\.{1,2}\/[^'"]*)\1/g
const outside = declarations(NEXT).flatMap((file) =>
  [...readFileSync(file, 'utf8').matchAll(RELATIVE)]
    .map((match) => match[2])
    .filter((specifier) => relative(NEXT, resolve(dirname(file), specifier)).startsWith('..'))
    .map((specifier) => `${relative(NEXT, file)}: ${specifier}`),
)
if (outside.length > 0) {
  console.error(`screen: declarations import files outside the package:\n  ${outside.join('\n  ')}`)
  process.exit(1)
}

rmSync(TYPES, { recursive: true, force: true })
renameSync(NEXT, TYPES)
rmSync(SCRATCH, { recursive: true, force: true })

console.log(
  'screen: declarations at dist/types/, with the inlined spec and registry modules inside',
)
