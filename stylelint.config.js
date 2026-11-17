import { createJiti } from 'jiti'

import polymorph, { applicationRules, RULE_NAMES } from '@polymorph/rules/stylelint'

/**
 * Every token that exists, computed at config-load time.
 *
 * `no-ghost-tokens` must be told which custom properties exist, and the only
 * reliable source is the sheet the theme engine emits. A checked-in list would
 * go stale and let the next missing token through. The engine is TypeScript
 * and this file is loaded natively by node, so `jiti` bridges the two. It is
 * already this repository's way of reaching TypeScript from a plain-JS entry
 * point (`packages/cli/bin/polymorph.js`, `bin/registry.js`).
 *
 * The list comes from `@polymorph/engine`, through
 * `@polymorph/rules/stylelint/emitted`. The cost is one transpile of the engine
 * on a cold cache (~2s), then a cache read plus one `emitThemeCSS` (~0.3s), paid
 * on every Stylelint run, editor integrations included.
 * `packages/rules/src/stylelint/emitted.ts` explains why that trade is right and
 * why one pairing covers all of them.
 */
const jiti = createJiti(import.meta.url)
const { emittedTokens, tokenValues } = jiti('@polymorph/rules/stylelint/emitted')
const TOKENS = emittedTokens(import.meta.dirname)

/**
 * The values those tokens have in the reference pairing, by family, from the
 * same emitted sheet. `token-values-only` compares a raw colour, length or
 * duration with them, so a report names the nearest token (`12px` is
 * `var(--pm-space-4)`) instead of only its family.
 */
const VALUES = tokenValues(import.meta.dirname)

/**
 * The CSS half of the red rules (`docs/rules.md`).
 *
 * Both stages are active. Stage 1: vocabulary CSS may express a colour, space,
 * radius, shadow, type or motion value only through a `--pm-*` token. Stage 2:
 * pattern-scoped token ownership, and the motion containment law over `apps/`.
 *
 * A rule listed here is not necessarily applied: a rule left commented out
 * reports nothing. So `packages/rules/src/repo-laws.test.ts` asks Stylelint
 * which rules govern a given file, and fails if one is missing.
 *
 * @type {import('stylelint').Config}
 */
export default {
  extends: ['stylelint-config-standard'],
  plugins: [...polymorph],
  rules: {
    // CSS Modules vocabulary
    'selector-class-pattern': '^[a-z][a-zA-Z0-9]*$',
    'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['global', 'local'] }],
    'property-no-unknown': [true, { ignoreProperties: ['composes'] }],
    // A `composes` value is a class name, not a CSS keyword. `focusRing` is
    // correct and `focusring` would not resolve. Every focusable part composes
    // the focus-ring module this way.
    'value-keyword-case': ['lower', { ignoreProperties: ['composes'] }],
    'custom-property-pattern': '^pm-[a-z0-9-]+$',
  },
  overrides: [
    {
      // The vocabulary is the only place design decisions may live, and there
      // they must be written as tokens rather than values. The members' recipes
      // are in `packages/recipes`; `packages/react` ships Icon's.
      files: ['packages/{recipes,react-ui,react}/**/*.css'],
      rules: {
        [RULE_NAMES.tokenValuesOnly]: [true, { values: VALUES }],

        // `--radix-*` is allowed here and only here. These are properties the
        // positioning engine measures at runtime (an anchor's width, the space
        // left below it, the origin a panel grows from). They are geometry, not
        // design decisions, and Select's panel cannot apply "min-width: the
        // trigger's width" without one. packages/rules/src/stylelint/values.js
        // explains the same exception in detail.
        'custom-property-pattern': '^(pm|radix)-[a-z0-9-]+$',

        // A `--pm-shell-*` or `--pm-page-*` token may only be declared or read by
        // the pattern that owns it, per packages/rules/scoped-token-owners.json.
        [RULE_NAMES.scopedTokenOwners]: true,

        // Recipes are theme-neutral. A recipe may never select on which house
        // system it is in or which palette it uses: `data-system`,
        // `data-palette`, and the retired `data-theme`. Without this, each
        // system's distinctive details would become hand-authored CSS, and
        // churn, the product's central claim, would fail through many small
        // exceptions. The lawful alternatives are a token value (preferred) or
        // a style query on an exposed axis flag.
        [RULE_NAMES.noThemeSelectors]: true,

        // `data-member` is reserved for exception blocks. Every component root
        // writes it, and only the emitter's exception blocks read it. A recipe
        // selecting it would be a component branching on itself, which is the
        // per-component fork the class tokens replace.
        [RULE_NAMES.noMemberSelectors]: true,

        // Every `--pm-*` a recipe reads must exist, or CSS drops the whole
        // declaration it sits in. `token-references.test.ts` is the stronger
        // half of this law, because it collects the scoped tokens declared
        // across every stylesheet, which no per-file rule can see. This rule is
        // the half that ships to consumers. Both run here, so a missing token
        // is caught in the editor as well as in the suite.
        //
        // Not applied to `apps/` on purpose. The docs harness declares
        // `--pm-sample-*` and `--pm-swatch` from a style prop in TSX and reads
        // them from CSS. That is lawful, but a rule that reads only stylesheets
        // cannot see the declaration. The vocabulary declares every scoped token
        // in the stylesheet that reads it, so nothing is lost here.
        [RULE_NAMES.noGhostTokens]: [true, { tokens: TOKENS }],
      },
    },
    {
      // The application half, including the harness: no motion, no token
      // declared, no selector on the theme's attributes or a member's identity,
      // no root font size. The harness has none of them, and these rules keep
      // it that way.
      files: ['apps/**/*.css'],
      rules: { ...applicationRules },
    },
  ],
  ignoreFiles: [
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    // Deliberately unlawful. `packages/rules/src/fixtures.test.ts` lints them.
    'packages/rules/fixtures/**',
  ],
}
