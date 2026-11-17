import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildRegistry, type Registry } from '@polymorph/registry'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { emitScreen } from './src/emit'
import type { ScreenSpec } from './src/schema'
import { validateSpec } from './src/validate'

/**
 * The round trip: Relay's screens, re-expressed as specs.
 *
 * The claim is that a screen can be described instead of written. The way to
 * test that is to describe screens that already exist and check whether the
 * description holds. `design/screens/*.json` holds Relay's three screens as
 * composition. This file emits them and asks two questions.
 *
 * **Does the vocabulary accept it?** The emitted files are written into
 * `packages/spec/.emitted/` and typechecked against the real
 * `@polymorph/react-ui` with `tsconfig.emit.json`. This checks the specs against
 * the components' real types, not against a shape written for this test. A spec that named a prop
 * wrong, passed a string where an element goes, or used a variant the grid does
 * not have would fail against the component's actual types. The test needs no
 * knowledge of what `ListPage` takes.
 *
 * **Do the specs still describe Relay?** A spec that stopped covering the
 * screen it was written from would pass every test above while describing
 * nothing real. So the last law reads the hand-written screens and checks that
 * the specs mention what they compose.
 *
 * **Does it hold for screens not listed here?** The three above are listed by
 * hand because the questions asked of them are about Relay. Every other law in
 * this file globs `design/screens/` instead, because the *composer* also saves
 * there. A screen made with the mouse must validate, emit and typecheck as
 * strictly as one written by hand, and a law that names its subjects cannot
 * cover a file created after it. One `tsc` program takes the whole emitted set,
 * so coverage follows the glob and the cost stays one process.
 *
 * The emitted files are deleted afterwards and never committed, so there are
 * no generated intermediates and no freshness tests. What ships is the spec,
 * and the TSX exists only while `tsc` reads it.
 */

const ROOT = resolve(import.meta.dirname, '../..')
const RELAY = 'apps/workbench/src/relay'
const SCREENS_DIR = resolve(ROOT, 'design/screens')
const EMITTED = resolve(import.meta.dirname, '.emitted')

/** The three screens Relay was written from, and the file each mirrors. */
const SCREENS = [
  { spec: 'inbox', view: 'InboxView', from: 'InboxPage.tsx' },
  { spec: 'new-ticket', view: 'NewTicketView', from: 'NewTicketPage.tsx' },
  { spec: 'settings', view: 'SettingsView', from: 'SettingsPage.tsx' },
]

/** Everything in the directory, both shipped and composer-saved. */
const EVERY = readdirSync(SCREENS_DIR)
  .filter((file) => file.endsWith('.json'))
  .sort()

const registry: Registry = buildRegistry(ROOT)

const specOf = (name: string): ScreenSpec =>
  JSON.parse(readFileSync(resolve(ROOT, `design/screens/${name}.json`), 'utf8')) as ScreenSpec

const emittedPath = (name: string) => resolve(EMITTED, `${name}.tsx`)

/** Per screen: what the validator said, and what the emitter did with it. */
const emitted = new Map<string, { faults: string[]; failed: string | null }>()

let typecheck: { code: number; output: string }

beforeAll(async () => {
  mkdirSync(EMITTED, { recursive: true })

  // The domain type a real consumer would already have. Relay's `Ticket` lives
  // in the screen's own directory. The emitted view only needs it to exist.
  writeFileSync(
    resolve(EMITTED, 'tickets.ts'),
    readFileSync(resolve(ROOT, RELAY, 'tickets.ts'), 'utf8'),
  )

  for (const file of EVERY) {
    const name = file.replace(/\.json$/, '')
    const path = emittedPath(name)
    const record: { faults: string[]; failed: string | null } = { faults: [], failed: null }
    try {
      const spec = specOf(name)
      record.faults = validateSpec(registry, spec).faults.map(
        (fault) => `${fault.path}: ${fault.message}`,
      )
      writeFileSync(path, await emitScreen(spec, { filepath: path }))
    } catch (error) {
      // This law exists to catch an emitter that throws. The fault must be
      // reported clearly, and a raw parser error from inside prettier is not.
      record.failed = error instanceof Error ? error.message : String(error)
    }
    emitted.set(file, record)
  }

  try {
    execFileSync('npx', ['tsc', '--noEmit', '-p', writeProject(EMITTED)], {
      cwd: ROOT,
      stdio: 'pipe',
    })
    typecheck = { code: 0, output: '' }
  } catch (error) {
    const failure = error as { status?: number; stdout?: Buffer; stderr?: Buffer }
    typecheck = {
      code: failure.status ?? 1,
      output: `${failure.stdout?.toString() ?? ''}${failure.stderr?.toString() ?? ''}`,
    }
  }
}, 300_000)

afterAll(() => {
  rmSync(EMITTED, { recursive: true, force: true })
})

