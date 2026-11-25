# @polymorph/mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the system as tools
for an agent. While an agent writes code, the server answers questions about polymorph's
**vocabulary** (the closed set of components). It reports when the code is unlawful and which rung
of the exception ladder answers each violation. It also writes the results (a screen, an install, a
theme) into the repository the agent is working on.

It runs over **stdio only**, with no port, no auth and nothing to host. From a checkout it builds
the registry from the checkout that holds it when it starts. It is also published, with the CLI, as
`@metamorph-labs/polymorph` (`packages/tools`), which reads the registry of its release and needs
no checkout.

The tools that only read are marked with `readOnlyHint`. Those that take `framework` (`react`,
`vue`, `svelte`, `solid` or `angular`) answer for that framework's vocabulary, and those that take
`platform` (`web` when omitted, `ios` or `android`) for that platform's members:

| Tool | What it answers |
| --- | --- |
| `search_components` | Members by name, purpose, prop or variant, ranked; an empty query lists the catalogue. `platform` leaves out the members absent there, and `framework` the members with no shell in that framework |
| `get_component` | One member: props with printed types, lawful variant × tone cells, states, `data-*` attributes, dependencies; `source: true` adds the files |
| `get_install_plan` | What `polymorph add <items>` would copy and install, in the framework `framework` names or the project's `polymorph.json` records. Writes nothing. |
| `get_system_card` | The system card: the whole vocabulary, compressed for a context window. Read it first. `platform` renders it for `ios` or `android`, and `framework` for a Vue, Svelte, Solid or Angular app |
| `get_theme_axes` | The design axes, systems, palettes, colour roles and token scales |
| `validate` | Submitted code (TSX, a Vue or Svelte single-file component, an Angular component module or template, or CSS) linted by the same red rules the repository runs, with the ladder rungs for each violation; `framework` says how to read a fragment. Or a screen spec checked against the registry: on the spec's `platform`, and with `framework`, against that framework's vocabulary |
| `fix` | Submitted code with every violation that has exactly one lawful rewrite already rewritten, using the rules' own fixes (the ones `eslint --fix` applies), read in the framework `framework` names as `validate` reads it. Also the remaining violations, which are decisions, each with its ladder rungs. A fix either carries everything on an element across or leaves the element alone. No CSS rule has a fix |
| `propose_theme` | An intent in words ("calmer, more editorial, warmer paper") turned into a candidate system and palette, resolved through the real theme engine, with a verdict |
| `render_screen` | A screen spec drawn in a real browser under a named system and palette, at a phone and a desktop width: the layout faults measured in the page (a sideways scroll, clipped text, a control under the touch-target floor, content cut off) as data, then one PNG for each view. `data` and `empty` fill the spec's inputs. Needs Playwright's Chromium, and says how to install it when it is missing |

Without `framework`, the tools that read code or a spec (`validate`, `fix`, `fix_file` and
`emit_screen`) ask the project the same way, so they read one fragment or spec alike: TSX and a
web spec are Solid's in a project whose package depends on `@polymorph/solid-ui` and not
`@polymorph/react-ui`, and React's otherwise.

The tools that write each write what the matching read tool answered:

| Tool | What it writes | Judged first by |
| --- | --- | --- |
| `emit_screen` | A screen spec compiled to a presentational component: React or Solid TSX (`.tsx`, Solid's with `framework` or in a Solid project), a Vue or Svelte single-file component, or an Angular standalone component (`.ts`), formatted with the project's Prettier config. A spec whose `platform` is `ios` or `android` compiles to SwiftUI (`.swift`) or Compose (`.kt`). Replaces a file only when that file is itself an emitted screen. | `validate`'s spec check, then the red rules over the emitted code (for a native file, the native screen contract's law) |
| `install` | `polymorph add <items>` in the install's framework: the vendored file closure, the install manifest, the packages in `package.json`, the ESLint and Stylelint config that make the red rules run, and for a theme the pre-paint script and the entry import. Keeps any file it did not write, or that the project has edited since. | `get_install_plan`'s planner |
| `save_theme` | A system and a palette as `<dir>/systems/<name>.json` and `<dir>/palettes/<name>.json`. Names an existing file instead of replacing it, unless `overwrite`. | the admission `propose_theme` reports |
| `fix_file` | A source file in the project (TypeScript or JavaScript, a Vue or Svelte component, an Angular template), rewritten in place with `fix`'s fixes and nothing else. Without `framework`, a `.ts` module in a package that uses `@polymorph/angular-ui` is read as an Angular component, its inline template included, and TSX in one that uses `@polymorph/solid-ui` as Solid's. A stylesheet is reported and never rewritten. The answer is counts and the remaining violations, not the code. | the red rules, whose fixes these are |

