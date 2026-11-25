# Coding agents and their harnesses

A coding agent runs inside a harness: Claude Code, Codex, Cursor, or another that reads an
`AGENTS.md` and runs commands in a shell. A harness learns polymorph three ways:

- an instruction file it loads in every session (`AGENTS.md`, and `CLAUDE.md`, which includes it);
- skills, in the Agent Skills format, that it loads when a task matches one;
- tools: the CLI through a shell, and the MCP server.

All three are written from one description, `planAgents` in `packages/cli/src/agents.ts` with the
skill texts in `packages/cli/src/skills.ts`. `polymorph agents` writes them into a project,
`polymorph init` writes them into a new app, and `pnpm agents` writes the plugin in
`plugins/polymorph/` from the same texts. So the three say the same thing at the same release.

This guide says what each harness reads and how to set it up. [listing.md](listing.md) covers the
directories the plugin and the server are listed in.

## What `polymorph agents` writes

```sh
npx -y @metamorph-labs/polymorph@latest agents
npx -y @metamorph-labs/polymorph@latest agents --harness claude,codex --dry-run
```

| File | Read by | What it holds |
| --- | --- | --- |
| `AGENTS.md` | Codex, Cursor and most other harnesses; Claude Code through `CLAUDE.md` | A block between `<!-- polymorph:start: … -->` and `<!-- polymorph:end -->`: what the app is built with, what application code may not contain, the ladder, the commands for the card, a member, `validate` and `render`, and where the skills are. The rest of the file is the project's |
| `CLAUDE.md` | Claude Code | The line `@AGENTS.md`. A `CLAUDE.md` that exists keeps its text, and the line is added at its end |
| `.claude/skills/<skill>/` | Claude Code | The four skills |
| `.agents/skills/<skill>/` | Codex, Cursor and the other harnesses of the shared format | The same four skills |
| `.mcp.json` | Claude Code | The `polymorph` server, run with `--project .`, beside the servers already there |
| `.cursor/mcp.json` | Cursor | The `polymorph` server as a `stdio` entry, run with `--project ${workspaceFolder}` |
| `.codex/config.toml` | Codex, in a project it trusts | A block holding `[mcp_servers.polymorph]` |
| `polymorph/system-card.md` | Every harness, through `AGENTS.md` | The card for the project's framework, as `polymorph init` writes it |
| `polymorph/agents.json` | `polymorph agents` | The hash of each part it wrote |

The skills are `polymorph-screen` (build or change a screen: the card, the members, a spec or code,
`validate`, `fix`, `emit`, `render`), `polymorph-rules` (a red-rule violation, rung by rung up the
exception ladder), `polymorph-setup` (a new app, the packages and vendoring routes, the agent files)
and `polymorph-theme` (the two theme documents, `axes`, `theme propose`, `theme validate`). Each
names the CLI command it runs. The ladder's rungs and the application rules in `polymorph-rules`
are read from the registry. The skills keep no copy of the card: `card` answers for the release the
command names, and a copy in a skill would fall behind the release a project installs.

`--harness` takes `claude`, `codex`, `cursor`, `generic` or `all`, comma-separated. With none, a
project gets `claude`, `codex` and `cursor`, or the ones it was set up for before. A harness named
is added to the ones written before, so a rerun never drops a harness's files. `--framework` names
the framework the texts and the card are for. Without it, it is the one written before, else the
one `polymorph.json` records, else the first whose vocabulary `package.json` depends on, else
React. The always-loaded text names the project's lint command when `package.json` has a `lint`
script, run by the package manager its lockfile names.

Every command the texts name runs the tools that wrote them: from the published tools,
`npx -y @metamorph-labs/polymorph@^<version> <verb>`, which resolves the copy a project lists as a
dev dependency and downloads the release otherwise; from a checkout, that checkout's bin by its
path on that machine.

### Running it again

The one way to bring the agent files to a new release is to run `agents` again with that release's
tools. `polymorph update` copies vendored members and leaves the agent files alone.

- A part nobody edited since it was written is brought up to date.
- A part that already says what the release says is left as it is, so a rerun writes nothing.
- A part someone edited, or one `agents` did not write, is kept and named in the output.
  `--force` replaces it. A part is a whole skill file, the block in `AGENTS.md` or
  `.codex/config.toml`, the `polymorph` entry of an MCP config, or the line in `CLAUDE.md`.
- A file a release no longer writes is removed if nobody edited it, with its empty directories.
- `--dry-run` prints the same report and writes nothing.

An app written by an earlier `polymorph init` has an `AGENTS.md` with no block, a card and an
`.mcp.json` that `agents` did not record. The first run adds the block below the old text, which
can then be deleted, and keeps the card and the server entry as not its own. Running
`polymorph agents --force` once replaces those two.

`agents` writes nothing outside the project: a path a link carries out of it is refused, and so is
a record that names one. Like `add`, it refuses to write inside a checkout of polymorph, and plans
there with `--dry-run`.

