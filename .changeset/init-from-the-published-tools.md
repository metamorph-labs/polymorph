---
'@polymorph/cli': patch
---

**`polymorph init` writes an app that works on any machine when it runs from the published
tools.** Its `.mcp.json` runs `npx -y @metamorph-labs/polymorph@^<version> mcp --project .`, the app
lists the tools as a dev dependency at the release, and its `AGENTS.md` names no path of the
machine that ran `init`. From a checkout both stay as they were.

`--registry npmjs|github` chooses where the app installs the packages from. From the published
tools the default is npmjs.com, which needs no `.npmrc` and no token. From a checkout it stays
GitHub Packages, the registry a release reaches first. The install runs with the package manager
that ran the command (read from `npm_config_user_agent`), or pnpm from a checkout and npm from the
published tools when none can be told; pnpm still installs with `--ignore-workspace`.

For a caller of the functions: `InitPrograms` holds two commands (`{ command, args }`) where it
held two paths, `Cli` takes an `origin` (`'checkout'`, the default, or `'published'`), and
`installApp` takes the registry and the package manager as options. The outcome `no-pnpm` is now
`no-package-manager`.
