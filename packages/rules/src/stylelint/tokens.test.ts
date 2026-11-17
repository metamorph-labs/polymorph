import stylelint from 'stylelint'
import { describe, expect, it } from 'vitest'

import { emittedTokens } from './emitted'
import plugins, { RULE_NAMES } from './index.js'
import { customPropertiesIn, distance, nearest, readsIn } from './tokens.js'

/**
 * `polymorph/no-ghost-tokens`: the vocabulary-integrity law as a rule that ships
 * to other repositories.
 *
 * `token-references.test.ts` checks the law over this tree. It cannot ship,
 * because it walks a corpus, combines the declarations in it, and derives the
 * token list from the theme engine. None of that exists in a consumer's
 * repository, where their vendored recipes and their own stylesheets read
 * tokens unchecked. This file tests the shipped rule: the same failure, checked
 * one file at a time, with the token list passed in.
 *
 * The token list here is the real one, composed from `design/`. A synthetic
 * list would only show that the rule can compare two sets, not that the set it
 * receives in production is correct. The owner map in `fixtures.test.ts` is
 * synthetic for the opposite reason: a real one would fail every time an
 * archetype was added. This list is regenerated from the emitter on every run,
 * so it cannot go stale.
 */

const TOKENS = emittedTokens(process.cwd())

/** Lint a fragment under the rule alone, at a real vocabulary path. */
async function lint(css: string, tokens: string[] = TOKENS) {
  const result = await stylelint.lint({
    code: css,
    codeFilename: 'packages/react-ui/src/probe/probe.module.css',
    config: { plugins, rules: { [RULE_NAMES.noGhostTokens]: [true, { tokens }] } },
  })
  return (result.results[0]?.warnings ?? []).map((warning) => ({
    text: warning.text,
    line: warning.line,
    column: warning.column,
    endColumn: warning.endColumn,
  }))
}

const names = async (css: string, tokens?: string[]) =>
  (await lint(css, tokens)).map(
    (warning) => /Unexpected \w+\((--pm-[a-z0-9-]+)\)/.exec(warning.text)?.[1],
  )

describe('the token list the rule receives', () => {
  it('is the emitter’s own output, with more than 150 tokens', () => {
    expect(TOKENS.length).toBeGreaterThan(150)
    // A sample across the four kinds of decision, so a list that lost a whole
    // family still fails even if it is long enough.
    for (const token of [
      '--pm-accent-bg',
      '--pm-border-default',
      '--pm-space-4',
      '--pm-text-sm-size',
      '--pm-motion-duration-control',
      '--pm-axis-depth',
    ]) {
      expect(TOKENS, token).toContain(token)
    }
  })

  it('has no pattern-scoped tokens, which belong to the file that declares them', () => {
    // The rule collects these itself. If they were emitted, the per-file
    // collection below would be unnecessary and untested.
    expect(TOKENS).not.toContain('--pm-page-padding-x')
    expect(TOKENS).not.toContain('--pm-shell-topbar-height')
  })
})

describe('reading a stylesheet', () => {
  it('finds both ways a stylesheet reads a property', () => {
    expect(readsIn('var(--pm-accent-bg)').map((read) => read.how)).toEqual(['var'])
    expect(readsIn('style(--pm-axis-depth: flat)').map((read) => read.how)).toEqual(['style'])
  })

  it('finds a read inside a fallback, where a rename often leaves a ghost', () => {
    expect(readsIn('var(--pm-shadow-raised, var(--pm-shadow-lifted))').map((r) => r.name)).toEqual([
      '--pm-shadow-raised',
      '--pm-shadow-lifted',
    ])
  })

  it('ignores namespaces the vocabulary does not own', () => {
    expect(readsIn('var(--radix-select-trigger-width)')).toEqual([])
    expect(readsIn('translate(--pm-not-a-read)')).toEqual([])
  })

  it('reads declarations out of a sheet without mistaking a style query for one', () => {
    // This is why the regex exists: a misspelled style query would otherwise
    // declare the token it fails to find.
    expect(customPropertiesIn('.a { --pm-page-padding-x: 1px; }')).toEqual(['--pm-page-padding-x'])
    expect(
      customPropertiesIn('@container style(--pm-axis-dpeth: flat) { .a { color: red; } }'),
    ).toEqual([])
  })

  it('measures the edit distance of a typo', () => {
    expect(distance('--pm-accnet-bg', '--pm-accent-bg')).toBe(2)
    expect(distance('--pm-space-4', '--pm-space-4')).toBe(0)
  })

  it('suggests nothing instead of guessing', () => {
    // A validator that guesses confidently sends the reader to the wrong place.
    expect(nearest('--pm-border-defualt', TOKENS)[0]).toBe('--pm-border-default')
    expect(nearest('--pm-completely-invented-thing', TOKENS)).toEqual([])
  })
})

