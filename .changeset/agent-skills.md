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
