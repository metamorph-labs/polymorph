---
'@polymorph/cli': patch
'@polymorph/tools': patch
---

**`polymorph agents` writes the files a coding agent reads in a project, and `init` writes the
same ones.** A marked block in `AGENTS.md` (created when absent, and the rest of an existing file
kept), a `CLAUDE.md` that includes it, the polymorph skills in the Agent Skills format
(`polymorph-screen`, `polymorph-rules`, `polymorph-setup`, `polymorph-theme`) in
`.claude/skills/` and `.agents/skills/`, the MCP server's entry for Claude Code (`.mcp.json`,
merged with the servers already there), Cursor (`.cursor/mcp.json`) and Codex
(`.codex/config.toml`, which Codex reads in a trusted project; the output prints the
`codex mcp add` command for every other project), and the system card. `--harness` takes
`claude`, `codex`, `cursor`, `generic` or `all`; with none it writes for the three most projects use,
or the ones it wrote before.

`polymorph/agents.json` records what it wrote. Run it again after an upgrade: a file nobody edited
is brought up to the new release, an edited one is kept and named, `--force` replaces it, and
`--dry-run` writes nothing. `--remove <harness>` stops writing for a harness and removes the files
only it reads. A file with CRLF line endings compares as the text it holds, and an older release
refuses to write over files a newer one wrote. The texts say the project's lint runs the red
rules only when its ESLint config loads them, and give `check src` either way. Every command the texts name is the tools' own, at the release that
wrote them: `npx -y @metamorph-labs/polymorph@^<version> <verb>` from the published tools, the
checkout's bin from a checkout.

An app `init` writes now holds the skills, the Cursor and Codex entries and the record too, and
its `AGENTS.md` is the short block, which names the app's own package manager's lint command. An
app written by an earlier `init` keeps its `AGENTS.md` text above the new block; its card and
`.mcp.json` were not written by `agents`, so `polymorph agents --force` once replaces them.

For a caller of the functions: `InitPrograms` takes an optional `polymorph`, the CLI as the
texts name it, and `planInit` an optional `manager`. `FrameworkApp` no longer has `agents`.
