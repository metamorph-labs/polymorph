import js from '@eslint/js'
import polymorph, {
  fixableRawControls,
  stageOneRules,
  stageTwoRules,
  vendorableRules,
} from '@polymorph/rules/eslint'
import {
  CHART_ENGINE,
  CHART_TIER,
  ICON_MAP_FILE,
  ICON_MAP_TEST,
  MOTION_INTERNALS,
  SYMBOL_DRAWERS,
} from '@polymorph/rules/containment'
import { tokenValues } from '@polymorph/rules/stylelint/emitted'
import type { Linter } from 'eslint'
import prettier from 'eslint-config-prettier/flat'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

/**
 * Flat config. The red rules (`docs/rules.md`) come in two groups, exported by
 * `@polymorph/rules/eslint` as `stageOneRules` and `stageTwoRules`:
 *
 *   stage 1 — application code cannot express a style decision.
 *   stage 2 — application code cannot reach past the vocabulary. It needs the
 *             vocabulary to exist first, because forbidding `<button>` before
 *             `<Button>` and `<Bespoke>` both exist leaves no lawful alternative.
 *
 * Both are active.
 */

/** Application code: composition and content bindings, nothing else. */
const APP_CODE = ['apps/**/*.{ts,tsx}']

/**
 * The dev harness is a tool for inspecting the system, not product code. It
 * draws swatches in arbitrary resolved colours, and its toolbar is plain HTML
 * outside the vocabulary. The exemption is declared here and explained in
 * `apps/workbench/src/harness/README.md`. Relay, the demo product, has none.
 */
const HARNESS = ['apps/*/src/harness/**']

/**
 * The theme's values, so a raw colour or length in application code is
 * reported with the nearest token by value (a `#0089ea` background is
 * `--pm-accent-bg`, a `12px` gap is `--pm-space-4` and `gap={4}`) instead of
 * only its family.
 *
 * Read once, at config load, from the sheet the engine emits for the reference
 * pairing, as `stylelint.config.js` reads its token list.
 * `packages/rules/src/stylelint/emitted.ts` explains the source and its cost.
 */
const VALUES = tokenValues(import.meta.dirname)

/** Stage 1, with the values given to the two rules that report a raw value. */
const STAGE_ONE = {
  ...stageOneRules,
  'polymorph/no-raw-styles': ['error', { values: VALUES }],
  'polymorph/no-app-css': ['error', { values: VALUES }],
} satisfies Linter.RulesRecord

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.vite/**',
      // Deliberately unlawful. `packages/rules/src/fixtures.test.ts` lints them.
      'packages/rules/fixtures/**',
      // Generated from the catalogue by `pnpm registry`; not hand-lawful code.
      'apps/*/src/fonts.gen.ts',
      // Agent worktrees are whole checkouts of this repository, linted from their own root.
      '.claude/**',
      // Gradle's build outputs for the native packages (test reports carry their own JS).
      'platforms/**/build/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['packages/{react-ui,react}/**/*.{ts,tsx}', 'apps/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    /**
     * Scripts that node runs as programs rather than as modules: the inventory
     * CLI, the churn harness behind `pnpm proof` (`docs/verification.md`), the
     * agent eval behind `pnpm eval`, and the root `scripts/` runners behind
     * `pnpm typecheck` and `pnpm lint`.
     * Their globals are declared here rather than by adding a globals package
     * for a handful of names.
     *
     * `inventory.js` itself takes a root and returns data. Only its `bin`
     * wrapper touches `process`, which keeps the scanner testable.
     */
    name: 'polymorph/node-cli',
    files: [
      'packages/*/bin/**/*.{js,mjs}',
      'packages/*/scripts/**/*.mjs',
      'proof/**/*.mjs',
      'eval/**/*.mjs',
      'scripts/**/*.mjs',
    ],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        // Evaluated inside the browser by Playwright, not by node.
        document: 'readonly',
        getComputedStyle: 'readonly',
        localStorage: 'readonly',
        window: 'readonly',
      },
    },
  },
  {
    name: 'polymorph/red-rules-stage-1',
    files: APP_CODE,
    ignores: HARNESS,
    plugins: { polymorph },
    rules: STAGE_ONE,
  },
  {
    /**
     * The vocabulary's own containment laws. These are rules about the
     * vocabulary's source, not about application code:
     *
     *  - icons: exactly one file may import the icon set, so the set is a
     *    design decision rather than a dependency.
     *  - "motion re-exported nowhere": the engine can be swapped only while
     *    nothing outside `src/motion/` can see it.
     *  - charts: the same pattern again. The borrowed scale code is visible from
     *    the engine's `src/charts/` and nowhere else, including the frame and
     *    the members that draw with it.
     *
     * `drawIn` is the chart tier's one exemption. A chart is SVG, and every mark
     * it draws is geometry the component computed, not a named glyph. It lifts
     * the inline-`<svg>` half of the icon rule and **only** that half. The
     * glyph-import ban still applies to the tier, so a chart that needs a
     * picture still goes through the icon gateway.
     */
    name: 'polymorph/vocabulary-containment',
    files: ['packages/{react-ui,react,engine}/**/*.{ts,tsx}'],
    plugins: { polymorph },
    rules: {
      'polymorph/no-external-icons': [
        'error',
        { allowIn: [ICON_MAP_FILE, ICON_MAP_TEST], drawIn: [...CHART_TIER, ...SYMBOL_DRAWERS] },
      ],
      'polymorph/no-external-motion': ['error', { allowIn: MOTION_INTERNALS }],
      'polymorph/no-external-dataviz': ['error', { allowIn: CHART_ENGINE }],
    },
  },
  {
    /**
     * The packaging boundary, applied to the tree that gets vendored.
     *
     * `packages/react-ui` is the part a consumer owns. `polymorph add` copies
     * these files into their repository, so every import in them must resolve
     * there too. The rule stops monorepo-only shortcuts (a relative import into
     * `packages/react` or `packages/engine`, a read of `design/`, a deep import
     * past their published subpaths) from shipping as a broken file. The rule's
     * root is `packages/react-ui/src`, the tree `polymorph add` copies from. A
     * member's recipe import (`@polymorph/recipes/<tier>/<file>.module.css`) is
     * a package import the rule allows; `polymorph add` copies the recipe beside
     * the member and rewrites the import to it.
     *
     * Tests are exempt because they are never copied: `vitest` runs them here,
     * and `polymorph add` does not copy them.
     */
    name: 'polymorph/vendorable-boundary',
    files: ['packages/react-ui/**/*.{ts,tsx}'],
    ignores: ['packages/react-ui/**/*.test.{ts,tsx}', 'packages/react-ui/src/test-setup.ts'],
    plugins: { polymorph },
    rules: vendorableRules,
  },
  {
    /**
     * Stage 2. These rules point people to the `<Bespoke>` route. A rule that
     * forbids `<button>` with no lawful alternative gets disabled. Here there is
     * an alternative, and `pnpm inventory` counts its uses.
     *
     * The exception is honoured inside the rules themselves (`rules/jsx.ts`),
     * not by an `eslint-disable` comment. That is the difference between a
     * declared exception and an undeclared one, and an undeclared one is what
     * makes the inventory exit non-zero.
     */
    name: 'polymorph/red-rules-stage-2',
    files: APP_CODE,
    ignores: HARNESS,
    plugins: { polymorph },
    // The apps here import members from the package, so a text-only `<button>`
    // has one module to be rewritten against, and its fix is enabled.
    rules: { ...stageTwoRules, ...fixableRawControls },
  },
  prettier,
)
