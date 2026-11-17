#!/usr/bin/env node
/**
 * `pnpm gate:engines` is the Firefox and WebKit gate. It runs every browser
 * project on each of the two engines: the `-firefox` and `-webkit` twins that
 * `PM_BROWSER_MATRIX=1` adds in `vitest.config.ts`. `pnpm gate` runs the same
 * projects on Chromium only.
 *
 * Each engine is its own `vitest run`, one after the other, so a failure's
 * output belongs to one engine and the two do not compete for the machine.
 * Both engines always run, so a failure on the first does not hide one on the
 * second. The exit code is the first failing engine's.
 *
 * The engines are Playwright's builds of them. One that is not installed fails
 * the gate before any test runs, with the command that installs it. This gate
 * has nothing else to check without its engines, so it does not pass on what
 * it skipped.
 *
 * With no vitest argument it then runs the static-page check
 * (`scripts/gate-no-build.mjs`) on the same engines: a page with no build,
 * served as plain files, loading the elements' no-build files, which it
 * builds first. `pnpm gate` runs that check on Chromium.
 *
 * `node scripts/gate-engines.mjs [engine…] [vitest argument…]`: an engine's
 * name runs that engine alone, and every other argument goes to vitest, so
 * `pnpm gate:engines webkit packages/vue-ui/src/overlays` runs one directory
 * on one engine, and no static-page check.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { firefox, webkit } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The fixed order. The exit code follows it. */
const engines = [
  { name: 'firefox', type: firefox },
  { name: 'webkit', type: webkit },
]

const args = process.argv.slice(2)
const named = args.filter((arg) => engines.some(({ name }) => name === arg))
const passed = args.filter((arg) => !named.includes(arg))
const selected = named.length > 0 ? engines.filter(({ name }) => named.includes(name)) : engines

/** Whether Playwright's build of the engine is on this machine. */
function installed({ type }) {
  try {
    return existsSync(type.executablePath())
  } catch {
    return false
  }
}

const missing = selected.filter((engine) => !installed(engine)).map(({ name }) => name)
if (missing.length > 0) {
  process.stderr.write(
    `gate:engines: ${missing.join(' and ')} not installed for Playwright. Run:\n` +
      `  pnpm exec playwright install ${missing.join(' ')}\n`,
  )
  process.exit(1)
}

const run = ({ name }) =>
  new Promise((done) => {
    const start = Date.now()
    const child = spawn(
      join(root, 'node_modules', '.bin', 'vitest'),
      ['run', '--project', `*-${name}`, ...passed],
      { cwd: root, stdio: 'inherit', env: { ...process.env, PM_BROWSER_MATRIX: '1' } },
    )
    child.on('error', (error) => {
      process.stderr.write(`gate:engines: could not run vitest: ${error.message}\n`)
      done({ code: 1, signal: null, seconds: (Date.now() - start) / 1000 })
    })
    child.on('close', (code, signal) => {
      done({ code: code ?? 1, signal, seconds: (Date.now() - start) / 1000 })
    })
  })

const wallStart = Date.now()
const verdicts = []
let failure = null
for (const engine of selected) {
  const { code, signal, seconds } = await run(engine)
  const verdict = code === 0 ? 'ok' : `failed (${signal ?? `exit ${code}`})`
  verdicts.push(`gate:engines: ${engine.name} — ${verdict}, ${seconds.toFixed(1)}s`)
  if (failure === null && code !== 0) failure = code
}

// The static-page check, on the same engines, unless vitest was given a subset to run.
if (passed.length === 0) {
  const start = Date.now()
  const names = selected.map(({ name }) => name)
  const code = await new Promise((done) => {
    const child = spawn(process.execPath, [join(root, 'scripts/gate-no-build.mjs'), ...names], {
      cwd: root,
      stdio: 'inherit',
    })
    child.on('error', () => done(1))
    child.on('close', (exit) => done(exit ?? 1))
  })
  const seconds = (Date.now() - start) / 1000
  verdicts.push(
    `gate:engines: the static-page check on ${names.join(' and ')} — ${code === 0 ? 'ok' : `failed (exit ${code})`}, ${seconds.toFixed(1)}s`,
  )
  if (failure === null && code !== 0) failure = code
}

// Every engine's verdict together, after the last run's output.
for (const line of verdicts) process.stderr.write(`${line}\n`)
const wall = ((Date.now() - wallStart) / 1000).toFixed(1)
process.stderr.write(
  `gate:engines: ${selected.map(({ name }) => name).join(', ')} in ${wall}s${failure === null ? '' : ' — FAILED'}\n`,
)
process.exitCode = failure ?? 0
