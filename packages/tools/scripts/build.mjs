#!/usr/bin/env node
import { fork } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { createJiti } from 'jiti'
import { build } from 'vite'

/**
 * `pnpm --filter @polymorph/tools build`: the published tools' `dist/`.
 *
 * `dist/` is a slice of this repository at the repository's paths, so it is the
 * source root the published CLI and server read, as a checkout is in a
 * checkout. It is written in four steps:
 *
 *  1. **The modules**, by `vite.build.config.ts`: the two bins and the screen
 *     emitter at the top, and every module they run at its source path.
 *  2. **The registry** of the tree the build runs in, at `registry/registry.json`,
 *     where `pnpm registry` writes it in a checkout. The tools answer for this
 *     release, and an app `init` writes pins it.
 *  3. **The source tree**: every file the registry names (`namedFiles`), every
 *     file the elements' no-build directory holds, and what the native screen
 *     emitters read of each platform's member package (`NATIVE_FILES`: its
 *     generated contract and the list of members it draws), each copied at
 *     its own path. The list is the registry's, so the build fails on a named
 *     file that is missing rather than copying a directory. The no-build
 *     files are a build output: `pnpm --filter @polymorph/elements-ui build`
 *     writes them, and this step fails without them.
 *  4. **The screen page** `render_screen` draws in, at `screen/`. The
 *     workbench's own builder (`apps/workbench/screen.build.mjs`) builds it, as
 *     it does for a checkout's server, and this step writes the files it sends.
 *     The published server reads them and builds nothing.
 *
 * A copied file never replaces a module of step 1: the build fails on one that
 * would, because the two would be the same path read for two things.
 */

const PACKAGE = resolve(import.meta.dirname, '..')
const ROOT = resolve(PACKAGE, '../..')
const DIST = resolve(PACKAGE, 'dist')

function fail(message) {
  console.error(`tools build: ${message}`)
  process.exit(1)
}

/** Every file below `dir`, relative to `root`, with `/` between segments. */
function filesBelow(root, dir) {
  const found = []
  const walk = (at) => {
    for (const entry of readdirSync(resolve(root, at), { withFileTypes: true })) {
      const path = `${at}/${entry.name}`
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) found.push(path)
    }
  }
  walk(dir)
  return found
}

// 1. The modules.
await build({ configFile: resolve(PACKAGE, 'vite.build.config.ts'), logLevel: 'warn' })
const modules = new Set(filesBelow(DIST, '.').map((path) => path.slice(2)))

// 2. The registry.
const jiti = createJiti(import.meta.url)
const { buildRegistry, renderRegistry } = await jiti.import(
  resolve(ROOT, 'packages/registry/src/build.ts'),
)
const { namedFiles } = await jiti.import(resolve(ROOT, 'packages/registry/src/files.ts'))
const { NATIVE_FILES } = await jiti.import(resolve(ROOT, 'packages/spec/src/emit-native.ts'))
const registry = buildRegistry(ROOT)
mkdirSync(resolve(DIST, 'registry'), { recursive: true })
writeFileSync(resolve(DIST, 'registry/registry.json'), renderRegistry(registry))

// 3. The source tree.
const noBuild = registry.vendor.frameworks.elements.noBuild
if (noBuild === undefined) fail('the registry names no files for a page with no build')
if (!existsSync(resolve(ROOT, noBuild.dir))) {
  fail(
    `${noBuild.dir} is missing. It is the elements' build output: run ` +
      '`pnpm --filter @polymorph/elements-ui build`, then this build again.',
  )
}
const shipped = [
  ...namedFiles(registry),
  ...filesBelow(ROOT, noBuild.dir),
  ...Object.values(NATIVE_FILES).flatMap(({ contract, drawn }) => [contract, drawn]),
]
const missing = shipped.filter((path) => !existsSync(resolve(ROOT, path)))
if (missing.length > 0) {
  fail(`the registry names files this tree does not have:\n  ${missing.join('\n  ')}`)
}
const clashing = shipped.filter((path) => modules.has(path))
if (clashing.length > 0) fail(`these files are also built modules:\n  ${clashing.join('\n  ')}`)
for (const path of shipped) {
  mkdirSync(dirname(resolve(DIST, path)), { recursive: true })
  copyFileSync(resolve(ROOT, path), resolve(DIST, path))
}

// 4. The screen page.
const page = await new Promise((done, refuse) => {
  // A production build, as every published build is: React's development build writes each
  // source file's absolute path into the page, and the page would carry this machine's paths.
  const builder = fork(resolve(ROOT, 'apps/workbench/screen.build.mjs'), [], {
    serialization: 'advanced',
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    env: { ...process.env, NODE_ENV: 'production' },
  })
  let answered = false
  builder.on('message', (message) => {
    answered = true
    if (message && 'files' in message) done(message.files)
    else refuse(new Error(message?.error ?? 'the screen builder sent nothing'))
  })
  builder.on('error', refuse)
  builder.on('exit', (code) => {
    if (!answered) refuse(new Error(`the screen builder exited with code ${code}`))
  })
}).catch((error) => fail(`the screen page did not build: ${error.message}`))
if (!page.some((file) => file.name === 'screen.html')) fail('the screen page has no screen.html')
for (const { name, body } of page) {
  const target = resolve(DIST, 'screen', name)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, typeof body === 'string' ? body : Buffer.from(body))
}

console.log(
  `tools build: ${modules.size} modules, the registry, ${shipped.length} source files ` +
    `and ${page.length} page files in ${DIST}`,
)
