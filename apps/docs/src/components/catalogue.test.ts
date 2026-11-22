import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { componentsByTier, findComponent, REGISTRY, TIERS } from '../registry'
import {
  FOUNDATION_PACKAGE,
  importLine,
  importNames,
  listTiers,
  neighbours,
  reachNote,
  readableType,
  series,
  splitUnion,
  VOCABULARY_PACKAGE,
} from './catalogue'
import { TIER_COPY } from './tiers'

const member = (name: string) => {
  const found = findComponent(name)
  if (!found) throw new Error(`no member ${name} in the registry`)
  return found
}

/**
 * The value names `@polymorph/react-ui` exports, read from its index source, so
 * the test runs in node without loading the vocabulary's stylesheets.
 */
function vocabularyExports(): Set<string> {
  const index = readFileSync(
    resolve(import.meta.dirname, '../../../../packages/react-ui/src/index.ts'),
    'utf8',
  )
  const names = new Set<string>()
  for (const block of index.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const raw of (block[1] ?? '').split(',')) {
      const item = raw.trim()
      if (item === '' || item.startsWith('type ')) continue
      names.add(item.split(/\s+as\s+/).pop() as string)
    }
  }
  for (const declared of index.matchAll(/export\s+(?:const|function|class)\s+(\w+)/g)) {
    names.add(declared[1] as string)
  }
  return names
}

describe('the index lists every member once', () => {
  it('names every tier the registry emits, with copy for each', () => {
    const emitted = new Set(REGISTRY.components.map((component) => component.tier))
    expect([...emitted].filter((tier) => !(TIERS as readonly string[]).includes(tier))).toEqual([])
    expect(Object.keys(TIER_COPY).sort()).toEqual([...TIERS].sort())
  })

  it('lists each member exactly once with no query, in gallery order within its tier', () => {
    const listed = listTiers('').flatMap((group) => group.members.map((entry) => entry.component))
    expect(listed.map((component) => component.name).sort()).toEqual(
      REGISTRY.components.map((component) => component.name).sort(),
    )
    for (const group of listTiers('')) {
      expect(group.members.map((entry) => entry.component.name)).toEqual(
        componentsByTier(group.tier).map((component) => component.name),
      )
    }
  })

  it('narrows with the registry search and leaves out tiers with no match', () => {
    const groups = listTiers('  date  ')
    const names = groups.flatMap((group) => group.members.map((entry) => entry.component.name))
    expect(names).toContain('DatePicker')
    expect(groups.every((group) => group.members.length > 0)).toBe(true)
    expect(listTiers('no member is called this')).toEqual([])
  })

  it('says which prop a query matched when it was not the name or the summary', () => {
    const matched = listTiers('placeholder')
      .flatMap((group) => group.members)
      .find((entry) => entry.component.name === 'Input')?.matched
    expect(matched).toEqual({ kind: 'prop', name: 'placeholder' })
  })
})

describe('where a member runs', () => {
  it('says nothing on a card for a member that runs everywhere', () => {
    expect(reachNote(member('Button'))).toBeNull()
  })

  it('names where a member runs when it is missing somewhere', () => {
    expect(reachNote(member('Tooltip'))).toBe('Web only')
    expect(reachNote(member('BarChart'))).toBe('Web and iOS only')
    expect(reachNote(member('ModeSwitch'))).toBe('Web and Android only')
    expect(reachNote(member('ImageEditor'))).toBe('React, iOS and Android only')
  })

  it('joins words as a sentence does', () => {
    expect(series(['React'])).toBe('React')
    expect(series(['Web', 'iOS'])).toBe('Web and iOS')
    expect(series(['Vue', 'Svelte', 'Solid'], 'or')).toBe('Vue, Svelte or Solid')
  })
})

describe('the import line', () => {
  const exported = vocabularyExports()

  it('names only real exports, and at least one, for every member', () => {
    for (const component of REGISTRY.components) {
      const names = importNames(component)
      expect(names.length, component.name).toBeGreaterThan(0)
      for (const name of names) expect(exported.has(name), `${component.name}: ${name}`).toBe(true)
    }
  })

  it('imports a member used through its exports by those exports', () => {
    expect(importNames(member('Toast'))).not.toContain('Toast')
    expect(importNames(member('Toast'))).toContain('toast')
    expect(importNames(member('Tooltip'))).toEqual(['Tooltip', 'TooltipProvider'])
    expect(importLine(importNames(member('Button')))).toBe(
      `import { Button } from '${VOCABULARY_PACKAGE}'`,
    )
  })

  it('names packages the registry ranges', () => {
    expect(REGISTRY.packages).toHaveProperty([VOCABULARY_PACKAGE])
    expect(REGISTRY.packages).toHaveProperty([FOUNDATION_PACKAGE])
  })
})

describe('prop types as a reader writes them', () => {
  const prop = (type: string, optional = true) => ({ name: 'x', type, optional })

  it('splits only the top-level union', () => {
    expect(splitUnion('((event: MouseEvent<A, B>) => void) | undefined')).toEqual([
      '((event: MouseEvent<A, B>) => void)',
      'undefined',
    ])
    expect(splitUnion('"a | b" | { c: 1 | 2 }')).toEqual(['"a | b"', '{ c: 1 | 2 }'])
  })

  it('drops an optional prop’s undefined and writes boolean', () => {
    expect(readableType(prop('string | undefined'))).toBe('string')
    expect(readableType(prop('false | true'))).toBe('boolean')
    expect(readableType(prop('string | undefined', false))).toBe('string | undefined')
  })

  it('unwraps a lone function type', () => {
    expect(readableType(prop('((value: string) => void) | undefined'))).toBe(
      '(value: string) => void',
    )
  })

  it('writes the whole icon role union as IconRole', () => {
    const icon = member('Button').props.find((entry) => entry.name === 'icon')
    expect(icon && readableType(icon)).toBe('IconRole')
  })
})

describe('previous and next', () => {
  it('stays within the tier and stops at its ends', () => {
    for (const tier of TIERS) {
      const members = componentsByTier(tier)
      const first = members[0]
      const last = members[members.length - 1]
      if (!first || !last) continue
      expect(neighbours(first).previous).toBeNull()
      expect(neighbours(last).next).toBeNull()
      if (members.length > 1) expect(neighbours(first).next?.tier).toBe(tier)
    }
  })
})