describe('a ghost reference is reported', () => {
  it('names the property, the line and the column it starts at', async () => {
    const [warning, ...rest] = await lint('.a {\n  color: var(--pm-accnet-bg);\n}\n')
    expect(rest).toEqual([])
    expect(warning?.line).toBe(2)
    expect(warning?.column).toBe('  color: var('.length + 1)
    expect(warning?.endColumn).toBe('  color: var(--pm-accnet-bg'.length + 1)
    expect(warning?.text).toContain('Did you mean `--pm-accent-bg`?')
  })

  it('says what a browser does with it, which is why the law exists', async () => {
    const [warning] = await lint('.a {\n  background: var(--pm-accent-border);\n}\n')
    expect(warning?.text).toContain('dropping the whole declaration')
  })

  it('is not satisfied by a working fallback', async () => {
    // This always renders correctly but never reads the token it meant to. The
    // fallback hides the typo without fixing it.
    expect(
      await names('.a {\n  border-color: var(--pm-border-defualt, var(--pm-border-default));\n}\n'),
    ).toEqual(['--pm-border-defualt'])
  })

  it('catches a ghost inside a fallback', async () => {
    expect(
      await names('.a {\n  box-shadow: var(--pm-shadow-raised, var(--pm-shadow-lifted));\n}\n'),
    ).toEqual(['--pm-shadow-lifted'])
  })

  it('catches the axis style query, misspelled, in the at-rule’s own params', async () => {
    // The least visible failure: the query matches nothing, the branch never
    // runs, and the recipe behaves as if it were not there.
    const [warning] = await lint(
      '@container style(--pm-axis-dpeth: flat) {\n  .a {\n    color: var(--pm-text-primary);\n  }\n}\n',
    )
    expect(warning?.line).toBe(1)
    expect(warning?.column).toBe('@container style('.length + 1)
    expect(warning?.text).toContain('Did you mean `--pm-axis-depth`?')
  })

  it('reports every ghost separately, so each one can be fixed', async () => {
    expect(
      await names(
        '.a {\n  background:\n    linear-gradient(var(--pm-bg-wash-from), var(--pm-bg-wash-too)),\n    var(--pm-accent-border);\n}\n',
      ),
    ).toEqual(['--pm-bg-wash-too', '--pm-accent-border'])
  })
})

describe('what the rule counts as existing', () => {
  it('accepts an emitted token', async () => {
    expect(
      await lint('.a {\n  padding: var(--pm-space-4);\n  color: var(--pm-text-primary);\n}\n'),
    ).toEqual([])
  })

  it('accepts a property the same file declares, wherever it declares it', async () => {
    // The archetypes' own spacing: no theme emits `--pm-page-*`, by design, and
    // a law that only knew the emitted set would call each of them a ghost. It
    // is declared inside a media query and read outside it, because the
    // collection is a full pass over the file, not a running cursor.
    expect(
      await lint(
        '.page {\n  padding-inline: var(--pm-page-padding-x);\n}\n\n@media (min-width: 60rem) {\n  .page {\n    --pm-page-padding-x: var(--pm-space-6);\n  }\n}\n',
      ),
    ).toEqual([])
  })

  it('counts a declaration as a declaration, never as a read', async () => {
    expect(await lint('.a {\n  --pm-page-max-width: var(--pm-space-9);\n}\n')).toEqual([])
  })

  it('says nothing about a namespace that is not the vocabulary’s', async () => {
    // `--radix-*` is geometry the positioning engine measures at runtime.
    // `token-values-only` decides which other namespaces a value may use, and
    // this rule ignores them.
    expect(await lint('.a {\n  min-width: var(--radix-select-trigger-width);\n}\n')).toEqual([])
  })
})

describe('the rule reports an error instead of passing when misconfigured', () => {
  /**
   * The important failure mode. A rule with no token list would either call
   * every reference a ghost or, with the opposite default, call every ghost
   * lawful. Nobody would notice the second: a config with a typo in the option
   * name would report a clean sheet forever.
   */
  it('reports the missing token list instead of a clean sheet', async () => {
    const [warning, ...rest] = await lint('.a {\n  color: var(--pm-accnet-bg);\n}\n', [])
    expect(rest).toEqual([])
    expect(warning?.text).toContain('switched on without a token list')
  })

  it('rejects a token list that is not a list of names', async () => {
    const result = await stylelint.lint({
      code: '.a {\n  color: var(--pm-accent-bg);\n}\n',
      codeFilename: 'packages/react-ui/src/probe/probe.module.css',
      config: { plugins, rules: { [RULE_NAMES.noGhostTokens]: [true, { tokens: [42] }] } },
    })
    expect(result.results[0]?.invalidOptionWarnings.map((warning) => warning.text)).toEqual([
      'Invalid value "42" for option "tokens" of rule "polymorph/no-ghost-tokens"',
    ])
    // It stops there. Linting with a malformed option would report against a
    // token list nobody chose.
    expect(result.results[0]?.warnings).toEqual([])
  })
})
