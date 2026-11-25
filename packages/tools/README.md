# @metamorph-labs/polymorph

The command line and the MCP server of [Polymorph](https://github.com/metamorph-labs/polymorph), a
design system in which application code composes a closed set of components and lint rules stop it
from making design decisions. This one package writes a new app, copies components into an app you
have, checks an app's code against the rules, and gives a coding agent the whole system as tools.
It needs no checkout of the repository: the registry and every file an install copies ship inside
it.

Run it with `npx`, always by this scoped name. The unscoped `polymorph` on npm is another package.

## Three commands

```sh
npx -y @metamorph-labs/polymorph@latest init my-app      # a new app: React, or --framework vue|svelte|solid|angular|elements
npx -y @metamorph-labs/polymorph@latest add button dialog theme:pastel   # copy members and a theme into this app
npx -y @metamorph-labs/polymorph@latest check src        # the red rules over a directory, with no lint config
```

`init` writes a Vite app that installs the Polymorph packages from npmjs.com, themed, linted, with
a first screen and an `AGENTS.md` for a coding agent, then installs it with the package manager that
ran the command. `--registry github` installs from GitHub Packages instead, which needs a token.
`--no-install` writes the app and stops. `--dry-run` lists the files and writes nothing.

The other commands: `diff` (what you and the release have changed in the copied files), `update`
(copy the release's changes where you have not edited), `theme validate | emit | schema` (check a
system and palette you wrote), and `mcp` (the server, below). `polymorph --help` lists every
verb, and `polymorph <verb> --help` its flags.

## The MCP server

`polymorph mcp` runs the server over stdio, in the repository it is started in. The app `init`
writes is configured already: its `.mcp.json` holds

```json
{
  "mcpServers": {
    "polymorph": {
      "command": "npx",
      "args": ["-y", "@metamorph-labs/polymorph@^<version>", "mcp", "--project", "."]
    }
  }
}
```

and the app lists the package as a dev dependency, so `npx` runs the copy it installed. For another
client or repository, register the same command. `--project <path>` names the repository the write
tools write in, for a client that starts servers elsewhere, and `--read-only` starts a server with
no write tool. The `polymorph-mcp` bin is the same server.

The tools read the vocabulary (`get_system_card`, `search_components`, `get_component`,
`get_install_plan`, `get_theme_axes`), check code and screen specs against the rules (`validate`,
`fix`), propose a theme (`propose_theme`), draw a screen spec in a browser (`render_screen`), and
write into the project (`emit_screen`, `install`, `save_theme`, `fix_file`).

`render_screen` draws with Playwright's Chromium. Playwright is an optional dependency and its
browser is downloaded once: when it is missing, the tool answers with the command that downloads
it, and every other tool works without it.

## Versions

Each release of this package answers for the release of the vocabulary it was published with, and
an app `init` writes pins that release. Node 24 or later.

The full documentation is in the repository: `docs/tooling.md` for the command line and the server,
`docs/consuming.md` for using Polymorph from another repository. MIT licensed.
