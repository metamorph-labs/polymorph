import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { installNodeModules, runIn, write } from '../cli/consumer-app'
import { buildEngine, lockEngineDist } from '../engine/dist-lock'
import { buildReact, lockReactDist } from '../react/dist-lock'
import { buildReactUi, lockReactUiDist } from './dist-lock'

/**
 * The server-render law: Node loads the published vocabulary, and every state
 * of every member renders to markup there.
 *
 * A framework that renders on a server (Next.js, React Router, Astro) runs each
 * member in Node before a browser has it. Two things can fail there and nowhere
 * else in this repository, because every other member test runs in a browser:
 *
 *  - a built module imports something Node cannot load, such as a stylesheet.
 *    The package's `imports` map answers a stylesheet import with an empty
 *    module under the `node` condition (`vite.build.config.ts`).
 *  - a member reads `document`, `window` or a layout measurement while it
 *    renders. Those belong in an effect, which a server render does not run.
 *
 * So this assembles a consumer's `node_modules` from the packages' builds
 * (`packages/cli/consumer-app.ts`), outside the workspace, and renders every
 * state of every states fixture with `react-dom/server` in a separate Node
 * process. An `import()` inside vitest would go through Vite's transform
 * pipeline and would test whether Vite can load the files.
 *
 * `pnpm gate:next` (`scripts/gate-next.mjs`) builds a Next.js application from
 * the same builds and checks what only a framework's bundler decides: which
 * stylesheets reach the page, and whether the client's markup matches the
 * server's.
 */

const PACKAGE = import.meta.dirname

/** Every states fixture in the vocabulary's source, which is one per member. */
function statesFixtures(directory: string = resolve(PACKAGE, 'src')): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return statesFixtures(path)
    return entry.name.endsWith('.states.tsx') ? [path] : []
  })
}

/**
 * Renders every state and prints what failed. React reports a server-render
 * problem that does not throw through `console.error`, so those are collected
 * too.
 */
const PROBE = `
import { renderToString } from 'react-dom/server'
import * as galleries from '@polymorph/react-ui/galleries'

const members = Object.values(galleries).filter(Array.isArray).flat()
const failures = []
let states = 0
for (const member of members) {
  for (const state of member.entries) {
    states += 1
    const reported = []
    const original = console.error
    console.error = (...args) => reported.push(args.map(String).join(' '))
    try {
      renderToString(state.render())
    } catch (error) {
      reported.push(String(error && error.message))
    } finally {
      console.error = original
    }
    for (const message of reported) {
      failures.push(member.component + ' / ' + state.name + ': ' + message.split('\\n')[0])
    }
  }
}
console.log(JSON.stringify({ members: members.length, states, failures }))
`

let parent: string
let app: string

/**
 * The three builds run under their locks, taken in the order every holder
 * takes them (`packages/engine/dist-lock.ts`), and the locks are held until
 * `installNodeModules` has copied each `dist` into the app.
 */
beforeAll(async () => {
  parent = mkdtempSync(resolve(tmpdir(), 'polymorph-server-render-'))
  app = resolve(parent, 'app')
  write(
    app,
    'package.json',
    `${JSON.stringify(
      {
        name: 'server-render',
        private: true,
        type: 'module',
        dependencies: {
          '@polymorph/engine': '*',
          '@polymorph/react': '*',
          '@polymorph/react-ui': '*',
          react: '*',
          'react-dom': '*',
        },
      },
      null,
      2,
    )}\n`,
  )
  write(app, 'render.mjs', PROBE)

  const releases: (() => void)[] = []
  try {
    releases.push(await lockEngineDist('server-render.test.ts'))
    releases.push(await lockReactDist('server-render.test.ts'))
    releases.push(await lockReactUiDist('server-render.test.ts'))
    buildEngine()
    buildReact()
    buildReactUi()

    installNodeModules(app, 'declared')
  } finally {
    for (const release of releases.reverse()) release()
  }
}, 900_000)

afterAll(() => {
  if (parent) rmSync(parent, { recursive: true, force: true })
})

describe('Node renders the published vocabulary', () => {
  it('loads every member and renders every state without an error', () => {
    const { code, output } = runIn(app, process.execPath, ['render.mjs'])
    // A module Node cannot load fails the import, before any state renders.
    expect(code, output).toBe(0)

    const result = JSON.parse(output.trim().split('\n').pop() as string) as {
      members: number
      states: number
      failures: string[]
    }
    expect(result.failures).toEqual([])
    // Every member's fixture was rendered, so an empty list is meaningful.
    expect(result.members).toBe(statesFixtures().length)
    expect(result.states).toBeGreaterThan(result.members)
  }, 120_000)
})
