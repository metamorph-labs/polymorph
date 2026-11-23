import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The package runs in a page, a worker and a server alike, and pays only for
 * what is imported.
 *
 * Its source imports no node module and no package but the spec's and the
 * registry's pure subpaths, which its build inlines: this law walks the value
 * import graph of every entry, as `packages/spec/src/browser-surface.test.ts`
 * walks the spec's, and fails on anything else. That no module reads a DOM
 * global is the typecheck's to hold: `tsconfig.json` gives the source no DOM
 * library and no node types.
 *
 * It also holds each entry to what it reaches: `parsePartial` reaches no
 * other module, and the walk reaches neither the generated table, the card
 * nor the validator, so a renderer that is handed a table loads none of them
 * through it.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const SRC = 'packages/screen/src'

/** The subpaths the build inlines, and their files. */
const PURE: Record<string, string> = {
  '@polymorph/registry/frameworks': 'packages/registry/src/frameworks.ts',
  '@polymorph/registry/platforms': 'packages/registry/src/platforms.ts',
  '@polymorph/registry/shape': 'packages/registry/src/shape.ts',
  '@polymorph/registry/screen-table': 'packages/registry/src/screen-table.ts',
  '@polymorph/registry/runtime-card': 'packages/registry/src/runtime-card.ts',
  '@polymorph/spec/schema': 'packages/spec/src/schema.ts',
  '@polymorph/spec/validate': 'packages/spec/src/validate.ts',
  '@polymorph/spec/action-type': 'packages/spec/src/action-type.ts',
}

const ENTRIES: Record<string, string> = {
  '.': 'index.ts',
  './check': 'check.ts',
  './partial': 'partial.ts',
  './walk': 'walk.ts',
  './vocabulary': 'vocabulary.ts',
  './card': 'card.ts',
}

/** Value imports only. `import type` is erased, as the compiler erases it. */
function valueImportsOf(file: string): string[] {
  const source = readFileSync(resolve(ROOT, file), 'utf8')
  const found: string[] = []
  const pattern = /(^|\n)\s*(import|export)\s+(type\s+)?([^'"]*?)from\s+['"]([^'"]+)['"]/g
  for (const match of source.matchAll(pattern)) {
    if (match[3] !== undefined) continue
    found.push(match[5] as string)
  }
  return found
}

/** Every file an entry reaches, and every import off the pure list. */
function reach(entry: string): { files: Set<string>; faults: string[] } {
  const files = new Set<string>()
  const faults: string[] = []
  const walk = (file: string) => {
    if (files.has(file)) return
    files.add(file)
    for (const specifier of valueImportsOf(file)) {
      if (specifier.startsWith('.')) {
        const target = resolve(ROOT, dirname(file), specifier)
        walk(`${target.slice(ROOT.length + 1)}${target.endsWith('.ts') ? '' : '.ts'}`)
      } else if (PURE[specifier] !== undefined) {
        walk(PURE[specifier])
      } else {
        faults.push(`${file} imports \`${specifier}\``)
      }
    }
  }
  walk(`${SRC}/${entry}`)
  return { files, faults }
}

describe('the package reaches nothing but its own modules and the pure subpaths', () => {
  for (const [name, entry] of Object.entries(ENTRIES)) {
    it(`@polymorph/screen${name === '.' ? '' : name.slice(1)}`, () => {
      expect(reach(entry).faults).toEqual([])
    })
  }

  it('would fail on the spec’s emitter, which the package must not import', () => {
    const faults = reach('../../spec/src/lawful.ts').faults
    expect(faults.some((fault) => fault.includes('@polymorph/rules/verify'))).toBe(true)
  })
})

describe('each entry reaches only what it needs', () => {
  const TABLE = `${SRC}/vocabulary.gen.ts`
  const CARD = `${SRC}/card.ts`

  it('parsePartial reaches no other module', () => {
    expect([...reach('partial.ts').files]).toEqual([`${SRC}/partial.ts`])
  })

  it('the walk reaches neither the table, the card nor the validator', () => {
    const { files } = reach('walk.ts')
    expect(files.has(TABLE)).toBe(false)
    expect(files.has(CARD)).toBe(false)
    expect(files.has('packages/registry/src/runtime-card.ts')).toBe(false)
    expect(files.has('packages/spec/src/validate.ts')).toBe(false)
  })

  it('checkScreen reaches the table and not the card', () => {
    const { files } = reach('check.ts')
    expect(files.has(TABLE)).toBe(true)
    expect(files.has(CARD)).toBe(false)
  })
})
