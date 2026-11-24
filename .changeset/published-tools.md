---
'@polymorph/tools': patch
---

**The CLI and the MCP server as one package, with no checkout: `@metamorph-labs/polymorph`.** It
carries both, the registry of its release and every file an install copies, so
`npx -y @metamorph-labs/polymorph@<range> <verb>` runs `init`, `add`, `diff`, `update`, `theme`
and `check` in any repository, and `polymorph mcp` (or the `polymorph-mcp` bin) starts the MCP
server there. `render_screen` draws in the page the package ships and builds nothing. Playwright is
an optional dependency, and the tool names the command that downloads its browser when it is
missing. Run it by this scoped name: the unscoped `polymorph` on npm is another package.
