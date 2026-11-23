---
'@polymorph/registry': patch
---

**The registry lists the data types the members' props take, and builds what the run-time core
reads.** The system card does not change.

- `registry.json` has `dataTypes`: every named data type a member's props take (an option, a
  column, a stat, a menu entry), its parts' and the exception primitives' included, read through
  the TypeScript checker and sorted by name. Each has its type parameters and its fields, typed as
  a prop's type is printed, or the named types it is a union of. `Registry` gains `dataTypes` as a
  required field, so a `Registry` a test builds by hand needs it.
- `pnpm registry` also writes `packages/screen/src/vocabulary.gen.ts`, the vocabulary table
  `@polymorph/screen` checks and draws a screen with. It is gitignored, as `registry/` is.
- `@polymorph/registry/screen-table` (the table's compact form, and its expansion) and
  `@polymorph/registry/runtime-card` (the members section of the run-time card a host puts in a
  model's prompt) are new subpaths. Neither imports the registry's builder or a Node built-in.
- `controlledProps(props)` in `@polymorph/registry/frameworks` reads a member's controlled props
  (`value` with `onChange`, `open` with `onOpenChange`). The elements' generator and the run-time
  walk read them by this one rule.
