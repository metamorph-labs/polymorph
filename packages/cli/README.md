# @polymorph/cli

The installer: `polymorph init`, `add`, `diff`, `update`, `theme` and `check`. `init` creates a new app
that installs the packages, with a theme, the red rules, an MCP config and a first screen. `add`
copies chosen members of the **vocabulary** (the closed set of polymorph components) and themes
from this repository into another one. Both work in one web framework: React by default, or Vue,
Svelte, Solid or Angular with `--framework` ([docs/frameworks.md](../../docs/frameworks.md)). The
copies are source that the other repository owns and may edit. `add` also makes the **red rules**
(the lint rules that fail CI) run in that repository. This is "open code, closed usage": the
components are open to edit, and the red rules govern how application code uses them.

Vendoring is one of two ways to use polymorph from another repository. The other is installing
the packages, which `init` sets up. [docs/consuming.md](../../docs/consuming.md) compares them.

## Running it

The bin is `polymorph` (`bin/polymorph.js`). It reads the vocabulary from the checkout that holds
it and installs into the **current directory**, so run it from the other repository's root:

```sh
node ../polymorph/packages/cli/bin/polymorph.js add button dialog theme:pastel
```

In this repository, `pnpm polymorph <command>` runs from this repository's root. Use it only for
`help`, `add --dry-run` and `theme`: `add` and `update` refuse to write into a checkout of polymorph,
as `init` does.

To start a new app instead, name a directory outside the checkout:

```sh
node ../polymorph/packages/cli/bin/polymorph.js init my-app
```

| Command | What it does |
| --- | --- |
| `polymorph init <dir>` | Writes a new Vite app into a new or empty directory, in React or in the framework `--framework` names: that framework's packages as npm aliases (`@polymorph/rules` as a dev dependency), an `.npmrc` that names the token, a catalogue theme compiled by the Vite plugin, the lint configs, an `.mcp.json` for this checkout's MCP server, the system card, `AGENTS.md`, and a first screen emitted from its spec. Then runs `pnpm install` with `NODE_AUTH_TOKEN` or `gh auth token` |
| `polymorph add <item…>` | Vendors members (`button`) in the install's framework, the exception ladder's primitives (`bespoke`, `third-party`, `density-scope`, `tone-scope`), a theme (`theme:pastel`: a system, its default palette and its fonts) or a palette (`palette:orchid`) |
| `polymorph diff` | Lists what you have changed since the install, and what has changed upstream |
| `polymorph update` | Re-vendors the files you have not edited, keeps and reports the files you have edited, and recompiles the installed themes |
| `polymorph theme validate \| emit \| schema` | Checks, emits or describes a system and palette that you wrote, given by path, with the same laws |
| `polymorph check [dir]` | Runs the red rules over every `.ts`, `.tsx`, `.vue`, `.svelte`, `.html` and `.css` file below a directory as application code, with no lint config, outside the vendored directory. Prints each violation by file and rule with the rungs that answer it, and exits 1 on any |

Flags: `--dir <path>` (where vendored source lands, default `src/polymorph`), `--dry-run` (print
the plan, write nothing), `--force` (overwrite files you have edited), `--out <path>` (where
`theme emit` and `theme schema` write), `--system <name>` (the system `init` themes the app with,
default `plain`), `--framework <name>` (`react`, the default, `vue`, `svelte`, `solid` or
`angular`: the app `init` writes and the members `add` vendors; once an install has
`polymorph.json`, `add` uses the framework it records and refuses another; `check` reads every file
in it instead of inferring each file's), `--no-install` (`init` writes the app and skips
`pnpm install`), `--json` (`check` prints its report as JSON).

`add` writes `polymorph.json` first. It lists every path the install will write and the hash of
its contents, so `diff` and `update` can tell your edit from an upstream change. `add` then copies
the files, generates `polymorph.eslint.js` and `polymorph.stylelint.js`, and patches your
`package.json` (`@polymorph/rules` into `devDependencies`) and lint configs to use them. A theme
install also compiles every installed pairing to CSS (`<dir>/themes/theme.css`, and one sheet per
other pairing under `<dir>/themes/pairings/`).
It generates `<dir>/themes/index.ts`, which uses only `@polymorph/engine/runtime` and exports
`installThemes()` and an async `ensurePairing()`. It patches `index.html` (the pre-paint script)
and the app entry (a call to `installThemes()`). The application never derives a theme, and any
bundler can serve the result. After editing a vendored system or palette, run `polymorph update`
to recompile.

## Entry point

`@polymorph/cli` exports its parts as pure functions and plain modules: `planInit` (the new app's
files, as data) with `writeInit` and `installApp`, `planInstall` (takes a registry and a list of
names, returns a description of the install, and never touches the filesystem), `applyPlan`, `diffInstall`, `updateInstall`, the manifest reader and writer, the
generated-file emitters and the config patches. The MCP server's `get_install_plan` tool calls
`planInstall`, and its `install` tool calls `applyPlan` on that plan. An agent and the CLI
therefore always produce the same install.

The CLI is a **thin front** over `@polymorph/registry`. The file closure, the version ranges, the
fonts and the pre-paint script all come from the registry. The package never opens the
vocabulary's source, reads `design/`, or links the TypeScript compiler. Compiling a theme runs
`@polymorph/theme`'s `admitTheme` over the system and palette files the registry names. These are
the same files the install copies. `check` runs `@polymorph/rules`' `verify` over the consumer's
own files, as the MCP server's `validate` does, and loads it only when `check` runs.

## Tests

In the `logic` vitest project:

```sh
pnpm exec vitest run packages/cli
```

- `src/plan.test.ts`, `src/install.test.ts`, `src/patch.test.ts`, `src/theme.test.ts` — the plan,
  installs into temporary directories, the idempotent config patches, and the `theme` verbs.
- `src/init.test.ts` — `init`'s plan, the directories it refuses, and the command's output.
- `src/vue.test.ts`, `src/frameworks.test.ts` (Svelte and Solid), `src/angular.test.ts` — `init
  --framework` and `add --framework` for each framework but React: the files `init` writes pass
  that framework's compiler and the red rules, and `add` plans and writes that framework's members.
- `src/check.test.ts` — `check` over temporary apps: what it reads and leaves out, the framework
  each file is read in, what it refuses, its output and its exit code.
- `src/thin-front.test.ts` — the package never reaches into the vocabulary, `design/` or the
  TypeScript compiler.
- `scratch.test.ts` — the end-to-end check. It builds `@polymorph/engine`, `@polymorph/react` and
  `@polymorph/rules`, creates a scratch Vite app outside the workspace, and installs members, a
  theme and a palette into it. It builds the
  app with the theme's real fonts and lints it, so a seeded violation fails under the installed
  rules. It audits the built page for accessibility and for overflow at phone width. Then it
  changes the vocabulary upstream and checks that `update` takes the change and keeps the app's
  own edits.
- `init.test.ts` — `init`'s end-to-end check. It runs the bin with `--no-install` into a directory
  outside the workspace, builds `@polymorph/engine`, `@polymorph/react`, `@polymorph/rules` and
  `@polymorph/react-ui`, installs them from their builds, and checks that the new app
  typechecks, builds with its theme and fonts, and lints clean under the red rules.
  `consumer-app.ts` assembles both apps' `node_modules`.

## Read more

- [docs/tooling.md](../../docs/tooling.md) — every item form, each step of `add`,
  `polymorph.json`, `diff`, `update` and `theme`
- [docs/consuming.md](../../docs/consuming.md) — vendoring versus linking, end to end
- [docs/rules.md](../../docs/rules.md) — the rules an install carries
