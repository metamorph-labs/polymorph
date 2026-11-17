import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { verify } from '@polymorph/rules/verify'
import { buildRegistry, renderSystemCard, type Registry } from '@polymorph/registry'
import { afterAll, describe, expect, it } from 'vitest'

import { emitScreen } from './src/emit'
import type { ScreenSpec } from './src/schema'
import { validateSpec } from './src/validate'

/**
 * The agent-loop acceptance test (`docs/verification.md`).
 *
 * > *An agent given only the registry and a screen brief produces a spec that
 * > passes all red rules.*
 *
 * That needs a spec format: something an agent can produce that the system can
 * check. `@polymorph/spec` is that format, and this is the scripted-agent
 * fixture that exercises it.
 *
 * The fixture is three files in `design/screens/agent-loop/`: the brief, a
 * first attempt and a second. Both attempts are committed on purpose. The test
 * does not show that "an agent can be right", which says nothing about a
 * system. It shows that the system tells an agent exactly what is wrong, and
 * that the correction converges. Attempt 1 makes the five mistakes agents
 * actually make: a `className`, a variant × tone cell that does not exist, an
 * invented icon role, a binding to nothing, and a component borrowed from a
 * different design system. Each one comes back as a fault with a path.
 *
 * **"Given only the system card"** is checked, not assumed. Every component and
 * every icon role the accepted spec names must appear in the card, which is a
 * real file this repository generates. An agent that had read the source could
 * have used something the card never mentions, and this test would catch it.
 *
 * No real model runs, because that step is optional. Everything downstream of
 * the model runs: the format, the validation, the correction, and the emitted
 * screen going through every red rule and the vocabulary's own type checker.
 */

const ROOT = resolve(import.meta.dirname, '../..')
const FIXTURE = 'design/screens/agent-loop'

const registry: Registry = buildRegistry(ROOT)
const card = renderSystemCard(registry)

const attempt = (name: string): ScreenSpec =>
  JSON.parse(readFileSync(resolve(ROOT, FIXTURE, `${name}.json`), 'utf8')) as ScreenSpec

const brief = readFileSync(resolve(ROOT, FIXTURE, 'brief.md'), 'utf8')

/** Its own scratch directory, so two spec tests can run at once. */
const EMITTED = resolve(import.meta.dirname, '.emitted-agent')
const VIEW = resolve(EMITTED, 'api-keys.tsx')

afterAll(() => {
  rmSync(EMITTED, { recursive: true, force: true })
})

describe('the brief describes the job without naming components', () => {
  it('says what the screen must do and names no component', () => {
    // If the brief named `ListPage`, the test would only check transcription.
    // The brief describes a job (a table, a create action, a destructive action
    // that asks first, an empty state) and leaves every choice to the agent.
    expect(brief).toContain('sortable by last used')
    for (const component of registry.components.map((entry) => entry.name)) {
      expect(brief, `the brief names ${component}`).not.toContain(component)
    }
  })
})

