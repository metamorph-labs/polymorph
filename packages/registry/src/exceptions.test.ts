import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { parseSystem } from '@polymorph/theme'
import { describe, expect, it } from 'vitest'

import { buildRegistry } from './build'
import { auditExceptions } from './exceptions'

/**
 * The registry's half of the member-exceptions law. The schema rejects
 * malformed exceptions at parse time. Only the registry can check that the
 * member exists and reads the class token being re-pointed. An exception that
 * names no member, or re-points a token its member does not read, emits CSS
 * that has no effect and raises no error.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry = buildRegistry(ROOT)

const SYSTEMS_DIR = join(ROOT, 'design/systems')
const systems = readdirSync(SYSTEMS_DIR)
  .filter((file) => file.endsWith('.json'))
  .map((file) => parseSystem(JSON.parse(readFileSync(join(SYSTEMS_DIR, file), 'utf8'))))

describe('every declared exception addresses a member through a token it reads', () => {
  it('finds the shipped systems to check', () => {
    expect(systems.length).toBeGreaterThanOrEqual(11)
  })

  for (const system of systems) {
    it(system.name, () => {
      expect(auditExceptions(registry.components, system.overrides?.exceptions ?? [])).toEqual([])
    })
  }
})

describe('the exceptions audit reports', () => {
  it('a member that does not exist', () => {
    const faults = auditExceptions(registry.components, [
      { component: 'ghost-panel', family: 'radius', class: 'control', step: 'pill', because: 'x' },
    ])
    expect(faults).toHaveLength(1)
    expect(faults[0]).toContain('answers to nobody')
  })

  it('a class token the member never reads', () => {
    // Card reads inset-surface, not inset-list. inset-list is the menus' padding.
    const faults = auditExceptions(registry.components, [
      { component: 'card', family: 'inset', class: 'list', step: 4, because: 'x' },
    ])
    expect(faults).toHaveLength(1)
    expect(faults[0]).toContain('does not read --pm-inset-list')
  })

  it('nothing when the member exists and reads the token', () => {
    expect(
      auditExceptions(registry.components, [
        { component: 'button', family: 'radius', class: 'control', step: 'pill', because: 'x' },
        { component: 'card', family: 'inset', class: 'surface', step: 7, because: 'x' },
      ]),
    ).toEqual([])
  })
})
