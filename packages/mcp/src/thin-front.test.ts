import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { READ_TOOL_NAMES, TOOL_NAMES, WRITE_TOOL_NAMES } from './server'

/**
 * The law the CLI's installer is held to, applied to the MCP server.
 *
 * The architecture rule is "one canonical registry, three thin fronts:
 * adapters never become sources of truth". For this front it means *no tool
 * may compute anything the registry does not already know*. The rule is easy
 * to break one `readFileSync` at a time, so a test checks it.
 *
 * The one lawful reach is `get_component`'s `source: true`, which reads a file
 * the registry *named*. Following a pointer you were given is not computing
 * (`polymorph add` copies files the same way), and the difference is visible
 * in the code: the path comes from `component.files`, never from a literal.
 * That is why the check below forbids any path literal about the vocabulary or
 * the specs in this package.
 *
 * `propose_theme` is the second lawful reach, and it has a different shape: it
 * links `@polymorph/theme` and resolves a pair. The registry is a catalogue of
 * what exists, and a proposal is by definition a pair that does not. No
 * catalogue can say whether it is lawful, and the only alternative to running
 * the laws is claiming a verdict. So the reach is *upward*, into the engine
 * both fronts share, never sideways into the vocabulary or the design files.
 * The path checks below still apply to every file in this package.
 *
 * The write tools are held to the same law from the other side. A front that
 * writes is still not a source of truth if what it writes was produced and
 * checked elsewhere (the emitter's bytes, the installer's plan, the documents
 * the engine admitted), and if it can write only into the project it was
 * started for. So writing is confined to one module with one write call in it,
 * and a test checks that.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const PACKAGE = resolve(import.meta.dirname, '..')

/** Strips comments, because the law is about code. Prose may name a path. */
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

function sourceFiles(): { file: string; source: string }[] {
  return execFileSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      'packages/mcp/src',
      'packages/mcp/bin',
    ],
    { cwd: ROOT },
  )
    .toString()
    .split('\n')
    .filter(Boolean)
    .filter((file) => !file.endsWith('.test.ts'))
    .map((file) => ({ file, source: withoutComments(readFileSync(resolve(ROOT, file), 'utf8')) }))
}

const files = sourceFiles()