A write tool refuses anything unlawful, writes nothing when it refuses, and never deletes a file.
One write can stop halfway. `install` vendors and records the source before it edits the
project's lint config. When it cannot make that edit, it reports that the source is on disk, gives
the lines to add, and finishes on a second call. Use a write tool instead of typing the result,
because the tool writes the system's own output (the emitter's bytes, the installer's plan, the
documents the engine admitted) instead of a model's copy of it.

## Seeing a screen

`render_screen` is the one tool that runs a browser. Playwright is an optional dependency, loaded
when the tool is called, so a server without it starts and answers every other tool. Download the
browser once. In a checkout:

```sh
pnpm exec playwright install chromium
```

The published package's server names its own command when the browser is missing
(`npx -y playwright@<version> install chromium`, for the Playwright it loads): the entry point
passes the advice as the context's `browserSetup`.

The screen is drawn by the workbench's screen page (`apps/workbench/src/screen/`), not by this
package. From a checkout, the first call builds that page in memory through
`apps/workbench/screen.build.mjs`, which the bin names, and the page is kept for the life of the
server. The published package ships the page built and names its directory (`screenPage`), so its
server builds nothing. No port is opened and no file is
written. [docs/tooling.md](../../docs/tooling.md#seeing-a-screen-render_screen) has the arguments,
the answer, the faults and what fills a spec's inputs.

## The project

The server has two roots. It reads the vocabulary from the checkout that holds the bin, or from the
published package. It writes
only into the **project**, which is the working directory it was started in, or the path given as
`--project <path>`. An agent working in a repository starts its stdio servers there, and
`--project` is for a client that starts servers somewhere else. A project is a directory with a
`package.json`. The write tools refuse any other directory, and refuse a path that resolves
outside the project, including through a link. `install` also refuses when the project is a
checkout of polymorph.

`--read-only` starts the server with no project. It then registers the read tools and no write
tool. A flag the server does not know stops it with a usage line.

## Running it

```sh
pnpm mcp
```

`pnpm mcp` runs the bin `polymorph-mcp` (`bin/polymorph-mcp.js`) with this repository as the
project. Outside a checkout, register the published package with a client as a stdio server whose
command is `npx -y @metamorph-labs/polymorph@^<version> mcp`; from a checkout, the command is
`node /absolute/path/to/polymorph/packages/mcp/bin/polymorph-mcp.js`.
[docs/tooling.md](../../docs/tooling.md) shows the usual `mcpServers` shape. stdout carries only
protocol messages. Diagnostics go to stderr. `polymorph mcp` starts the same server, with the same
flags, through the same function (`serveStdio`).

Every tool is also a verb of the CLI (`polymorph card`, `validate`, `render`, …), which calls it
in its own process and prints the same answer
([docs/tooling.md](../../docs/tooling.md#the-verbs-that-ask-the-mcp-tools)).

## Entry point

`@polymorph/mcp` exports `createServer(context)`, which returns a server with no transport
attached. It also exports `READ_TOOL_NAMES`, `WRITE_TOOL_NAMES` and `TOOL_NAMES`, and each tool as
a plain function that takes a `{ registry, root, project?, screenBuilder?, screenPage?,
browserSetup? }` context:
`searchComponents`, `getComponent`, `getInstallPlan`, `getSystemCard`, `getThemeAxes`, `validate`,
`fix`, `proposeTheme`, `renderScreen`, `emitScreen`, `install`, `saveTheme`, `fixFile`.
`src/server.ts` holds one table of the tools (`TOOLS`): each name, argument schema, annotations
and the function it calls. `createServer` registers the table and only binds it to the protocol,
so a different transport would bind the same functions.

Two functions use the same table outside a client's session, for an entry point to build:

- `toolCaller(context)` returns `(name, args) => Promise<ToolAnswer>`, which calls one tool by
  name in this process. It checks `args` with the tool's own schema through the SDK's functions,
  and answers as the server does: `{ value, images, isError }`, the JSON value (or the text of the
  system card, or a refusal's sentence), each picture as bytes with its media type, and whether it
  is an error. A context with no project has no write tool, as a `--read-only` server has none.
  The CLI's verbs run on it (`cli.tools`).
- `serveStdio(context)` runs the server over stdio and resolves when the client has closed stdin
  and every request has its answer. `bin/polymorph-mcp.js`, `polymorph mcp` (`cli.serve`) and the
  published tools' bins all start the server with it, and all read its flags with `serverFlags`
  (from `@polymorph/cli`, which this package re-exports).

The server is a **thin front** over `@polymorph/registry`. Every answer is a field of the
registry, a projection of one, or a file the registry names. It never reads the vocabulary's
source or `design/` directly. `propose_theme` and `save_theme` run the theme engine
(`@polymorph/theme`), because no catalogue of existing themes can say whether a new pair is
lawful. `render_screen` draws nothing itself: the workbench's page draws and measures, and the
tool checks the request, drives the browser and arranges the answer. The write tools are fronts
too: `emit_screen` calls `@polymorph/spec`'s emitter, and
`install` calls `@polymorph/cli`'s `planInstall` and `applyPlan`. Every write this package makes
itself goes through one function in `src/write.ts`.

## Tests

In the `logic` vitest project:

```sh
pnpm exec vitest run packages/mcp
```

- `src/tools.test.ts` — each read tool as a function, against the real registry.
- `src/write.test.ts` — each write tool as a function, into temporary projects: what it writes,
  and that a refusal leaves the project unchanged.
- `src/render.test.ts` — `render_screen` as a function, in a real Chromium: the pictures, a fault
  in a screen written to have it, how the inputs are filled, and every request it refuses.
- `src/measure.test.ts` — the layout measure the screen page runs, over a page written for each
  fault kind and a lawful page that looks like it.
- `src/vue.test.ts`, `src/frameworks.test.ts` (Svelte and Solid), `src/angular.test.ts` — each
  tool that takes `framework`, asked about that framework.
- `src/server.test.ts` — the protocol wiring over an in-memory transport: each name bound to its
  function and argument schema, and how a refusal reads.
- `src/verbs.test.ts` — the law that every tool is a CLI verb and every verb names a tool that
  exists; that `toolCaller` answers as the server does, refusals included; and every verb run
  through the CLI's `main` with the real caller in a scratch project: `--json` is the tool's
  answer, `validate` prints one line for each violation, `emit` writes the bytes `emit_screen`
  writes, `render` writes its pictures, and `polymorph mcp` answers a session spoken by hand and
  exits when stdin closes.
- `src/violations.test.ts` — every violation `validate` returns carries its fix, its
  alternatives and its message.
- `src/thin-front.test.ts` — the package names no vocabulary or `design/` path, links no
  TypeScript compiler, loads the browser in `src/render.ts` alone and only when its tool is
  called, writes only through `src/write.ts`, deletes nothing, and exposes exactly the tools in
  the two tables above.
- `transcript.test.ts` — spawns the real server over stdio, as a client does, and runs a scripted
  session through every tool with a scratch directory as the project. It checks that `validate`
  returns exactly what ESLint reports for the same input, that a `--read-only` server offers no
  write tool, and that a server with no browser answers `render_screen` with the install command
  and every other tool as before.

## Read more

- [docs/tooling.md](../../docs/tooling.md) — every tool's arguments, and registering the server
- [docs/rules.md](../../docs/rules.md) — the rules `validate` runs, what `fix` rewrites, and the
  ladder both point at
- [docs/theming.md](../../docs/theming.md) — the axes, systems and palettes that `propose_theme`
  adjusts and `save_theme` writes
