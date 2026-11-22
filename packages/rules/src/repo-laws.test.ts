import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import stylelint from 'stylelint'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  CHART_ENGINE,
  CHART_TIER,
  ICON_MAP_FILE,
  MOTION_INTERNALS,
  SYMBOL_DRAWERS,
} from './containment'
import { matchesAny } from './glob'

/**
 * Laws about the repository itself, which no linter can see.
 *
 * `no-app-css` catches a stylesheet that is imported. ESLint never visits a file
 * nobody imports, so a stray `.css` under `apps/` would go unnoticed until
 * someone imported it. This file covers that case.
 */

const ROOT = process.cwd()

/**
 * The one declared exemption: the dev harness. It is a literal both here and in
 * `eslint.config.ts`, so widening it takes two deliberate edits, not one.
 */
const HARNESS = ['apps/*/src/harness/**']

function walk(dir: string, base = dir): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, base))
    else out.push(full.slice(base.length + 1))
  }
  return out
}

describe('apps/ contains no stylesheets', () => {
  const files = walk(resolve(ROOT, 'apps'))

  it('finds the app tree, so a pass is meaningful', () => {
    expect(files.some((file) => file.endsWith('.tsx'))).toBe(true)
  })

  it('keeps every stylesheet inside the declared harness exemption', () => {
    const stray = files
      .filter((file) => /\.(css|scss|sass|less|styl)$/.test(file))
      .map((file) => `apps/${file}`)
      .filter((file) => !matchesAny(file, HARNESS))

    expect(stray, 'a screen with its own stylesheet has somewhere to put a decision').toEqual([])
  })

  it('keeps the harness exemption narrow', () => {
    // If the exemption is widened to a whole app, this assertion fails.
    expect(HARNESS).toEqual(['apps/*/src/harness/**'])
  })
})

describe('the exception ladder stays visible', () => {
  it('documents why the harness is exempt, where the exemption lives', () => {
    const readme = readFileSync(resolve(ROOT, 'apps/workbench/src/harness/README.md'), 'utf8')
    expect(readme).toMatch(/exempt/i)
    expect(readme).toMatch(/red rule/i)
  })
})

/* -------------------------------------------------------------------------- */
/* The one-h1 law                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The one-h1 law, which counts a pair (`design/components/hero.md`).
 *
 * With one opener the law would hold by construction. PageHeader owns the
 * page's `<h1>`, `Heading`'s `level` starts at 2 so a second h1 cannot be
 * written, and each archetype's tests show its composition renders one. Hero is
 * a second lawful source: a page composes **exactly one** of PageHeader or
 * Hero: PageHeader on working screens, Hero on opening pages. A rule with two
 * lawful sources needs checking, because a page that uses both renders two h1s.
 *
 * This check lives here for the same reason as the `no-app-css` check above:
 * neither question can be answered one file at a time. Which components may
 * render an `<h1>` is a fact about the whole vocabulary. How many openers a
 * page composes can depend on several files, and no file-scoped linter sees
 * them together. The archetype tests in `packages/react-ui/src/archetypes` still
 * assert the rendered result (that a page archetype puts exactly one h1 on
 * screen), and this is the corpus check.
 *
 * The third check ships to consumers: `polymorph/one-opener` fails a module that
 * renders both, so a consumer who composes the pair gets a red rule. It cannot
 * see a page assembled across modules, as no file-scoped rule can, so this
 * corpus check stays as it is and is not replaced by the rule.
 *
 * Comments are stripped before scanning, because several files that discuss
 * the law quote the tag: `AppShell` says it contains no `<h1>`, and `Heading`
 * says why it cannot render one.
 */
