import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { type Linter as LinterNS } from 'eslint'
import stylelint from 'stylelint'
import { describe, expect, it } from 'vitest'

import { RULE_CLIMB } from './ladder'
import { allRules, rules, stageOneRules, stageTwoRules, vendorableRules } from './index'
import { emittedTokens } from './stylelint/emitted'
import stylelintPlugins, { applicationRules, RULE_NAMES } from './stylelint/index.js'
import { verifyCode, verifyCss } from './verify'

/**
 * The rules' own acceptance test: seeded violations fail under the real stage
 * configs, and the lawful versions of the same files pass. A rule that silently
 * stops matching, or a config that stops applying it, fails here instead of
 * being found in a review much later.
 */

const FIXTURES = resolve(process.cwd(), 'packages/rules/fixtures')
const read = (name: string) => readFileSync(join(FIXTURES, name), 'utf8')

/**
 * A synthetic owner map, intentionally not the repo's. These tests check that
 * the rule fires, and the real map would make them fail every time a real
 * archetype was added. The paths are still real, because people copy fixtures
 * first, and a fixture naming a missing directory would spread that mistake to
 * the real map. `repo-laws.test.ts` checks that the real map names existing
 * files.
 */
const OWNERS = {
  '--pm-shell-': ['packages/react-ui/src/archetypes/app-shell.module.css'],
  '--pm-page-': ['packages/react-ui/src/archetypes/**'],
}

/** The owner map is data, so the rule that reads it must be given it. */
function withOwners(base: LinterNS.RulesRecord): LinterNS.RulesRecord {
  return { ...base, 'polymorph/scoped-token-owners': ['error', { owners: OWNERS }] }
}

/**
 * Every fixture goes through `@polymorph/rules/verify`, which is also the only
 * way the MCP server runs a rule. The server promises that `validate`
 * "returns the same diagnostics as the local toolchain on identical input".
 * Routing both through one function makes that true by construction, not by
 * two implementations happening to agree.
 */
function lintApp(fixture: string, rules: LinterNS.RulesRecord): string[] {
  const result = verifyCode(read(fixture), { filename: `apps/relay/src/${fixture}`, rules })
  expect(result.fatal, `${fixture}: ${result.fatal}`).toBeNull()
  return [...new Set(result.diagnostics.map((diagnostic) => diagnostic.rule))].sort()
}

/**
 * The vendorable rule. Fixtures are linted as if at a real component path,
 * because the rule compares the file's location with its import targets. A
 * fixture linted without a real path would report nothing.
 */
function lintVocabulary(fixture: string, rulesRecord: LinterNS.RulesRecord): string[] {
  const result = verifyCode(read(fixture), {
    surface: 'vocabulary',
    filename: resolve(process.cwd(), 'packages/react-ui/src/controls/Button.tsx'),
    rules: rulesRecord,
  })
  expect(result.fatal, `${fixture}: ${result.fatal}`).toBeNull()
  return [...new Set(result.diagnostics.map((diagnostic) => diagnostic.rule))].sort()
}

async function lintCss(fixture: string, rules: Record<string, unknown>): Promise<string[]> {
  const result = await verifyCss(read(fixture), {
    filename: `packages/react-ui/src/button/${fixture}`,
    rules: rules as LinterNS.RulesRecord,
  })
  expect(result.fatal, `${fixture}: ${result.fatal}`).toBeNull()
  return [...new Set(result.diagnostics.map((diagnostic) => diagnostic.rule))].sort()
}