describe('every screen in design/screens/, by construction', () => {
  /*
   * The law the composer needs. A hand-listed set of names covers nothing the
   * composer saves. Such a screen would appear in the Open list and render in
   * the canvas, but no test would emit it. So the subjects are read from the
   * directory, which is the only form of this law that covers a file created
   * after the law.
   */
  it('finds the screens to check', () => {
    expect(EVERY.length, 'design/screens/ has no screens in it').toBeGreaterThanOrEqual(3)
    expect(emitted.size).toBe(EVERY.length)
  })

  for (const file of EVERY) {
    it(file, () => {
      const record = emitted.get(file)
      expect(record?.faults, `${file} is not a lawful screen spec`).toEqual([])
      expect(record?.failed, `${file} could not be emitted`).toBeNull()
    })
  }

  it('emit TSX the vocabulary’s own types accept', () => {
    // The deep check. The whole directory goes into one `tsc` program. `tsc`
    // knows what `ListPage` takes, what shape an `emptyState` has, and that
    // `<Select value={…}>` wants a string or null, and none of that has to be
    // restated here.
    expect(typecheck.output).toBe('')
    expect(typecheck.code).toBe(0)
  })
})

describe('Relay’s screens, re-expressed as specs', () => {
  it('still describe the screens they were written from', () => {
    /*
     * This law keeps the round trip meaningful. Everything above would pass if
     * a spec stopped covering its screen, because it would be a lawful
     * description of something that no longer exists. So the hand-written
     * screen is read for the components it composes, and the spec must mention
     * them.
     *
     * The check is deliberately one-directional. A spec may name *more* than its
     * screen (the emitted view takes as props what the container computes, and a
     * container may wrap things the view does not). It may not name fewer,
     * because that is the direction drift goes.
     */
    for (const screen of SCREENS) {
      const spec = JSON.stringify(specOf(screen.spec))
      const missing = [...composedBy(screen.from)]
        .filter((name) => !spec.includes(`"${name}"`))
        .sort()
      expect(missing, `${screen.spec} no longer covers ${screen.from}`).toEqual([])
    }
  })

  it('produce views a container can actually render', () => {
    // Every input is a prop the container supplies, so a view with no inputs
    // would be a screen with no data. A view that binds something it was not
    // given is caught by `validateSpec`. This checks the shape: the emitted half
    // is presentational, and everything else stays in the container.
    for (const screen of SCREENS) {
      const spec = specOf(screen.spec)
      expect(spec.name, screen.spec).toBe(screen.view)
      expect(spec.inputs.length, screen.spec).toBeGreaterThan(0)
      expect(
        spec.inputs.some((input) => input.type.includes('=>')),
        `${screen.spec}: a screen with no callbacks does nothing`,
      ).toBe(true)
    }
  })
})

/**
 * The components a screen composes in its returned tree.
 *
 * It is scoped to the `return`, and that boundary is the container/view split.
 * Above it a screen has state, derived data and, in InboxPage, column
 * definitions whose cells render `Avatar` and `Badge`. Those are *code*: a
 * function per cell, which a spec cannot express and correctly receives as an
 * input. Below the return is composition, which is what a spec is for. A scan
 * of the whole file would require the spec to cover the cell renderers, and a
 * spec that covered them would no longer be declarative.
 */
function composedBy(file: string): Set<string> {
  const source = readFileSync(resolve(ROOT, RELAY, file), 'utf8')
  const tree = source.slice(source.lastIndexOf('\n  return ('))

  const names = [...tree.matchAll(/<([A-Z][A-Za-z0-9]*(?:\.[A-Z][A-Za-z0-9]*)?)[\s/>]/g)].map(
    (match) => match[1] as string,
  )

  // `SettingsArchetype` is `SettingsPage` under an alias. The screen and the
  // archetype share a name, and only the container has to disambiguate.
  return new Set(names.filter((name) => name !== 'SettingsArchetype'))
}

/**
 * A project for one `tsc` run over one scratch directory.
 *
 * `tsconfig.emit.json` holds the compiler options and no files. The `include`
 * lives here so that two spec tests running at once cannot typecheck each
 * other's half-written output. `css-modules.d.ts` is the same ambient
 * declaration the installer copies into a consumer's repository, for the same
 * reason: without it every `import styles from './x.module.css'` in the
 * vocabulary is a type error.
 */
function writeProject(directory: string): string {
  writeFileSync(
    resolve(directory, 'tsconfig.json'),
    `${JSON.stringify(
      {
        extends: '../tsconfig.emit.json',
        include: ['**/*.ts', '**/*.tsx', '../../react-ui/src/css-modules.d.ts'],
      },
      null,
      2,
    )}\n`,
  )
  return resolve(directory, 'tsconfig.json')
}