describe('the one-h1 law counts a pair', () => {
  /** Vocabulary source without its fixtures and tests: what the system ships. */
  const VOCABULARY = ['packages/react-ui/src', 'packages/react/src']
    .flatMap((dir) => walk(resolve(ROOT, dir)).map((file) => `${dir}/${file}`))
    .filter((file) => file.endsWith('.tsx') && !/\.(test|states)\.tsx$/.test(file))

  /**
   * The one temporary file under `apps/`. `packages/mcp/transcript.test.ts`
   * checks that `validate` agrees with the local toolchain by writing the
   * violating fixture to a real application path (the ESLint config selects
   * files by glob, so the path must be real) and deleting it afterwards. Vitest
   * runs the two files in parallel workers, so this walk can run while the probe
   * exists. A corpus law that counted it would report another test's temporary
   * file, not a page the repo ships. It is excluded by exact path, and a test
   * below checks the path against the literal in the file that writes it. A
   * probe renamed in only one place then fails the law instead of silently
   * reopening the race.
   */
  const TRANSIENT_PROBE = 'apps/workbench/src/relay/validate-probe.tsx'

  const APP_FILES = walk(resolve(ROOT, 'apps'))
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => `apps/${file}`)
    .filter((file) => file !== TRANSIENT_PROBE)

  const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

  const code = (file: string): string => stripComments(readFileSync(resolve(ROOT, file), 'utf8'))

  const countOf = (source: string, pattern: RegExp): number => (source.match(pattern) ?? []).length

  /** A JSX `<h1>`, not the word in a sentence. */
  const H1 = /<h1[\s>]/g

  /** The two openers, as a call site writes them. */
  const OPENER = /<(PageHeader|Hero)[\s/>]/g

  /**
   * The only components allowed to render the element. Two are the openers. Two
   * are archetypes that are themselves a page and render their own h1:
   * AuthPage's card title is the page's h1 (there is no shell around it), and
   * DetailPage's entity name comes after its back button in the DOM. A fifth
   * entry is a design decision and requires an edit to this list.
   */
  const LAWFUL_SOURCES = [
    'packages/react-ui/src/archetypes/AuthPage.tsx',
    'packages/react-ui/src/archetypes/DetailPage.tsx',
    'packages/react-ui/src/structure/Hero.tsx',
    'packages/react-ui/src/structure/PageHeader.tsx',
  ]

  it('finds both trees, so a pass is meaningful', () => {
    expect(VOCABULARY.length).toBeGreaterThan(50)
    expect(APP_FILES.length).toBeGreaterThan(10)
  })

  it('excludes only the probe that its writer writes', () => {
    // Checks the exclusion above. The path is a literal in two files on purpose,
    // so moving the probe takes two deliberate edits, and a single edit fails
    // the law instead of reopening the race.
    const writer = readFileSync(resolve(ROOT, 'packages/mcp/transcript.test.ts'), 'utf8')
    expect(writer).toContain(`'${TRANSIENT_PROBE}'`)
  })

  it('names every component in the vocabulary that renders one', () => {
    const sources = VOCABULARY.filter((file) => countOf(code(file), H1) > 0)
    expect(sources.sort()).toEqual(LAWFUL_SOURCES)
  })

  it('lets each of them render exactly one', () => {
    for (const file of LAWFUL_SOURCES) {
      expect(countOf(code(file), H1), file).toBe(1)
    }
  })

  it('composes at most one opener into any page the repo ships', () => {
    // The pair rule, checked where pages are written. Two openers in one module
    // means two h1s on one screen, whichever two they are. A second PageHeader is
    // a violation, and a Hero beside a PageHeader is the same violation.
    const doubled = APP_FILES.map((file) => ({
      file,
      openers: countOf(code(file), OPENER),
    })).filter(({ openers }) => openers > 1)
    expect(doubled, 'a page composes both halves of the pair and renders two h1s').toEqual([])
  })

  it('allows a hand-written h1 only in the harness', () => {
    const stray = APP_FILES.filter((file) => !matchesAny(file, HARNESS)).filter(
      (file) => countOf(code(file), H1) > 0,
    )
    expect(stray, 'an application page writes its own h1 instead of composing one').toEqual([])
  })

  it('detects a page that composes both', () => {
    // A seeded example. A page with a PageHeader and a Hero is what the law above
    // looks for, and running the same counter on one shows the check works
    // instead of passing over an empty list.
    const seeded = stripComments(`
      export function OverviewPage() {
        return (
          <Stack>
            <PageHeader title="Overview" />
            <Hero title="One vocabulary. Any number of faces." />
          </Stack>
        )
      }
    `)
    expect(countOf(seeded, OPENER)).toBe(2)
  })
})

