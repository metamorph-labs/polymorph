import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * A consumer's app on disk, with `node_modules` assembled the way a package
 * manager would assemble it from the published packages.
 *
 * Two acceptance tests build one: `scratch.test.ts` vendors members into a
 * scratch Vite app, and `init.test.ts` creates an app with `polymorph init`.
 * Both need the same two decisions, so they are made once, here.
 *
 * **The app consumes the published packages' `dist`, not their source.** Each
 * of our packages the app declares is assembled the way npm assembles one (the
 * built files plus a manifest with `publishConfig` merged in) and placed in
 * `node_modules`. Pointing the app at the workspace would test Vite's ability
 * to compile TypeScript from `node_modules`, which no consumer needs.
 *
 * **Only the declared dependencies are linked.** Every package in
 * `node_modules` is one the app's `package.json` declares, as a dependency or a
 * dev dependency. An install that under-declares therefore cannot succeed by
 * accident on something pnpm hoisted. It fails here, as it would for the
 * consumer. The build tools are the one exception, and only for an app that
 * stands for one that has them already (`installNodeModules`).
 *
 * The caller builds the packages first, under their `dist` locks.
 */

export const ROOT = resolve(import.meta.dirname, '../..')

/** The packages a consumer installs, each published here from its own build. */
const PUBLISHED: Record<string, string> = {
  '@polymorph/engine': resolve(ROOT, 'packages/engine'),
  '@polymorph/react': resolve(ROOT, 'packages/react'),
  '@polymorph/react-ui': resolve(ROOT, 'packages/react-ui'),
  '@polymorph/rules': resolve(ROOT, 'packages/rules'),
}

/** Where a linked package can be found, in pnpm's per-package layout. */
const NODE_MODULES = [
  resolve(ROOT, 'packages/react-ui/node_modules'),
  resolve(ROOT, 'packages/react/node_modules'),
  resolve(ROOT, 'apps/workbench/node_modules'),
  resolve(ROOT, 'node_modules'),
]

/** The tools that build and lint an app. */
const TOOLING = [
  'vite',
  '@vitejs/plugin-react',
  'typescript',
  '@types/react',
  '@types/react-dom',
  'eslint',
  'stylelint',
]

export function write(root: string, path: string, contents: string): void {
  mkdirSync(dirname(resolve(root, path)), { recursive: true })
  writeFileSync(resolve(root, path), contents)
}

export function read(root: string, path: string): string {
  return readFileSync(resolve(root, path), 'utf8')
}

/** A command run in the app, with its exit code and everything it printed. */
export function runIn(
  cwd: string,
  command: string,
  args: string[],
): { code: number; output: string } {
  try {
    return { code: 0, output: execFileSync(command, args, { cwd, stdio: 'pipe' }).toString() }
  } catch (error) {
    const failure = error as { status?: number; stdout?: Buffer; stderr?: Buffer }
    return {
      code: failure.status ?? 1,
      output: `${failure.stdout?.toString() ?? ''}${failure.stderr?.toString() ?? ''}`,
    }
  }
}

/**
 * `node_modules` for the app at `root`: every declared package, published from
 * its `dist` when it is ours and linked from this repository when it is not,
 * and the build tools' binaries.
 *
 * `tools` says where the build tools come from. With `'assumed'`, they are
 * linked whether the app declares them or not. The scratch app needs that: it
 * stands for an app `create-vite` made, which has them, and its `package.json`
 * declares only React. With `'declared'`, only the tools the app declares are
 * linked, so an app that `polymorph init` wrote without one fails to build or
 * lint here, as it would for the consumer.
 */
export function installNodeModules(root: string, tools: 'assumed' | 'declared' = 'assumed'): void {
  const modules = resolve(root, 'node_modules')
  mkdirSync(modules, { recursive: true })

  const manifest = JSON.parse(read(root, 'package.json')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const declared = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })

  for (const name of declared) {
    const source = PUBLISHED[name]
    if (source === undefined) link(modules, name)
    else publish(source, resolve(modules, name))
  }
  const linked = tools === 'assumed' ? TOOLING : TOOLING.filter((name) => declared.includes(name))
  for (const name of linked) link(modules, name)
  for (const name of linked) linkBinaries(modules, name)
}

/**
 * `node_modules/.bin`, which pnpm writes and a directory of symlinks lacks.
 *
 * Without it, `npx vite` walks up out of the app and finds this repository's
 * copy, so the build would run against the wrong root. The tools come from
 * this repository either way. What matters is that they run *in* the app,
 * against its config and its files.
 */
function linkBinaries(modules: string, name: string): void {
  const manifest = JSON.parse(readFileSync(resolve(modules, name, 'package.json'), 'utf8')) as {
    bin?: string | Record<string, string>
  }
  if (!manifest.bin) return

  const entries =
    typeof manifest.bin === 'string'
      ? { [name.split('/').pop() as string]: manifest.bin }
      : manifest.bin

  mkdirSync(resolve(modules, '.bin'), { recursive: true })
  for (const [command, path] of Object.entries(entries)) {
    const target = resolve(modules, '.bin', command)
    if (!existsSync(target)) symlinkSync(resolve(modules, name, path), target, 'file')
  }
}

function link(modules: string, name: string): void {
  const target = resolve(modules, name)
  if (existsSync(target)) return

  const from = NODE_MODULES.map((directory) => resolve(directory, name)).find(existsSync)
  if (!from) throw new Error(`consumer app: ${name} is declared but not installed anywhere here`)

  mkdirSync(dirname(target), { recursive: true })
  symlinkSync(from, target, 'dir')
}

/**
 * One of our packages as npm would publish it: the `files` list, and the
 * manifest with `publishConfig` merged in.
 *
 * Its own `node_modules` is linked beside it, entry by entry, as a transitive
 * install gives a consumer. These tests therefore do not cover undeclared
 * dependencies, and the undeclared-dependency law in each package's
 * `packaging.test.ts` is still needed. The `@polymorph` scope is left out, so
 * `@polymorph/react`'s import of the engine resolves to the published engine
 * beside it in the app, not to this repository's source.
 */
function publish(source: string, target: string): void {
  const manifest = JSON.parse(readFileSync(resolve(source, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  > & { files: string[]; publishConfig: Record<string, unknown> }

  mkdirSync(target, { recursive: true })
  for (const entry of manifest.files) {
    if (!existsSync(resolve(source, entry))) continue
    cpSync(resolve(source, entry), resolve(target, entry), { recursive: true })
  }

  const { publishConfig, devDependencies: _dev, scripts: _scripts, ...rest } = manifest
  const published: Record<string, unknown> = { ...rest, ...publishConfig, private: false }
  writeFileSync(resolve(target, 'package.json'), `${JSON.stringify(published, null, 2)}\n`)

  const own = resolve(source, 'node_modules')
  mkdirSync(resolve(target, 'node_modules'), { recursive: true })
  for (const entry of readdirSync(own)) {
    if (entry === '@polymorph' || entry.startsWith('.')) continue
    if (!entry.startsWith('@')) {
      symlinkSync(resolve(own, entry), resolve(target, 'node_modules', entry), 'dir')
      continue
    }
    // A scope is a real directory with a link for each package in it, as a
    // package manager writes one. Turbopack does not resolve a package through
    // a scope directory that is itself a link.
    mkdirSync(resolve(target, 'node_modules', entry), { recursive: true })
    for (const name of readdirSync(resolve(own, entry))) {
      symlinkSync(resolve(own, entry, name), resolve(target, 'node_modules', entry, name), 'dir')
    }
  }
}
