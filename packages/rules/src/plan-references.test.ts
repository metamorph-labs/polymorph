import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The repository describes what is true now, not its history.
 *
 * Plans, proposals and follow-ups live in GitHub issues. People and agents read
 * code, tests and docs without that history, so a comment that cites a ticket
 * identifier or a retired planning document points nowhere. The reader cannot
 * follow it, and the reason it replaced is lost. Write the reason in the present
 * tense, and leave history to `git log`.
 *
 * The patterns are intentionally narrow and match only the forms plan
 * references take, so a hit is almost always real. Fix a genuine false positive
 * by rewording or by a precise entry in `ALLOWED`, never by loosening a pattern.
 */

const ROOT = resolve(import.meta.dirname, '../../..')

const TEXT = /\.(?:ts|tsx|js|mjs|cjs|css|json|md|ya?ml)$/

/** Files this law does not read: generated, vendored, or this file's own patterns. */
const SKIP = [
  /^pnpm-lock\.yaml$/,
  /^\.claude\//,
  /(?:^|\/)node_modules\//,
  /(?:^|\/)dist\//,
  /^registry\//,
  /^packages\/rules\/src\/plan-references\.test\.ts$/,
  // The agent eval's recorded runs: measurements, and the documents a model
  // wrote, kept as it wrote them. A label such as "Phase 2" in a model's
  // onboarding screen is evidence, not a reference this repository makes.
  /^eval\/results\//,
]

const PATTERNS: { name: string; pattern: RegExp }[] = [
  {
    name: 'a retired planning document',
    pattern: /IMPLEMENTATION_PLAN|PRODUCT_BRIEF|PROOF\.md|design\/excellence\b/,
  },
  {
    // P3.1, X4.0, DV1.2, W11.1: a plan item number.
    name: 'a dotted plan identifier',
    pattern: /\b(?:P|X|DV|W|F|R|L|C|V)\d{1,2}\.\d{1,2}[a-z]?\b/,
  },
  {
    // (L16), (R2, R3), (C3a): an identifier cited as a source. Function keys
    // (F1–F12) are excluded, because "(F8)" is a keyboard shortcut in a label.
    name: 'a parenthesised plan identifier',
    pattern:
      /\((?!F\d{1,2}\))[A-Z]{1,2}\d{1,2}[a-z]?(?:\.\d+)?(?:\s*[,/–-]\s*[A-Z]{0,2}\d{1,2}(?:\.\d+)?)*\)/,
  },
  {
    name: 'planning vocabulary',
    pattern: /\b(?:packets?|wide-shelf|Phase \d+)\b/i,
  },
  {
    name: 'a numbered contract',
    pattern: /\bcontract [A-Z]\d+\b/i,
  },
]

/** `path:line` entries a pattern matches for a reason that is not a plan reference. */
const ALLOWED = new Set<string>([])

function repositoryFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((file) => TEXT.test(file) && !SKIP.some((skip) => skip.test(file)))
}

describe('no plan references in the repository', () => {
  const files = repositoryFiles()

  it('finds the tree, so a clean result is meaningful', () => {
    expect(files).toContain('README.md')
    expect(files.some((file) => file.startsWith('packages/react-ui/src/'))).toBe(true)
  })

  for (const { name, pattern } of PATTERNS) {
    it(`cites no ${name}`, () => {
      const hits: string[] = []
      for (const file of files) {
        let source: string
        try {
          source = readFileSync(resolve(ROOT, file), 'utf8')
        } catch {
          continue // listed by git but deleted in the working tree
        }
        source.split('\n').forEach((line, index) => {
          const at = `${file}:${index + 1}`
          if (pattern.test(line) && !ALLOWED.has(at)) hits.push(`${at}: ${line.trim()}`)
        })
      }
      expect(
        hits,
        'say the reason instead — see AGENTS.md, "Writing comments, docs and tests"',
      ).toEqual([])
    })
  }

  it('detects each kind of reference', () => {
    const [retired, dotted, parenthesised, vocabulary, contract] = PATTERNS.map(
      ({ pattern }) => pattern,
    )
    expect(retired?.test('see PRODUCT_BRIEF §7.2')).toBe(true)
    expect(dotted?.test('landed in P3.1')).toBe(true)
    expect(parenthesised?.test('the ring (C4)')).toBe(true)
    expect(parenthesised?.test('Notifications (F8)')).toBe(false)
    expect(vocabulary?.test('this packet')).toBe(true)
    expect(contract?.test('contract C7')).toBe(true)
  })
})