describe('ESLint fixtures', () => {
  it('fails every stage-1 rule', () => {
    expect(lintApp('app-violations.tsx', stageOneRules)).toEqual([
      'polymorph/no-app-css',
      'polymorph/no-raw-styles',
    ])
  })

  it('fails every stage-2 rule', () => {
    expect(lintApp('app-violations.tsx', withOwners(stageTwoRules))).toEqual([
      'polymorph/danger-last',
      'polymorph/no-external-dataviz',
      'polymorph/no-external-icons',
      'polymorph/no-external-motion',
      'polymorph/no-raw-interactive',
      'polymorph/one-main-button',
      'polymorph/one-opener',
      'polymorph/scoped-token-owners',
      'polymorph/trailing-icon',
    ])
  })

  it('fires every application rule, so no configured rule is unused', () => {
    const fired = lintApp('app-violations.tsx', withOwners(allRules))
    expect(fired).toEqual(Object.keys(allRules).sort())
  })

  /**
   * A rule can be added to the plugin but to no config, and every test above
   * would still pass. `allRules` is only the application set, so "every rule is
   * applied somewhere" must be checked against the union of all groups.
   */
  it('leaves no rule in the plugin that no config applies', () => {
    const applied = new Set([
      ...Object.keys(stageOneRules),
      ...Object.keys(stageTwoRules),
      ...Object.keys(vendorableRules),
    ])
    expect([...applied].sort()).toEqual(
      Object.keys(rules)
        .map((name) => `polymorph/${name}`)
        .sort(),
    )
  })

  it('reports every way a vendored file can import from outside the tree', () => {
    expect(lintVocabulary('vendorable-violations.tsx', vendorableRules)).toEqual([
      'polymorph/vendorable-imports',
    ])
  })

  it('passes a component that imports only through the boundary', () => {
    expect(lintVocabulary('vendorable-clean.tsx', vendorableRules)).toEqual([])
  })

  it('passes the lawful screen', () => {
    expect(lintApp('app-clean.tsx', allRules)).toEqual([])
  })

  it('passes a declared <Bespoke> zone, because rung 4 is lawful', () => {
    expect(lintApp('app-bespoke.tsx', withOwners(allRules))).toEqual([])
  })

  it('passes a declared <ThirdParty> boundary around another library’s component', () => {
    expect(lintApp('app-third-party.tsx', withOwners(allRules))).toEqual([])
  })
})

describe('every rule says which rung answers it', () => {
  // Deduplicated, because `polymorph/scoped-token-owners` is intentionally one
  // name in two plugins: the same law, applied to TypeScript and to CSS. It has
  // one entry in the table, because the rung does not depend on the language
  // that referenced the token.
  const everyRule = [
    ...new Set([
      ...Object.keys(rules).map((name) => `polymorph/${name}`),
      ...Object.values(RULE_NAMES),
    ]),
  ].sort()

  it('has an entry for every rule in either plugin', () => {
    // For a rule missing from the table, `validate` can only refuse. Declaring
    // `[]` is the other lawful entry. The vocabulary's own laws have no rung,
    // because the ladder applies to the code that makes exceptions, not to the
    // code exceptions are made from.
    expect(Object.keys(RULE_CLIMB).sort()).toEqual(everyRule)
  })

  it('names only rungs the ladder has, in ascending order', () => {
    for (const [rule, climb] of Object.entries(RULE_CLIMB)) {
      expect(
        climb.every((rung) => rung >= 1 && rung <= 5),
        rule,
      ).toBe(true)
      expect(
        [...climb].sort((a, b) => a - b),
        rule,
      ).toEqual(climb)
      expect(new Set(climb).size, rule).toBe(climb.length)
    }
  })

  it('gives every application rule a lawful alternative', () => {
    // Every rule a screen can break needs an answer. Otherwise the system refuses
    // an agent with no lawful alternative, which the ladder exists to prevent.
    for (const rule of Object.keys(allRules)) {
      expect(RULE_CLIMB[rule], rule).toBeDefined()
    }
    expect(RULE_CLIMB['polymorph/no-raw-styles']).toEqual([1, 3, 4])
    expect(RULE_CLIMB['polymorph/no-external-icons']).toEqual([1, 4, 5])
  })
})

