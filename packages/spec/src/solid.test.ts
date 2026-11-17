import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { buildRegistry, type Registry } from '@polymorph/registry'
import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { emitScreen, IMPORT_SOURCE, SOLID_IMPORT_SOURCE } from './emit'
import { emitCheckedScreen, validateSpec } from './lawful'
import { SPEC_ID, type ScreenSpec } from './schema'

/**
 * The same spec, emitted for Solid.
 *
 * Solid is written in TSX, and a Solid member takes the React member's props
 * under the same names, so the tree is the React emitter's. Two things differ:
 * the members come from `@polymorph/solid-ui`, and the component reads its
 * inputs from `props` instead of destructuring them, because a destructured
 * Solid prop is read once. These tests check that each Relay screen typechecks
 * with Solid's JSX types against the Solid vocabulary's own source, passes
 * every red rule as Solid TSX, and is the same bytes every time.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)

const SCREENS = ['inbox', 'new-ticket', 'settings']

const screen = (name: string): ScreenSpec =>
  JSON.parse(readFileSync(resolve(ROOT, `design/screens/${name}.json`), 'utf8')) as ScreenSpec

/** Where an emitted Solid screen would live in this repository, for its Prettier config. */
const solidPath = (name: string) => resolve(ROOT, `apps/workbench/src/relay/${name}.view.tsx`)

const emitSolid = (spec: ScreenSpec, name = 'probe') =>
  emitScreen(spec, { framework: 'solid', filepath: solidPath(name) })

/**
 * Every error TypeScript reports in the emitted files, checked as Solid TSX
 * (`jsxImportSource: 'solid-js'`) against `@polymorph/solid-ui`'s source.
 * The files are virtual, placed in this package so `@internationalized/date`
 * resolves, beside a `tickets` module that declares the Relay ticket.
 */
function solidTypeErrors(files: Record<string, string>): Record<string, string[]> {
  const at = (name: string) => resolve(import.meta.dirname, '__emitted__', name)
  const virtual = new Map<string, string>([
    [at('tickets.ts'), 'export interface Ticket {\n  id: string\n  subject: string\n}\n'],
    ...Object.entries(files).map(([name, code]) => [at(`${name}.view.tsx`), code] as const),
  ])
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.Preserve,
    jsxImportSource: 'solid-js',
    lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    types: [],
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    isolatedModules: true,
    verbatimModuleSyntax: true,
    paths: { [SOLID_IMPORT_SOURCE]: [resolve(ROOT, 'packages/solid-ui/src/index.ts')] },
  }
  const host = ts.createCompilerHost(options)
  const read = host.readFile.bind(host)
  const exists = host.fileExists.bind(host)
  const source = host.getSourceFile.bind(host)
  host.readFile = (file) => virtual.get(file) ?? read(file)
  host.fileExists = (file) => virtual.has(file) || exists(file)
  const directory = host.directoryExists?.bind(host)
  host.directoryExists = (path) => path === at('') || (directory?.(path) ?? true)
  host.getSourceFile = (file, language, ...rest) => {
    const text = virtual.get(file)
    return text === undefined
      ? source(file, language, ...rest)
      : ts.createSourceFile(file, text, language, true, ts.ScriptKind.TSX)
  }
  const program = ts.createProgram(
    [...virtual.keys(), resolve(ROOT, 'packages/solid-ui/src/css-modules.d.ts')],
    options,
    host,
  )
  return Object.fromEntries(
    Object.keys(files).map((name) => {
      const file = program.getSourceFile(at(`${name}.view.tsx`))
      const diagnostics = file === undefined ? [] : ts.getPreEmitDiagnostics(program, file)
      return [
        name,
        diagnostics.map((diagnostic) => {
          const where =
            diagnostic.start === undefined || diagnostic.file === undefined
              ? ''
              : `${diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1}: `
          return `${where}${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`
        }),
      ]
    }),
  )
}

