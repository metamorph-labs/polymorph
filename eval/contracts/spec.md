## What you hand back

One screen spec: a JSON document in the `polymorph-screen/1` format, in a single fenced `json`
block at the end of your final answer.

A spec is composition only: which members, which prop values, and which inputs they bind to. It
has no field for a style and no expression language. Data and callbacks come from the container
that renders the screen, as declared inputs.

- `spec` is `"polymorph-screen/1"`. `name` is the PascalCase component the emitter writes.
  `purpose` is one sentence.
- `inputs` lists what the screen is handed, as `{ "name", "type", "doc"? }`. `type` is one
  TypeScript type, written into the emitted props interface verbatim.
- `types` (optional) maps a module to the type names the inputs mention: the vocabulary's own
  from `@polymorph/react-ui`, and the screen's domain types from a module of your choosing.
- `root` is an element: `{ "component", "props"?, "children"? }`. `component` is a member or a
  compound part (`Member.Part`).
- A value (a prop value or a child) is a string, a number, a boolean, `null`, an element, a list
  of values, a binding `{ "$": "inputName" }`, or a structured object `{ "$object": { … } }`. A
  binding names a declared input, or a dotted path into one, and is never an expression.
- A spec has no condition: every element in it is rendered whenever the screen is. Content that
  is sometimes absent is a prop bound to an input that is empty while there is nothing to show,
  on a member that draws nothing when it is given nothing: an `Alert` with no title and no
  content, an `ErrorSummary` with an empty `errors`. It is not an element the container builds
  and hands in as an input, because the screen would then hold no member in that place.

`validate` takes the document as JSON text in `spec`. It checks the document against the
registry, emits it as TSX, runs the red rules over that TSX, and returns every fault with its
path and every red-rule violation with the exception-ladder rungs that answer it.

The format's JSON Schema:
