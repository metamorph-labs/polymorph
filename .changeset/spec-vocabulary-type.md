---
'@polymorph/spec': patch
---

**`validateSpec` takes any vocabulary that holds what it reads.** Its first parameter is typed
`SpecVocabulary`: the members, the exception primitives and the icon roles, with the fields the
validator reads of each (`SpecMember`, `SpecPrimitive`, `SpecProp`, `SpecPlatformEntry`,
`SpecFrameworkEntry`). The registry is one. The run-time core's vocabulary table is another, so
`checkScreen` in `@polymorph/screen` gives a page the registry's faults with no registry in it. A
caller that passes a `Registry` changes nothing.

`isActionType`, the rule that reads a type as a callback, is also exported from a new subpath,
`@polymorph/spec/action-type`, which loads no validator. `@polymorph/spec/validate` still exports
it.
