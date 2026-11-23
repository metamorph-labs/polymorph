# @polymorph/screen

Screens a model writes and a host draws at run time.

An agent inside a running product (a chat, a copilot panel, a tool result) writes a small
document, and the host draws it at once, as interactive UI in the host's own theme. The document is
a `polymorph-screen/1` screen spec: the same format `pnpm emit` turns into source for any framework
or platform, drawn here without a build. It names members of the vocabulary, their props and the
inputs they bind to. It has no field for a style and no expression language, so nothing in it runs.

This package is what every run-time renderer shares. It has no framework, no DOM and no
dependencies, and runs in a page, a worker and a server alike.

| Import                         | What it is                                                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@polymorph/screen/vocabulary` | `VOCABULARY`: the members, their props, parts and lawful cells, generated from the registry of the release you install.                                     |
| `@polymorph/screen/check`      | `checkScreen(document, { framework?, members? })`: the spec validator's faults, plus a member the host does not allow and an address a screen may not hold. |
| `@polymorph/screen/partial`    | `parsePartial(text)`: the document a model's answer holds so far, for drawing while it streams.                                                             |
| `@polymorph/screen/walk`       | `createScreen(options)`: the document, the host's data and the vocabulary, resolved into what a renderer draws, with actions, controlled values and faults. |
| `@polymorph/screen/card`       | `runtimeCard({ framework?, members? })`: the text a host puts in the model's system prompt.                                                                 |

The root re-exports all of it. Import a subpath to load only what it needs: `parsePartial` loads
no vocabulary, and the walk loads neither the vocabulary table nor the card.

## Drawing a screen

A host draws with a renderer, and every renderer draws from `createScreen`, so a document
behaves the same in each of them:

- a data input is filled from the host's `data` by name, and is empty when the host has no value;
- an input whose type is a function that returns nothing is an action: the host is told
  `{ name, args, values }` when a member calls it, and the member waits on a promise the host
  returns;
- an input whose type is a function that returns a value is a question a member asks while it
  draws (a row's key): it is answered by its return type, and the host is never told;
- a control keeps what the reader chose, and its value is in `values` under its `name` (see
  below);
- a component is drawn only if the vocabulary has it and the host allows it (`members`), a prop
  only if the member takes it, a callback only if it is a function, and an object only as the
  format writes one (`{ "$object": … }`);
- an address (a prop or a field named `href`, `src` or `avatar`) is passed only as text that is
  relative or `http:`, `https:`, `mailto:` or `tel:`, or a flat list of such text, from the
  document or from the host's data a binding puts there. Data nested inside an object the host
  binds whole is the host's responsibility: the walk passes it as the host gave it;
- a document nests at most `MAX_DEPTH` (128) objects and lists: `parsePartial` stops reading
  deeper text with an `error`, `checkScreen` reports a fault, and the walk draws nothing deeper,
  so no document makes any of them throw;
- a member that hosts another library's code (`ThirdParty`) is drawn only where the host names it;
- a node that cannot be drawn is drawn as nothing and reported with its path. Each fault is told
  to `onFault` once in a drawing, by its path and message; a drawing begins when the screen is
  made and again when a stream begins;
- while a document streams, an element is drawn once every prop it requires is written and the
  text (`parsePartial`'s `cut`) has moved past its plain props, so a member is never drawn without
  a prop it requires nor with a half-written value, and a page is drawn while the elements in its
  props and its children are still being written; a prop written later arrives when it is whole.

### The values of named controls

`values`, and the `values` of each action, hold each control that has a `name`, as JSON, by that
name. A control's value is what the reader sees in it:

1. what the reader chose, until the document or the host gives the control another value, or the
   control at that place becomes another component or takes another name;
2. else the value the document or the host gives it (`value`, or a checkbox's `checked`);
3. else its default (`defaultValue`, `defaultChecked`);
4. else the empty value of its type: `null` where the type admits it (a Select with nothing
   chosen, an empty NumberInput or DatePicker), `[]` for a list (MultiSelect, CheckboxGroup),
   `false` for a checkbox or a switch, and `""` for text.

A control whose type has none of these is left out until it has a value; every control the
vocabulary has today has one. A value that is not JSON is reduced to JSON: a date or a time to its
ISO text. What the reader chose in a control the document gives no value is passed back to the
member as its default, so a member drawn again, such as a field in a dialog that opens again,
shows what `values` holds. A renderer keys each node by `key`, which holds a named control's
name, so a control drawn under another name is drawn afresh.

Two controls with one name are a fault, and `values` holds the last of them in document order. A
control named `__proto__`, `constructor` or `prototype` is a fault, and is left out of `values`,
as a host that copies `values` into an object with `Object.assign` would set that object's
prototype.

## Asking a model for a screen

```ts
import { runtimeCard } from '@polymorph/screen/card'
import { checkScreen } from '@polymorph/screen/check'
import { parsePartial } from '@polymorph/screen/partial'

const members = ['Stack', 'Card', 'Text', 'Button', 'Input', 'FormField']
const system = runtimeCard({ members })
// … stream the model's answer into `text` …
const { document, complete } = parsePartial(text)
if (complete) console.log(checkScreen(document, { members }).faults)
```

The card lists only the members the host allows, each with its props and their types, and ends
with the output contract, so the model needs no tool call.
