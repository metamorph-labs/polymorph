# @polymorph/recipes

The **recipes**: every member's styling as a CSS Module written only in `--pm-*` tokens, and the
base layer. A recipe contains no framework code. Every web vocabulary imports these files: React's
([`@polymorph/react-ui`](../react-ui/README.md)) and the Vue, Svelte, Solid and Angular ones
(`@polymorph/vue-ui`, `@polymorph/svelte-ui`, `@polymorph/solid-ui`, `@polymorph/angular-ui`), so
each framework's member renders the same class names from the same file. The SwiftUI and Compose
members use no CSS: they read the same decisions from the emitted token packages. What a recipe
is, and why it holds design decisions, is in [`docs/concepts.md`](../../docs/concepts.md).

## Layout

| Path | What it is |
| --- | --- |
| `src/<tier>/<file>.module.css` | One member's recipe, in its tier's directory. The path is the member's path in `packages/react-ui/src`: Button is `src/controls/Button.tsx` there and `src/controls/button.module.css` here. |
| `src/conventions/*.module.css` | The modules recipes `composes:` from: the focus ring (`focus.module.css`), state and press feedback (`motion.module.css`) and the accessibility helpers (`a11y.module.css`), with the gallery frame and page transitions. |
| `src/base.css` | The base layer: the reset and the border-box baseline, which bind the page to the theme. It is a plain stylesheet, not a module. |

## Imports

| Import | File |
| --- | --- |
| `@polymorph/recipes/<tier>/<file>.module.css` | `src/<tier>/<file>.module.css` |
| `@polymorph/recipes/base.css` | `src/base.css` |

The `exports` map names nothing else.

## No build

The package ships its source. A CSS Module must be compiled before a browser can use it: the
application's bundler (Vite, webpack, Next.js and most others do this by default) turns each
`*.module.css` into a stylesheet with hashed class names and a JavaScript object that maps each
authored name to its hashed one. That is the step a framework's members rely on.

An application that installs `@polymorph/react-ui`, `@polymorph/vue-ui`, `@polymorph/solid-ui` or
`@polymorph/angular-ui` does not compile these files itself. Each of those builds contains the
compiled recipes, and each member's module imports its own stylesheet. `@polymorph/svelte-ui`
ships its members as source and depends on this package, so the application's bundler compiles
each recipe beside the Svelte member that imports it. An application that vendors members with
`polymorph add` does not install this package either: the CLI copies each recipe beside its
member and rewrites the import to the relative path (`./button.module.css`). See
[`docs/consuming.md`](../../docs/consuming.md).

`sideEffects` declares every `.css` file, so a bundler keeps a stylesheet that is imported only
for its effect, such as `base.css`.

## The rules

The member-CSS rules in `stylelint.config.js` apply to every file here: a value is a token
(`token-values-only`), every token read exists (`no-ghost-tokens`), a pattern-scoped token is read
only by its owner (`scoped-token-owners`), and no recipe selects on the house system, the palette
or `data-member`. `packages/rules/src/token-references.test.ts` checks every `var(--pm-*)` against
the emitted tokens. The laws that read a recipe as text (`selectors.test.ts`,
`reduced-motion.test.ts`) run in the React vocabulary's suite.
