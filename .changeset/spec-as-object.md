---
'@polymorph/mcp': patch
---

**`validate`, `emit_screen` and `render_screen` take a spec as an object.** `spec` was JSON text
only, so an agent wrote the document inside a JSON string, escaped a second time, and a slip in
that escaping failed the call with `the spec is not JSON` before anything about the screen was
checked. `spec` is now the document itself or its JSON text, and both are read alike.
