#!/usr/bin/env node
/**
 * `pnpm lint` runs three tools concurrently: `eslint .`, stylelint over the css
 * glob with `--allow-empty-input`, and `prettier --check .`. The two tools that
 * support a cache use it. File sets and rules are the same as running each tool
 * alone. The flags below change how long a run takes, not what it checks.
 *
 * Caches live under `node_modules/.cache/`: eslint's in `eslint/` by explicit
 * flag, prettier's at `prettier/.prettier-cache` by its own default. They sit
 * inside the gitignored `node_modules/`, so a fresh checkout has none and
 * always does a full, correct run. stylelint runs without a cache flag. Most of
 * its ~2s is the jiti bridge in `stylelint.config.js`, which keeps its own cache.
 *
 * Known cache gap: eslint invalidates on config and eslint-version changes, but
 * not on an edit to a rule's implementation in `packages/rules/src`. After
 * changing a rule, run `rm -rf node_modules/.cache/eslint`. The rules' own
 * vitest suites run without a cache, so a stale lint result cannot pass them. Prettier's cache keys on file content,
 * options and its own version, and this repository loads no prettier plugins
 * that could go stale behind it.
 *
 * Output is buffered per tool and flushed in a fixed order (eslint, stylelint,
 * prettier). This script's own status lines go to stderr. The exit code is the
 * first failing tool's. Every tool always runs, so a later tool's findings are
 * reported alongside an earlier tool's failure instead of being hidden by it.
 *
 * `node scripts/lint.mjs [tool…]` runs a subset. `lint:js`, `lint:css` and
 * `lint:format` are aliases for those subsets, so each tool's flags live in one
 * place.
 */

import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The fixed order. Output is flushed in this order, and the exit code follows it. */
const tools = [
  { name: 'eslint', args: ['.', '--cache', '--cache-location', 'node_modules/.cache/eslint/'] },
  { name: 'stylelint', args: ['{packages,apps}/**/*.css', '--allow-empty-input'] },
  { name: 'prettier', args: ['--check', '.', '--cache'] },
]

const requested = process.argv.slice(2)
const unknown = requested.filter((name) => !tools.some((tool) => tool.name === name))
if (unknown.length > 0) {
  process.stderr.write(
    `lint: unknown tool ${unknown.join(', ')} — expected ${tools.map(({ name }) => name).join(', ')}\n`,
  )
  process.exit(1)
}
const selected = requested.length > 0 ? tools.filter(({ name }) => requested.includes(name)) : tools

const run = ({ name, args }) =>
  new Promise((done) => {
    const start = Date.now()
    const stdout = []
    const stderr = []
    const child = spawn(join(root, 'node_modules', '.bin', name), args, { cwd: root })
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.on('error', (error) => {
      stderr.push(`lint: could not run ${name}: ${error.message}\n`)
      done({ code: 1, signal: null, stdout, stderr, seconds: (Date.now() - start) / 1000 })
    })
    child.on('close', (code, signal) => {
      done({ code: code ?? 1, signal, stdout, stderr, seconds: (Date.now() - start) / 1000 })
    })
  })

const wallStart = Date.now()
const running = selected.map(run)

let failure = null
for (const [index, promise] of running.entries()) {
  const { code, signal, stdout, stderr, seconds } = await promise
  for (const chunk of stdout) process.stdout.write(chunk)
  for (const chunk of stderr) process.stderr.write(chunk)
  const verdict = code === 0 ? 'ok' : `failed (${signal ?? `exit ${code}`})`
  process.stderr.write(`lint: ${selected[index].name} — ${verdict}, ${seconds.toFixed(1)}s\n`)
  if (failure === null && code !== 0) failure = code
}

const wall = ((Date.now() - wallStart) / 1000).toFixed(1)
process.stderr.write(
  `lint: ${selected.map(({ name }) => name).join(', ')} in ${wall}s${failure === null ? '' : ' — FAILED'}\n`,
)
process.exitCode = failure ?? 0
