import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildRegistry, type Registry } from '@polymorph/registry'
import { FRAMEWORKS, shippedParts, type Framework } from '@polymorph/registry/frameworks'
import { PLATFORMS, type Platform } from '@polymorph/registry/platforms'
import { afterAll, describe, expect, it } from 'vitest'

import { emitScreen } from './src/emit'
import { emitCheckedScreen } from './src/lawful'
import { SPEC_ID, type ScreenSpec } from './src/schema'
import { validateSpec } from './src/validate'

/**
 * A member's compound parts, in a screen spec.
 *
 * The system card tells an agent which parts a member has in a framework or
 * on a platform (`Dashboard.Panel`, `AppShell.NavItem`). The validator reads
 * the same list (`shippedParts`), so every part the card names whose props the
 * registry records is a component a spec may compose there, and a part it
 * does not name is refused with the parts the member does have. The first law holds the two to each other for
 * every member. The second emits a screen drawn from the parts no Relay
 * screen composes and checks it against the React vocabulary's own types.
 */

const ROOT = resolve(import.meta.dirname, '../..')
const registry: Registry = buildRegistry(ROOT)

/** A screen whose root is the one component, validated where it is to be drawn. */
const faultsOf = (component: string, platform: Platform, framework: Framework): string[] =>
  validateSpec(
    registry,
    {
      spec: SPEC_ID,
      name: 'Probe',
      purpose: 'A probe.',
      inputs: [],
      ...(platform === 'web' ? {} : { platform }),
      root: { component },
    },
    {},
    { framework },
  ).faults.map((fault) => fault.message)

/** Where a screen is drawn: each web framework, then each native platform. */
const PLACES: { platform: Platform; framework: Framework; name: string }[] = [
  ...FRAMEWORKS.map((framework) => ({ platform: 'web' as Platform, framework, name: framework })),
  ...PLATFORMS.filter((platform) => platform !== 'web').map((platform) => ({
    platform,
    framework: 'react' as Framework,
    name: platform,
  })),
]

describe('the parts the system card lists are the parts a spec may compose', () => {
  const withParts = registry.components.filter((component) => component.parts.length > 0)

  it('finds members with parts to check', () => {
    expect(withParts.map((component) => component.name)).toEqual(
      expect.arrayContaining(['Dashboard', 'AppShell', 'Table', 'SettingsRow']),
    )
  })

  for (const { platform, framework, name } of PLACES) {
    it(`in ${name}, accepts each part the member carries there and refuses the others`, () => {
      for (const component of withParts) {
        const shipped = new Set(
          shippedParts(component, platform, framework).map((part) => part.name),
        )
        for (const part of component.parts) {
          const written = `${component.name}.${part.name}`
          const faults = faultsOf(written, platform, framework).filter(
            (message) =>
              message.includes('no component called') || message.includes('is not a part'),
          )
          if (shipped.has(part.name)) {
            expect(faults, `${written} in ${name}`).toEqual([])
          } else {
            expect(faults, `${written} in ${name}`).toHaveLength(1)
            expect(faults[0], `${written} in ${name}`).toContain(`\`${written}\` is not a part`)
          }
        }
      }
    })
  }

  it('says so of a part a framework has and the registry records no props for', () => {
    // The registry reads a part's props from the React member. A part only
    // another framework's files declare is on the card and has no record, so a
    // spec cannot be checked against it, and the fault says that.
    const unrecorded: string[] = []
    for (const { platform, framework, name } of PLACES) {
      for (const component of registry.components) {
        const recorded = new Set(component.parts.map((part) => part.name))
        for (const part of shippedParts(component, platform, framework)) {
          if (recorded.has(part.name)) continue
          const written = `${component.name}.${part.name}`
          unrecorded.push(`${written} in ${name}`)
          expect(faultsOf(written, platform, framework), `${written} in ${name}`).toEqual([
            `no component called \`${written}\` — it is a part in ${framework} whose props the ` +
              'registry does not record, so a spec cannot compose it',
          ])
        }
      }
    }
    expect(unrecorded).toContain('Toast.Viewport in vue')
    expect(faultsOf('Toast.Viewport', 'web', 'react')).toEqual([
      'no component called `Toast.Viewport` — `Toast` has no parts',
    ])
  })

  it('refuses a part on a platform that does not carry it, and lists the ones it does', () => {
    const [first] = faultsOf('Table.Head', 'ios', 'react')
    expect(first).toBe(
      '`Table.Head` is not a part on ios — `Table`’s parts are `Table.Row`, `Table.Header`, ' +
        '`Table.Cell` there',
    )
    expect(faultsOf('Dashboard.Panel', 'android', 'react')[0]).toBe(
      '`Dashboard.Panel` is not a part on android — `Dashboard` has no parts there',
    )
  })

  it('answers a part the member does not have with the parts it has', () => {
    expect(faultsOf('Dashboard.Region', 'web', 'react')).toEqual([
      'no component called `Dashboard.Region` — `Dashboard`’s parts are `Dashboard.Panel`',
    ])
    expect(faultsOf('Button.Icon', 'web', 'react')).toEqual([
      'no component called `Button.Icon` — `Button` has no parts',
    ])
  })

  it('checks a part’s props against the part, not against its member', () => {
    const spec: ScreenSpec = {
      spec: SPEC_ID,
      name: 'Probe',
      purpose: 'A probe.',
      inputs: [],
      root: {
        component: 'Dashboard.Panel',
        // `stats` is the Dashboard's, and `variant` is nobody's here.
        props: { title: 'Requests', stats: [], variant: 'solid' },
        children: ['None yet'],
      },
    }
    expect(validateSpec(registry, spec).faults.map((fault) => fault.message)).toEqual([
      '`Dashboard.Panel` has no prop `stats`',
      '`Dashboard.Panel` has no prop `variant`',
    ])
  })
})

