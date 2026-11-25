---
'@polymorph/cli': patch
---

Every MCP tool is now a CLI verb, so an agent with a shell and no MCP client can do all an agent
with the server can. `card`, `search`, `component`, `axes` and `plan` look things up;
`validate <file...|->` checks code, or a `.json` screen spec, and prints each violation as
`file:line:column  rule  message` with the lawful answer and the ladder's rungs under it;
`render <spec.json> --system <name>` draws a spec and writes its pictures into `<spec>.render/`;
`fix <file>` rewrites what has one lawful rewrite (`--dry-run`, or `-` for stdin, prints the fixed
code); `emit <spec.json> <out>` compiles a spec into the project; `theme propose "<intent>"`
proposes a theme and `--save` writes it; `mcp` starts the MCP server, with the flags
`polymorph-mcp` takes. Each verb is the tool of the same job and gives the same answer: `--json`
prints exactly the tool's answer, and the exit code is 0 when the answer is clean, 1 when it
reports violations, faults or a refusal, and 2 when the command line cannot be read.
`polymorph <verb> --help` prints a verb's flags, and the help lists every verb in groups.

An entry point that calls `main` supplies the tools as `cli.tools` (`toolCaller` from
`@polymorph/mcp`) and the server as `cli.serve` (`serveStdio`); without them those verbs refuse
with one line. `VERBS` exports the verb list as data. An unknown command now exits 2.
