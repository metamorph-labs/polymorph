# The screen spec: `polymorph-screen/1`

A screen spec is a JSON document that describes one screen: which members it composes, the value of
each prop, and the inputs its content is bound to. It has no field for a style and no expression
language. `validate` checks it against the vocabulary, and `emit` compiles it for the app's
framework.

```json
{
  "spec": "polymorph-screen/1",
  "name": "KeysView",
  "purpose": "The API keys an integration uses, with a way to make another.",
  "inputs": [
    { "name": "count", "type": "string", "doc": "How many keys exist, already formatted." },
    { "name": "onCreate", "type": "() => void" }
  ],
  "root": {
    "component": "Stack",
    "props": { "gap": 5 },
    "children": [
      { "component": "Heading", "children": ["API keys"] },
      { "component": "Text", "props": { "tone": "secondary" }, "children": [{ "$": "count" }] },
      {
        "component": "Button",
        "props": { "variant": "solid", "tone": "accent", "label": "Create key", "onClick": { "$": "onCreate" } }
      }
    ]
  }
}
```

## Fields

| Field | Meaning |
| --- | --- |
| `spec` | Always `polymorph-screen/1`. |
| `name` | PascalCase: the name of the component `emit` writes. |
| `purpose` | One sentence. It becomes the emitted file's doc comment. |
| `inputs` | What the screen is handed: `{ "name", "type", "doc"? }`. `type` is one TypeScript type, such as `string`, `Ticket[]` or `(id: string) => void`. Every binding names one of these, a callback included. |
| `types` | Optional. A module mapped to the type names the inputs use, emitted as `import type` lines. |
| `root` | One element: the screen's tree. Write it last. |

## Elements and values

An element is `{ "component", "props"?, "children"?, "exception"? }`. `component` is a member or
one of its parts (such as `Table.Row`), as the card lists them for the
app's framework.

A value, as a prop or a child, is a string, a number, a boolean, `null`, an element, a list, a
binding `{ "$": "inputName" }`, or a structured object `{ "$object": { … } }` for data a prop
takes.

A binding names a declared input, or a dotted path into one (`draft.subject`). It is never an
expression: no call, operator or index. A value the screen needs computed, such as a count or a
filtered list, is computed by the container and passed in as an input of its own.

A spec has no condition. Every element is rendered whenever the screen is. Content that is
sometimes absent is a prop bound to an input that is empty while there is nothing to show, on a
member that draws nothing when it is given nothing.

## Exceptions

An element may declare a rung of the exception ladder (rungs 2 and 4 on a
primitive, and rung 3 as a `patch` prop) with the reason:

```json
{
  "component": "DensityScope",
  "props": { "value": "compact" },
  "exception": { "rung": 2, "because": "A queue is scanned, so more rows per screen is worth more here." },
  "children": []
}
```

## The loop

1. Write the spec from the card and the members `component` describes.
2. `validate` it. Each fault names its path and, for a wrong name, the nearest real ones.
3. Correct and validate again until it is lawful.
4. `render` it and read the pictures and the layout faults. Correct the composition and render
   again.
5. `emit` it into the app, and write or update the container that renders it.
