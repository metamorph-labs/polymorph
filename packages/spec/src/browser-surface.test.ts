import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The browser surface must not depend on node-only modules.
 *
 * The composer validates documents in the page through three subpaths:
 * `@polymorph/spec/validate`, `@polymorph/spec/schema` and
 * `@polymorph/registry/shape`, which reach `@polymorph/registry/platforms` and
 * `@polymorph/registry/frameworks` for the platform and framework names. They are useful only because they do NOT load
 * the registry builder's `node:fs`/`typescript` or the emitter's Prettier. This
 * law walks the transitive *value* import graph of each entry and fails on the
 * first node-only module in it. Type-only imports are erased
 * (`verbatimModuleSyntax`: statement-level `import type` emits nothing), so
 * they are skipped by the same rule the compiler applies.
 */

const ROOT = resolve(import.meta.dirname, '../../..')

const ENTRIES = {
  '@polymorph/spec/validate': 'packages/spec/src/validate.ts',
  '@polymorph/spec/schema': 'packages/spec/src/schema.ts',
  '@polymorph/registry/shape': 'packages/registry/src/shape.ts',
}

const SUBPATHS: Record<string, string> = {
  '@polymorph/registry/shape': 'packages/registry/src/shape.ts',
  '@polymorph/registry/search': 'packages/registry/src/search.ts',
  '@polymorph/registry/exceptions': 'packages/registry/src/exceptions.ts',
  '@polymorph/registry/platforms': 'packages/registry/src/platforms.ts',
  '@polymorph/registry/frameworks': 'packages/registry/src/frameworks.ts',
  '@polymorph/spec/schema': 'packages/spec/src/schema.ts',
  '@polymorph/spec/validate': 'packages/spec/src/validate.ts',
}

const FORBIDDEN = /^(node:|prettier$|typescript$|jiti$)/

/** Value imports only. `import type` is skipped here, as the compiler erases it. */
function valueImportsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const found: string[] = []
  const pattern = /(^|\n)\s*(import|export)\s+(type\s+)?([^'"]*?)from\s+['"]([^'"]+)['"]/g
  for (const match of source.matchAll(pattern)) {
    if (match[3] !== undefined) continue
    found.push(match[5] as string)
  }
  return found
}

function walk(entry: string, seen = new Set<string>(), trail: string[] = []): string[] {
  const faults: string[] = []
  const file = resolve(ROOT, entry)
  if (seen.has(file)) return faults
  seen.add(file)

  for (const specifier of valueImportsOf(file)) {
    if (FORBIDDEN.test(specifier)) {
      faults.push(`${[...trail, entry].join(' → ')} imports \`${specifier}\``)
      continue
    }
    if (specifier.startsWith('.')) {
      const target = resolve(dirname(file), specifier)
      const candidate = target.endsWith('.ts') || target.endsWith('.tsx') ? target : `${target}.ts`
      faults.push(
        ...walk(candidate.slice(ROOT.length + 1), seen, [...trail, entry]).map((fault) => fault),
      )
      continue
    }
    const mapped = SUBPATHS[specifier]
    if (mapped !== undefined) {
      faults.push(...walk(mapped, seen, [...trail, entry]))
      continue
    }
    // Any other bare package on the value graph is a surface change that needs a
    // stated reason. The check is deliberately strict.
    faults.push(`${[...trail, entry].join(' → ')} imports \`${specifier}\`, off the pure list`)
  }
  return faults
}

describe('the document-judging surface is browser-clean', () => {
  for (const [name, entry] of Object.entries(ENTRIES)) {
    it(name, () => {
      expect(walk(entry)).toEqual([])
    })
  }

  it('fails on the emitter, which the surface must not import', () => {
    const faults = walk('packages/spec/src/emit.ts')
    expect(faults.some((fault) => fault.includes('prettier'))).toBe(true)
  })
})
