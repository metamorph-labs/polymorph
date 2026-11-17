---
'@polymorph/spec': patch
'@polymorph/registry': patch
---

**A screen spec's shape faults say what was written, and its schema lists `root` first.**

- A key the format does not have is reported with the fields the object does have:
  `` `optional` is not in the schema — the fields here are `name`, `type` and `doc` ``. The fault
  was `not in the schema`, with the key only in its path.
- A fault inside a nested value is reported where it is. An element with a misspelt field, or a
  binding with a second key, was reported at the outermost child as `expected a string, got a
  object`.
- A plain object where a value goes is reported once, with the three forms an object may take and
  how a plain one is written (`{ "$object": { … } }`).
- The published schema, the docs and the `inputs` description list `root` before `inputs` and
  `types`. A document's own key order stays free. An author who writes one from top to bottom now
  declares each input with the tree's bindings already written, where an input the tree turned
  out to need was bound and never declared.
