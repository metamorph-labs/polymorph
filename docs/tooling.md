# Tooling

This page covers the tools around the component library: the generated registry and system card,
the CLI that vendors components into another repository, the MCP server that answers agents, the
screen spec format and its emitter, the workbench app and the docs site.

A few terms used throughout:

- The **vocabulary** is the closed set of components polymorph ships; a **member** is one
  component in it. Members are grouped into **tiers**: `structure`, `controls`, `overlays`,
  `layout`, `charts`, `ai` (the conversation), `archetypes` (whole-page layouts), plus `Icon`.
- A **system** decides how a product is built (eight design axes, three font slots, defaults). A
  **palette** decides its colours. A **pairing** is one of each, set on `<html>` as `data-system`
  and `data-palette`. [theming.md](theming.md) covers them.
- A **red rule** is a lint rule (ESLint or Stylelint) that fails the gate. A **law** is a test that
  enforces a design claim. The **exception ladder** is the five lawful ways to deviate from the
  vocabulary. [rules.md](rules.md) covers all three.
- A **states fixture** is a member's `*.states.tsx` (`*.states.ts` in Vue and Angular,
  `*.states.svelte` in Svelte): every state it can be in. The completeness law renders it in each
  framework, and the workbench galleries render React's.

## At a glance

| Command | What it does | Code |
| --- | --- | --- |
| `pnpm registry` | Builds `registry/registry.json`, its JSON Schema and the system card | `packages/registry/bin/registry.js` |
| `pnpm polymorph <command>` | The CLI: `init`, `add`, `diff`, `update`, `theme`, `check`, and a verb for each MCP tool (`card`, `search`, `component`, `axes`, `plan`, `validate`, `fix`, `emit`, `render`, `theme propose`) and `mcp`, the server | `packages/cli` |
| `pnpm mcp` | The MCP server, over stdio | `packages/mcp` |
| `pnpm emit <spec.json> [out.tsx \| out.vue \| out.svelte \| out.ts \| out.swift \| out.kt]` | Validates a screen spec and emits TSX (Solid's with `--framework solid`), a Vue or Svelte single-file component, an Angular standalone component, SwiftUI for a spec for `ios`, or Jetpack Compose for a spec for `android` | `packages/spec` |
| `pnpm emit:theme <system> <palette> [out.css]` | Emits one pairing's stylesheet, for inspection | `scripts/emit-theme.mjs` |
| `pnpm dev` | The workbench: studio, composer, components, pages, mood board, Relay | `apps/workbench` |
| `pnpm dev:docs` | The docs site | `apps/docs` |
| `pnpm site` | Builds the docs site and writes every page as static HTML, for a static host | `scripts/site.mjs` |
| `pnpm new:member <Name>` | Scaffolds a new member and wires it in | `packages/react-ui/bin/new-member.mjs` |
| `pnpm inventory` | Lists every declared exception; fails on an undeclared one | `packages/rules/bin/inventory.js` |

## One registry, thin fronts

The **registry** is the one machine-readable description of the system: every member, its props,
its files, the theme catalogue, the red rules and the exception ladder. It is generated from
source, so it cannot disagree with the code.

The tools on this page get the vocabulary from the registry and nowhere else. The CLI, the MCP
server, the spec validator, the docs site and the workbench's component browser and composer only
reformat what the registry says. None of them derives a fact about a member itself, because that
would create a second source of truth. `thin-front.test.ts` in `packages/cli/src/` and
`packages/mcp/src/` enforces this: neither package may read `design/`, open the vocabulary's
source, or load the TypeScript compiler.

## The registry and the system card

### Generating it

```sh
pnpm registry
```

`packages/registry/bin/registry.js` builds the registry from the working tree and validates it
against its own schema. If the document fails the schema, the script exits non-zero and writes
nothing. Otherwise it writes:

| File | Contents |
| --- | --- |
| `registry/registry.json` | The catalogue, schema id `polymorph-registry/1` |
| `registry/registry.schema.json` | The JSON Schema (draft 2020-12) of that document |
| `registry/system-card.md` | The system card — the vocabulary compressed for an agent's context window |
| `apps/docs/src/fonts.gen.ts`, `apps/workbench/src/fonts.gen.ts` | Each app's font-loader map, derived from the systems' font slots |
| `packages/screen/src/vocabulary.gen.ts` | The run-time core's vocabulary table: what the spec validator and the run-time card read of the registry, in a compact form ([run-time-screens.md](run-time-screens.md)) |

All of it is **generated and gitignored**. Nothing in `registry/` is committed, so there is no
copy in git that can go out of date and no freshness test is needed. The vocabulary table ships
inside `@polymorph/screen`'s build, so `packages/screen/src/parity.test.ts` holds the file on disk
to what the registry builds from the tree, and fails before a stale table is published. It is all
regenerated:

- by the root `prepare` script, on every `pnpm install`;
- by each app's `predev` and `prebuild` hooks, so `pnpm dev`, `pnpm dev:docs` and `pnpm build`
  always see the current tree;
- by hand, with `pnpm registry`, after you change a member, a system, a palette or a rule.

The build is deterministic: no timestamps, no absolute paths, every list in source order or
sorted. `packages/registry/src/registry.test.ts` builds it twice and compares the bytes.

If a system names a font package an app has not installed, the font-loader step fails and prints
the `pnpm add <package> --filter <app>` command that fixes it.

### Where its facts come from

| Registry field | Read from |
| --- | --- |
| `components` | The member list in `packages/react-ui/src/galleries.ts`; props and lawful cells from the exported TypeScript types; states from each states fixture; file and package closures from the import graph; `tokens` and `dataAttributes` from each stylesheet; `purpose` from the doc comment; `spec` and `anatomy` from `design/components/*.md` and `design/archetypes/*.md` |
| `platforms`, and each member's `platforms` | `design/platforms/*.json`, checked by the platform law before anything is built |
| `frameworks`, and each member's `frameworks` | `design/frameworks/*.json`, checked before anything is built; a native member's `shell` from that framework's tree (`packages/<framework>-ui/src/`) |
| `packages` | The `dependencies` of `packages/react-ui`, `packages/react` and `apps/workbench`; a `workspace:` range becomes a caret on the package's own version |
| `vendor.frameworks.<framework>.packages` | The `dependencies` of that framework's foundation and vocabulary only (`packages/<framework>`, `packages/<framework>-ui`), read the same way |
| `theme` | `design/systems/*.json` and `design/palettes/*.json`, resolved through `@polymorph/theme` |
| `exceptions.ladder` | The numbered rungs in [rules.md](rules.md) |
| `exceptions.primitives` | `Bespoke`, `DensityScope`, `ToneScope`: the components that implement the ladder |
| `laws` | The rule sets in `@polymorph/rules`, each with the ladder rungs that answer it |
| `icons` | `design/icons.json` — role names (meanings), never glyphs |
| `version` | `@polymorph/react`'s version |

### What the registry contains

The full shape is `packages/registry/src/schema.ts`, published as `registry.schema.json`. In
outline:

- **`platforms`** — the platforms the vocabulary is mapped to: `web`, `ios`, `android`.
- **`frameworks`** — the web frameworks the vocabulary ships in: `react`, `vue`, `svelte`,
  `solid`, `angular`, `elements` ([frameworks.md](frameworks.md)).
- **`components`** — one entry per member: `name`, `tier`, `origin` (`installed` ships in
  `@polymorph/react`, `vendored` is copied into a consumer's repository), `platforms` (the
  member's entry on each platform: `status` is `native`, `adapted` with `as`, or `absent` with
  `reason` and `substitute`; see [concepts.md](concepts.md#platforms)), `frameworks` (whether each
  web framework's vocabulary ships it: `native`, or `absent` with `reason`; React is always
  native, and a member native in any other has a `shell` there, what an install of it copies,
  which for an element is nothing), `purpose`, `spec`, `anatomy`, `files` (source, stylesheet, states fixture), `props`
  (name, printed type, optional, doc), `parts` (every compound part its export carries, such as
  `Table.Row`, with the part's props), `exports` (its other callable exports, declared in the files
  named for it: Toast's `toast`, `ToastHost`, `ToastNotice` and `ToastViewportTarget`), `grid` (the
  lawful variant × tone cells, when the member has one), `states`, `requiredSelectors`, `tokens` (every `--pm-*` property its own stylesheet reads),
  `dataAttributes`, `behaviour` (the statements of its spec's `contract` fence, which the
  conformance law runs; [conformance.md](conformance.md)), `agent` (the statements of its spec's
  `agent` fence: the states an agent on a running page reads, the actions it may run and which
  need a person, or `null` for a member agents cannot see; [agents.md](agents.md)), and
  `dependencies` (other members, external packages, and every file that must be installed with
  it).
- **`dataTypes`** — every named data type the members' props take (an option, a column, a stat, a
  menu entry), their parts' and the exception primitives' included, read through the TypeScript
  checker and sorted by name: its type parameters, its fields typed as a prop's type is printed,
  or the named types it is a union of. A reader with no compiler, such as a model writing a
  run-time screen, writes one from its fields.
- **`vendor`** — the source root install paths are rebased from, the package members import their
  recipes from and its source tree (`recipes`), the support file every install needs
  (`css-modules.d.ts`), the base layer (`@polymorph/recipes/base.css`), and for each framework but
  React (`frameworks.vue`, `frameworks.svelte`, `frameworks.solid`, `frameworks.angular`) the same
  root and support file and `packages`: the range an install in that framework writes its
  foundation, its vocabulary and each package its members import at. Those ranges are read from
  the framework's foundation and vocabulary manifests only, because the frameworks can range one
  package differently. The Solid foundation pins `@zag-js/core` exactly, so a Solid install pins
  every Zag machine to that version, and the other frameworks take a caret range.
- **`packages`** — the version range of every other installable package, the one it was built
  against: the installed packages, what React's vendored members and the ladder's primitives
  import, and the systems' webfonts, read from the React manifests and the workbench. Two
  manifests that declare one package at different ranges stop the build.
- **`icons`** — icon sizes and the closed set of icon roles.
- **`theme`** — the axes and their values, colour roles, token scales, standard-density
  magnitudes, every `--pm-*` custom property a theme emits, the systems, the palettes, and the
  pre-paint script. Each system carries `tokenValues`, what its colour, space, radius, type-size,
  size and duration tokens are worth with its default palette, as its sheet declares them before
  any scope attribute applies: the `values` the red rules name the nearest token with, which
  `init` writes into the lint fragments. `renamed` maps each system and palette the catalogue
  shipped under another name to the name it has now (`shadcn` is `plain`), read from `RENAMED` in
  `packages/registry/src/theme.ts`, so `update` moves an install recorded under the old name.
- **`exceptions`** — the ladder's rungs and the primitives that implement them, with their props,
  platform entries and file closures.
- **`laws`** — every red rule: whether it governs application code or the vocabulary, whether it
  runs under ESLint or Stylelint, a one-line summary, and the ladder rungs to climb.

The package also exports, as subpaths: `@polymorph/registry/search` (the ranking both the MCP
server and the workbench's Components page search with, browser-safe), `@polymorph/registry/shape`
(the small schema language the registry and the spec format are written in; it validates
documents and prints JSON Schema), `@polymorph/registry/platforms` (the platform names, the
platform file's shape and its law, browser-safe), `@polymorph/registry/frameworks` (the framework
names, the framework file's shape and its law, and `vueBinding`, the React-to-Vue reading of a
prop, which the Vue, Svelte and Angular screen emitters and the shell generator read;
browser-safe), `@polymorph/registry/behaviour` (the grammar of a spec's `contract` fence,
browser-safe), `@polymorph/registry/agent` (the grammar of a spec's `agent` fence and the faults
`pnpm registry` reports, browser-safe), `@polymorph/registry/exceptions` (the check that a system's per-member
exception names a member that actually reads that token), `@polymorph/registry/screen-table` (the
compact vocabulary table `pnpm registry` writes for the run-time core, and its expansion,
browser-safe), and `@polymorph/registry/runtime-card` (the members section of the run-time card,
rendered from that table, browser-safe). `@polymorph/screen` inlines the last two in its build
([run-time-screens.md](run-time-screens.md)).

### The system card

`registry/system-card.md` describes the whole vocabulary in a form that fits an agent's context
window. The registry is the full catalogue. The card is a summary, and its omissions are
deliberate: it gives prop names without their types, has no file paths, and states the conventions
every member shares once.

Its sections:

- **The rules that will stop you** — every red rule, one line each, and the component contract
  in the card's framework (in React no `className`, `style` or `css` props and the client
  directive rule; in Vue, Svelte, Solid, Angular and elements no `class` or `style` on a member;
  state surfaces as `data-*` attributes in each).
- **When the vocabulary has no word for it** — the exception ladder.
- **The vocabulary** — every member by tier: its purpose, its props (`*` marks required), its
  lawful variant × tone cells, and on the web card an `agent:` segment for a member with an agent
  fence, which names the actions an agent may run and, after `|`, the states it reads
  (`agent: check, uncheck | checked, disabled`; [agents.md](agents.md)).
- **Platforms** — one line per platform: how many members are native, adapted and absent there,
  and each absent member with its substitute.
- **Icon roles** — the closed set of meanings.
- **Theme** — the axes, every system with its axis values and default palette, every palette.
- **Token families** — colour roles, scales (with the space ladder's pixel values), control
  heights, and the literals component CSS may still write.

`renderSystemCard(registry, { platform })` renders the card for one platform (the default is
`web`): the vocabulary section leaves out the members absent there, and each adapted member says
how it renders. `registry/system-card.md` is the web card for React. `{ framework: 'vue' }`
renders it for a Vue app: the paragraph on what a consumer installs names the Vue packages and how
a prop reads in Vue, the component contract and the line on adding a member are written in Vue's
terms, and the members with no Vue shell are left out. `{ framework: 'svelte' }`,
`{ framework: 'solid' }` and `{ framework: 'angular' }` do the same for Svelte, Solid and Angular,
and `{ framework: 'elements' }` for a page: it names the files `polymorph init` copies and the
elements' reading of a prop (a kebab attribute, a JSON attribute, `slot="…"`, a `poly-` event, a
property set from script), and says that the red rules do not read HTML.
The paragraph replaces text rather than adding it, so such a card is never longer than the React
one ([frameworks.md](frameworks.md)).

`packages/registry/src/card.test.ts` keeps the card under a character budget (reported in tokens
at four characters per token), for every platform, and above a floor. The budget stops the card
from outgrowing a context window unnoticed, and the floor stops a section from being dropped
unnoticed. Raising the budget is allowed, with the reason recorded in that file.

**How an agent uses it.** Read the card before building a screen or adding a member:

1. Make sure it is current by running `pnpm registry` or any `pnpm install`. The docs site
   serves the same card at `/system-card.md`, with `/llms.txt` (the contract in one page) and
   `/llms-full.txt` (the card followed by the rules) for an agent that only has a URL.
2. Read `registry/system-card.md` (or call the MCP tool `get_system_card`, with `platform` when
   the screen is for iOS or Android, and `framework` when the app is in Vue, Svelte, Solid or
   Angular, or is a page that uses the elements). Compose only from the members, props, cells and icon roles it lists.
3. For a prop's exact type, a member's files or its dependency closure, look it up in
   `registry/registry.json` or call `get_component`.
4. When nothing on the card fits, climb the exception ladder. Do not invent a component or write
   a style.
5. Check the result: the MCP tool `validate` for code or a screen spec, `pnpm emit` for a spec,
   and the repository's own lint run. `eslint --fix`, or the MCP tools `fix` and `fix_file`,
   rewrite the violations that have exactly one lawful answer. The violations that remain need a
   decision.

A test checks that the card supports this use. `packages/spec/agent-loop.test.ts` checks that a
screen written from the card alone names only members and icon roles the card mentions (see
[The agent loop](#the-agent-loop)).

## The CLI

`packages/cli` — bin `polymorph`; in this repository, `pnpm polymorph`.

The CLI creates a new app that installs the packages (`init`), and copies chosen members (and
themes) from this repository into another one, setting up the red rules there too (`add`). It
also runs the red rules over another repository's directory with no lint config (`check`).
Components are copied as source that the consumer owns and may edit. The rules that govern how
application code uses them are installed with them. Vendoring is one of two ways to consume
polymorph. The other is installing the packages, which `init` sets up.
[consuming.md](consuming.md) compares them.

Every tool of the [MCP server](#the-mcp-server) is also a verb: `card`, `search`, `component`,
`axes` and `plan` look things up, `validate` and `render` check code and screens, `fix` and `emit`
write, and `theme propose` proposes a theme and saves it. Each verb is the MCP tool of the same
job and returns the same answer, so a harness with a shell and no MCP client, or a skill that runs
a command, can do all an agent with the server can. `mcp` starts the server itself.
[The verbs that ask the MCP tools](#the-verbs-that-ask-the-mcp-tools) covers them.

The CLI writes apps and vendors members for the web frameworks (`--framework`, below). The SwiftUI
and Compose renderers are not npm packages. An app reaches them through a checkout or a git
submodule of this repository, and [native.md](native.md) describes them.

### Running it

The CLI has two roots. It reads the vocabulary from the checkout that holds the bin, and it
installs into the **current directory**.

- **Into another repository** — run the bin from that repository's root, pointing at a checkout
  of this one:

  ```sh
  node ../polymorph/packages/cli/bin/polymorph.js add button dialog theme:pastel
  ```

- **In this repository** — `pnpm polymorph <command>` runs from this repository's root. `add`
  and `update` refuse to write into a checkout of polymorph (this one, or another clone or
  worktree, recognised by the base layer at the path the registry copies it from) or into a
  directory inside one, as `init` and the MCP tool `install` do. Use it here for `help`, the
  verbs that look up and check (`card`, `search`, `component`, `axes`, `plan`, `validate`,
  `render`), `add --dry-run` and `theme`.

```text
Start
  polymorph init <dir>                Write a new app: packages, theme, rules, agent tools and a first screen.

Look up
  polymorph card                      Print the system card: every member, the tokens, the red rules and the ladder.
  polymorph search [query]            Find members by name, purpose, prop or variant; with no query, list them all.
  polymorph component <name>          Print one member: its props, its lawful cells, its states and what it depends on.
  polymorph axes                      Print the theme axes, the systems and palettes, the colour roles and the scales.
  polymorph plan <item...>            Print what `add` would copy and install, and write nothing.

Check
  polymorph validate <file...|->      Check code against the red rules, or a screen spec against the vocabulary.
  polymorph check [dir]               Run the red rules over a directory, with no lint config.
  polymorph render <spec.json>        Draw a screen spec in a browser, and report its layout faults beside the pictures.
  polymorph diff                      List what you have changed in an install, and what has changed upstream.

Write
  polymorph add <item...>             Vendor members and themes, and extend the lint configs with the red rules.
  polymorph update                    Vendor again the files you have not edited, and keep the ones you have.
  polymorph fix <file|->              Rewrite what has exactly one lawful rewrite in a file, and report the rest.
  polymorph emit <spec.json> <out>    Compile a screen spec to a file in the project, checked against the red rules.

Themes
  polymorph theme propose "<intent>"  Turn plain words into a checked system and palette, and save them with `--save`.
  polymorph theme validate <system.json> <palette.json> [partner.json]
  polymorph theme emit <system.json> <palette.json> [partner.json]
  polymorph theme schema <system|palette>

Agents
  polymorph mcp                       Start the MCP server over stdio, for an agent’s client.
```

This is the list `polymorph help` prints, from the verb list `@polymorph/cli` exports (`VERBS`,
`packages/cli/src/verbs.ts`): each verb's name, group, summary, usage, flags and the MCP tools of
the same job. `polymorph <verb> --help` prints one verb's usage and flags.

| Flag | Applies to | Effect |
| --- | --- | --- |
| `--dir <path>` | `add`, `plan` | Where vendored source lands. Default `src/polymorph`. Must stay inside the repository. |
| `--dir <path>` | `theme propose --save` | The directory holding `systems/` and `palettes/`. Default `design`. |
| `--out <path>` | `theme emit`, `theme schema` | Write to a file instead of stdout |
| `--out <dir>` | `render` | Where the pictures are written. Default `<spec>.render/` beside the spec |
| `--system <name>` | `init` | The catalogue system the app wears. Default `plain`; an unknown name lists the catalogue |
| `--system <name>` | `render` | The shipped system the screen is drawn in. Required |
| `--palette <name>`, `--mode <mode>` | `render` | A shipped palette, and `light` or `dark`. Default the system's own |
| `--data <file>`, `--empty <file>` | `render` | A JSON file of input values: the populated screen, and a second drawing laid over it |
| `--viewports <list>` | `render` | `phone`, `desktop` or `phone,desktop`. Default both |
| `--framework <name>` | `init`, `add`, `check` | `react` (default), `vue`, `svelte`, `solid` or `angular`: an app in that framework, or that vocabulary's components ([frameworks.md](frameworks.md)). Once an install has a manifest, `add` plans in the framework it records and refuses a different one. `check` reads every file in it instead of inferring each file's |
| `--framework <name>` | `card`, `search`, `plan`, `validate`, `fix`, `emit` | The tool's `framework` argument |
| `--framework <name>` | `component` | Narrows the reading's frameworks to one. The JSON answer lists every framework |
| `--platform <name>` | `card`, `search` | `web` (default), `ios` or `android` |
| `--tier`, `--origin`, `--limit` | `search` | The tool's filters |
| `--source` | `component` | Adds the member's source, stylesheet and states fixture |
| `--properties`, `--values` | `axes` | Add every `--pm-*` property, and each system's token values |
| `--filename <name>` | `validate -`, `fix -` | The name the text read from stdin is checked as |
| `--surface <name>` | `validate`, `fix` | `application` (default) or `vocabulary` |
| `--based-on <system>/<palette>` | `theme propose` | Where the proposal starts; either half may be left out |
| `--save`, `--overwrite` | `theme propose` | Save the proposal; replace files already saved under its names |
| `--project <path>`, `--read-only` | `mcp` | As for `polymorph-mcp`: the project the write tools write into, or none |
| `--json` | `check` and every verb that asks a tool | Print the report, or the tool's answer, as JSON |
| `--no-install` | `init` | Write the app and do not run `pnpm install` |
| `--force` | `add`, `update` | Overwrite files you have edited |
| `--dry-run` | `add`, `init` | Print the plan and write nothing |
| `--dry-run` | `fix` | Print the fixed code and write nothing |

### `init`

```sh
node ../polymorph/packages/cli/bin/polymorph.js init my-app [--system pastel] [--no-install]
```

`init` writes a new Vite React app that installs `@polymorph/engine`, `@polymorph/react` and
`@polymorph/react-ui` as npm aliases of their published names and `@polymorph/rules` as a dev
dependency, at the registry's ranges. The directory must be new or empty (a lone `.git` is
allowed) and outside any checkout of polymorph. In order, it writes `package.json`, an `.npmrc`
that names `NODE_AUTH_TOKEN` and holds no token, the Vite app with the theme plugin, the system
and palette JSON under `src/theme/` (copied from the files the registry names), the two lint
fragments and the configs that spread them, an `.mcp.json` that runs this checkout's MCP server
against the app, the system card under `polymorph/`, an `AGENTS.md` (and a `CLAUDE.md` that
includes it), and a first screen: `src/screens/welcome.json`, the `Welcome.tsx` the screen
emitter writes from it, and the `App.tsx` container that renders it. The emitter runs as a
separate process in the new app, so the spec is validated against the registry and the output is
formatted with the app's Prettier settings. [consuming.md](consuming.md#one-command) lists each
file.

The ESLint fragment is not the one `add` writes. It spreads `fixableRawControls` after the rules,
because the app imports every member from `@polymorph/react-ui`, so `eslint --fix` rewrites a
text-only `<button>` as `Button` and imports it from there. It has no block for a vendored tree,
because the app has none.

`.mcp.json` names the MCP server by its absolute path in the checkout that ran `init`, because the
server runs from that checkout. The path is machine-specific. A team changes it on each machine or
adds `.mcp.json` to `.gitignore`, and the written `AGENTS.md` says so.

Last, it runs `pnpm install --ignore-workspace` in the app. Without the flag, a
`pnpm-workspace.yaml` in a directory above the app makes pnpm install that workspace instead. The
token is `NODE_AUTH_TOKEN` from the environment, or `gh auth token` when that is unset, and it is
passed in pnpm's environment only. When `init` uses the GitHub CLI's token, it prints one line
saying so, and that a token with only `read:packages` in `NODE_AUTH_TOKEN` is the recommended way.
pnpm's output is captured, printed with the token masked, and read to tell the failures apart. In
each case below `init` keeps the app it wrote and exits 1:

- **No token, or a token the registry refuses** (401 or 403). It prints
  `gh auth refresh -s read:packages` and the install command.
- **No release at the app's ranges** (a 404, or no matching version, for a package in the
  published scope). The ranges are the checkout's own versions, so a checkout ahead of the last
  release asks for versions that are not published. `init` names the four packages with their
  ranges, says that, and points at the release steps in CONTRIBUTING.md.
- **pnpm is not on the `PATH`.** It says so and prints the install command to run once pnpm is
  installed.
- **Anything else.** pnpm's output is above, and `init` prints the install command to retry.

`packages/cli/init.test.ts` runs the bin with `--no-install`, installs the four packages from their
builds, and checks that the app typechecks, builds and lints clean, and that `eslint --fix`
rewrites a raw `<button>` as `Button` imported from `@polymorph/react-ui`.
`packages/cli/src/vue.test.ts`, `frameworks.test.ts` (Svelte and Solid) and `angular.test.ts` plan
the app in each other framework and check that its container and welcome screen compile and lint
clean under its ESLint fragment.

`planInit` (the files, as data), `writeInit` and `installApp` are exported separately, so another
front can create the same app from a registry and a source tree.

`--framework vue` writes the same app in Vue: `@polymorph/vue` and `@polymorph/vue-ui` in place of
the React packages, `@vitejs/plugin-vue` and a `vue-tsc` typecheck, the ESLint fragment that parses
`.vue` files, a welcome screen that writes its title and status line as `Heading` and `Text` where
the React app has `PageHeader`, emitted as `Welcome.vue`, and an `App.vue` container. `init` checks
that every member the welcome screen names is native in the app's framework before it writes
anything, and stops with each absent member's reason.
[frameworks.md](frameworks.md#a-vue-app-polymorph-init---framework-vue) lists the files.

`--framework svelte` and `--framework solid` write the same app in Svelte 5 and in Solid
(`packages/cli/src/init-svelte.ts` and `init-solid.ts`, in the shape `init-app.ts` declares): each
framework's foundation and vocabulary, its Vite plugin (`@sveltejs/vite-plugin-svelte`,
`vite-plugin-solid`), its typecheck (`svelte-check`, `tsc` with Solid's JSX types), its ESLint
fragment, the same welcome spec emitted as `Welcome.svelte` or Solid's `Welcome.tsx`, and an
`App.svelte` or `App.tsx` container.
[frameworks.md](frameworks.md#svelte-and-solid-apps-polymorph-init---framework-sveltesolid) lists
the files.

`--framework angular` writes the same app in Angular 22 (`packages/cli/src/init-angular.ts`):
Angular and the Angular foundation and vocabulary, Analog's Vite plugin
(`@analogjs/vite-plugin-angular`, compiling ahead of time), TypeScript 6.0, which Angular's
compiler requires, an `ngc` typecheck with `strictTemplates`, and an ESLint fragment that extracts
each component's inline template and reads it with Angular's template parser. The entry imports the
theme and the vocabulary's base stylesheet and bootstraps the container without zone.js. The same
welcome spec is emitted as the standalone component `src/screens/welcome.ts`, and `src/app.ts` is
the container. [frameworks.md](frameworks.md#an-angular-app-polymorph-init---framework-angular)
lists the files.

`--framework elements` writes a page with no build (`packages/cli/src/elements.ts`). It copies the
files a page loads the elements from (`polymorph.js`, its chunks, `polymorph-all.js`,
`polymorph.css`, `prepaint.js`, `themes/`) from the directory the registry names
(`vendor.frameworks.elements.noBuild`) into the app's static directory (`public/polymorph/`, or
`--dir`), compiles `theme.css` there from the system's and its palette's documents, and writes an
example page (`public/index.html`), the elements card, `.mcp.json`, `AGENTS.md` and a
`polymorph.json` that records every copy with its hash. It writes no `package.json` and installs
nothing. The files are a build output, so a checkout that has not run `pnpm build:packages` is
refused with that command, before anything is written.
[frameworks.md](frameworks.md#a-page-with-no-build-polymorph-init---framework-elements) lists the
files.

### What `add` accepts

| Item | Example | What lands |
| --- | --- | --- |
| A member | `button`, `date-picker`, `DatePicker` | Its source, stylesheet and states fixture, plus every file they import (other members, convention stylesheets) |
| A ladder primitive | `bespoke`, `third-party`, `density-scope`, `tone-scope` | The rung-4 Bespoke zone, the rung-4 boundary around another library's component, or a rung-2 scope, as source. In React, `DensityScope` and `ToneScope` share a file, so either brings both. |
| `theme:<system>` | `theme:pastel` | The system's JSON, the palette it declares as its default, and the webfont packages it needs |
| `palette:<name>` | `palette:orchid` | One palette's JSON, which any installed system can use |

Names are matched ignoring case and punctuation, so `date-picker`, `DatePicker` and `datepicker` are
the same request. A wrong name fails with a suggestion: `polymorph add pastel` suggests
`theme:pastel`. `Icon` ships inside `@polymorph/react`, so `polymorph add icon` installs nothing and
says to import it. In an elements install a member installs nothing and says why, because the page
loads every element, and a theme or a palette is compiled into the install's theme sheet.

### What `add` does

Run `pnpm polymorph add button theme:pastel --dry-run` here to see a plan. The steps are:

1. **Plan.** Each item is expanded through the registry's file closure and deduplicated. Paths are
   rebased from `packages/react-ui/src/` to `<dir>/` with the tree below preserved, and a member's
   recipe from `packages/recipes/src/` lands beside it, so every relative import inside the copied
   files resolves as written. The one rewrite is a member's recipe import:
   `@polymorph/recipes/controls/button.module.css` becomes `./button.module.css`, so a vendoring
   consumer installs no `@polymorph/recipes`. Members pulled in by the closure are reported as
   `came along`. Theme data goes to `<dir>/themes/systems/<name>.json` and
   `<dir>/themes/palettes/<name>.json`. Package version ranges come from the registry.
2. **Record.** `polymorph.json` is written *first*, listing every path about to be written and
   the hash of its contents. An install that fails halfway can then be re-run safely.
3. **Copy.** The planned files, `<dir>/css-modules.d.ts` (so `import styles from
   './x.module.css'` typechecks) and the base layer at `<dir>/base.css` (the reset and
   border-box baseline).
4. **Generate.**
   - `polymorph.eslint.js` — every red rule for application code. The vendored directory is
     exempt from them except `vendorable-imports`, which refuses a vendored member's import of a
     path outside the vendored directory, of a package's `src/`, or of a package a consumer does
     not install (`@polymorph/theme`, `@polymorph/react-ui`, the dev-time tools).
   - `polymorph.stylelint.js` — the motion rule for application CSS, token-only values for
     vendored CSS, and the ghost-token check against the list of every `--pm-*` property the
     installed themes emit.
   - Both fragments carry `VALUES`, the token values the rules name the nearest token with, read
     from the first pairing in the compiled `theme.css`. An install with no system, whose sheet is
     empty (an app that builds its theme at run time, or one that installs a palette alone), gets
     the registry's `tokenValues` for `plain`, the system `init` defaults to, and the fragment's
     header says so.
   - The compiled theme, when a theme is installed. The installer admits every installed
     system × palette through the theme engine and writes CSS: `<dir>/themes/theme.css` holds
     each system with its own default palette, and every other pairing gets
     `<dir>/themes/pairings/<system>--<palette>.css` plus a small loader module
     `<dir>/themes/pairings/<system>--<palette>.ts` that imports it. It compiles the JSON the
     application will have: the upstream copy, or yours if you have edited it. A pairing that
     fails a law stops the install with the law's own message.
   - `<dir>/themes/index.ts`, beside them — imports the base layer, the fonts and `theme.css`, uses
     only `@polymorph/engine/runtime`, and exports `installThemes()` (call once before the app
     mounts), `ensurePairing(system, palette)` (returns a Promise; await it before switching to a
     pairing that is not a system's default) and `DEFAULT_SYSTEM`. Nothing in it derives a theme, so
     the application ships no engine, and any bundler can serve it.
5. **Patch the consumer's own files**, changing as little as possible:
   - `package.json` — adds missing dependencies: `@polymorph/rules` to `devDependencies`, the
     rest to `dependencies`. A name already in either map counts as present. A range already
     there is left alone and the disagreement is reported.
   - `eslint.config.js` and `stylelint.config.js` — the generated configs are spliced in, or the
     files are created. The ESLint config is the flat config the application has, by ESLint's
     own order: `eslint.config.js`, `.mjs`, `.ts` or `.mts`. A config the CLI cannot edit safely
     fails with the lines to paste. A config counts as linked when it names the generated file
     as a module, not when a comment mentions it.
   - `index.html` (theme installs) — the pre-paint script, first in `<head>`, so the first frame
     is already in the right theme.
   - The app entry (`src/main.tsx`, `src/main.ts`, `src/index.tsx` or `src/index.ts`) — imports
     and calls `installThemes()`, unless the manifest sets `appInstallsThemes`.
6. **Record again**, with what actually happened.

`--framework vue` vendors the Vue vocabulary's single-file components instead: each member's
shell as the registry publishes it (its component, its compound parts, its states fixture, the
members they import and the shared recipes), read from the Vue tree. `Icon` ships in
`@polymorph/vue` and is not vendored. A member the framework map marks absent is refused with its
reason. `polymorph.json` records the framework, and a later `add` plans in it. `--framework svelte`,
`--framework solid` and `--framework angular` vendor the Svelte, Solid and Angular members the same
way, from their trees. Such an install writes the foundation and the packages its members import
at the framework's own ranges (`vendor.frameworks.<framework>.packages`), and the engine, the
rules and the fonts at the ranges in `packages`. A Vue, Svelte or Angular install adds the parser
its ESLint config reads components with (`vue-eslint-parser`, `svelte-eslint-parser`, or the two
`@angular-eslint` packages).
[frameworks.md](frameworks.md#vendoring-vue-members-polymorph-add---framework-vue) has the
details. `--framework elements` vendors nothing: `add <member>` writes nothing and says that the
page loads every element, and `add theme:<system>` writes the theme sheet again with the system
added ([frameworks.md](frameworks.md#add-update-and-diff-in-an-elements-install)).

Afterwards, install the new dependencies. A file you had already edited is kept and reported as
`kept yours` unless you pass `--force`. The same applies to a file that was already at an install
path and that the manifest has no record of, such as your own `Button.tsx` under a `--dir` you
already use, unless it already matches what would be written. Running `add` again is additive and
does not duplicate any patch. The vendored system and palette JSON are yours to edit. Run
`polymorph update` after an edit to recompile the sheets.

### `polymorph.json`

The manifest lives at the consumer's root and is meant to be committed.

| Field | Meaning |
| --- | --- |
| `version` | The registry version (`@polymorph/react`'s) the install was resolved against |
| `dir` | Where vendored source lives; in an elements install, where the copied files and the theme sheet live |
| `components` | Members asked for by name; everything else came along |
| `systems`, `palettes` | The installed halves of the theme |
| `files` | Every installed path → `{ hash, source }`: the SHA-256 of the bytes written, and the repo-relative file it came from (`null` for a generated file) |
| `framework` | `vue`, `svelte`, `solid` or `angular` when the vendored members are that framework's components, so `diff` and `update` plan the same files; `elements` when the install is a page's; absent for React |
| `appInstallsThemes` | `true` when the application installs its themes from a module of its own instead of calling the generated `installThemes()`, so `add` and `update` leave its entry as it is. Set by hand; absent means `false`, and each install that has a system or palette adds the import and the call to the entry again |

The hash distinguishes your edit from an upstream change. If the file on disk differs from the
recorded hash, you edited it. If the recorded hash differs from the current upstream file,
polymorph changed it. A manifest whose `dir` or any file path resolves outside the repository is
rejected entirely.

### `diff`

Compares the installed version with the available one, then lists every vendored file that has
changed on either side:

| Label | Meaning |
| --- | --- |
| `yours` | You edited it; upstream has not changed |
| `ours` | Upstream changed it; you have not |
| `both` | Changed on both sides — `update` leaves it alone |
| `gone` | Recorded in the manifest, missing from disk |
| `dropped` | Upstream does not ship it |

Unchanged and generated files are not listed. Differences are reported, never treated as
failures: `diff` exits 0 whatever it finds. It needs a `polymorph.json` to compare against.

### `update`

Re-plans the install from the manifest's requested items (members, `theme:<system>`,
`palette:<name>`), so a member that has gained a file picks it up. Then:

- files changed only upstream, or missing, are rewritten;
- files you edited (`yours`, `both`) are kept and listed, unless `--force`;
- files upstream does not ship are deleted if they are byte-for-byte as installed, and kept and
  reported if you edited them;
- a member that came along with another one and is no longer brought by the members the manifest
  lists, while the application imports its source, is added to `components` with a note, so it
  stays and keeps being updated. Any other vendored file the application imports, and each
  vendored file a kept one imports, is kept and reported, under `--force` too, until the import
  is removed. The application's source is every JavaScript, TypeScript, `.vue` and `.svelte` file
  outside the vendored directory, dot-directories, `node_modules`, `dist`, `build`, `coverage` and
  `out`. An import is a relative path, or an alias that names the vendored directory's last
  segment (`@/polymorph/exceptions/Bespoke`);
- a system or palette the registry records as renamed (`theme.renamed`) moves to its current
  name: the manifest names the new one, its files are written, and the old ones are pruned as
  above. The note says which name your code should use now;
- any other item upstream does not ship is dropped with a note, naming its likely replacement
  where there is one;
- generated files are rewritten, and the installed themes are recompiled from the JSON the
  application has after the update, which is your edited copy where you have one.

In an elements install, `update` copies again each file the build changed and you did not, writes
the theme sheet again, and removes a copied file the build no longer writes where it is as
installed. A file you edited is kept and named, and `--force` takes ours.

### `theme validate | emit | schema`

These take a system and a palette that **you** wrote, as paths to two JSON files, rather than
ones from this repository's catalogue. They run the same admission check as `admitTheme` in
`@polymorph/theme` (`packages/theme/src/admit.ts`).

```sh
polymorph theme validate my-system.json my-palette.json   # the laws, as a report; exit 1 if unlawful
polymorph theme emit my-system.json my-palette.json --out theme.css
polymorph theme schema system --out system.schema.json    # or: palette
```

A palette that names a `moreContrast` partner is admitted with it: a third path
(`polymorph theme validate my-system.json my-palette.json my-palette-strong.json`), or else the
file named for the partner beside the palette. Without either, admission refuses the palette, and
the report says where the partner is looked for.

- `validate` reports every fault in the laws' own messages, the font packages to install, a note
  when a name collides with a shipped system or palette, and the catalogue-only laws that do
  not apply to a guest theme.
- `emit` prints the emitted stylesheet. It is for handoff and inspection, not for installing. A
  product keeps the two JSON documents and compiles them in its build (`@polymorph/engine/vite`) or
  its install (`add`, then `update` after an edit), so the sheet is re-derived when a decision
  changes. A banner in the file marks it as a handoff.
- `schema` prints the JSON Schema for a system or a palette document, for an editor.

[theming.md](theming.md) covers bringing your own theme in full.

### `check`

Runs the red rules over a directory of another repository, with no ESLint or Stylelint config
there. Run it from that repository's root; the directory defaults to the root, and a file may be
named instead.

```sh
node ../polymorph/packages/cli/bin/polymorph.js check src           # exit 1 on any violation
node ../polymorph/packages/cli/bin/polymorph.js check src --json    # the report as data
```

It reads every `.ts`, `.tsx`, `.vue`, `.svelte`, `.html` and `.css` file below the directory as
application code, through `verify` from `@polymorph/rules/verify`, the function the MCP server's
`validate` calls, so it reports what the rules report in an installed config. It writes nothing.

- **What it leaves out.** Dot-directories, `node_modules`, `dist`, `build`, `coverage` and `out`,
  as `update` does, and the vendored directory `polymorph.json` records, which the generated lint
  fragments hold to the vocabulary's own rules. A `.html` file is read as an Angular template, so
  it is read only in a project that uses the Angular vocabulary or with `--framework angular`;
  the report counts the ones it left. In a project that uses the elements a `.html` file is a
  page, which the red rules do not read, and the report counts those too.
- **Which framework a file is in** is read as the MCP server reads it for `fix_file`: a `.vue` or
  `.svelte` file by its extension, a `.html` file as an elements page where the project uses the
  elements and not Angular and as an Angular template otherwise, a `.ts` module as an Angular
  component where its package uses the Angular vocabulary, and TSX as Solid where its package uses
  the Solid vocabulary and not the React one. A package uses a vocabulary when its nearest
  `package.json` depends on it or `polymorph.json` records that framework, so a page with no
  `package.json` is answered by its manifest. `--framework` sets it for every file.
- **What it prints.** Each file with a violation, then each rule it breaks with the rungs of the
  exception ladder that answer that rule (from the registry's law catalogue), then each report at
  its line and column. A file that does not parse is listed as not read. The last line counts
  the violations.
- **`--json`** prints `{ ok, dir, checked, files, notes }`. Each file has its `path`, the
  `framework` it was read in, `fatal` and `violations`; each violation is a `verify` diagnostic
  (`rule`, `message`, `line`, `column`, `fix`, `alternatives`) with the rule's `rungs`.
- **Exit code.** 1 on any violation or unread file, and on a usage error (a directory outside the
  repository or missing, an unknown framework, an unreadable `polymorph.json`); 0 otherwise.

### The verbs that ask the MCP tools

`card`, `search`, `component`, `axes`, `plan`, `validate`, `fix`, `emit`, `render` and
`theme propose` each call an [MCP tool](#the-mcp-server) and print its answer. A verb is the tool
of the same job and gives the same answer: the CLI turns the flags into the tool's arguments, and
the tool decides everything. Both read the vocabulary from the checkout that holds the bin and
write into the directory the command runs in, which is the tools' project.

| Verb | Tool |
| --- | --- |
| `card` | `get_system_card` |
| `search` | `search_components` |
| `component` | `get_component` |
| `axes` | `get_theme_axes` |
| `plan` | `get_install_plan` |
| `validate` | `validate` |
| `render` | `render_screen` |
| `fix` | `fix_file`; with `--dry-run` or `-`, `fix` |
| `emit` | `emit_screen` |
| `theme propose` | `propose_theme`; with `--save`, then `save_theme` |
| `add` | the CLI's own installer, which the tool `install` also runs |

A law holds the verb list to the server's table of tools
(`packages/mcp/src/verbs.test.ts`): every tool the server registers is some verb's job, and every
tool a verb names is one the server registers.

- **`--json`** prints exactly the tool's JSON answer and nothing else on stdout. The answer of
  `card` is Markdown, so its JSON is a string. A refusal prints `{ "error": "<the tool's
  message>" }`. `validate` given several files prints an array of answers, one for each file in
  the order named, and `theme propose --save` prints `{ "propose_theme": …, "save_theme": … }`.
- **Without `--json`** a verb prints a plain reading: the card as Markdown, a member as Markdown
  with its props, the theme axes as Markdown, a plan as `add --dry-run` prints it, each violation
  as one line (below), and each drawing with the path of its picture.
- **Exit codes.** 0 when the answer is clean; 1 when it reports violations, faults or a refusal,
  or the tool refused its arguments (an unknown framework); 2 when the command line cannot be read:
  a flag the verb does not take, a missing argument, a file that does not exist or a JSON file
  that does not parse. A verb refuses a flag it does not declare rather than ignore it.
- **In this repository** a verb that writes is refused where its tool is refused: `add` refuses a
  checkout, as `install` does, and `emit`, `fix` and `theme propose --save` write here, as
  `emit_screen`, `fix_file` and `save_theme` do ([the project](#the-project)).

The CLI cannot load the tools itself, because `@polymorph/mcp` depends on it. Its entry point
supplies them: `cli.tools` is a function that calls one tool by name in the same process
(`toolCaller` from `@polymorph/mcp`), and `cli.serve` starts the server (`serveStdio`). The bin
loads each the first time a verb calls it, so `add` and `diff` never load the linters the tools
carry.

### Looking up: `card`, `search`, `component`, `axes`, `plan`

```sh
polymorph card --framework vue              # the system card for a Vue app
polymorph search date picker --limit 5      # the query is every word after the verb
polymorph component Button                  # a wrong name gets suggestions, and exits 1
polymorph axes --properties                 # the axes, systems, palettes, roles and scales
polymorph plan button theme:pastel          # what `add` would copy; writes nothing
```

`plan` prints what `add --dry-run` prints for the same items, from the tool `get_install_plan`.

### Checking: `validate` and `render`

`validate <file...>` reads each file and sends its text with its path in the project, so the
rules read it where it is. A `.json` file is a screen spec, sent as `spec` and checked against the
vocabulary. `-` reads stdin, named by `--filename`. A directory is `check`'s job, and `validate`
says so. Each violation is one line, and under it the lawful answer:

```text
src/App.tsx:4:7  polymorph/no-raw-interactive  Unexpected <button>. Use `<Button label="Save" />` (rung 1): …
    fix    one lawful rewrite, which `polymorph fix` applies
    use    <Button label> (rung 1)
    climb  rung 1 variant selection · rung 4 bespoke zone
screens/inbox.json  $.root  no component called `Modal` — did you mean `Dialog`, `Drawer`, `Popover`?
1 violation, 1 fault.
```

`fix` is the rule's own rewrite, shown in full when it fits on a line; `use` lists the members,
props and tokens the message names, with their rungs; `climb` lists every rung that answers the
rule.

`render <spec.json> --system <name>` draws the spec in a browser, as `render_screen` does, and
writes one PNG for each drawing into `--out <dir>`, by default a directory beside the spec named
for it (`screens/inbox.json` → `screens/inbox.render/`). Each picture is
`<state>-<viewport>.png`: `sampled-phone.png`, `populated-desktop.png`, `empty-phone.png`. The
pictures are written with `--json` too, so a reader of the JSON answer finds each view's picture
by its `state` and `viewport`. The red rules, `check` and Prettier read no PNG, and this
repository's `.gitignore` leaves out `*.render/`. The reading lists the pairing, how each input was
filled, and each view with its picture's path and its faults under it. `--data` and `--empty` take
a JSON file each. It exits 1 when a view has a fault or a failed element, and when the spec is not
lawful.

### Writing: `fix` and `emit`

```sh
polymorph fix src/App.tsx                   # rewrites the file, as `fix_file` does
polymorph fix src/App.tsx --dry-run         # prints the fixed code; writes nothing
polymorph fix - --filename src/App.tsx < App.tsx > Fixed.tsx
polymorph emit screens/inbox.json src/screens/Inbox.tsx
```

`fix <file>` is `fix_file`: the file is fixed where it stands, and the reading names how many
reports each rule's fixes answered and the violations left. `--dry-run`, and `-` for stdin, is
`fix`: stdout is the fixed code and nothing else, so it can be redirected into a file, and what
the fix did and what it left go to stderr. `emit <spec.json> <out>` is `emit_screen`: `<out>` is a
path in the project, and the file written is the emitter's, byte for byte.

### Themes: `theme propose`

```sh
polymorph theme propose "calmer, more editorial, warmer paper"
polymorph theme propose calm --based-on journal/umber --save --dir design
```

The intent is every word after `propose`. The reading lists what each word moved, the words the
table does not have, and the verdict. `--save` then calls `save_theme` with the two documents,
into `--dir` (default `design`), and `--overwrite` replaces files already saved under the names.
It exits 1 when the proposal is not lawful or the save wrote nothing.

### Agents: `mcp`

`polymorph mcp [--project <path>] [--read-only]` starts the MCP server over stdio, with the flags
`polymorph-mcp` takes and through the same function (`serveStdio`), so the two are one server.
`--project` is resolved against the directory the command runs in. From then on stdout is the
protocol: a refusal goes to stderr, and the command exits when the client closes stdin and every
request has its answer.

## The MCP server

`packages/mcp` — bin `polymorph-mcp`; in this repository, `pnpm mcp`.

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the system to an
agent as tools. It runs over **stdio only**: no port, no auth, nothing to host. At startup it
builds the registry from the checkout that contains it.

Some tools read and some write, and each declares which in its annotations. A client shows these
annotations to the person deciding whether to approve a call.

### The tools that read

Marked `readOnlyHint`. None writes a file.

| Tool | What it answers |
| --- | --- |
| `search_components` | Finds members by name, purpose, prop or variant, ranked; an empty query lists the catalogue. Filters: `tier`, `origin`, `platform` (leaves out the members absent there; default `web`), `framework` (leaves out the members with no shell in that framework; default `react`), `limit`. Each hit says what it matched on. |
| `get_component` | One member: props with printed types, lawful variant × tone cells, states, `data-*` attributes, dependencies. `source: true` adds the source, stylesheet and states fixture. A wrong name gets suggestions (`Modal` → `Dialog`). |
| `get_install_plan` | What `polymorph add <items>` would copy: the file closure, packages and ranges, fonts. Takes the same items as `add`, and an optional `dir` and `framework` (`vue`, `svelte`, `solid` or `angular` plans that vocabulary's components, and `elements` plans no member and one theme sheet; omitted, the project manifest's framework, and a different one is refused). Writes nothing. |
| `get_system_card` | The system card. The tool the server's instructions say to call first. `platform` (default `web`) renders it for one platform: absent members left out, adapted ones with how they render. `framework` (`vue`, `svelte`, `solid`, `angular` or `elements`) renders it for an app in that framework. |
| `get_theme_axes` | The axes and their values, the systems and palettes, the colour roles and scales. `customProperties: true` adds every `--pm-*` property; `tokenValues: true` adds each system's token values. |
| `validate` | Submit `code` (TSX or CSS) and get the red-rule violations the repository's own lint run reports, with the same rules and the same lines, each with the ladder rungs that answer it. Code is parsed, never executed. Or submit `spec` (a screen spec, as the document itself or as its JSON text) and get it checked against the registry. Optional `filename` (where the code would live; `.css` routes to Stylelint, `.vue` to the Vue parser, `.svelte` to the Svelte parser, `.html` to Angular's template parser), `surface` (`application`, the default, or `vocabulary`) and `framework` (each checks a spec against that framework's vocabulary; `vue` lints unnamed markup with no block as a component's template, at the lines it was given, and code that opens with `<template>` or `<script>` is a single-file component either way; `svelte` lints unnamed code that opens with markup as a component; `solid` lints TSX as Solid's; `angular` lints unnamed TypeScript as a component module, its inline template included, and unnamed markup as a component's template; `elements` answers unnamed markup, and any `.html` file, with a `fatal` that says the red rules do not read HTML pages; otherwise TypeScript or CSS is linted as itself). Without `framework`, the project decides as it does for `fix`: TSX and a web spec are Solid's in a project whose package depends on `@polymorph/solid-ui` and not `@polymorph/react-ui`, and React's otherwise, so the two tools read one fragment alike and `emit_screen` writes a spec this accepts. |
| `fix` | Submit `code` (TSX, a Vue or Svelte component, an Angular module or template, or CSS, with the same optional `filename`, `surface` and `framework` as `validate`, read the same way) and get it back with every violation that has exactly one lawful rewrite already rewritten. Without `framework`, TSX is Solid's in a project whose package depends on `@polymorph/solid-ui` and not `@polymorph/react-ui`, and React's otherwise. These are the rules' own fixes, the ones `eslint --fix` applies ([rules.md](rules.md#what-the-rules-fix) lists them). Whether the `<button>` fix applies is decided by the project rather than by a lint config (below). The answer contains the fixed `code`, `changed`, `fixed` (rule → how many of its reports the fixes resolved) and the remaining `violations`, which need a decision, each with its ladder rungs. A stylesheet comes back unchanged, because no CSS rule has a fix. Writes nothing. |
| `propose_theme` | Turns an `intent` in plain words ("calmer, more editorial, warmer paper") into a complete candidate system and palette, resolved through the real engine, with a verdict (`lawful`, `faults`), a `rationale` per recognised word, and the words it did not recognise in `unmapped`. Optional `basedOn: { system, palette }`. The recognised words are listed in the tool's description (`packages/mcp/src/propose.ts`). |
| `render_screen` | Draws a screen `spec` in a real browser under a `system` (and optional `palette` and `mode`), at a phone and a desktop width, and returns the layout faults measured in the page as data, followed by one PNG for each view. `data` and `empty` fill the spec's inputs. Needs Playwright's Chromium. Writes nothing. [Seeing a screen](#seeing-a-screen-render_screen) covers it. |

Each violation `validate` and `fix` return carries its answer as data, beside the `message`, the
`law` and the `climb` (the ladder rungs that answer the rule). `fix` is the rule's own rewrite
when the violation has exactly one: `{ range, text }`, the edit `eslint --fix` makes, as a range
of the submitted code and the text that replaces it. It is `null` when the answer is a decision.
`alternatives` lists the lawful answers the message names, in its order, each as
`{ member?, prop?, token?, rung }`. `<Inline gap={4}>` in a message is
`{ member: 'Inline', prop: 'gap', rung: 1 }`, and `--pm-space-4` is
`{ token: '--pm-space-4', rung: 1 }`. `rung` is `null` for the vocabulary's own rules, which no
rung answers. The alternatives are read from the message itself
(`packages/rules/src/rules/alternatives.ts`), so the two never disagree. `@polymorph/mcp` exports
the types as `Violation`, `DiagnosticFix` and `Alternative`.

### Seeing a screen: `render_screen`

`validate` says whether a spec is lawful. A lawful spec can still be a bad screen: a row of
actions wider than a phone, a title squeezed under its neighbours, a table drawn with nothing in
it. Those show only when the screen is drawn. `render_screen` draws it and returns what a reader
would see and what a reader would miss.

It takes:

| Argument | Meaning |
| --- | --- |
| `spec` | A web screen spec, as an object or as JSON text, as `validate` takes it. It is checked the same way first, and an unlawful spec is answered with its faults (`specFaults`) and not drawn. A spec for `ios` or `android` is refused, because a browser does not draw its members. |
| `system` | A shipped system, by name. |
| `palette`, `mode` | A shipped palette and `light` or `dark`. Omitted, they are the palette and the mode the system declares. |
| `data` | The populated screen: a JSON value for each input, by input name. |
| `empty` | The empty screen: values laid over `data` for a second drawing, such as `{"tickets": []}`. |
| `viewports` | `phone`, `desktop` or both. Omitted, both. |

The answer is a JSON text followed by the pictures, as MCP image content. The JSON holds the
`pairing` that was drawn and one entry in `states` for each drawing. A state lists how every input
was filled (`inputs`) and one view for each width. A view has the `window` (375 by 812 for
`phone`, 1440 by 900 for `desktop`, the sizes `pnpm proof` shoots at), the `pageHeight`, the
number of its `image`, its `faults`, the text a member shortened with an ellipsis (`truncated`)
and the elements that threw while they rendered (`failed`). `ok` is true when no view has a fault
or a failed element. A picture is of the whole page from its top, up to three windows of height,
and `imageHeight` says how much of the page it shows. The phone is drawn at two device pixels a
point, so its text can be read.

**The faults** are measured in the page (`apps/workbench/src/screen/measure.ts`), over the whole
document and not only the part in the picture. Each names its element as an author would
(`Button "Create key"`, `span "Seats" in SettingsRow`) and gives the numbers.

| Fault | What was measured |
| --- | --- |
| `sideways-scroll` | The page scrolls sideways, or a layout region pans because its content is too wide for it. A region built to pan is not reported: a table that marks itself overflowing, a tab list, a named or focusable scroll region. |
| `clipped-text` | Text its own box cuts with no ellipsis, or text drawn outside a box too narrow for it. |
| `small-target` | A control whose hit area is under 24px, with another control inside the 24px circle centred on it. This is WCAG 2.2's target size, with its spacing exception ([layout.md](layout.md) has the floor). The hit area is asked of the page point by point, so a checkbox's label row and a text field's frame count. |
| `cut-off` | Text or a control hidden by a box that clips it, or lying past an edge of the page, where nothing scrolls to it. |
| `no-gap` | A member that touches another member with nothing between them, in a box that lays its children out in flow (a field directly above a table in a Card), or whose border lies against the inside of a box's border with no inset. A member that paints nothing (a Table, an Image's frame), a member's own parts, members in a flex or grid container, and a bar that runs edge to edge are not reported. |
| `unseen-focus` | A control that, with keyboard focus, draws no mark, draws only an outline under 2px, or draws an outline under 3:1 against what it is drawn on or cut by a box that cannot scroll to it (WCAG 2.4.13 and 1.4.11). A mark on the box around the control, such as a field's frame, counts. The page gives each control focus as the keyboard does, after the picture is taken. |

Three decisions shape the tool.

**Where the page is built and served.** The drawing is done by the workbench, not by the server:
`apps/workbench/screen.html` is a second document of that app, and `src/screen/main.tsx` draws the
spec as the composer does, with the run-time renderer `@polymorph/react/screen` and the real
vocabulary ([run-time-screens.md](run-time-screens.md)). The server passes the page the spec, the
pairing, the data and its registry's member names, by which a layout fault names a member. What
the spec's names mean is the run-time core's vocabulary table, which `pnpm registry` writes from
the same registry, so the page loads no registry of its own. The server runs over stdio from a checkout and its
dependency list is pinned, so it has no bundler and may print nothing on stdout. Its entry point
names a program the workbench owns, `apps/workbench/screen.build.mjs`. The first call to the tool
runs that program as a child process. It builds the screen page in memory with the workbench's own
Vite configuration and sends the files back over the process channel. The files stay in the
server's memory for its lifetime, as the registry does, so a change to the vocabulary shows after
the server restarts. The browser is given the files by request interception under an address
nothing listens on. No port is opened and no file is written. Every other request the page makes
is refused and listed in the answer as `blocked`. A published package would ship the built page
beside its registry and skip the build.

**The browser is optional.** Playwright is an optional dependency of `@polymorph/mcp`, loaded when
the tool is called and by no other tool. An install does not download a browser. Where Playwright
or its Chromium is missing, the tool answers with a tool error that says which and gives the
command, and every other tool works as before:

```sh
pnpm exec playwright install chromium
```

**What fills the inputs.** A spec binds its content to inputs and holds no data, so a picture
needs some. The caller decides which pictures it gets:

- With `data`, the screen is drawn populated. An input `data` leaves out is sampled.
- With `empty` as well, a second drawing lays `empty` over `data`. `empty` alone draws only that.
- With neither, there is one drawing, in which every input is sampled from its declared type by
  the run-time core's rule (`sampleOf` in `@polymorph/screen`): a string is its own name in
  brackets, a number is 0, a boolean is false, a list is empty, a type that admits `null` is
  `null`, and any other type is absent. No data is invented, so the sampled screen shows where
  the data goes.

A callback is never a function the caller passes, because JSON holds no function. The run-time
core decides by the prop or field the callback is bound to
([run-time-screens.md](run-time-screens.md#callback-inputs)). Where that prop's function returns
a value and the prop may be left out, nothing is passed and the member answers by default.
Elsewhere a stub answers by its return type: nothing for `void`, `false`, `0`, an empty list,
and for `string` a key for its first argument (its `id`, the value itself, or a serial for each
object), which is what a `getRowId` is asked for. A callback bound where no callback receives it
is a fault, and the picture draws its fault in place. A key in `data` or `empty` that names no declared input, or names a
callback, refuses the call, so a mistyped name cannot leave a sampled screen that its caller
believes is populated. A cell renderer is code and cannot be passed, so a column given as data
shows each row's value as text.

The picture is drawn with the React members. Every web framework's members import the same
recipes, so the layout measured is the layout of each. Only shipped systems and palettes can be
named. Motion is set to `none` for the drawing, so a picture is of the settled screen.

### The tools that write

Each one writes what a read tool returned into the project (below) and nowhere else. An agent can
already edit files. It should call one of these instead, because what gets written is the system's
own output: the emitter's bytes, the installer's plan, the documents the engine admitted. An
agent's own copy of that output could drift from the vocabulary.

| Tool | What it writes |
| --- | --- |
| `emit_screen` | Takes `spec` (a screen spec, as an object or as JSON text, as `validate` takes it) and `path` (relative to the project). The framework is the `framework` argument or, without one, the path's extension: a `.tsx` file emits for Solid with `framework: "solid"` or in a package that depends on `@polymorph/solid-ui` and not `@polymorph/react-ui`, as `validate` checks a spec, and for React otherwise, a `.vue` or `.svelte` file for Vue or Svelte, and a `.ts` module an Angular standalone component. A spec whose platform is `ios` emits a `.swift` file and one for `android` a `.kt` file, and `framework` is refused for either. Checks the spec exactly as `validate` does, a native spec against its platform's member package too; an unlawful spec writes nothing and returns its faults. A lawful one is compiled by the emitter (below), checked against the red rules (a native file against the native screen contract's law), and written, formatted with the Prettier config that applies to `path` (a native file as the emitter lays it out). The answer names the component (for SwiftUI the view, for Compose the composable), the `language` (`tsx`, `vue`, `svelte`, `angular`, `swift` or `kotlin`) and whether the file was `written`, `replaced` or `unchanged`, and adds a note when the package the file was written to does not depend on the framework's vocabulary (`@polymorph/react-ui`, `@polymorph/solid-ui`, …), which the file imports from. `framework: "elements"`, or a `.html` path in a project that uses the elements, is refused with the reason, because HTML has no way to bind a screen's callbacks and node renderers. |
| `install` | `polymorph add <items>`, applied. It takes the same `items`, `dir` and `framework` as `get_install_plan` and does what that plan describes: it vendors the file closure, records it in the manifest, adds the packages to `package.json`, extends the lint configs, and for a theme adds the pre-paint script to `index.html` and one import to the app entry. The answer lists what was `written`, what `cameAlong`, the files it `kept` because they were the project's own, and the project files it `extended`. It does not run a package manager. In an elements install it vendors no member and says why, and writes a theme into the install's theme sheet. |
| `save_theme` | Takes `system` and `palette` (the two documents `propose_theme` returns, as returned or edited since), an optional `dir` (default `design`) and `overwrite`. Admits the pair through the theme engine again. An unlawful pair writes nothing and returns the laws' messages. A lawful one is written as `<dir>/systems/<name>.json` and `<dir>/palettes/<name>.json`. The answer lists the font packages to install, the catalogue laws that did not run, and what to add to the build. |
| `fix_file` | Takes `path` (a TypeScript or JavaScript source file, a `.vue` or `.svelte` component, an Angular `.html` template, or a `.css` file, in the project), an optional `surface` and an optional `framework`. Without `framework`, the file and its package decide: a `.ts` module in a package that depends on `@polymorph/angular-ui`, or in a project whose manifest records Angular, is an Angular component, its inline template read; TSX is Solid's in a package that uses `@polymorph/solid-ui` and not `@polymorph/react-ui`. Applies `fix` to the file where it stands and writes it back when a fix changed it, so the code never passes through the conversation. The answer is `changed`, `fixed` and the remaining `violations`, without the code. A file that does not parse is left untouched. A stylesheet is also left untouched and only reported. |

What the write tools do not do:

- **Write anything unlawful.** Each one checks first, with the same check its read-only
  counterpart uses, and a refusal writes nothing. `emit_screen` also runs the red rules over the
  emitted code before writing it, as `pnpm emit` does. A lawful spec can still contain a value the
  rules read as a design value, so the output is checked too.
- **Replace someone's work without saying so.** `install` has no `--force`. A file it did not
  write, or wrote and the project has edited since, is kept and named in the answer. `emit_screen`
  replaces a file only when that file is itself an emitted screen, and refuses any other existing
  file. Regenerating an emitted screen after its spec changes is the normal workflow. It overwrites
  hand edits to the emitted file, which is why state and handlers belong in the container.
  `save_theme` reports a file already saved under the same name instead of replacing it, unless
  the call passes `overwrite: true`.
- **Delete a file**, or write outside the project. A path is resolved before it is written, so a
  link inside the project that points out of it is refused too. The project is a directory with a
  `package.json`, or with a `polymorph.json`, which marks a page with no build.
- **Change more than was asked.** `fix_file` is the only tool that edits a file someone else
  wrote. It changes only what a rule's fix changes. It does not reformat, and it changes nothing a
  rule did not report.
- **Import a member from a package the project does not have.** One fix imports a member: a
  `<button>` rewritten as `Button`. That fix has to name a module, the framework's vocabulary
  (`@polymorph/react-ui`, or `@polymorph/solid-ui` for Solid TSX); an element is not imported by
  name, so in elements the `<button>` is reported and never rewritten. `fix_file` checks the package
  the file is in and rewrites only when that package depends on it. Otherwise the `<button>` is
  reported and left as it is, with a note when it would otherwise have been rewritten. `fix`
  receives a fragment rather than a file, so it assumes the vocabulary, as the spec emitter does.
  The exception is a project known to vendor: its root has an install manifest and no dependency
  on the package. Neither tool reads the project's ESLint config. This is the one place the tools
  can differ from the project's own `eslint --fix`, which rewrites a `<button>` only where the
  config spreads `fixableRawControls` (or `fixableSolidControls`).

One write can stop halfway. The installer copies and records the vendored source before it edits
the project's lint config. If it cannot edit the config, a retry can then complete the install.
`install` returns an error that says the source is on disk, gives the lines to add, and says to
call it again.

`install` is annotated as an additive write. `emit_screen`, `save_theme` and `fix_file` are
annotated as writes that can replace a file (`destructiveHint`).

### The project

The server has two roots, like the CLI. It reads the vocabulary from the checkout that holds the
bin. It writes into the **project**: the directory the server was started in, or the path given as
`--project <path>`. An agent working in a repository starts its stdio servers there.

- A project is a directory with a `package.json`. A write tool refuses any other directory, so a
  client that starts its servers somewhere else gets a refusal that says to pass `--project`.
- `install` refuses when the project is a checkout of polymorph (this one, or another clone or
  worktree) or a directory inside one, because it would vendor the vocabulary into its own source.
  `emit_screen` and `save_theme` work there. A screen is written into an app, and a theme saved to
  `design/` joins the catalogue, as it does from the studio. Run `pnpm registry` afterwards.
- `--read-only` starts the server with no project. It registers the read tools and no write
  tool.
- Flags are parsed strictly. An unknown flag stops the server with a usage line, so a mistyped
  `--read-only` cannot start a server that writes.

The tools are plain functions in `packages/mcp/src/tools.ts`, `propose.ts`, `render.ts` and
`write.ts`.
`packages/mcp/src/server.ts` holds one table of them (`TOOLS`), each with its name, argument schema
and annotations, and only binds it to the protocol. `toolCaller` (`oneshot.ts`) calls the same
table by name outside the protocol, checking the arguments with each tool's schema as the SDK
does, which is what the CLI's verbs run on. `packages/mcp/transcript.test.ts`
spawns the real server over stdio, as a client would, calls every tool with a scratch directory as
the project, and checks that `validate` returns exactly what ESLint reports for the same input.

### Registering it with a client

The repository ships no client configuration. The server is a command that speaks MCP on stdin
and stdout, so register it the way your client registers a stdio server. Many clients read an
`mcpServers` object in this shape:

```json
{
  "mcpServers": {
    "polymorph": {
      "command": "node",
      "args": ["/absolute/path/to/polymorph/packages/mcp/bin/polymorph-mcp.js"]
    }
  }
}
```

Add `"--project", "/absolute/path/to/your/repository"` to `args` for a client that does not start
the server in your repository, or `"--read-only"` for a server that only reads.

Run it by hand with `pnpm mcp`, or `pnpm polymorph mcp`, which starts the same server. Diagnostics
go to stderr. Stdout carries only protocol messages.

## The screen spec

`packages/spec` — a screen described as a JSON document instead of written as code, validated
against the registry, and emitted for any web framework (React or Solid TSX, a Vue or Svelte
single-file component, an Angular standalone component), or as SwiftUI or Jetpack Compose for a
screen whose platform is `ios` or `android`.

A spec expresses **composition, prop values, bindings and declared exceptions**. It has no field
for a style and no expression language. A prop is a name and a value, and the name is checked
against that member's props in the registry. `className` therefore fails for the same reason a
typo does: no member has it. Behaviour comes in only through declared inputs.

This section covers the authoring path: a spec checked and emitted as a source file, which a
developer commits and builds. The same document can also be drawn at run time, as a model writes
it inside a running product, with no build: [run-time-screens.md](run-time-screens.md).

### The format: `polymorph-screen/1`

The schema is `packages/spec/src/schema.ts`.

```json
{
  "spec": "polymorph-screen/1",
  "name": "KeysView",
  "purpose": "The API keys an integration uses, with a way to make another.",
  "inputs": [
    { "name": "count", "type": "string", "doc": "How many keys exist, already formatted." },
    { "name": "onCreate", "type": "() => void" }
  ],
  "root": {
    "component": "Stack",
    "props": { "gap": 5 },
    "children": [
      { "component": "Heading", "children": ["API keys"] },
      { "component": "Text", "props": { "tone": "secondary" }, "children": [{ "$": "count" }] },
      {
        "component": "Button",
        "props": { "variant": "solid", "tone": "accent", "label": "Create key", "onClick": { "$": "onCreate" } }
      }
    ]
  }
}
```

| Field | Meaning |
| --- | --- |
| `spec` | Always `polymorph-screen/1` |
| `name` | PascalCase — the component the emitter writes. For a native screen, the name without a trailing `View` or `Screen` names the model, the actions and the view (`InboxView` gives `InboxModel`, `InboxActions` and `InboxView` or `InboxScreen`) |
| `purpose` | One sentence; becomes the emitted file's doc comment |
| `platform` | Optional. `web`, `ios` or `android`; `web` when absent. A member absent on that platform is a fault that names its substitute. A screen for `ios` or `android` is also held to the native screen contract and emits SwiftUI or Jetpack Compose (below) |
| `types` | Optional. Module → type names the inputs mention, emitted as `import type` lines in TSX. A native screen maps them by the contract's type table instead: a vocabulary type is the member package's `PM` type, and a relative module's type is the app's own. There is no default or namespace import: a type is imported by its own name and an input writes it bare (`ReactNode`, not `React.ReactNode`) |
| `inputs` | What the screen is handed: `{ name, type, doc? }`. `type` is one TypeScript type, written verbatim into the props interface. Every binding in `root` names one of these, a function a member requires included |
| `root` | An element |

The fields may come in any order. The schema lists `root` last: a tree written last is closed by
closing every bracket, and one written before `inputs` has to be closed exactly in the middle of
the document. An element has no field for a note. A remark for a reader goes in `purpose` or in
an input's `doc`.

An **element** is `{ component, props?, children?, exception? }`. `component` is a member or a
compound part (`SettingsRow.Group`, `Dashboard.Panel`): any part the system card lists for the
member in the screen's framework or on its platform. A part the member does not carry there is a
fault that lists the parts it does. The registry reads a part's props from the React member, so a
part only another framework's files declare (`Toast.Viewport` in Vue) has none on record: a spec
cannot compose it, and the fault says so. A **value** (a prop value or a child) is a
string, number, boolean, `null`, an element, a list, a binding `{ "$": "inputName" }` or a
structured object `{ "$object": { … } }`.

A **binding** is a declared input, or a dotted path of names into one (`draft.subject`). It is
never an expression: no call, index, operator or element. Anything a screen needs computed, such
as `items.length > 0` or a mapped list, is computed by the container that renders it and passed in
as a separate input.

A spec has no condition: every element in it is rendered whenever the screen is. Content that is
sometimes absent is a prop bound to an input that is empty while there is nothing to show, on a
member that draws nothing when it is given nothing. An `Alert` with no title and no content
renders nothing, and so does an `ErrorSummary` with an empty `errors`. Such content is not an
element the container builds and hands in as an input, because the screen's document would then
hold no member in that place for the validator to check.

An **exception** declares a ladder rung on the node that takes it, with a reason:

```json
{
  "component": "DensityScope",
  "props": { "value": "compact" },
  "exception": { "rung": 2, "because": "A queue is scanned rather than read, so more rows per screen is worth more here." },
  "children": []
}
```

A screen may declare rungs 2 (a contextual scope), 3 (an instance patch) and 4 (a Bespoke zone).
See [rules.md](rules.md).

### Validation

`validateSpec(registry, document)` (`packages/spec/src/validate.ts`) runs two passes and returns
`{ ok, faults }`. Each fault is a `{ path, message }`, with a path such as `$.root.children[1]`.
Its first parameter is typed by what it reads, `SpecVocabulary`: the members, the exception
primitives and the icon roles. The registry is one, and the run-time core's vocabulary table is
another, so `checkScreen` (`@polymorph/screen/check`) gives a page the registry's faults with no
registry in it ([run-time-screens.md](run-time-screens.md#checking-an-answer-and-asking-again)).
`validateSpec(registry, document, { framework })` with `vue`, `svelte`, `solid` or `angular` also refuses a
member that framework's vocabulary does not ship, with the framework map's reason
([frameworks.md](frameworks.md)):

1. **Shape** — is it a screen spec at all.
2. **Meaning** — does every component exist, and render on the screen's `platform` (an absent
   one is reported once, at the member rather than at each of its parts, with the entry's
   substitute and reason; an adapted one is lawful); does every prop exist on it, with a value of
   the right kind; are required props present; is the variant × tone cell lawful; is every icon role
   in the closed set; is every binding a path of names whose head is a declared input; is every
   exception at the rung its component actually is, with a reason; and does no node declare an
   exception it does not take.

The emitter prints four fields as code. Each is checked to be exactly what it claims to be,
because anything more would put unchecked text where code goes:

| Field | Held to | By |
| --- | --- | --- |
| `component` | a member's name, or `Member.Part` — the whole name, never a prefix of it | the registry |
| a binding's `$` | a path of names; also a `pattern` in the published JSON Schema | the schema |
| the names and module keys in `types` | identifiers that are not reserved words; a specifier with no quote, backslash or space | the validator |
| an input's `type` | one TypeScript type: it parses, it is a single statement, and every node in it is type syntax — no default value, computed key or accessor body | the TypeScript parser |

The last check needs a compiler, so it runs only where one is available. `validateSpec` from the
package's root entry, which `pnpm emit` and the MCP server call, passes each input's type to the
TypeScript parser (`packages/spec/src/input-type.ts`). The `@polymorph/spec/validate` subpath is
the part the browser runs. It checks everything else and skips types. That is enough for the
composer, because the composer creates neither inputs nor bindings, and for `checkScreen`, which
is built on it. `@polymorph/spec/action-type` holds `isActionType`, the rule that reads an input's
type as a callback, for code that needs the rule and no validator, such as the run-time walk.

A structured object (`$object`) is data for a prop. Among children, or in a list in a prop that
holds an element, it is a fault, because those positions are rendered.

Wrong names come back with suggestions: `Modal` → `Dialog`, `api-key` → `key`. The same check is
available to agents as the MCP tool `validate` with `spec`. It also runs before the MCP tool
`emit_screen` writes anything, and it runs in the browser through the `@polymorph/spec/validate`
subpath, which the composer uses.

### Emitting TSX

```sh
pnpm emit design/screens/inbox.json                 # TSX to stdout
pnpm emit design/screens/inbox.json src/Inbox.tsx   # or to a file
```

`packages/spec/bin/emit.js` (bin `polymorph-emit`) validates first and writes nothing if the spec
is unlawful, printing every fault with its path. A lawful spec becomes a **presentational
component**: it takes the declared inputs as props and renders the tree. It holds no state and
computes nothing. A hand-written container renders it and supplies data and handlers. The output
is formatted with Prettier, using the Prettier config that applies to the output path when one is
given. Paths are resolved from the current directory, which under `pnpm emit` is the
repository root.

The emitted code is then checked against the red rules, or a native screen against the native
screen contract's law (below). A file that breaks one is not written or
printed (`emitCheckedScreen`, `packages/spec/src/lawful.ts`). The format has no field for a style
or a raw control, and validation leaves no other field to write one in. A lawful spec can still
hold a value that *is* a design value, such as a label whose text is `#7c3aed`, and this check
catches it. The command exits non-zero and lists the violations. It checks the red rules only, not
anything else in a repository's lint config.

Text is emitted so that the file says exactly what the spec says:

- **Prose** (`purpose`, an input's `doc`, an exception's `because`) goes into comments and cannot
  close the comment it is in.
- **A string** is written as an attribute or a text child where that means the same thing, and as
  an expression (`label={'Fish &amp; chips'}`) where it would not. That is the case for a line
  break, a character reference, and, for a text child, any whitespace other than single spaces
  between words, or another string directly before it. JSX joins two lines of text into one text
  with a space between them, which is not what two separate strings mean.
- **A list in a prop** is a fragment when it holds an element (`actions={<>…</>}`), its items
  written as children, and an array when it does not (`value={['a', 'b']}`).
- **An exception's comment** is `{/* … */}` among an element's children and a plain comment at
  the root of the screen or in a prop, where braces would mean something else.

An agent emits through the MCP tool `emit_screen`. It uses the same validation and the same
emitter, and writes the file into the server's project.

The same spec emits a Vue single-file component with `{ framework: 'vue', registry }`, an output
path ending in `.vue`, or `--framework vue`: `defineProps` for the inputs, `@foo` for an event,
named slots for node-typed props. [frameworks.md](frameworks.md#emitting-a-screen-for-vue) has the
details and an example. `{ framework: 'svelte', registry }` (or a `.svelte` output) emits a Svelte 5
component, with snippets for node-typed props, and `{ framework: 'solid' }` (or `--framework
solid`, to a `.tsx` output) emits Solid TSX that reads its inputs from `props`
([frameworks.md](frameworks.md#emitting-a-screen-for-svelte-or-solid)). `{ framework: 'angular',
registry }` (or a `.ts` output) emits one standalone component: every input a signal input,
callbacks included, an output's handler calling the callback (`(click)="onSave()()"`), node-typed
props projected through `ngProjectAs="[slot=…]"`, and the template inline
([frameworks.md](frameworks.md#emitting-a-screen-for-angular)).

### Emitting SwiftUI and Compose

```sh
pnpm emit platforms/ios/Examples/Relay/Screens/inbox.json App/InboxView.swift       # SwiftUI
pnpm emit platforms/android/examples/relay/Screens/inbox.json app/src/main/kotlin/dev/acme/InboxScreen.kt
```

A spec whose `platform` is `ios` emits one Swift file (`packages/spec/src/emit-swift.ts`):
`<Screen>Model`, `<Screen>Actions`, a stateless `<Screen>View` and `<Screen>Actions.inert`. A spec
whose `platform` is `android` emits one Kotlin file (`packages/spec/src/emit-kotlin.ts`): `data
class <Screen>Model`, `interface <Screen>Actions`, `@Composable fun <Screen>Screen` and `object
<Screen>Inert`, in the package the output's directory names under its source root. Both are named
as `design/native/screen-contract.md` names them, and share the type table, the walk over the
tree and the faults (`packages/spec/src/emit-native.ts`). The platform is a field of the spec, so
it decides the language: a `.swift` or `.kt` output for any other spec, another output for a
native spec, and a web `--framework` with one are refused. Each member's props and their types
are read from the generated contract of this checkout's member package, with the members it
draws, which `emitScreen` and `validateSpec` take as `native` (`readNativePackage(root,
platform)`).

Validation also holds the spec to the contract's faults: a type its table does not map, an input
named `loadStatus`, a root that is not a page archetype, a member the package does not draw,
an event bound to data or data to an action, and the others
[native.md](native.md#emitting-a-screen-to-swiftui) lists, each at its path. The emitter refuses
what the contract has no place for, a prop it cannot express or a binding of another type
among them, and writes nothing. The emitted file is checked against the contract's law instead of
the red rules: it holds no state, no asynchronous call, no navigation and no theme. It is laid
out by the emitter, not by Prettier.

`pnpm emit:examples` (`scripts/emit-examples.mjs`) rewrites the emitted screens of
`platforms/ios/Examples` and `platforms/android/examples`, and `pnpm emit:examples --check`, a
step of `pnpm gate:ios` and `pnpm gate:android`, reports one that differs from what the emitter
writes.

### Where screens live

`design/screens/` holds the web screen specs. `inbox.json`, `new-ticket.json` and `settings.json`
describe Relay's screens (`apps/workbench/src/relay/`). The workbench composer saves new screens to
the same directory. `packages/spec/roundtrip.test.ts` reads every `.json` file at the top of the
directory: each must validate, emit, and typecheck against the real `@polymorph/react-ui`, and
Relay's must match the screens they describe. The native examples' specs are in
`platforms/ios/Examples/Relay/Screens/` and `platforms/android/examples/relay/Screens/` (above).

### The agent loop

The format is designed for this loop. An agent given only the system card and a brief writes a
spec. The system reports exactly what is wrong. The agent corrects the spec until it is lawful.
`design/screens/agent-loop/` is a recorded run of that loop:

- `brief.md` — a screen brief (an API-keys page) that names no component;
- `attempt-1.json` — a first attempt with the mistakes agents commonly make: a `className`, a
  variant × tone cell that does not exist, an invented icon role, a binding to an undeclared
  input, a missing required prop, and a component from another design system;
- `attempt-2.json` — the corrected, lawful spec.

`packages/spec/agent-loop.test.ts` checks that every mistake in the first attempt comes back as a
fault at its path, that the second attempt validates, uses only members and icon roles the
system card names, answers the brief, and emits TSX that passes every red rule and typechecks.
Run `pnpm emit design/screens/agent-loop/attempt-1.json` to see the faults.

A lawful spec is the end of that loop and the start of a second one. The MCP tool `render_screen`
([above](#seeing-a-screen-render_screen)) draws the spec at a phone and a desktop width, and the
agent corrects what the picture and the measured faults show.

## The workbench

`apps/workbench` — `pnpm dev`. The designer's app. It is where systems and palettes are created,
screens are composed, and the whole vocabulary is inspected under any pairing.

The **toolbar** at the top of every page selects the system, palette, mode, density and motion
temperament, persisted in `localStorage`. Every surface renders under the toolbar's selection,
including a studio draft. Switching the system and then visiting each page shows the effect of one
decision everywhere.

| Route | Area | Code |
| --- | --- | --- |
| `/` (also `/studio`) | Studio | `apps/workbench/src/studio/` |
| `/composer` | Composer | `apps/workbench/src/composer/` |
| `/components`, `/components/<slug>` | Component browser | `apps/workbench/src/harness/ComponentsPage.tsx`, `ComponentDetailPage.tsx` |
| `/gallery/<slug>` | One member's gallery | `apps/workbench/src/harness/GalleryPage.tsx`, `gallery.ts` |
| `/pages`, `/pages/<slug>` | Sample pages | `apps/workbench/src/harness/PagesIndex.tsx`, `apps/workbench/src/pages/` |
| `/moodboard` | Mood board | `apps/workbench/src/harness/MoodboardPage.tsx` |
| `/tokens` | Token gallery | `apps/workbench/src/harness/TokensPage.tsx` |
| `/overview` | Overview and gallery index | `apps/workbench/src/harness/HomePage.tsx` |
| `/relay/…` | Relay, the demo product | `apps/workbench/src/relay/` |

`screen.html` is a second document of the app, with no toolbar and no route. It draws one screen
spec for the MCP tool `render_screen` ([above](#seeing-a-screen-render_screen)), and its code is in
`apps/workbench/src/screen/`.

The studio, composer, sample pages and Relay are application code and follow every red rule: no
stylesheets, no `style` or `className`, vocabulary only. `apps/*/src/harness/` is the one
declared exemption. Workbench tooling such as the toolbar and the token swatches may have CSS,
which still reads only `--pm-*` tokens. [rules.md](rules.md) has the details.

### Studio

The studio creates or edits a system and a palette and saves them to `design/`.

- **Controls.** *Axes* — the eight axes as selects. *Scale* — exact values for corners, spacing,
  control heights, shadows, the focus ring and the type scale, and which steps each class of
  component uses; saved as the system's `overrides`, and only what you change is recorded.
  *Exceptions* — one member re-pointed to one step, with a required reason. *Seeds* — accent
  hue, gradient hue, neutral tint, chroma budget. *Type* — the body, display and mono families.
  [theming.md](theming.md) explains what each one decides.
- **Live derivation.** Every change composes and resolves the draft through the real theme
  engine and installs it under a reserved pairing, `pm-draft`. The preview shows real screens in
  both modes. The draft persists across reloads, and every other workbench page can render under
  it.
- **Law faults are shown inline.** Coherence and contrast faults appear beside the control that
  caused them, in the laws' own messages. An unlawful draft still previews where it can, but
  cannot be saved.
- **Save.** Writes `design/systems/<name>.json` and `design/palettes/<name>.json` through a
  dev-server endpoint (`POST /__studio/save`, `apps/workbench/src/studio/save-endpoint.ts`). The
  endpoint exists only under `vite dev`, accepts same-origin requests only, validates with the
  same parsers the engine loads shipped files with, and asks before amending an existing file.
  It writes those two files and nothing else: no git, no build. Run `pnpm registry` (or restart
  `pnpm dev`) to see the new pair in the registry.
- **Import a proposal.** Paste what the MCP tool `propose_theme` returned, or a copied pair, and
  the controls load it. This is how an agent's proposal reaches a designer. An agent that saves
  one itself calls the MCP tool `save_theme`, which writes the same two files.
- **Share.** Downloads `<system>-<palette>-handoff.md` (every decision with its reason, the
  `polymorph add theme:… palette:…` command, and the MCP loop for an agent), the pair as one JSON
  file, and the emitted stylesheet. The stylesheet is for inspection, never for pasting into a
  codebase. `pnpm emit:theme <system> <palette> [out.css]` emits the same stylesheet for any
  pairing in `design/`, headlessly.

The studio does not create *members*. That is `pnpm new:member` (below).

### Composer

The composer assembles screens from the vocabulary with the mouse, as `polymorph-screen/1`
documents. This is the same format an agent writes and `pnpm emit` compiles.

- **Three panes**: the layer tree (where you select a node), the canvas (the real vocabulary,
  drawn from the spec under the current pairing by `@polymorph/react/screen` and the run-time
  core, the renderer a product draws a model's screen with; `apps/workbench/src/composer/draw.tsx`
  holds only the picture's options: every member allowed, inputs sampled, each fault and binding
  drawn in place; and `render.tsx` adds the selection around each element), and the selection
  (the node's props as controls, plus the law panel showing `validateSpec`'s faults).
- **The palette of insertable members** is computed from the registry
  (`apps/workbench/src/composer/palette.ts`): a member is insertable when every required prop can
  be set with a control: text, number, switch, a choice from a literal union, an icon role, a
  number list, or a nested member. A member with any other required prop (a callback, an array
  of options, chart data) is shown in search as *code-wired*: it is still lawful in a spec
  written by hand or by an agent. Layout primitives (`Stack`, `Inline`, `Grid`, `Card`) serve as
  the plain containers in this system.
- **Inserted members start lawful**: required props are filled with placeholders.
- **Content is literal.** The composer does not create bindings or inputs. A spec that has them
  opens with bindings shown as named placeholders.
- Undo and redo; a working draft kept in `localStorage`; start from a blank `Stack` or an
  archetype skeleton, or open any screen in `design/screens/`.
- **Save** writes `design/screens/<kebab-name>.json` through `POST /__composer/save`
  (`apps/workbench/src/composer/save-endpoint.ts`; dev-only and same-origin like the studio's).
  It refuses an unlawful document, and refuses everything if the generated registry is missing.
  **Download spec** saves the JSON; **Copy emit command** copies
  `pnpm emit design/screens/<name>.json` for a developer.

### Component browser and galleries

- `/components` searches the vocabulary with the same ranking as the MCP tool
  `search_components`, plus a *wears* filter: the members whose own stylesheet reads a given
  `--pm-*` token, which shows what changes when that token changes.
- `/components/<slug>` is one member under the current pairing: its purpose, the decisions it
  uses, every token it reads, its props, and its states fixture rendered live.
- `/gallery/<slug>` is the bare gallery: every entry of the states fixture, in order, under whatever
  the toolbar selects. Any member listed in `packages/react-ui/src/galleries.ts` gets one.
  `pnpm proof` screenshots these routes ([verification.md](verification.md)).

### Sample pages, mood board, tokens

- `/pages` indexes vocabulary-only sample pages, each an invented product built on one page
  archetype: `analytics` (Dashboard), `crm` (ListPage), `project` (DetailPage), `onboarding`
  (FormPage), `billing` (SettingsPage), `signin` (AuthPage) and `assistant` (ConversationPage). It
  also lists Relay.
  Each page at `/pages/<slug>` replaces the workbench chrome and fills the window, as a real
  product would.
- `/moodboard` is an overview of the current system: its direction paragraph from
  `design/systems/<name>.md`, type specimen, colours, shape and depth, a component collage, and
  both modes side by side.
- `/tokens` shows everything the engine derives for the current pairing.

### Relay

Relay (`/relay`) is the demo product: a support inbox with a ticket list, ticket detail, a
new-ticket form and settings, built entirely from the vocabulary with no CSS and no `className`.
It has exactly two declared exceptions, which `pnpm inventory` reports: a rung-2 `DensityScope`
in the inbox and a rung-4 `Bespoke` zone for an illustration. It replaces the workbench chrome
and has its own theme switchers on its settings screen.

## The docs site

`apps/docs` — `pnpm dev:docs`. The website. It documents the system live, under any pairing a
visitor chooses from its top bar, and it publishes every file in `docs/` as a guide.

| Route | Page |
| --- | --- |
| `/` | The landing page: a sample screen under any pairing, and one spec emitted for each web framework |
| `/install` | Getting started: the CLI, each framework and platform, vendoring, bringing your own system, the MCP server |
| `/guides`, `/guides/<slug>` | The files in `docs/`, grouped, each with its table of contents |
| `/components`, `/components/<slug>` | Every member, with its states fixture rendered live |
| `/systems` | Every house system: its axes, fonts, default palette, and a live specimen |
| `/tokens` | Colour roles and scales, painted with the live pairing's own properties |
| `/motion` | Every motion pattern, re-triggerable, at each temperament ([motion.md](motion.md)) |
| `/principles` | The exception ladder and the red rules, from the registry |

Its content comes from `registry/registry.json` (regenerated by its `predev`/`prebuild`) and from
`docs/`, so its facts always match the source tree. The entries of a fixture that reaches
outside the page, with a modal overlay, an open panel or a fixed-position element, render inside
iframes (`apps/docs/frame.html`, `src/frame.tsx`, `src/FixtureFrame.tsx`), so they cannot make
the rest of the page inert or cover it.

`pnpm site` builds the app and writes every page as static HTML into `apps/docs/dist`, with a
`404.html`, a sharing picture and `robots.txt`. It opens each page in Chromium and fails on a page
that logs an error or links to an address of the site that has no page, and on two pages with one
title. `VITE_SITE_URL` names the site's public address, which the canonical links, the pages'
structured data and `sitemap.xml` need. The build also writes the files an agent reads:
`llms.txt`, the system card, and each guide as markdown at `/guides/<slug>.md`.
[apps/docs/README.md](../apps/docs/README.md) describes the step and what a host must serve.

The workbench and the docs site both browse components, on purpose. The docs site is the
reference. The workbench is the tool that previews a member under a draft theme.

## Adding members and auditing exceptions

- `pnpm new:member <Name> [--tier <tier>]` scaffolds a member's files and adds it to every list
  that must include it. [../CONTRIBUTING.md](../CONTRIBUTING.md) describes the full process.
- `pnpm inventory` prints every declared exception in application code, writes `exceptions.json`,
  and exits non-zero on an undeclared one. [rules.md](rules.md) explains the ladder it counts.