/**
 * A rule that is written and unit-tested but not added to the flat config does
 * nothing, and every other test would still pass. `fixtures.test.ts` checks that
 * each rule fails when applied. This checks that the repo applies them, by
 * asking ESLint which rules apply to a given file instead of reading the config
 * as text.
 *
 * A stage that is commented out in the config passes every other test, so this
 * asks ESLint, not the config file.
 */
describe('both stages of the red rules are switched on', () => {
  const SUBJECTS = {
    app: 'apps/workbench/src/App.tsx',
    harness: 'apps/workbench/src/harness/HomePage.tsx',
    vocabulary: 'packages/react-ui/src/controls/Button.tsx',
  }

  /*
   * Resolved once, not once per assertion. `eslint.config.ts` is TypeScript, so
   * resolving it transpiles the config and everything it imports. That takes
   * seconds on a machine already running the rest of the suite in parallel, and
   * doing it three times under the default 5s timeout makes the test flaky.
   */
  const resolved: Record<keyof typeof SUBJECTS, string[]> = { app: [], harness: [], vocabulary: [] }

  beforeAll(async () => {
    const { ESLint } = await import('eslint')
    const eslint = new ESLint({ cwd: ROOT })

    for (const [key, file] of Object.entries(SUBJECTS)) {
      const config = await eslint.calculateConfigForFile(file)
      resolved[key as keyof typeof SUBJECTS] = Object.keys(config.rules ?? {})
        .filter((rule) => rule.startsWith('polymorph/'))
        .sort()
    }
  }, 60_000)

  it('applies every application rule the plugin ships to application code', () => {
    expect(resolved.app).toEqual([
      'polymorph/no-app-css',
      'polymorph/no-external-dataviz',
      'polymorph/no-external-icons',
      'polymorph/no-external-motion',
      'polymorph/no-raw-interactive',
      'polymorph/no-raw-styles',
      'polymorph/one-opener',
      'polymorph/scoped-token-owners',
    ])
  })

  it('applies none of them to the harness', () => {
    // Checks the exemption where it is applied, not where it is declared.
    expect(resolved.harness).toEqual([])
  })

  it('applies only the containment and packaging-boundary rules to the vocabulary', () => {
    // `packages/react-ui` is checked by Stylelint and by icon/motion
    // containment. The app rules would forbid the vocabulary from containing any
    // `<button>`.
    expect(resolved.vocabulary).toEqual([
      'polymorph/no-external-dataviz',
      'polymorph/no-external-icons',
      'polymorph/no-external-motion',
      // The packaging-boundary rule. A consumer owns copies of
      // `packages/react-ui`, so its files must still work after being copied out
      // of this repository.
      'polymorph/vendorable-imports',
    ])
  })
})

/**
 * The same check for the CSS rules.
 *
 * A Stylelint override commented out in `stylelint.config.js` makes no test
 * fail. `fixtures.test.ts` lints the CSS rules under a config it builds itself,
 * so it shows they work, but not that the repo runs them. Without this suite,
 * Stylelint would be the only linter with no configuration test, and a gap there
 * would go unnoticed.
 *
 * It asks two questions, because they fail differently. `resolveConfig` answers
 * "does this rule apply to this path", which a commented-out override breaks.
 * The probes answer "does it then report", which a dropped `plugins` entry or a
 * rule that stops matching breaks.
 */
