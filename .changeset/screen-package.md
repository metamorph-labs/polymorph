---
'@polymorph/screen': patch
---

`@polymorph/screen` is a new package: what a host needs to draw a screen a model writes, at run
time, with no build. The screen is a `polymorph-screen/1` document, the format `pnpm emit` reads.
The package has no framework, no DOM and no dependencies:

- `VOCABULARY` (`@polymorph/screen/vocabulary`): the members, their props, parts and lawful cells,
  generated from the release's registry.
- `checkScreen(document, { framework, members })` (`@polymorph/screen/check`): the spec
  validator's faults, in a page or in Node, with no registry, and the faults the walk adds for
  the document: a member the host does not allow, an address that is not relative or `http:`,
  `https:`, `mailto:` or `tel:` (as text, or a flat list of text), a control's name two controls
  share or every object has, an input type or a key over its length limit, a callback input bound where no
  callback receives it, an element in a structured object's field that takes no node, and a
  document nested too deep to read. `ThirdParty` is allowed only where the host names it in
  `members`.
- `parsePartial(text)` (`@polymorph/screen/partial`): the document a model's streamed answer holds
  so far, prose and a fenced `json` block included.
- `createScreen(options)` (`@polymorph/screen/walk`): what a renderer draws from a document, the
  host's data and the vocabulary, with actions, controls that follow the reader, named values and
  faults. A callback input is handed by the prop or field it is bound to: where that prop's type
  returns nothing, it is an action the host is told of (`{ name, args, values, changed }`); where
  it returns a value, nothing is passed if it may be left out and a stub answers by that type if it
  is required, and the host is never told; anywhere else, the binding is a fault and nothing is
  passed. An element whose required data prop was never written, or was refused, is not drawn,
  with a fault that names the prop; a slot whose element is a fault leaves its page drawn. A
  function in the host's data is never handed to a member as itself. `values` holds what the
  reader sees in each named control, its default or its empty value included, and `changed` names the ones the person chose. An element in a structured
  object is drawn only where the field's data type takes a node, and none at any depth below a
  field that takes data only. Each node's `key` holds a named
  control's name, so a renderer draws a renamed control afresh.
- A document nests at most `MAX_DEPTH` (128) objects and lists, a declared input type is at most
  `MAX_TYPE_LENGTH` (500) characters, a key a document writes is at most `MAX_KEY_LENGTH` (100)
  characters, and a value reduced to JSON holds at most `MAX_JSON_VALUES` (100,000) values.
  `hostile.test.ts` feeds the core documents and host data written to break it (deep nesting, long
  strings, thousands of children, an unclosed fence, cyclic and shared data, input types and keys
  over their limits): none makes it throw, and for each kind it times, the larger of two sizes
  costs less than twenty times the smaller (eight times the size, for most kinds).
- `runtimeCard({ framework, members })` (`@polymorph/screen/card`): the text a host puts in the
  model's system prompt: the members it allows, each with its props' types, the data types those
  props take with their fields, and the output contract.
