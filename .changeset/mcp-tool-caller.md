---
'@polymorph/mcp': patch
---

The server registers its tools from one table (`TOOLS`), and `toolCaller(context)` calls the same
table by name in the same process: it checks the arguments with the tool's own schema and returns
`{ value, images, isError }`, the answer the server would have sent before encoding it. A context
with no project has no write tool, as a `--read-only` server has none. `serveStdio(context)` runs
the server over stdio and resolves once the client has closed stdin and every request has its
answer; `polymorph-mcp` and `polymorph mcp` both start the server with it.