describe('both stages of the CSS rules are switched on', () => {
  const SUBJECTS = {
    vocabulary: 'packages/recipes/src/controls/button.module.css',
    harness: 'apps/workbench/src/harness/Toolbar.module.css',
  }

  const resolved: Record<keyof typeof SUBJECTS, string[]> = { vocabulary: [], harness: [] }

  beforeAll(async () => {
    for (const [key, file] of Object.entries(SUBJECTS)) {
      const config = await stylelint.resolveConfig(file, { cwd: ROOT })
      resolved[key as keyof typeof SUBJECTS] = Object.keys(config?.rules ?? {})
        .filter((rule) => rule.startsWith('polymorph/'))
        .sort()
    }
  }, 60_000)

  it('applies both stages to vocabulary CSS', () => {
    expect(resolved.vocabulary).toEqual([
      // The shipped check for the vocabulary-integrity law. The stronger check
      // is `token-references.test.ts`, which reads the whole corpus. This one
      // runs in the editor and in a consumer's repository, where that suite
      // does not exist.
      'polymorph/no-ghost-tokens',
      // Member exceptions: only the emitter may select on the identity
      // attribute, never a recipe, so a component cannot branch on its own name.
      'polymorph/no-member-selectors',
      'polymorph/no-theme-selectors',
      'polymorph/scoped-token-owners',
      'polymorph/token-values-only',
    ])
  })

  it('applies the application half to app CSS, including the harness', () => {
    // The harness is exempt from every ESLint rule but not from these. It is a
    // stylesheet under `apps/`, which is the only condition.
    expect(resolved.harness).toEqual([
      'polymorph/no-app-member-selectors',
      'polymorph/no-app-theme-selectors',
      'polymorph/no-motion-outside-vocabulary',
      'polymorph/no-root-font-size',
      'polymorph/no-token-declarations',
    ])
  })

  /**
   * Real filenames with substituted contents. Stylelint lints `code`, and the
   * path only decides which config and owner-map entries apply.
   */
  async function probe(codeFilename: string, code: string): Promise<string[]> {
    const result = await stylelint.lint({
      code,
      codeFilename,
      configFile: resolve(ROOT, 'stylelint.config.js'),
      cwd: ROOT,
    })
    const warnings = result.results[0]?.warnings ?? []

    // Stylelint reports a rule it cannot find under the rule's own name. If
    // `plugins` were dropped from the config, every assertion below would still
    // see the expected rule name. The name alone does not show the rule ran.
    for (const warning of warnings) {
      expect(warning.text, `${codeFilename}: ${warning.rule}`).not.toMatch(/^Unknown rule/)
    }

    const rules = warnings.map((warning) => warning.rule)
    return [...new Set(rules)].filter((rule) => rule.startsWith('polymorph/')).sort()
  }

  it('reports a scoped token read outside its owning pattern', async () => {
    // Two rules on one line, with two different objections. The ownership law
    // says a `--pm-shell-*` token belongs to the archetype that owns it. The
    // ghost law sees one file at a time and says nothing in this file declares
    // it. Both apply to a control using the shell's spacing, and each suggests
    // a different fix.
    expect(
      await probe(SUBJECTS.vocabulary, '.probe {\n  height: var(--pm-shell-topbar-height);\n}\n'),
    ).toEqual(['polymorph/no-ghost-tokens', 'polymorph/scoped-token-owners'])
  })

  it('reports a recipe that reads a token nothing declares', async () => {
    // The configuration check for this rule. The config must pass it the token
    // list, and a rule switched on without one reports its own misconfiguration
    // instead of a clean sheet. So this result shows the emitted set arrived.
    expect(
      await probe(SUBJECTS.vocabulary, '.probe {\n  background: var(--pm-accnet-bg);\n}\n'),
    ).toEqual(['polymorph/no-ghost-tokens'])
  })

  it('accepts a token the emitter writes', async () => {
    expect(
      await probe(SUBJECTS.vocabulary, '.probe {\n  background: var(--pm-accent-bg);\n}\n'),
    ).toEqual([])
  })

  it('reports a token the harness declares, and the pairing it branches on', async () => {
    expect(
      await probe(
        SUBJECTS.harness,
        "[data-palette='petrol'] .probe {\n  --pm-accent-bg: var(--pm-bg-surface);\n}\n",
      ),
    ).toEqual(['polymorph/no-app-theme-selectors', 'polymorph/no-token-declarations'])
  })

  it('reports a transition in the harness', async () => {
    expect(await probe(SUBJECTS.harness, '.probe {\n  transition: opacity 200ms;\n}\n')).toEqual([
      'polymorph/no-motion-outside-vocabulary',
    ])
  })

  it('reports a recipe that selects on the house system', async () => {
    expect(
      await probe(
        SUBJECTS.vocabulary,
        "[data-system='terminal'] .probe {\n  background: var(--pm-bg-surface);\n}\n",
      ),
    ).toEqual(['polymorph/no-theme-selectors'])
  })

  it('reports a recipe that selects on the palette', async () => {
    // The pairing's other attribute, checked with the real config. A pairing is
    // two attributes, and a rule applied to only one of them would allow a
    // recipe to fork its colours.
    expect(
      await probe(
        SUBJECTS.vocabulary,
        "[data-palette='petrol'] .probe {\n  background: var(--pm-accent-bg);\n}\n",
      ),
    ).toEqual(['polymorph/no-theme-selectors'])
  })

  it('reports the retired data-theme attribute if it is reintroduced', async () => {
    // Nothing sets `data-theme`, which is why the ban stays: no other law in
    // the tree would catch it being reintroduced.
    expect(
      await probe(
        SUBJECTS.vocabulary,
        "[data-theme='terminal'] .probe {\n  background: var(--pm-bg-surface);\n}\n",
      ),
    ).toEqual(['polymorph/no-theme-selectors'])
  })

  it('accepts the lawful axis branch', async () => {
    // The same law forbids the theme check and provides a lawful alternative.
    // A rule that only banned would push the divergence somewhere no rule can
    // see.
    expect(
      await probe(
        SUBJECTS.vocabulary,
        '@container style(--pm-axis-depth: flat) {\n' +
          '  .probe {\n    border: 1px solid var(--pm-border-default);\n  }\n}\n',
      ),
    ).toEqual([])
  })
})

