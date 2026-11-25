# Privacy

This covers the Polymorph tools: the npm package `@metamorph-labs/polymorph` (its command line and
its MCP server), the plugin in `plugins/polymorph/`, and the files `polymorph agents` and
`polymorph init` write for a coding agent.

The tools run on your computer. They collect nothing, send nothing to Metamorph, Inc. or to anyone
else, and hold no telemetry or analytics.

- They read and write files in the project you run them in, and read the files the package ships.
- They make no network request of their own. The page `render` draws a screen in is served from
  memory, and the browser it runs in is refused every other address.
- The requests that do happen are ones you start: your package manager downloading the package
  when `npx` runs it, `polymorph init` installing a new app's packages from npmjs.com or GitHub
  Packages, and Playwright downloading Chromium when you run the command `render` gives you.
- When `polymorph init` installs from GitHub Packages, it reads a token from `NODE_AUTH_TOKEN` or
  the GitHub CLI and passes it to the package manager's environment. It writes no token to disk.
- The coding agent you use the tools with (Claude Code, Codex, Cursor or another) is a separate
  product with its own privacy policy, which governs what it sends to its provider.

Questions go to https://github.com/metamorph-labs/polymorph/issues.
