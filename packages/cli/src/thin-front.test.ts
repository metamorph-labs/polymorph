import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Enforces "one canonical registry, three thin fronts" as a law.
 *
 * The architecture rule is that adapters never become sources of truth. The
 * rule is easy to break. When the CLI first needs a fact the registry does not
 * publish, the cheap fix is a `readFileSync`. Then there are two answers to
 * "what is Button made of". They agree for a while, and when they diverge, the
 * registry is the one that looks wrong.
 *
 * So the rule is a check that fails, like every rule in this repository. The
 * installer may open the consumer's repository and may copy a file the
 * registry named. It may not look anywhere else. Three specific reaches are
 * refused:
 *
 *   the packages     `packages/react-ui`, `packages/recipes`, `packages/react`,
 *                    `packages/engine`, `packages/rules` — the registry describes them
 *   the specs        `design/` — where decisions are written; the registry reads it
 *   the compiler     `typescript` — for computing facts instead of reading them
 *
 * The list is deliberately coarse. Changing it is a deliberate decision made
 * here, not an import that slips through in a diff nobody reads.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const PACKAGE = resolve(import.meta.dirname, '..')

function sourceFiles(): string[] {
  // Includes `--others`, because an uncommitted file is the one most likely to
  // contain a forbidden reach.
  return execFileSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      'packages/cli/src',
      'packages/cli/bin',
    ],
    { cwd: ROOT },
  )
    .toString()
    .split('\n')
    .filter(Boolean)
    .filter((file) => !file.endsWith('.test.ts'))
}

/**
 * Strips comments, because the law is about code.
 *
 * Both fronts in this repository have long comments, and the comment on
 * `rebase` has to write out `packages/react-ui/src/controls/Button.tsx` to
 * explain what it does. A path named in prose is not a reach. A `readFileSync`
 * of one is. The stripping is crude on purpose: it would also strip a `//`
 * inside a string literal, and there is none here.
 */
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const files = sourceFiles().map((file) => ({
  file,
  source: withoutComments(readFileSync(resolve(ROOT, file), 'utf8')),
}))

describe('the installer is a front, not a second source of truth', () => {
  it('finds the installer source, so a pass is not vacuous', () => {
    expect(files.length).toBeGreaterThan(5)
    expect(files.some((entry) => entry.file.endsWith('src/plan.ts'))).toBe(true)
  })

  it('never reaches into the vocabulary or the specs', () => {
    // A *path literal* in code, not prose, that names the vocabulary or the
    // specs. A reach looks like `readFileSync('packages/react-ui/…')`, not an
    // import, because an import of the vocabulary would not resolve from here.
    const REACH =
      /['"`]((?:[^'"`]*\/)?(?:packages\/(?:react-ui|recipes|react|engine|theme|rules)|design)\/[^'"`]*)['"`]/g

    // `bin/polymorph.js` may name `packages/registry/src` and `packages/cli/src`.
    // Those paths load this package's own modules through jiti, which is not
    // reading the vocabulary. The exemption tests the *path*, not the file that
    // contains it. Filtering the composed `<file>: <path>` string instead would
    // exempt every hit from a file under `packages/cli/`, and the law would
    // catch nothing.
    const ownPackages = /^packages\/(cli|registry)\//

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
      expect(source, file).not.toMatch(/require\('typescript'\)/)
    }

    const manifest = JSON.parse(readFileSync(resolve(PACKAGE, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    // `@polymorph/theme` is a dependency for the guest verbs (`polymorph theme`).
    // Admission is the engine's own answer, so it is not a second source of
    // truth. The MCP front uses it the same way, and the registry this front
    // already depends on is built on it. The banned reaches above still hold:
    // the guest verbs open only the consumer's own files, named on the command
    // line. `@polymorph/rules` is a dependency for `check`, the same way: its
    // verdict is the rules' own (`verify`), which the MCP front's `validate`
    // also returns. `check` opens only the consumer's files.
    expect(Object.keys(manifest.dependencies).sort()).toEqual([
      '@polymorph/registry',
      '@polymorph/rules',
      '@polymorph/theme',
      'jiti',
    ])
  })

  it('takes the consumer’s root as an argument rather than reading it', () => {
    // `process.cwd()` in a library can make an installer vendor a project into
    // itself. The entry point resolves it once, and everything below takes both
    // roots as arguments.
    for (const { file, source } of files) {
      if (file.endsWith('bin/polymorph.js')) continue
      expect(source, file).not.toContain('process.cwd()')
      expect(source, file).not.toContain('import.meta.dirname')
    }
  })
})
