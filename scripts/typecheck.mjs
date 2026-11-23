#!/usr/bin/env node
/**
 * `pnpm typecheck` runs the workspace's `tsc --noEmit -p` invocations
 * concurrently, `vue-tsc` for the Vue packages, `svelte-check` for the
 * Svelte packages and `ngc` for the Angular packages. The Solid packages, and
 * the elements packages that render the Solid members, are TSX that `tsc`
 * reads with Solid's JSX types (`jsxImportSource: "solid-js"` in their
 * tsconfigs).
 *
 * Running them concurrently is safe because the projects do not depend on each
 * other's output. Every workspace package's `exports` points at `./src/*.ts`, so
 * each program resolves the others as source and none reads another's emitted
 * declarations. `pnpm gate` confirms this: it runs `pnpm typecheck` before
 * `pnpm build`, and `dist/` is gitignored, so on a fresh checkout a project that
 * needed another's build output would fail.
 *
 * Warm re-checks come from `"incremental"` plus a named `tsBuildInfoFile` in
 * each project's own tsconfig. They are set per project rather than in
 * `tsconfig.base.json`, because `packages/spec/tsconfig.emit.json` extends the
 * base for throwaway scratch programs that must not cache. The caches live in
 * `node_modules/.cache/tsbuildinfo/`, inside the gitignored `node_modules/`, so
 * a fresh checkout always starts cold.
 *
 * Each project's output is buffered and flushed in declaration order, child
 * stdout to stdout and child stderr to stderr. This script's own status lines
 * go to stderr only. The exit code is the first failing project's. All projects
 * always run, so errors in a later project are reported alongside the first
 * instead of being hidden by it.
 */

import { spawn } from 'node:child_process'
import { availableParallelism } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tsc = join(root, 'node_modules', '.bin', 'tsc')
/**
 * The Vue packages hold single-file components, which `tsc` cannot read.
 * `vue-tsc` checks them, script and template alike, from the vocabulary's own
 * install.
 */
const vueTsc = join(root, 'packages', 'vue-ui', 'node_modules', '.bin', 'vue-tsc')
const VUE_PROJECTS = new Set(['packages/vue/tsconfig.json', 'packages/vue-ui/tsconfig.json'])
/**
 * The Svelte packages hold Svelte components and rune modules, which `tsc`
 * cannot read. `svelte-check` checks them, scripts and markup alike, from the
 * vocabulary's own install, with each package as its workspace so it reads
 * that package's compiler options. A warning fails it too.
 */
const svelteCheck = join(root, 'packages', 'svelte-ui', 'node_modules', '.bin', 'svelte-check')
const SVELTE_PROJECTS = new Set([
  'packages/svelte/tsconfig.json',
  'packages/svelte-ui/tsconfig.json',
])
/**
 * The Angular packages are checked by Angular's compiler, `ngc`, templates
 * included, with the TypeScript 6.0 each package installs, which the compiler
 * requires (the root's is 5.9).
 */
const ANGULAR_PROJECTS = new Map([
  [
    'packages/angular/tsconfig.json',
    join(root, 'packages', 'angular', 'node_modules', '.bin', 'ngc'),
  ],
  [
    'packages/angular-ui/tsconfig.json',
    join(root, 'packages', 'angular-ui', 'node_modules', '.bin', 'ngc'),
  ],
])
const command = (project) =>
  ANGULAR_PROJECTS.has(project)
    ? [ANGULAR_PROJECTS.get(project), ['-p', project, '--noEmit']]
    : SVELTE_PROJECTS.has(project)
      ? [
          svelteCheck,
          [
            '--tsconfig',
            join(root, project),
            '--workspace',
            dirname(join(root, project)),
            '--fail-on-warnings',
            '--output',
            'human',
          ],
        ]
      : [VUE_PROJECTS.has(project) ? vueTsc : tsc, ['--noEmit', '-p', project]]

