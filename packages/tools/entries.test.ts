import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * The tools are a distribution of the two fronts, and they decide nothing.
 *
 * The CLI and the MCP server are thin fronts over the registry
 * (`packages/cli/src/thin-front.test.ts`, `packages/mcp/src/thin-front.test.ts`).
 * The published tools run those same fronts with the registry and the files
 * they ship, so a decision made here would be a third front, and one no
 * checkout runs. This law keeps `src/` to entry points: the two bins, the
 * screen emitter `init` runs, the server starter the bins share, and the
 * module that says where the shipped files are. Each imports only Node's own
 * modules, the fronts, the emitter, the registry's types and its siblings.
 */

const SRC = resolve(import.meta.dirname, 'src')

/** What an entry point may import: Node, the fronts and the emitter, and each other. */
const ALLOWED = new Set([
  '@polymorph/cli',
  '@polymorph/mcp',
  '@polymorph/mcp/flags',
  '@polymorph/spec',
  '@polymorph/registry',
])

describe('the tools add no decision to the fronts', () => {
  const files = readdirSync(SRC).sort()

  it('hold only the entry points and the two modules they share', () => {
    expect(files).toEqual(['emit.ts', 'polymorph-mcp.ts', 'polymorph.ts', 'serve.ts', 'shipped.ts'])
  })

  it('import nothing but Node, the fronts, the emitter and each other', () => {
    const reaches = files.flatMap((file) =>
      ts
        .preProcessFile(readFileSync(resolve(SRC, file), 'utf8'), true, true)
        .importedFiles.map(({ fileName }) => fileName)
        .filter((specifier) => !specifier.startsWith('node:') && !specifier.startsWith('./'))
        .filter((specifier) => !ALLOWED.has(specifier))
        .map((specifier) => `${file}: ${specifier}`),
    )
    expect(reaches).toEqual([])
  })

  it('read the registry only as a type, never building one', () => {
    for (const file of files) {
      const source = readFileSync(resolve(SRC, file), 'utf8')
      expect(source, file).not.toMatch(/import\s+\{[^}]*\bbuildRegistry\b/)
      expect(source, file).not.toMatch(/^import \{[^}]*\} from '@polymorph\/registry'/m)
    }
  })

  it('depend on no polymorph package, because the build bundles every one', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string>; optionalDependencies: Record<string, string> }
    const installed = Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })
    expect(installed.filter((name) => name.startsWith('@polymorph/'))).toEqual([])
  })
})