describe('Stylelint fixtures', () => {
  /**
   * The token list is the real one, unlike the owner map above. It is
   * regenerated from the emitter on every run, so it cannot go stale. A
   * synthetic list would only show that the rule can compare two sets, not that
   * the set it receives in production is correct. `@polymorph/rules/stylelint/emitted`
   * builds it, and `stylelint.config.js` calls the same function, so this suite
   * and the repository lint use the same token list.
   */
  const allCssRules = {
    [RULE_NAMES.tokenValuesOnly]: true,
    [RULE_NAMES.scopedTokenOwners]: [true, { owners: OWNERS }],
    [RULE_NAMES.noMotionOutsideVocabulary]: true,
    [RULE_NAMES.noThemeSelectors]: true,
    [RULE_NAMES.noMemberSelectors]: true,
    [RULE_NAMES.noGhostTokens]: [true, { tokens: emittedTokens(process.cwd()) }],
  }

  it('fails every CSS rule', async () => {
    expect(await lintCss('vocabulary-violations.css', allCssRules)).toEqual(
      [
        RULE_NAMES.tokenValuesOnly,
        RULE_NAMES.scopedTokenOwners,
        RULE_NAMES.noMotionOutsideVocabulary,
        RULE_NAMES.noThemeSelectors,
        RULE_NAMES.noMemberSelectors,
        // The ghost rule fires here too, for a known reason. This fixture reads
        // `--pm-shell-topbar-height` and `--pm-page-padding-x`, real properties
        // declared by an archetype in another file, to break
        // `scoped-token-owners`. A rule that sees one file at a time cannot
        // know the archetype declares them, so it reports them.
        // `token-references.test.ts` checks the whole corpus and does not report
        // this file. This is where the per-file rule and the corpus law differ.
        RULE_NAMES.noGhostTokens,
      ].sort(),
    )
  })

  it('reports every form of ghost, with the intended name', async () => {
    // The seeded fixture for the vocabulary-integrity law: the
    // `--pm-accent-border` case exactly, a typo hidden by a working fallback, a
    // ghost inside a fallback, and a misspelled axis style query. The lawful
    // reads at the end (an emitted token and one the file itself declares) must
    // not be reported, or the rule is unusable.
    const result = await stylelint.lint({
      code: read('vocabulary-ghost-token.css'),
      codeFilename: 'packages/react-ui/src/panel/panel.module.css',
      config: {
        plugins: stylelintPlugins,
        rules: { [RULE_NAMES.noGhostTokens]: allCssRules[RULE_NAMES.noGhostTokens] },
      },
    })
    const reported = (result.results[0]?.warnings ?? []).map((warning) => warning.text)

    expect(reported.map((text) => /Unexpected \w+\((--pm-[a-z-]+)\)/.exec(text)?.[1])).toEqual([
      '--pm-accent-border',
      '--pm-border-defualt',
      '--pm-shadow-lifted',
      '--pm-axis-dpeth',
      // Declared by `app-shell.module.css` and read here. The corpus law accepts
      // this and a per-file rule cannot. See above.
      '--pm-shell-topbar-height',
    ])
    expect(reported[1]).toContain('Did you mean `--pm-border-default`')
    expect(reported[3]).toContain('Did you mean `--pm-axis-depth`?')
  })

  it('passes token-only CSS', async () => {
    expect(await lintCss('vocabulary-clean.css', allCssRules)).toEqual([])
  })

  /**
   * The application half, through `verify` with its own rule set, which is the
   * set the MCP server's `validate` and `polymorph check` apply. A stylesheet
   * that re-declares a token, branches on the pairing, restyles a member and
   * rescales the root breaks one rule each.
   */
  it('fails every application CSS rule under the application set', async () => {
    const result = await verifyCss(read('app-css-violations.css'), {
      filename: 'apps/relay/src/register.css',
    })
    expect(result.fatal).toBeNull()
    expect([...new Set(result.diagnostics.map((diagnostic) => diagnostic.rule))].sort()).toEqual(
      Object.keys(applicationRules).sort(),
    )
  })

  it('passes application CSS that reads tokens and declares only its own properties', async () => {
    const result = await verifyCss(read('app-css-clean.css'), {
      filename: 'apps/relay/src/print.css',
    })
    expect(result.diagnostics).toEqual([])
  })

  it('holds a recipe to the identity-attribute rule in the vocabulary set', async () => {
    const result = await verifyCss(
      "[data-member='button'] .icon {\n  color: var(--pm-text-primary);\n}\n",
      { surface: 'vocabulary' },
    )
    expect(result.diagnostics.map((diagnostic) => diagnostic.rule)).toEqual([
      RULE_NAMES.noMemberSelectors,
    ])
  })

  it('underlines only the offending value, not the !important after it', async () => {
    const result = await stylelint.lint({
      code: '.a {\n  padding: 12px !important;\n}\n',
      codeFilename: 'packages/react-ui/src/a/a.module.css',
      config: { plugins: stylelintPlugins, rules: { [RULE_NAMES.tokenValuesOnly]: true } },
    })
    const [warning] = result.results[0]?.warnings ?? []
    expect(warning?.line).toBe(2)
    expect(warning?.column).toBe('  padding: '.length + 1)
    expect(warning?.endColumn).toBe('  padding: 12px'.length + 1)
  })

  /**
   * A pairing is `data-system` plus `data-palette`, which replace the retired
   * `data-theme`. A ban on only one name could be bypassed by renaming. This
   * asserts each attribute instead of "the rule fired", because otherwise the
   * fixture would still pass the suite above with two of the three attributes
   * silently allowed.
   */
  it('bans both attributes of a pairing and the retired data-theme', async () => {
    const result = await stylelint.lint({
      code: read('vocabulary-violations.css'),
      codeFilename: 'packages/react-ui/src/button/button.module.css',
      config: { plugins: stylelintPlugins, rules: { [RULE_NAMES.noThemeSelectors]: true } },
    })
    const reported = (result.results[0]?.warnings ?? []).map((warning) => warning.text)

    // With a value and bare, for each of the three. The bare form is how an edit
    // starts before it becomes a theme check.
    expect(reported).toHaveLength(6)
    for (const attribute of ['data-system', 'data-palette', 'data-theme']) {
      expect(
        reported.filter((text) => text.includes(`[${attribute}`)),
        attribute,
      ).toHaveLength(2)
    }
  })

  it('bans the identity attribute in recipes, named and bare', async () => {
    // Every root writes `data-member`, and only the emitter's `@scope` exception
    // blocks read it. A recipe selecting it is a component branching on its own
    // name.
    const result = await stylelint.lint({
      code: read('vocabulary-violations.css'),
      codeFilename: 'packages/react-ui/src/button/button.module.css',
      config: { plugins: stylelintPlugins, rules: { [RULE_NAMES.noMemberSelectors]: true } },
    })
    const reported = (result.results[0]?.warnings ?? []).map((warning) => warning.text)
    expect(reported).toHaveLength(2)
    for (const text of reported) {
      expect(text).toContain('data-member')
      expect(text).toContain('branching on its own name')
    }
  })

  it('reports each raw value separately, so each one can be fixed', async () => {
    const result = await stylelint.lint({
      code: read('vocabulary-violations.css'),
      codeFilename: 'packages/react-ui/src/button/button.module.css',
      config: { plugins: stylelintPlugins, rules: { [RULE_NAMES.tokenValuesOnly]: true } },
    })
    const warnings = result.results[0]?.warnings ?? []
    // gap, padding, font-size, font-weight, colour, background, border colour,
    // radius, two shadow lengths, transition duration, the non-pm var and its
    // raw fallback, each reported individually.
    expect(warnings.length).toBeGreaterThanOrEqual(12)
    expect(warnings.every((w) => /--pm-/.test(w.text))).toBe(true)
  })
})
