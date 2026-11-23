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

- a data input is filled from the host's `data` by name, and is empty when the host has no value.
  An input whose type is longer than `MAX_TYPE_LENGTH` (500 characters) is a fault, and is data
  with no value;
- an input whose type is a function is a callback, and what a member is handed for it is decided
  by the prop or the field it is bound to, as a member calls a prop by the prop's type. Where that
  prop's type is a function that returns nothing, it is an action: the host is told
  `{ name, args, values, changed }` when the member calls it, and the member waits on a promise
  the host returns. Where it is a function that returns a value, it is a question the member asks
  while it draws (a row's key, a page's label): a stub answers by that type, and the host is never
  told. Anywhere else (a text, a child, data, a field of an object type the vocabulary does not
  name), the binding is a fault and nothing is passed;
- a function in the host's `data` is never handed to a member as itself: a binding whose value is
  a function is a fault, wherever it is bound. Functions inside an object or a list the host binds
  whole (a column's `cell`) are the host's, and are passed as the host gave them;
- a control keeps what the reader chose, and its value is in `values` under its `name` (see
  below);
- a component is drawn only if the vocabulary has it and the host allows it (`members`), a prop
  only if the member takes it, a callback only if it is a function, and an object only as the
  format writes one (`{ "$object": … }`);
- an element in a structured object is drawn only where the field's data type takes a node (an
  empty state's `action`). One in a field the type does not declare, or declares as data, is a
  fault and is not drawn, so it holds no value in `values`. In an object whose type the vocabulary
  does not name (a row of the host's own type, a type written out in full), it is drawn;
- an address (a prop or a field named `href`, `src` or `avatar`) is passed only as text that is
  relative or `http:`, `https:`, `mailto:` or `tel:`, or a flat list of such text, from the
  document or from the host's data a binding puts there. Data nested inside an object the host
  binds whole is the host's responsibility: the walk passes it as the host gave it;
- a document nests at most `MAX_DEPTH` (128) objects and lists: `parsePartial` stops reading
  deeper text with an `error`, `checkScreen` reports a fault, and the walk draws nothing deeper.
  An action's `args` and a control's value are reduced to at most `MAX_JSON_VALUES` (100,000)
  values, which bounds host data that shares one object at many levels. No text and no value
  makes `parsePartial`, `checkScreen`, `createScreen` or `update` throw, and each takes time in
  proportion to what it reads;
- a member that hosts another library's code (`ThirdParty`) is drawn only where the host names it;
- a node that cannot be drawn is drawn as nothing and reported with its path. Each fault is told
  to `onFault` once in a drawing, by its path and message. A drawing begins when the screen is
  made, when a stream begins, and when the host gives a whole document, not streaming, that
  differs from the one drawn; a stream's chunks and new `data` are the same drawing;
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

Two controls with one name are a fault, and `values` holds the last of them in document order:
an element comes before the elements its props hold, those in the order its props are written,
and then its children. That is the order of the text for a document that writes `props` before
`children`, as the card asks. A control named `__proto__`, `constructor` or `prototype` is a
fault, and is left out of `values`, as a host that copies `values` into an object with
`Object.assign` would set that object's prototype.

### What an action is, and is not

`values` is what the controls hold, not the person's word. The document wrote each control's
default and empty value, and chose the action's `name` and what its `args` carry. `changed` names
the controls whose value the person chose; every other value in `values` is the document's or the
host's. A host that acts on an action with consequences (a payment, a deletion, a message sent)
confirms it with the person outside the screen, in its own words, and does not take an action's
name as what the person meant.

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