/** Declaration order. Output is flushed in this order, and the exit code follows it. */
const projects = [
  'tsconfig.json',
  'packages/theme/tsconfig.json',
  'packages/engine/tsconfig.json',
  'packages/engine/tsconfig.node.json',
  'packages/rules/tsconfig.json',
  'packages/react/tsconfig.json',
  'packages/react/tsconfig.node.json',
  'packages/registry/tsconfig.json',
  'packages/cli/tsconfig.json',
  'packages/mcp/tsconfig.json',
  'packages/spec/tsconfig.json',
  'packages/screen/tsconfig.json',
  'packages/screen/tsconfig.node.json',
  'packages/native/tsconfig.json',
  'packages/react-ui/tsconfig.json',
  'packages/react-ui/tsconfig.node.json',
  'packages/conformance/tsconfig.json',
  'packages/conformance/tsconfig.node.json',
  'packages/shells/tsconfig.json',
  'packages/vue/tsconfig.json',
  'packages/vue/tsconfig.node.json',
  'packages/vue-ui/tsconfig.json',
  'packages/vue-ui/tsconfig.node.json',
  'packages/svelte/tsconfig.json',
  'packages/svelte/tsconfig.node.json',
  'packages/svelte-ui/tsconfig.json',
  'packages/svelte-ui/tsconfig.node.json',
  'packages/solid/tsconfig.json',
  'packages/solid/tsconfig.node.json',
  'packages/solid-ui/tsconfig.json',
  'packages/solid-ui/tsconfig.node.json',
  'packages/angular/tsconfig.json',
  'packages/angular/tsconfig.node.json',
  'packages/angular-ui/tsconfig.json',
  'packages/angular-ui/tsconfig.node.json',
  'packages/elements/tsconfig.json',
  'packages/elements/tsconfig.node.json',
  'packages/elements-ui/tsconfig.json',
  'packages/elements-ui/tsconfig.node.json',
  'apps/workbench/tsconfig.json',
  'apps/docs/tsconfig.json',
  'eval/tsconfig.json',
]

/**
 * Start order. This is only a scheduling hint: the largest program starts
 * first, so a pool narrower than the list (CI runners) never queues a
 * seven-second project behind a one-second one. The ranking comes from measured
 * cold times on a ten-core machine. A stale ranking costs seconds, never
 * correctness, and a project missing from the hint still runs (in declaration
 * order, after the hinted ones).
 */
const hint = [
  'packages/react-ui/tsconfig.json',
  'apps/docs/tsconfig.json',
  'apps/workbench/tsconfig.json',
  'packages/engine/tsconfig.json',
  'packages/mcp/tsconfig.json',
  'packages/cli/tsconfig.json',
  'packages/spec/tsconfig.json',
  'packages/native/tsconfig.json',
  'packages/registry/tsconfig.json',
  'packages/react/tsconfig.json',
  'packages/rules/tsconfig.json',
  'packages/theme/tsconfig.json',
  'tsconfig.json',
  'packages/react-ui/tsconfig.node.json',
  'packages/engine/tsconfig.node.json',
  'packages/react/tsconfig.node.json',
]
const rank = (project) => {
  const index = hint.indexOf(project)
  return index === -1 ? hint.length : index
}
const startOrder = projects
  .map((_, index) => index)
  .sort((a, b) => rank(projects[a]) - rank(projects[b]))

const check = (project) =>
  new Promise((done) => {
    const start = Date.now()
    const stdout = []
    const stderr = []
    const [program, programArgs] = command(project)
    const child = spawn(program, programArgs, { cwd: root })
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.on('error', (error) => {
      stderr.push(`typecheck: could not run tsc for ${project}: ${error.message}\n`)
      done({ code: 1, signal: null, stdout, stderr, seconds: (Date.now() - start) / 1000 })
    })
    child.on('close', (code, signal) => {
      done({ code: code ?? 1, signal, stdout, stderr, seconds: (Date.now() - start) / 1000 })
    })
  })

const results = []
let flushedTo = 0

/** Flush every finished project whose predecessors (in declaration order) are flushed. */
const flush = () => {
  while (flushedTo < projects.length && results[flushedTo] !== undefined) {
    const { code, signal, stdout, stderr, seconds } = results[flushedTo]
    for (const chunk of stdout) process.stdout.write(chunk)
    for (const chunk of stderr) process.stderr.write(chunk)
    const verdict = code === 0 ? 'ok' : `failed (${signal ?? `exit ${code}`})`
    process.stderr.write(`typecheck: ${projects[flushedTo]} — ${verdict}, ${seconds.toFixed(1)}s\n`)
    flushedTo += 1
  }
}

const wallStart = Date.now()
const queue = startOrder.values()
const worker = async () => {
  // Workers share one iterator, so each next() hands out the next unstarted project.
  for (const index of queue) {
    results[index] = await check(projects[index])
    flush()
  }
}
await Promise.all(Array.from({ length: Math.min(projects.length, availableParallelism()) }, worker))

const firstFailure = results.find(({ code }) => code !== 0)
const wall = ((Date.now() - wallStart) / 1000).toFixed(1)
process.stderr.write(
  `typecheck: ${projects.length} projects in ${wall}s${firstFailure ? ' — FAILED' : ''}\n`,
)
process.exitCode = firstFailure ? firstFailure.code : 0