describe('the MCP server is a front, not a second source of truth', () => {
  it('finds the server source, so a pass is not vacuous', () => {
    expect(files.length).toBeGreaterThan(3)
    expect(files.some((entry) => entry.file.endsWith('src/tools.ts'))).toBe(true)
  })

  it('never reaches into the vocabulary or the specs', () => {
    const REACH =
      /['"`]((?:[^'"`]*\/)?(?:packages\/(?:react-ui|react|engine|theme|rules)|design)\/[^'"`]*)['"`]/g
    // `bin/polymorph-mcp.js` names `packages/registry/src` and `packages/mcp/src`
    // to load its own modules through jiti. That is loading this package.
    const ownPackages = /^packages\/(mcp|registry|cli)\//

    const reaches = files.flatMap(({ file, source }) =>
      [...source.matchAll(REACH)]
        .map((match) => match[1] as string)
        .filter((path) => !ownPackages.test(path))
        .map((path) => `${file}: ${path}`),
    )

    expect(reaches, 'these paths belong in the registry, not in a front').toEqual([])
  })

  it('does not link the TypeScript compiler', () => {
    for (const { file, source } of files) {
      expect(source, file).not.toMatch(/from '(typescript|ts-morph)'/)
    }

    const manifest = JSON.parse(readFileSync(resolve(PACKAGE, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      optionalDependencies: Record<string, string>
    }
    expect(Object.keys(manifest.dependencies).sort()).toEqual([
      '@modelcontextprotocol/sdk',
      '@polymorph/cli',
      '@polymorph/registry',
      '@polymorph/rules',
      // `validate` takes a spec as well as code, and the spec half is checked
      // by the package that owns the format.
      '@polymorph/spec',
      /*
       * `propose_theme` answers a question about a pair that does not exist
       * yet: is it lawful? No catalogue of what *does* exist can answer it. So
       * this front links the engine and runs it, as the studio does, instead
       * of reproducing a verdict.
       *
       * This is not an exception to the rule. The rule is that a front may not
       * become a second source of truth, and it is stated as a dependency list
       * so that a reach *stays* deliberate. If something here starts deriving a
       * token to answer with, this line will look like permission for it, and
       * it is not. Every other tool still answers from the registry.
       */
      '@polymorph/theme',
      'jiti',
      'zod',
    ])

    /*
     * `render_screen` answers with a picture of a screen, and a picture needs a
     * browser. The browser is optional and not a dependency: a server installed
     * without it starts and answers every other tool. The tool derives nothing
     * with it. The page it opens is drawn by the vocabulary, in the workbench,
     * and the browser only shows it.
     */
    expect(Object.keys(manifest.optionalDependencies)).toEqual(['playwright'])
  })

  it('loads the browser in one module, and only when its tool is called', () => {
    for (const { file, source } of files) {
      if (!source.includes('playwright')) continue
      expect(file, 'only `render.ts` may name the browser').toBe('packages/mcp/src/render.ts')
      // A static import would make every tool fail to load where the optional
      // dependency is absent. A type import is erased, and the one that loads
      // the package is a dynamic import inside the function that starts it.
      const loaded = [...source.matchAll(/^import\s+(type\s+)?[\s\S]*?from '([^']+)'/gm)]
        .filter((statement) => statement[2] === 'playwright')
        .filter((statement) => statement[1] === undefined)
      expect(loaded.map((statement) => statement[0])).toEqual([])
      expect(source.match(/\bimport\('playwright'\)/g)).toHaveLength(1)
    }
  })

  it('takes the repository as an argument rather than reading it', () => {
    // `process.cwd()` in a server would make the answers depend on where the
    // client was launched from.
    for (const { file, source } of files) {
      if (file.endsWith('bin/polymorph-mcp.js')) continue
      expect(source, file).not.toContain('process.cwd()')
      expect(source, file).not.toContain('import.meta.dirname')
    }
  })

  it('writes through one function, in one module', () => {
    // The four write tools are annotated as writes. This check keeps the other
    // nine true to their read-only annotation: no file but `write.ts` may write
    // to a filesystem, so a read tool cannot gain writes one `writeFileSync` at
    // a time.
    const WRITES = /\b(?:writeFileSync|appendFileSync|mkdirSync|cpSync|copyFileSync|renameSync)\b/g
    // The asynchronous forms of the same calls: the promise API and a stream.
    // Nothing here uses either, and a check that only knew the `*Sync` names
    // would miss a write made through them.
    const OTHER_DOORS = /['"](?:node:)?fs\/promises['"]|\bfs\.promises\b|\bcreateWriteStream\b/
    for (const { file, source } of files) {
      expect(source, file).not.toMatch(OTHER_DOORS)
      if (file.endsWith('src/write.ts')) continue
      expect(source.match(WRITES) ?? [], file).toEqual([])
    }

    // Inside it, one function: `land` resolves a path against the project and
    // refuses one that leaves it, so every byte this package writes passes that
    // check. The imports name each function once, and the second mention is the
    // only call. (`install` writes through the installer, which has its own
    // containment law in its own package.)
    const door = files.find((entry) => entry.file.endsWith('src/write.ts'))?.source ?? ''
    expect(door.match(/\bfunction land\(project: string, path: string/g)).toHaveLength(1)
    expect(door.match(/\bwriteFileSync\b/g)).toHaveLength(2)
    expect(door.match(/\bmkdirSync\b/g)).toHaveLength(2)
    expect(door.match(WRITES)).toHaveLength(4)
  })

  it('deletes nothing, anywhere', () => {
    // The write tools add files and config lines and replace files the tool
    // itself wrote; `fix_file`, and `save_theme` with `overwrite`, also rewrite
    // existing files. A design system's server has no reason to remove
    // somebody's file.
    for (const { file, source } of files) {
      expect(source, file).not.toMatch(/\b(?:rmSync|rmdirSync|unlinkSync|truncateSync)\b/)
    }
  })

  it('exposes nine tools that read and four that write, and no more', () => {
    expect([...READ_TOOL_NAMES]).toEqual([
      'search_components',
      'get_component',
      'get_install_plan',
      'get_system_card',
      'get_theme_axes',
      'validate',
      // `validate`, with the mechanical fixes already applied. It returns code
      // and writes none.
      'fix',
      // The only one whose answer is a *proposal*.
      'propose_theme',
      // The only one whose answer is a picture. It draws a spec `validate`
      // accepts in a browser and measures it, and writes nothing.
      'render_screen',
    ])
    // Each writes what its matching read tool answered: a validated spec, an
    // install plan, a proposed pair, a fix.
    expect([...WRITE_TOOL_NAMES]).toEqual(['emit_screen', 'install', 'save_theme', 'fix_file'])
    expect([...TOOL_NAMES]).toEqual([...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES])
  })
})
