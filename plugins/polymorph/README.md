# Polymorph for coding agents

Polymorph is an open-source design system: one closed vocabulary of interface components for
React, Vue, Svelte, Solid, Angular and plain HTML, a theme engine, and lint rules (the red rules)
that keep design decisions out of application code. This plugin gives Claude Code and Codex what
they need to build with it in your app: four skills and an MCP server.

<!-- Every file in this directory is written by `pnpm agents` from packages/cli/src/plugin.ts and
     packages/cli/src/skills.ts in the polymorph repository. Edit those, not these. -->

## Skills

- `polymorph-screen`
- `polymorph-rules`
- `polymorph-setup`
- `polymorph-theme`

Each skill is a procedure with the exact commands: building a screen and checking it, answering a
red-rule violation by the exception ladder, adding polymorph to a project, and changing the theme.

## What it runs

The skills and the server run the published tools of release 1.0.17, the npm package
`@metamorph-labs/polymorph`:

```sh
npx -y @metamorph-labs/polymorph@1.0.17 card
npx -y @metamorph-labs/polymorph@1.0.17 mcp --read-only
```

The first run downloads the package and its dependencies from npmjs.com with `npx`, which can
take longer than a client waits for a server to start. Run the first command once with `--help`
to have the package ready; Claude Code also waits longer when `MCP_TIMEOUT` is set, in
milliseconds. A client on native Windows that cannot start `npx` runs it as `cmd /c npx` with
the same arguments. The server starts with `--read-only`: it reads the vocabulary, validates code and screen specs, draws
screens and proposes themes, and writes no file. The skills write through the CLI, in the project
the shell is in. Drawing a screen needs a Chromium that Playwright downloads; when it is missing,
the tools answer with the command that downloads it, and download nothing themselves.

Nothing is sent to Metamorph, and the tools collect nothing. See
[PRIVACY.md](https://github.com/metamorph-labs/polymorph/blob/main/PRIVACY.md) and [TERMS.md](https://github.com/metamorph-labs/polymorph/blob/main/TERMS.md).

## Install

Claude Code:

```sh
claude plugin marketplace add metamorph-labs/polymorph
claude plugin install polymorph@metamorph-labs
```

Codex:

```sh
codex plugin marketplace add metamorph-labs/polymorph
```

Then install Polymorph from the Metamorph Labs marketplace under `/plugins`.

Any harness that reads Agent Skills:

```sh
npx skills add metamorph-labs/polymorph
```

In a project of your own, `npx -y @metamorph-labs/polymorph@1.0.17 agents` writes the same skills, an `AGENTS.md`
block and the MCP entries for Claude Code, Codex and Cursor, with a server that writes into the
project. [docs/harnesses.md](https://github.com/metamorph-labs/polymorph/blob/main/docs/harnesses.md) says what each harness reads.

## Licence

MIT. See [LICENSE](https://github.com/metamorph-labs/polymorph/blob/main/LICENSE).
