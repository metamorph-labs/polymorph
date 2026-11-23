---
'@polymorph/screen': patch
---

`@polymorph/screen` is a new package: what a host needs to draw a screen a model writes, at run
time, with no build. The screen is a `polymorph-screen/1` document, the format `pnpm emit` reads.
The package has no framework, no DOM and no dependencies:

- `VOCABULARY` (`@polymorph/screen/vocabulary`): the members, their props, parts and lawful cells,
  generated from the release's registry.
- `checkScreen(document, { framework, members })` (`@polymorph/screen/check`): the spec
  validator's faults, in a page or in Node, with no registry, and two more: a member the host does
  not allow, and an address that is not relative or `http:`, `https:`, `mailto:` or `tel:`.
  `ThirdParty` is allowed only where the host names it in `members`.
- `parsePartial(text)` (`@polymorph/screen/partial`): the document a model's streamed answer holds
  so far, prose and a fenced `json` block included.
- `createScreen(options)` (`@polymorph/screen/walk`): what a renderer draws from a document, the
  host's data and the vocabulary, with actions, controls that follow the reader, named values and
  faults. A call of a callback input that returns nothing is an action the host is told of
  (`{ name, args, values }`); one that returns a value is answered by its type and never told.
- `runtimeCard({ framework, members })` (`@polymorph/screen/card`): the text a host puts in the
  model's system prompt: the members it allows, each with its props' types, the data types those
  props take with their fields, and the output contract.
