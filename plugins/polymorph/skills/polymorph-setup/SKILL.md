---
name: polymorph-setup
description: Add the polymorph design system to a project, or set up the files a coding agent reads to work with it. Use when asked to start a new app with polymorph, add polymorph to an existing React, Vue, Svelte, Solid or Angular app or to an HTML page, vendor polymorph components into a repository, move to a newer polymorph release, or write the AGENTS.md block, skills and MCP configuration for Claude Code, Codex, Cursor or another agent. It tells a new app, the packages route and the vendoring route apart.
---

# Set up polymorph

Polymorph is a design system: a closed vocabulary of interface components for React, Vue, Svelte,
Solid and Angular, and as custom elements for an HTML page with no build, with a theme engine and
lint rules (the red rules) that keep design decisions out of application code. Its tools are one
npm package, `@metamorph-labs/polymorph`, which every command here runs. Always run that scoped
name: the unscoped `polymorph` package on npm is someone else's.

## Which route the repository is on

| You find | The route |
| --- | --- |
| No app yet | A new app: `init` |
| `@polymorph/*` packages in `package.json`, often as npm aliases of `@metamorph-labs/polymorph-*` | Packages: the app installs the vocabulary |
| `polymorph.json` with `files`, and member source under its `dir` (`src/polymorph/`) | Vendoring: the members are copied into the repository as source the team owns |
| `polymorph.json` with `"framework": "elements"` | A page with no build: the elements are copied into a static directory |
| An app with none of these | An existing app without polymorph: vendoring is one command; the packages route is a few manual steps |
| `Package.swift` or an Xcode project with PolymorphUI, a Gradle build with `dev.polymorph` or `com.github.metamorph-labs.polymorph`, or a `pubspec.yaml` that names polymorph_tokens | A native app: the `polymorph-native` skill |

## A new app

```sh
npx -y @metamorph-labs/polymorph@1.0.18 init my-app
npx -y @metamorph-labs/polymorph@1.0.18 init my-app --framework vue
npx -y @metamorph-labs/polymorph@1.0.18 init my-app --system plain --no-install
npx -y @metamorph-labs/polymorph@1.0.18 init my-site --framework elements
```

`init` writes a new Vite app into an empty directory: the packages, a theme from a catalogue system
(`desktop`, `dew`, `flint`, `glassmorphic`, `harbor`, `journal`, `pastel`, `pebble`, `plain`, `pop`, `press`, `terminal`), the red rules wired into ESLint and Stylelint, a first screen written as a spec and
emitted, the agent files (`AGENTS.md`, the skills, the MCP entries) and the system card. Then it
installs the packages with the package manager that ran it. `--framework` takes
`react`, `vue`, `svelte`, `solid`, `angular` or `elements`. `--framework elements` writes a page with no build that loads the elements from copied files, and
installs nothing.

## An existing app: vendoring

```sh
npx -y @metamorph-labs/polymorph@1.0.18 plan button dialog theme:pastel --framework <framework>
npx -y @metamorph-labs/polymorph@1.0.18 add button dialog theme:pastel --framework <framework>
npx -y @metamorph-labs/polymorph@1.0.18 diff
npx -y @metamorph-labs/polymorph@1.0.18 update
```

`<framework>` is the app's framework: the one `polymorph.json` records, or, in an app with no
`polymorph.json` yet, the one its `package.json` depends on (`vue` for a Vue app). Name it on
every `plan` and `add`. The first `add` records the framework in `polymorph.json`, and with no
`--framework` it records `react` and copies React members, whatever the app is written in.

`plan` prints what `add` would copy and install, and writes nothing. `add` copies the members you
name, and every member they need, as source into `src/polymorph/` (`--dir` changes it), installs a
theme (`theme:<system>`, or `palette:<name>` for a palette alone), adds the packages the members
import to `package.json`, and links the red rules into the project's ESLint and Stylelint configs.
Install the new dependencies afterwards with the project's package manager. `polymorph.json`
records each file with a hash of what was written.

`diff` lists the files you have edited and the files that changed upstream. `update` copies again
the files you have not edited and keeps the ones you have; `--force` takes upstream's copy.

## An existing app: packages

The packages route installs `@polymorph/engine`, the framework's foundation and vocabulary, and
`@polymorph/rules` as npm aliases of their published names, adds the theme plugin to
`vite.config`, and spreads the red rules into the lint configs.
[references/packages.md](references/packages.md) has each step with the exact lines. `init` writes
the same files for a new app, so an app it wrote is a working example.

## The agent's files

```sh
npx -y @metamorph-labs/polymorph@1.0.18 agents
npx -y @metamorph-labs/polymorph@1.0.18 agents --harness claude,codex
npx -y @metamorph-labs/polymorph@1.0.18 agents --dry-run
```

`agents` writes what a coding agent reads in this repository: a marked block in `AGENTS.md` (and a
`CLAUDE.md` that includes it), these skills in `.claude/skills/` and `.agents/skills/`, the MCP
server's entry for each harness (`.mcp.json`, `.cursor/mcp.json`, `.codex/config.toml`), and the
system card in `polymorph/system-card.md`. `--harness` takes `claude`, `codex`, `cursor`,
`generic` or `all`. It records what it wrote in `polymorph/agents.json`. Run it again at any
time: a file it wrote and nobody edited is brought up to date, a file someone edited is kept and
named, and text outside its block in `AGENTS.md` and other servers in an MCP config are left as
they are. `--force` overwrites edited files. `--remove <harness>` stops writing for a harness
and removes the files only it reads that nobody edited. An older release refuses to write over a
newer one's files.

Each MCP entry runs `npx -y @metamorph-labs/polymorph@1.0.18 mcp --project <path>`, which starts the server over stdio for the
harness's client. Run it by hand only to see that it starts. With `--read-only` in place of the
project it offers no tool that writes a file.

## Moving to a newer release

Every command in this skill names the release it runs. To move to a newer one, run the same
commands with the newer version in place of this one's. In every project, `agents` rewrites the
agent files and the card for that release. In a vendoring project, `update` copies the new
members. In a packages project, raise the ranges of the `@polymorph/*` aliases and of
`@metamorph-labs/polymorph` in `package.json`, and install.

## Check the setup

```sh
npx -y @metamorph-labs/polymorph@1.0.18 check src
npx -y @metamorph-labs/polymorph@1.0.18 card --framework <framework>
```

`check` runs the red rules over a directory with no lint config and exits 1 on any violation. The
card should list the members the app uses.
