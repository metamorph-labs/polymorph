---
'@polymorph/spec': patch
---

`emitCommand` is `pnpm emit` as a function: the arguments, the registry and the tree that holds the
native member packages in, an exit code out. The checkout's `bin/emit.js` and the published tools'
emitter both run it, so the two refuse and write alike.