const EMITTED = resolve(import.meta.dirname, '.emitted-parts')
const VIEW = resolve(EMITTED, 'usage-overview.tsx')

afterAll(() => {
  rmSync(EMITTED, { recursive: true, force: true })
})

describe('a screen drawn from its members’ parts', () => {
  const overview = JSON.parse(
    readFileSync(resolve(import.meta.dirname, 'fixtures/overview.json'), 'utf8'),
  ) as ScreenSpec

  it('composes every part no Relay screen does', () => {
    const json = JSON.stringify(overview)
    for (const part of [
      'AppShell.NavGroup',
      'AppShell.NavItem',
      'AppShell.UserCard',
      'Dashboard.Panel',
      'Table.Head',
      'Table.Body',
      'Table.Foot',
      'Avatar.Group',
      'Tour.Target',
    ]) {
      expect(json, part).toContain(`"${part}"`)
    }
  })

  for (const framework of FRAMEWORKS) {
    it(`is a lawful spec in ${framework}`, () => {
      expect(validateSpec(registry, overview, {}, { framework }).faults).toEqual([])
    })
  }

  it('emits TSX that passes every red rule', async () => {
    const result = await emitCheckedScreen(overview, { filepath: VIEW })
    expect(result.fatal).toBeNull()
    expect(result.violations).toEqual([])
  })

  it('emits TSX the vocabulary’s own types accept', async () => {
    mkdirSync(EMITTED, { recursive: true })
    writeFileSync(VIEW, await emitScreen(overview, { filepath: VIEW }))
    writeFileSync(
      resolve(EMITTED, 'tsconfig.json'),
      `${JSON.stringify(
        {
          extends: '../tsconfig.emit.json',
          include: ['**/*.ts', '**/*.tsx', '../../react-ui/src/css-modules.d.ts'],
        },
        null,
        2,
      )}\n`,
    )

    let output = ''
    try {
      execFileSync('npx', ['tsc', '--noEmit', '-p', resolve(EMITTED, 'tsconfig.json')], {
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