describe('containment boundaries point at existing files', () => {
  it('keeps the icon map where the icon containment law says it is', () => {
    // A rename that misses this constant would silently break icon containment.
    // The rule would still run, its allowlist would match nothing, and the map
    // itself would be the only file reported.
    expect(existsSync(resolve(ROOT, ICON_MAP_FILE)), ICON_MAP_FILE).toBe(true)
  })

  it('states the motion internals as a glob under the engine', () => {
    // The motion engine ships in `@polymorph/engine`. It is installed and
    // upgraded by semver, not vendored, so its boundary is there too. The
    // boundary must be declared and scoped to one directory.
    for (const glob of MOTION_INTERNALS) {
      expect(glob.startsWith('packages/engine/src/'), glob).toBe(true)
    }
    expect(existsSync(resolve(ROOT, 'packages/engine/src/motion'))).toBe(true)
    expect(matchesAny('packages/engine/src/motion/animate.ts', MOTION_INTERNALS)).toBe(true)
    expect(matchesAny('packages/engine/src/icon/roles.ts', MOTION_INTERNALS)).toBe(false)
    // A component outside that directory is not covered.
    expect(matchesAny('packages/react-ui/src/controls/Button.tsx', MOTION_INTERNALS)).toBe(false)
  })

  it('scopes the chart scale maths to the engine only', () => {
    // One directory: the chart engine every framework's chart members draw
    // with, `@polymorph/engine/charts`.
    expect(CHART_ENGINE).toEqual(['packages/engine/src/charts/**'])
    for (const glob of CHART_ENGINE) {
      expect(existsSync(resolve(ROOT, glob.replace('/**', ''))), glob).toBe(true)
    }
    expect(matchesAny('packages/engine/src/charts/scales.ts', CHART_ENGINE)).toBe(true)
    expect(matchesAny('packages/engine/src/charts/paths.ts', CHART_ENGINE)).toBe(true)
    // The rest of the engine is outside it.
    expect(matchesAny('packages/engine/src/conventions/files.ts', CHART_ENGINE)).toBe(false)
    // The frame and the members sit directly above it and are outside the
    // boundary. Only this repository's own functions leave the engine.
    expect(matchesAny('packages/react-ui/src/charts/frame/ChartAxis.tsx', CHART_ENGINE)).toBe(false)
    expect(matchesAny('packages/react-ui/src/charts/BarChart.tsx', CHART_ENGINE)).toBe(false)
  })

  it('lets the chart tier draw without letting it import a glyph', () => {
    // `CHART_TIER` is passed to `drawIn`, not `allowIn`. A chart is SVG, and a
    // chart that needed a picture would still reference it by meaning through
    // `Icon`.
    expect(matchesAny('packages/react-ui/src/charts/frame/ChartFrame.tsx', CHART_TIER)).toBe(true)
    expect(matchesAny('packages/react-ui/src/charts/BarChart.tsx', CHART_TIER)).toBe(true)
    expect(matchesAny('packages/react-ui/src/structure/Badge.tsx', CHART_TIER)).toBe(false)
    // The chart engine is not in the tier: it computes `d` strings and
    // positions, and draws nothing.
    expect(matchesAny('packages/engine/src/charts/paths.ts', CHART_TIER)).toBe(false)
    expect(matchesAny('packages/engine/src/charts/scales.ts', CHART_TIER)).toBe(false)
  })

  it('names the drawing files outside the chart tier as files, not directories', () => {
    // A brand mark, a QR symbol and a progress ring get the chart tier's
    // exemption, because they draw geometry, not glyphs. A glob here would let a directory gain a drawing
    // file nobody reviewed. Each is a path and must exist: a rename that misses
    // this constant would leave the rule matching nothing and reporting the file.
    for (const file of SYMBOL_DRAWERS) {
      expect(file.includes('*'), file).toBe(false)
      expect(existsSync(resolve(ROOT, file)), file).toBe(true)
    }
    // The exemption does not extend to neighbouring files.
    expect(matchesAny('packages/react/src/icon/Icon.tsx', SYMBOL_DRAWERS)).toBe(false)
    expect(matchesAny('packages/react-ui/src/structure/qr-code.states.tsx', SYMBOL_DRAWERS)).toBe(
      false,
    )
    expect(matchesAny('packages/react-ui/src/controls/ProviderButton.tsx', SYMBOL_DRAWERS)).toBe(
      false,
    )
    expect(matchesAny('packages/react-ui/src/structure/progress.states.tsx', SYMBOL_DRAWERS)).toBe(
      false,
    )
    // It only allows drawing. No file here is the glyph map.
    expect(SYMBOL_DRAWERS).not.toContain(ICON_MAP_FILE)
  })
})

