# fixtures/

Seeded violations. `src/fixtures.test.ts` lints these with the real stage configs
and asserts exactly which rules fire, so the test checks the configuration as well
as the rule logic. A rule that stops working, or a config that stops applying it,
fails this test.

These files are excluded from the repo's own ESLint, Stylelint and TypeScript runs.
They are test data.

The two `vendorable-*` files are linted as if they were at a real component path
(`packages/react-ui/src/controls/Button.tsx`), not at their own path. The
packaging-boundary rule compares a file's location with its import targets, so a
fixture linted without a real path would report nothing.

| File                         | Must go red under                         |
| ---------------------------- | ----------------------------------------- |
| `app-violations.tsx`         | every ESLint rule, both stages            |
| `app-clean.tsx`              | nothing                                   |
| `app-bespoke.tsx`            | nothing (rung 4 suspends the rules)       |
| `app-third-party.tsx`        | nothing (the boundary lifts what it uses) |
| `app-css-violations.css`     | every Stylelint rule for application CSS  |
| `app-css-clean.css`          | nothing                                   |
| `vocabulary-violations.css`  | the vocabulary's rules and the motion law |
| `vocabulary-clean.css`       | nothing                                   |
| `vocabulary-ghost-token.css` | the vocabulary-integrity law, four ways   |
| `vendorable-violations.tsx`  | `vendorable-imports`, every shape of it   |
| `vendorable-clean.tsx`       | nothing                                   |

## Vue single-file components

`vue/` holds the same three application fixtures as Vue components: `app-violations.vue` goes red
under every ESLint application rule, including a `<style>` block for `no-app-css`, `app-clean.vue`
under none, and `app-bespoke.vue` under none because its zone lifts the rules.
`src/rules/vue.test.ts` lints them through `verify` with the Vue parser. `app-declared-exceptions.vue`
is read by the inventory (`src/inventory.test.ts`): a scope of each kind, a bound `patch`, and a
disable inside a `<Bespoke>` zone, and a disable's words inside a string, none of which is
undeclared.

## Svelte components

`svelte/` holds the same three application fixtures as Svelte components: `app-violations.svelte`
goes red under every ESLint application rule, including a `<style>` block for `no-app-css` and a
`transition:fade` directive for `no-external-motion`, `app-clean.svelte` under none, and
`app-bespoke.svelte` under none because its zone lifts the rules. `src/rules/svelte.test.ts` lints
them through `verify` with the Svelte parser. `app-undeclared-deviation.svelte` is read by the
inventory: a disable in its script and one in an HTML comment outside its self-closing `<Bespoke />`
are both undeclared. Prettier reads no `.svelte` file here, so these are formatted by hand.

## Solid TSX

`solid/` holds the same three application fixtures as Solid screens, using `class`, `on:click`,
`lucide-solid` and `solid-motionone`: `app-violations.tsx` goes red under every ESLint application
rule, `app-clean.tsx` under none, and `app-bespoke.tsx` under none because its zone lifts the
rules. `src/rules/solid.test.ts` lints them through `verify` with `framework: 'solid'`.

## Angular components

`angular/` holds the same three application fixtures as Angular components with inline templates,
using `[class.…]`, `(click)`, `lucide-angular` and `@angular/animations`:
`app-violations.component.ts` goes red under every ESLint application rule, including a
`styleUrl` for `no-app-css` and a `@fade` trigger for `no-external-motion`,
`app-clean.component.ts` under none, and `app-bespoke.component.ts` under none because its zone
lifts the rules and its `imports` list `Bespoke`. `src/rules/angular.test.ts` lints them through
`verify` with `framework: 'angular'`, which extracts each inline template.
`app-declared-exceptions.component.ts` is read by the inventory (`src/inventory.test.ts`): a scope
of each kind, a bound `[patch]`, a disable inside a `<pm-bespoke>` zone and one outside it.

## A hosted library

`app-third-party.tsx` and its twin in each framework's directory (`vue/app-third-party.vue`,
`svelte/app-third-party.svelte`, `solid/app-third-party.tsx`,
`angular/app-third-party.component.ts`) host a map inside a `<ThirdParty>` boundary that names
`leaflet`. Each imports a binding from `leaflet`, which is what makes its boundary host the
library. Each goes red under nothing: the boundary lifts the library's stylesheet and the
`style` on what it holds. Each framework's rule test lints its own, and the inventory reads them
for the library and the reason.

## Stylesheets an application imports

`stylesheets/` holds five stylesheets for `no-app-css`, which reads an imported stylesheet to
say what its rules become. `src/rules/no-app-css.test.ts` lints a screen beside them that imports
each one: `spacing.css` (flow, spacing and a colour, every rule a member prop), `keyframes.css`
(an animation, which is a member's motion), `bespoke.css` (placement no member prop carries,
which belongs in a zone), `margin.css` (only a margin, which is the parent's gap) and `wrap.css`
(one rule with no answer on its own, which gets the general one).

## Ghost tokens

`vocabulary-ghost-token.css` is the only row above that is read by a test instead
of linted. No rule fires on it, because `src/token-references.test.ts` checks
something no single file can answer: whether every `--pm-*` a stylesheet reads is
a property some theme emits or some stylesheet declares. Its four seeded failures
are the four ways a name goes wrong: a bare ghost (`var(--pm-accent-border)`, the
case the law was written for), a typo hidden by its fallback, a ghost inside a
fallback, and a misspelled `style()` query. Beside them are lawful reads of both
emitted and declared properties, which must not be reported.

## Spec staleness

`spec-api/` is a small copy of the repo layout, with its own `design/components/`
and its own `packages/react-ui`. It is audited by the same `auditSpecApi()` as the
real tree, so the law can be shown failing without breaking the real tree.

It contains each mismatch the law detects, once each: a shipped prop no spec
declares (`Widget.size`, `Panel.dense`), a specified prop that never shipped
(`Widget.ghost`, `Panel.collapsible`), one of each in both API formats (a markdown
table and a `ts` fence), and a component with no spec at all (`Ghost`), which must
be reported, not skipped. `Widget` is compound: its part `Widget.Item` is read
from its export and specified under a heading with its name, with one mismatch in
each direction, and `Panel.Footer` is a heading for a part `Panel` does not have.

## The exception ladder

- `app-declared-exceptions.tsx`: every rung used correctly. A contextual scope
  (rung 2), a patch (rung 3), a `<Bespoke>` zone with a reason (rung 4), and a
  rule disabled inside that zone, which is what makes the disable lawful.
- `app-undeclared-deviation.tsx`: the failing case, the same disable with no zone
  around it. `pnpm inventory` exits non-zero on this shape, and
  `src/inventory.test.ts` scans both files so the law is tested without breaking
  the repo.