describe('the Relay screens, emitted for Solid', () => {
  const emitted: Record<string, string> = {}
  let errors: Record<string, string[]> = {}
  beforeAll(async () => {
    for (const name of SCREENS) emitted[name] = await emitSolid(screen(name), name)
    errors = solidTypeErrors(emitted)
  }, 120_000)

  for (const name of SCREENS) {
    it(`${name} typechecks with Solid's JSX types against the Solid vocabulary`, () => {
      // A screen that names a member the Solid map marks absent is refused before
      // it is emitted, so only a screen the validator passes is held to compile.
      const { ok, faults } = validateSpec(registry, screen(name), { framework: 'solid' })
      if (!ok) {
        expect(faults.every((fault) => fault.message.includes('is absent in solid'))).toBe(true)
        return
      }
      expect(errors[name]).toEqual([])
    })

    it(`${name} passes every red rule as Solid TSX`, async () => {
      const result = await emitCheckedScreen(screen(name), {
        framework: 'solid',
        filepath: solidPath(name),
      })
      expect(result.fatal, name).toBeNull()
      expect(result.violations, name).toEqual([])
    })

    it(`${name} is the same bytes as its snapshot`, async () => {
      await expect(emitted[name]).toMatchFileSnapshot(`./__snapshots__/${name}.view.solid.tsx.snap`)
    })
  }

  // A whole type-check of the emitted screen, which the suite's load can
  // stretch past the default five seconds.
  it('reports what Solid’s types refuse, so a pass is meaningful', { timeout: 30_000 }, () => {
    const broken = (emitted['settings'] ?? '').replace('title="Settings"', 'title={4}')
    expect(solidTypeErrors({ broken })['broken']?.join('\n')).toContain(
      "Type 'number' is not assignable to type 'string'",
    )
  })

  it('is formatted the way this repository formats code', async () => {
    const { format, resolveConfig } = await import('prettier')
    for (const name of SCREENS) {
      const local = await resolveConfig(solidPath(name))
      expect(await format(emitted[name] ?? '', { ...local, filepath: solidPath(name) }), name).toBe(
        emitted[name],
      )
    }
  })

  it('reads every input from props, never destructuring them', () => {
    const code = emitted['inbox'] ?? ''
    expect(code).toContain('export function InboxView(props: InboxViewProps) {')
    expect(code).toContain('data={props.tickets}')
    expect(code).toContain('onClick={props.onNewTicket}')
    expect(code).toContain('label={props.summary.open.label}')
    expect(code).not.toMatch(/function InboxView\(\{/)
  })

  it('imports members and the vocabulary’s types from the Solid vocabulary, once', () => {
    const code = emitted['inbox'] ?? ''
    expect(code.match(new RegExp(`from '${SOLID_IMPORT_SOURCE}'`, 'g'))).toHaveLength(1)
    expect(code).toContain('type DataTableColumn')
    expect(code).not.toContain(IMPORT_SOURCE)
    expect(code).toContain("import type { Ticket } from './tickets'")
  })

  it('writes the React tree: node props as JSX, an element inside a value as JSX', () => {
    const code = emitted['inbox'] ?? ''
    expect(code).toContain(
      'actions={<Button icon="add" label="New ticket" onClick={props.onNewTicket} />}',
    )
    expect(code).toMatch(/secondaryAction: \(\n\s+<Button/)
    expect(emitted['settings']).toContain('<SettingsRow.Group')
  })

  it('takes no props argument when the screen has no inputs', async () => {
    const spec: ScreenSpec = {
      spec: SPEC_ID,
      name: 'Probe',
      purpose: 'A probe.',
      inputs: [],
      root: { component: 'Text', children: ['Hello'] },
    }
    expect(await emitSolid(spec)).toContain('export function Probe() {')
  })
})

/**
 * A screen drawn from the parts no Relay screen composes: a shell's navigation,
 * a dashboard's panels, a table's sections, an avatar group and a tour target.
 */
const OVERVIEW = JSON.parse(
  readFileSync(resolve(ROOT, 'packages/spec/fixtures/overview.json'), 'utf8'),
) as ScreenSpec

describe('a screen drawn from its members’ parts, emitted for Solid', () => {
  it('is a lawful spec that typechecks against the Solid vocabulary', async () => {
    expect(validateSpec(registry, OVERVIEW, { framework: 'solid' }).faults).toEqual([])
    const code = await emitSolid(OVERVIEW, 'usage-overview')
    expect(code).toContain('<Dashboard.Panel title="Requests by key">')
    expect(solidTypeErrors({ 'usage-overview': code })['usage-overview']).toEqual([])
  }, 120_000)
})

describe('the framework, checked before anything is emitted', () => {
  it('refuses a member the Solid map marks absent, with the map’s reason', () => {
    const missing: Registry = {
      ...registry,
      components: registry.components.map((component) =>
        component.name === 'Button'
          ? {
              ...component,
              frameworks: {
                ...component.frameworks,
                solid: { status: 'absent', reason: 'no Solid shell yet' },
              },
            }
          : component,
      ),
    }
    const { ok, faults } = validateSpec(missing, screen('new-ticket'), { framework: 'solid' })
    expect(ok).toBe(false)
    expect(faults).toContainEqual({
      path: '$.root.props.actions[1]',
      message: '`Button` is absent in solid — no Solid shell yet',
    })
    expect(validateSpec(missing, screen('new-ticket')).ok).toBe(true)
  })

  it('emits without a registry, as React does', async () => {
    const result = await emitCheckedScreen(screen('settings'), {
      framework: 'solid',
      filepath: solidPath('settings'),
    })
    expect(result.fatal).toBeNull()
    expect(result.code).toContain(`from '${SOLID_IMPORT_SOURCE}'`)
  })
})

describe('pnpm emit, for Solid', () => {
  const scratch = mkdtempSync(resolve(tmpdir(), 'polymorph-emit-solid-'))
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true })
  })

  const BIN = resolve(ROOT, 'packages/spec/bin/emit.js')
  const run = (args: string[]) =>
    spawnSync(process.execPath, [BIN, ...args], { cwd: ROOT, encoding: 'utf8' })

  it('emits Solid TSX to a .tsx file with --framework solid, and React without it', () => {
    const input = resolve(scratch, 'settings.json')
    writeFileSync(input, JSON.stringify(screen('settings')))
    const solid = resolve(scratch, 'Settings.tsx')
    const result = run([input, solid, '--framework', 'solid'])
    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(solid, 'utf8')).toMatch(new RegExp(`from ['"]${SOLID_IMPORT_SOURCE}['"]`))
    const react = resolve(scratch, 'SettingsReact.tsx')
    expect(run([input, react]).status).toBe(0)
    expect(readFileSync(react, 'utf8')).toMatch(new RegExp(`from ['"]${IMPORT_SOURCE}['"]`))
    // Each run builds the registry, which takes seconds under the suite's load.
  }, 120_000)

  it('refuses a .vue output for Solid, and writes nothing', () => {
    const input = resolve(scratch, 'inbox.json')
    writeFileSync(input, JSON.stringify(screen('inbox')))
    const result = run([input, resolve(scratch, 'Inbox.vue'), '--framework', 'solid'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('--framework solid writes a .tsx file')
    expect(() => readFileSync(resolve(scratch, 'Inbox.vue'))).toThrow()
  })
})