## Claude Code

Claude Code reads `CLAUDE.md`, the skills in `.claude/skills/` and a project's `.mcp.json`. It asks
before it starts a server from a project's `.mcp.json`.

**In a project**, `polymorph agents --harness claude` writes those three. The skills appear in the
`/` menu by name.

**As a plugin**, with no files in the project:

```sh
claude plugin marketplace add metamorph-labs/polymorph
claude plugin install polymorph@metamorph-labs
```

The plugin's skills run as `/polymorph:polymorph-screen` and the others. Its server starts with
`--read-only`, because a plugin's server is not started in a known project: it reads the
vocabulary, validates, draws screens and proposes themes, and the skills write through the CLI.
The plugin's manifest carries the fields Anthropic's directory lists it with (`displayName`, `icon`
and the four links). Claude Code accepts them from v2.1.281 on. An earlier release warns about each
one, and an early one such as v2.1.92 refuses the manifest, so the plugin needs a current Claude
Code. A project set up with
`agents` and the plugin installed has each skill twice, once by its own name and once under
`polymorph:`.

## Codex

Codex reads `AGENTS.md` from the project root down to the working directory, skills in
`.agents/skills/` from the working directory up to the repository root, and MCP servers from
`~/.codex/config.toml`, and from a project's `.codex/config.toml` when it trusts the project.

**In a project**, `polymorph agents --harness codex` writes the block, the skills and the
`.codex/config.toml` block, and prints the command that adds the server for every project instead:

```sh
codex mcp add polymorph -- npx -y @metamorph-labs/polymorph@^<version> mcp
```

**As a plugin**: `codex plugin marketplace add metamorph-labs/polymorph` adds the marketplace in
`.agents/plugins/marketplace.json`, and Polymorph is then installed from `/plugins`. The plugin is
read through its portable manifest, `plugins/polymorph/plugin.json`, with its server in
`plugins/polymorph/mcp.json`, read-only as in Claude Code.

## Cursor

Cursor reads `AGENTS.md`, skills in `.agents/skills/` (and in `.claude/skills/` and
`.codex/skills/`), and a project's `.cursor/mcp.json`. `polymorph agents --harness cursor` writes
the block, the skills and `.cursor/mcp.json`. A project set up for Claude Code as well holds each
skill in two directories Cursor reads, and Cursor lists both.

## Any other harness

A harness that reads `AGENTS.md` and runs a shell needs nothing more: every MCP tool is also a CLI
verb ([tooling.md](tooling.md#the-verbs-that-ask-the-mcp-tools)). `polymorph agents --harness
generic` writes the block and the skills in `.agents/skills/`, which the harnesses of the shared
format read. A client that takes an MCP server runs `npx -y @metamorph-labs/polymorph@^<version>
mcp --project <the project's path>`.

The open `skills` CLI installs the four skills into any of the harnesses it knows:

```sh
npx skills add metamorph-labs/polymorph
```

It finds them through `.claude-plugin/marketplace.json`, in the plugin's `skills/` directory, so
the repository holds one copy. Those skills name the release the plugin is pinned to.

## The MCP entry on Windows

Every MCP entry runs `npx` as its command. A committed config is shared by everyone who clones the
project, so an entry that named `cmd /c npx` would break on macOS and Linux, and one written
differently on each machine would change with whoever ran `agents` last. The entries therefore name
`npx`, and the always-loaded text says the one change a client on native Windows may need: the
command `cmd` with the arguments `/c`, `npx`, and the entry's own arguments after them. Claude
Code's MCP guide gives `npx` as the command with no Windows form.

## The first start

`npx` resolves the tools from the project's `node_modules` when the project lists them, as an app
`init` writes does, and starts at once. Elsewhere it downloads the package and its dependencies the
first time, which can take longer than a client waits for a server to start: a page with no build,
which has no `package.json`, a project that does not list the tools, and the plugin. Run the
command once before a client starts the server, so the download is done:

```sh
npx -y @metamorph-labs/polymorph@^<version> --help
```

Claude Code also waits longer for a server when `MCP_TIMEOUT` is set, in milliseconds.

## How to check it works

- `polymorph agents --dry-run` reports every part as unchanged once the files are current.
- `npx -y @metamorph-labs/polymorph@^<version> card` prints the card from the shell, as each skill
  does first.
- Claude Code's `/mcp` and Codex's `/mcp` list the `polymorph` server, and Codex's `/skills` lists
  the skills.

## Where the texts are held

`packages/cli/src/agents.test.ts` holds every command the texts and the plugin name to the verb
list (the verb, its flags and their values, its arguments, and the systems, palettes, frameworks
and members they name), each skill to the Agent Skills format, and `polymorph agents` to what this
guide says it does. `packages/cli/src/plugin.test.ts` holds the plugin to what `pnpm agents` writes
and to each directory's limits. [verification.md](verification.md) lists both.