describe('the pattern-scoped namespaces point at real files', () => {
  /**
   * The owner map only works while its globs match files. A map pointing at a
   * missing directory still runs, matches nothing, and reports the owning file
   * itself as the violation.
   */
  const owners = JSON.parse(
    readFileSync(resolve(ROOT, 'packages/rules/scoped-token-owners.json'), 'utf8'),
  ) as Record<string, string[]>

  it('names every namespace the vocabulary declares', () => {
    // Two from the archetypes, and `--pm-chart-height-` from the chart frame.
    // The frame heights are pattern-scoped, not theme-emitted, because a chart's
    // height belongs to the chart, not to a decision every pairing re-makes.
    expect(Object.keys(owners).sort()).toEqual(['--pm-chart-height-', '--pm-page-', '--pm-shell-'])
  })

  it('lists an owner that exists for each', () => {
    for (const [namespace, paths] of Object.entries(owners)) {
      expect(paths.length, namespace).toBeGreaterThan(0)
      for (const path of paths) {
        expect(existsSync(resolve(ROOT, path)), `${namespace} -> ${path}`).toBe(true)
      }
    }
  })

  it('keeps every owner among the recipes', () => {
    // A namespace owned by application code would put a design decision in `apps/`.
    for (const paths of Object.values(owners)) {
      for (const path of paths) expect(path.startsWith('packages/recipes/src/'), path).toBe(true)
    }
  })

  it('declares each namespace in the file that owns it', () => {
    for (const [namespace, paths] of Object.entries(owners)) {
      const declared = paths.some((path) =>
        readFileSync(resolve(ROOT, path), 'utf8').includes(`${namespace}`),
      )
      expect(declared, `${namespace} is owned by files that never mention it`).toBe(true)
    }
  })
})

