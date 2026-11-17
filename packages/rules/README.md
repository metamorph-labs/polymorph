# @polymorph/rules

The red rules. A **red rule** is a lint rule that fails CI, and all of polymorph's red rules
live here. The package holds an ESLint plugin, a Stylelint plugin, and supporting tools: the
exception-ladder rung that answers each rule, the inventory of declared exceptions, and a
function that runs the rules on a string of source.

The ESLint rules read every web framework's files: React TSX, Vue single-file components, Svelte
components, Solid TSX and Angular components with their inline or external templates. A rule
never imports a parser. It reads the parser services of the file it is given, so a repository
installs only the parser its framework needs ([docs/rules.md](../../docs/rules.md#the-eslint-rules)).

The rules cover two kinds of code. **Application code** composes the **vocabulary** (the closed
set of polymorph components; one component is a **member**) and binds content. It may not
express a style, rebuild a control, or import a motion, icon or charting library. **The
vocabulary** may express a design value only through a `--pm-*` token, and a component must not
know which theme it is in. The **exception ladder** is the five lawful ways to deviate, from
picking a variant, through a declared `<Bespoke>` zone, to promoting a new member.
[docs/rules.md](../../docs/rules.md) lists every rule, what it forbids and which rung answers it.

## Entry points

| Import | What it is |
| --- | --- |
| `@polymorph/rules` | The ESLint plugin (`plugin`, also the default export) and its rule groups `stageOneRules`, `stageTwoRules`, `allRules`, `vendorableRules`; `fixableRawControls` and `fixableSolidControls`, which switch the `<button>` fix on for a React or a Solid app; `solidSettings` and `angularSettings`, which make a config read its files as Solid or Angular; plus `RULE_CLIMB`, `parser` and `SCOPED_TOKEN_OWNERS` |
| `@polymorph/rules/eslint` | What a consumer's ESLint config imports: the plugin, the rule groups, the fix switches, the framework settings and `parser` |
| `@polymorph/rules/stylelint` | The Stylelint plugins (default export, an array), `RULE_NAMES`, and `applicationRules`: the rules for application stylesheets, switched on (no motion, no `--pm-*` token declared, no selector on the theme's attributes or on `data-member`, no root font size) |
| `@polymorph/rules/stylelint/emitted` | `emittedTokens(root)` — every custom property the theme engine emits, the list `no-ghost-tokens` checks against; `tokenValues(root)` — the values those properties have in the reference pairing, by family, which the rules that name the nearest token take as `values`; and their type, `TokenValues`. Both read `root/design/` and run in this repository (its configs, `verify` and the installer's tests); a root without `design/systems/` is an error that names it |
| `@polymorph/rules/ladder` | `RULE_CLIMB` — the ladder rungs that answer each rule |
| `@polymorph/rules/verify` | `verify`, `verifyCode`, `verifyCss`, which run the rules on source text, and `fix`, `fixCode`, `fixCss`, which apply the rules' fixes until none is left (`fixCss` only reports, because no CSS rule has a fix). The MCP server's `validate` and `fix` tools and `polymorph check` call these |
| `@polymorph/rules/inventory` | The scanner behind `pnpm inventory` |
| `@polymorph/rules/containment` | The only paths a borrowed dependency may be imported from: the icon map (and its test), the motion internals, the chart engine |
| `@polymorph/rules/spec-api` | The spec-staleness audit: every shipped prop against the specs in `design/components/` and `design/archetypes/` |
| `@polymorph/rules/scoped-token-owners.json` | Which files own each pattern-scoped token namespace (`--pm-shell-`, `--pm-page-`, `--pm-chart-height-`) |

The application rules come in two stages, split by what each needs before it can apply. Stage 1
(`no-raw-styles`, `no-app-css`) applies from the first line of application code. Stage 2 needs
the vocabulary and the exception ladder in place, because forbidding `<button>` only makes sense
once `<Button>` exists. `allRules` is both stages. `vendorableRules` applies to the vocabulary's
own source instead, so that a component copied into another repository imports only what it can
take with it.

`no-raw-styles`, `no-raw-interactive` and `no-external-icons` have a fix, for the violations with
exactly one lawful rewrite ([docs/rules.md](../../docs/rules.md#what-the-rules-fix)).
`src/rules/fix.ts` states the criterion and holds the code the fixers share.

Every other report names its answer ([docs/rules.md](../../docs/rules.md#what-the-rules-say)). A
raw colour, length or duration is answered with the token nearest it by value, which needs the
theme's values. `no-raw-styles`, `no-app-css` and `token-values-only` take them as a `values`
option: a `TokenValues`, six families (`color`, `space`, `radius`, `text`, `size`, `duration`),
each a map from a `--pm-*` property to its value in a pairing's default mode, density and motion
temperament. The rules never import the engine, so the config passes them in. In this repository
`eslint.config.ts` and `stylelint.config.js` build them once at load with `tokenValues(root)`,
from the reference pairing: the alphabetically first system in `design/systems/` with its own
default palette. `tokenValues` reads this repository's `design/`, so a consumer does not call it:
`polymorph add` writes the values into the config fragments it generates, read from the
consumer's compiled theme (`packages/cli/src/emit.ts`). Without the option, a report names the
token family instead of the step.

Another repository installs this package on its own, published as
`@metamorph-labs/polymorph-rules` and aliased to `@polymorph/rules`. Its configs import
`@polymorph/rules/eslint` and `@polymorph/rules/stylelint`, which is what `polymorph add` writes.
Every peer is optional: `eslint`, `stylelint`, the Vue parser (`vue-eslint-parser`), the Svelte
parser (`svelte-eslint-parser`), the Angular template parser and processor
(`@angular-eslint/template-parser`, `@angular-eslint/eslint-plugin-template`) and
`@polymorph/engine`. Only `@polymorph/rules/stylelint/emitted` and
`@polymorph/rules/verify` import it, so a repository that uses neither does not need it installed.
Both read this repository's `design/` and are not part of a consumer's setup.
The rules are not part of the engine or any framework's foundation, so an application's runtime
packages never carry a linter. [docs/consuming.md](../../docs/consuming.md) shows both setups.

`pnpm --filter @polymorph/rules build` writes the published build to `dist/`: one module per
source file, an entry per subpath in `publishConfig.exports`, and declarations under
`dist/types/`. `packaging.test.ts` builds it and checks every published entry exists, imports in
node and typechecks under a strict consumer.

## Commands

- `pnpm lint` runs ESLint, Stylelint and Prettier over the repository (`scripts/lint.mjs`).
  `eslint.config.ts` and `stylelint.config.js` load their rules from this package. `pnpm lint:js`
  and `pnpm lint:css` run one tool each.
- `pnpm inventory` (`bin/inventory.js`, run in place and not published) prints every declared
  exception in `apps/` (`DensityScope`/`ToneScope` for rung 2, `patch` for rung 3, `<Bespoke>`
  and `<ThirdParty>` for rung 4) and writes the same list to `exceptions.json`. It exits non-zero
  on an undeclared exception: an `eslint-disable` of one of these rules that is not inside a
  `<Bespoke>`, or a `<ThirdParty>` that writes no `library` out. A consumer that wants the same
  report calls `collectExceptions` from `@polymorph/rules/inventory` with its own globs.

## Tests

Everything runs in the `logic` vitest project, in node:

```sh
pnpm exec vitest run packages/rules
```

- `src/rules/*.test.ts`: each ESLint rule under `RuleTester`, including the exact output of
  each fix and the cases a fix must leave alone. `vue.test.ts`, `svelte.test.ts`, `solid.test.ts`
  and `angular.test.ts` run the rules over each framework's files and its seeded fixtures.
- `src/rules/messages.test.ts`: every report, in each framework, carries its answer and fits in
  200 characters.
- `src/rules/fix-api.test.ts`: checks the props the fixes write (`Button`'s, `Icon`'s) against
  those members' specs in `design/components/`.
- `src/fix.test.ts`: `fix` end to end. The passes converge, an import two fixes need is added
  once, and the remaining reports match what linting the output reports.
- `src/fixtures.test.ts`: the seeded files in [`fixtures/`](fixtures/README.md) fail under the
  real stage configs and their lawful versions pass. Every rule names its rungs.
- `src/repo-laws.test.ts`: asks ESLint and Stylelint which rules apply to sample files, so a
  rule that is written but not configured fails. It also checks laws no linter can see, such as
  "`apps/` contains no stylesheets".
- `src/token-references.test.ts`, `src/spec-api.test.ts`, `src/localization.test.ts`,
  `src/client-directive.test.ts`: repository-wide laws. Every token a stylesheet reads exists,
  every shipped prop is in a spec, no member hard-codes a sentence its host cannot replace, and
  `'use client'` is on exactly the modules that need it.
- `src/inventory.test.ts`: the inventory, including the fixture that must fail it.
- `src/plan-references.test.ts`: no code, test or doc in the repository cites a plan or ticket
  identifier.
- `packaging.test.ts`: runs the published build and checks it the way a consumer's toolchain
  reads it.

## Read more

- [docs/rules.md](../../docs/rules.md): the rules, the exception ladder, the inventory
- [docs/tooling.md](../../docs/tooling.md): the registry and MCP server, which publish and run
  these rules
- [docs/consuming.md](../../docs/consuming.md): configuring the rules in another repository