describe('the first attempt is rejected with specific faults', () => {
  const faults = validateSpec(registry, attempt('attempt-1')).faults
  const messageAt = (path: string) =>
    faults.find((fault) => fault.path === path)?.message ?? `no fault at ${path}`

  it('is rejected', () => {
    // Six: the five mistakes above, plus the omitted empty state, which only the
    // validator's value-and-requirement check can see.
    expect(faults.length).toBe(6)
  })

  it('catches the style decision', () => {
    // Not by name. `ListPage` has no `className`, so this is the same fault a
    // typo gets. That is why a new style prop cannot get past it.
    expect(messageAt('$.root.props.className')).toBe('`ListPage` has no prop `className`')
  })

  it('catches the variant × tone cell that does not exist', () => {
    // The most plausible invention in the system is a filled neutral button. The
    // catalogue has no neutral interactive fill.
    expect(messageAt('$.root.props.actions.props.tone')).toContain('no `solid` × `neutral` cell')
  })

  it('catches the hallucinated icon role, which is what the closed enum is for', () => {
    // This is the closed role set's stated purpose, enforced at the spec
    // boundary. In TSX a bad role is a type error, and in a document it would
    // be a missing glyph. (The fixture's invented role must stay a name the set
    // does not have. If that name is ever promoted to a real role, the
    // promotion path is working, and the fixture should use another name.)
    expect(messageAt('$.root.props.emptyState.props.icon')).toContain('is not an icon role')
  })

  it('catches the binding to nothing', () => {
    expect(messageAt('$.root.children[0].props.getRowId')).toContain('does not declare as an input')
  })

  it('catches the omitted empty state, which is the completeness law at the spec boundary', () => {
    // DataTable requires `emptyState` in TSX, so a spec without one describes
    // a screen that cannot compile. The validator's value-and-requirement check
    // catches it here.
    expect(messageAt('$.root.children[0]')).toContain('missing its required prop `emptyState`')
  })

  it('catches the component borrowed from somewhere else, and offers ours', () => {
    // `Modal` is the common industry name, and no edit distance reaches
    // `Dialog`. The purpose text does, because it opens "Modal interruption".
    const message = messageAt('$.root.children[1]')
    expect(message).toContain('no component called `Modal`')
    expect(message).toContain('`Dialog`')
  })
})

describe('the second attempt passes every law', () => {
  const spec = attempt('attempt-2')

  it('is a lawful spec', () => {
    expect(validateSpec(registry, spec).faults).toEqual([])
  })

  it('uses only components and icon roles the system card names', () => {
    // The mechanical reading of "given only the system card". Every component
    // and every icon role the spec uses must be in that file.
    const names = [...JSON.stringify(spec).matchAll(/"component":\s*"([^"]+)"/g)].map(
      (match) => (match[1] as string).split('.')[0] as string,
    )
    for (const name of new Set(names)) {
      expect(card, `${name} is not in the system card`).toContain(`**${name}**`)
    }

    const icons = [...JSON.stringify(spec).matchAll(/"icon":\s*"([^"]+)"/g)].map(
      (match) => match[1] as string,
    )
    for (const icon of new Set(icons)) {
      expect(card, `${icon} is not in the system card`).toContain(icon)
    }
  })

  it('answers the brief', () => {
    const json = JSON.stringify(spec)
    // A sortable table, a create action, a destructive action that asks first,
    // and an empty state. Four requirements, four things to find.
    expect(json).toContain('"onSortChange"')
    expect(json).toContain('"Create key"')
    expect(json).toContain('"ConfirmDialog"')
    expect(json).toContain('"emptyState"')
  })

  it('emits TSX that passes every red rule', async () => {
    const code = await emitScreen(spec, { filepath: VIEW })
    const result = await verify(code, { filename: VIEW })

    expect(result.fatal).toBeNull()
    expect(result.diagnostics).toEqual([])
  })

  it('emits TSX the vocabulary’s own types accept', async () => {
    // Schema checking cannot answer this: does the composition typecheck
    // against the components it names?
    mkdirSync(EMITTED, { recursive: true })
    writeFileSync(VIEW, await emitScreen(spec, { filepath: VIEW }))
    // The screen's own domain type, which a real consumer would already have.
    writeFileSync(
      resolve(EMITTED, 'keys.ts'),
      'export interface ApiKey {\n  id: string\n  name: string\n}\n',
    )

    let output = ''
    try {
      execFileSync('npx', ['tsc', '--noEmit', '-p', writeProject(EMITTED)], {
        cwd: ROOT,
        stdio: 'pipe',
      })
    } catch (error) {
      const failure = error as { stdout?: Buffer; stderr?: Buffer }
      output = `${failure.stdout?.toString() ?? ''}${failure.stderr?.toString() ?? ''}`
    }
    expect(output).toBe('')
  }, 300_000)
})

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