describe('the layout primitives make app CSS unnecessary', () => {
  /**
   * Checks that the workbench overview page is composed entirely of vocabulary
   * primitives: no stylesheet import, no `style` prop, no `className`. It is in
   * the harness, so no lint rule applies to it, which is why this test asserts
   * it.
   */
  const source = readFileSync(resolve(ROOT, 'apps/workbench/src/harness/HomePage.tsx'), 'utf8')

  it('imports no stylesheet', () => {
    expect(source).not.toMatch(/\.css['"]/)
  })

  it('sets no style or className', () => {
    expect(source).not.toMatch(/\bstyle=/)
    expect(source).not.toMatch(/\bclassName=/)
  })

  it('gets its spacing from the primitives', () => {
    expect(source).toMatch(/from '@polymorph\/react-ui'/)
    expect(source).toMatch(/<Stack/)
    expect(source).toMatch(/gap=\{\d\}/)
  })
})

describe('a release runs the gate first', () => {
  /**
   * There is no hosted CI that checks a change, so `scripts/publish-packages.mjs`
   * is the only machine between a commit and a published tarball. The publish
   * workflow runs it with `--tagged`, which reads the gate's result from the
   * release tag because a GitHub-hosted runner does not run the gate, and the
   * script writes that result into the tag only after the gate passed. This reads
   * the script instead of running it: the gate takes minutes and the upload needs
   * a token.
   */
  const source = readFileSync(resolve(ROOT, 'scripts/publish-packages.mjs'), 'utf8')
  const lines = source.split('\n')

  it('invokes the whole gate, not a subset of it', () => {
    expect(source).toMatch(/run\('pnpm', \['gate'\]/)
  })

  it('calls it on every run that does not read it from the tag, a dry run included', () => {
    expect(lines).toContain('if (fromTag) recordedGate()')
    expect(lines).toContain('else gate()')
  })

  it('reads it from the tag only as the line the script writes there', () => {
    expect(source).toMatch(/const GATE_RECORD = `Gate: passed at \$\{HEAD\}`/)
    expect(source).toMatch(/!message\.includes\(GATE_RECORD\)/)
    expect(source).toMatch(/run\('git', \['tag', '-a', [^\n]*GATE_RECORD\]\)/)
  })

  it('decides before anything is packed, uploaded or tagged', () => {
    const gate = source.indexOf('\nif (fromTag) recordedGate()')
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(source.indexOf("['pack'"))
    expect(gate).toBeLessThan(source.indexOf("['publish'"))
    expect(gate).toBeLessThan(source.indexOf("['tag', '-a'"))
  })
})
