---
'@polymorph/tools': patch
---

The skills that `polymorph agents` writes, and that the plugin carries, cover more of the system.
Three skills are new: `polymorph-runtime-screen` (a screen a model writes while the product runs),
`polymorph-agent-bridge` (an agent on the page that reads and operates the members) and
`polymorph-native` (a SwiftUI or Compose screen). `polymorph-screen` gains references for a screen
written in code and its container, a conversation with a model, charts and formatted text.
`polymorph-setup` holds the packages route step by step, and `polymorph-theme` covers the theme
documents, pins, a partner palette and `theme emit`. The block in `AGENTS.md` lists each skill with
the job it is for. Run `polymorph agents` again to take the new files.

`polymorph component <Name>` prints, under `## Types`, the fields of each data type the member's
props name, and the tool `get_component` answers them as `types`: a prop typed `PromptTrigger[]`
can be written from that one reading. `polymorph check` over a directory with no file the red
rules read ends by saying that no file was read. It used to end "No violations.".

`polymorph update` compiles the theme sheets again when a vendored system or palette was edited,
as the generated theme module says it does. It used to answer "nothing to update" while no file
had changed upstream. `polymorph update --force` compiles the sheets from the shipped documents it
puts back. It used to leave the sheet compiled from the edited copy.
