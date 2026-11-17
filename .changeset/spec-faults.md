---
'@polymorph/spec': patch
'@polymorph/registry': patch
---

**A screen spec's shape faults say what was written.**

- A key the format does not have is reported with the fields the object does have:
  `` `optional` is not in the schema — the fields here are `name`, `type` and `doc` ``. The fault
  was `not in the schema`, with the key only in its path.
- A fault inside a nested value is reported where it is. An element with a misspelt field, or a
  binding with a second key, was reported at the outermost child as `expected a string, got a
  object`.
- A plain object where a value goes is reported once, with the three forms an object may take and
  how a plain one is written (`{ "$object": { … } }`).
- A prop written as a field of its element, beside `props`, is told that it is a prop of that
  member and that it goes inside `props`.
- A `types` entry written as a default or a namespace import (`default as React`) is told that a
  type is imported by its own name and written bare in the input's type.
- The schema's descriptions say that every binding names a declared input, a function a member
  requires included, that `types` has no default or namespace import, and that an element has no
  field for a note.
