# Run-time screens

A run-time screen is a screen a model writes while your product runs, and your product draws at
once: generated UI, drawn with the vocabulary in your own theme, with no build and no source file.
An agent in a chat, a copilot panel or a tool result answers with a screen spec, the same
`polymorph-screen/1` document `pnpm emit` reads. A renderer draws it while it streams in. What the
person does with it reaches your code as data, and you send that to the model as its next turn.

This page is for the engineer who puts such a screen in a product. It covers when to use one, the
loop a host implements, what the renderers do with a document, what a document cannot do, and
what each package exports.

Terms used on this page:

- **Host**: the product that asks a model for a screen and draws it.
- **Screen spec**: a `polymorph-screen/1` document: the inputs it binds to, and a tree of elements
  that name members, their props and what they hold ([tooling.md](tooling.md#the-screen-spec)).
  "The document" on this page is one screen spec.
- **Run-time card**: the text a host puts in the model's system prompt: the members the host
  allows, with their props, and the output contract, which says what the answer is.
- **Action**: a member's call of a callback input that returns nothing. The host is told
  `{ name, args, values }`.
- **Run-time renderer**, or **renderer** on this page: what draws a document at run time.
  `@polymorph/react/screen` draws it in React, and `<poly-screen>` and
  `@polymorph/elements-ui/screen` draw it as elements.
- **Member**, **vocabulary**, **framework**, **law**: as the [glossary](concepts.md#glossary)
  defines them.

## When to use it

Three parts of polymorph put a model in front of the vocabulary. They differ in when the model
works and in what it produces.

| | Emitting a screen | A run-time screen | The agent bridge |
| --- | --- | --- | --- |
| The model | writes a screen spec while the product is built | writes a screen spec while the product runs | reads and operates the members already on a page |
| What it produces | a source file (`pnpm emit`, the MCP tool `emit_screen`) that a developer commits and builds | a drawing in the person's page | nothing new: it fills, chooses and presses |
| Who sees it first | a developer, in review | the person using the product | the person using the product |
| Read | [tooling.md](tooling.md#the-screen-spec) | this page | [agents.md](agents.md) |

Use a run-time screen when the screen depends on what the person asked, so no developer can write
it in advance: a form the agent needs filled before it acts, a summary of what it found, a choice
between options it computed. Use an emitted screen when the screen is part of the product and is
reviewed, tested and kept. Use the bridge when the screen already exists and the agent works it.

The three share the vocabulary: the same members, props, lawful variant and tone cells and icon
roles, drawn in the host's theme. The first two also share the document format and its validator,
so a document a model wrote at run time is the input `pnpm emit` reads.

## The loop

A host does five things:

1. **Puts the run-time card in the model's system prompt.** The card lists the members the host
   allows, so the model can write a lawful document in one request, with no tool call.
2. **Streams the answer.** The model answers with the document in a fenced `json` block, sometimes
   after a sentence of prose.
3. **Draws the answer while it arrives.** The renderer reads the document out of the text so far
   and draws each element once its props are written.
4. **Sends each action to the model.** A press, a submit or a choice calls an action input of the
   document. The host is told the input's name, the call's arguments and the value of every named
   control, and sends that to the model as the next turn.
5. **Changes what is drawn.** The host replaces the data whenever it changes, and the model's next
   answer replaces the document.

### The card

The members a host allows are one list, which the card, the renderer and `checkScreen` all take.
Keep it in a module of its own, so code in the browser can import it without the card:

```ts
// screen-members.ts
export const MEMBERS = ['Stack', 'Card', 'Heading', 'Text', 'Button', 'FormField', 'Input', 'Textarea']
```

Build the card where the model is called, usually a server:

```ts
import { runtimeCard } from '@polymorph/screen/card'

import { MEMBERS } from './screen-members'

// The same release, framework and members give the same text, so it is built once.
export const SYSTEM = runtimeCard({ members: MEMBERS })
```

`runtimeCard(options)` takes `framework` (`react` when absent, and `elements` for a page that
draws with `<poly-screen>`) and `members`. Without `members`, the card lists every member the
framework draws except those a host has to allow by name
([What the host decides](#what-the-host-decides)). The card has three parts: a paragraph that says
what the model is doing; the members, each with its props and their types, its parts and its
lawful cells, then the data types those props take and the icon roles; and the output contract. It
says nothing about tokens, red rules or installing, which a document cannot use.

Send the card as the system prompt, before anything that changes from one request to the next,
and mark it for your provider's prompt cache. Every request with the same card then reads it from
the cache. A provider caches a prompt only above a minimum length, which a card for a few members
may not reach. The agent eval sends the card this way: the whole system prompt, one block marked
for the cache, and no tools (`runtimeRequest` in `eval/run.mjs`).

The person's request goes in the message. When the screen should show your data, say in the
message which data you hold, each key with its type. A document binds a data input by the key's
name, and the renderer draws the value you pass under that name. A document can also write its
content as literal text.

A server that does not run JavaScript writes the card to a file once for each release, with the
command in [What it costs](#what-it-costs). A page can also build it with `loadScreen()`
([below](#loadscreen-on-a-page-with-no-build)).

### A React host

```tsx
import { useState } from 'react'
import * as members from '@polymorph/react-ui'
import { ScreenView, type ScreenAction } from '@polymorph/react/screen'

// Stand-in: your own call to the model, through your server, with SYSTEM as the system prompt.
// It keeps the conversation, calls `onText` with the answer so far each time more of it
// arrives, and resolves when the answer has ended.
import { askModel } from './model'
import { MEMBERS } from './screen-members'

const { PromptInput, Stack } = members

export function Assistant({ data }: { data: Record<string, unknown> }) {
  const [answer, setAnswer] = useState('')
  const [done, setDone] = useState(true)

  const send = async (message: string) => {
    setDone(false)
    await askModel(message, setAnswer)
    setDone(true)
  }

  const onAction = (action: ScreenAction) => {
    void send(`The person used the screen: ${JSON.stringify(action)}`)
  }

  return (
    <Stack gap={4}>
      <ScreenView
        text={answer}
        streaming={!done}
        members={members}
        allow={MEMBERS}
        data={data}
        onAction={onAction}
        onFault={(fault) => console.warn(fault.path, fault.message)}
      />
      <PromptInput label="Message" streaming={!done} onSubmit={(text) => void send(text)} />
    </Stack>
  )
}
```

- `members` is the components the renderer draws with: the vocabulary, a vendored copy, or a map
  of your own, lazy components included.
- `allow` is the list of member names a document may use, the list the card was built from.
- `text` is the answer so far, and the renderer reads the document out of it with `parsePartial`.
- `streaming` says that more is to come. No fault is reported for what has not arrived, and an
  element still being written waits.
- `onAction` returns nothing here, so no member waits on it. A handler that returns a promise
  makes a member that waits on its callback wait for it
  ([What the handler returns](#what-the-handler-returns)).

### A page with no build

```html
<poly-screen id="assistant" members="Stack Card Heading Text Button FormField Input Textarea"></poly-screen>

<script type="module">
  // Stand-in: the page's call to the model, through its server, with the card built for the
  // elements as the system prompt. It keeps the conversation, calls `onText` with the answer so
  // far each time more of it arrives, and resolves when the answer has ended.
  import { askModel } from './model.js'

  const screen = document.querySelector('#assistant')
  screen.data = { order: 'Order 1042' }

  async function send(message) {
    screen.streaming = true
    await askModel(message, (text) => {
      screen.text = text
    })
    screen.streaming = false
  }

  screen.addEventListener('poly-action', (event) => {
    send(`The person used the screen: ${JSON.stringify(event.detail)}`)
  })
  screen.addEventListener('poly-fault', (event) => console.warn(event.detail))

  send('I want a refund for order 1042.')
</script>
```

The page loads `polymorph.js` before this script, as every elements page does
([consuming.md](consuming.md#a-page-with-no-build)). It defines `<poly-screen>`, and the first
`<poly-screen>` to connect fetches the renderer. The card for this page is
`runtimeCard({ framework: 'elements', members })`, which lists only what the elements draw.
`streaming` is the page's to set: on while the answer arrives, and off when it ends, so an answer
cut short reports what it lacks. A server that renders the page can write a document it already
has into the element, as a `<script type="application/json">` child, and `<poly-screen>` draws it
with no script on the page.

### A screen, from answer to action

Asked for a refund, a model might answer with this document. It binds the host's `order` and one
action:

```json
{
  "spec": "polymorph-screen/1",
  "name": "RefundRequest",
  "purpose": "Asks the person how much of an order to refund, and why.",
  "inputs": [
    { "name": "order", "type": "string", "doc": "The order's number, as the person reads it." },
    { "name": "onSubmit", "type": "() => void" }
  ],
  "root": {
    "component": "Card",
    "props": { "title": "Refund an order" },
    "children": [
      {
        "component": "Stack",
        "props": { "gap": 4 },
        "children": [
          { "component": "Text", "props": { "tone": "secondary" }, "children": [{ "$": "order" }] },
          {
            "component": "FormField",
            "props": { "label": "Amount" },
            "children": [{ "component": "Input", "props": { "name": "amount", "type": "number" } }]
          },
          {
            "component": "FormField",
            "props": { "label": "Reason" },
            "children": [{ "component": "Textarea", "props": { "name": "reason" } }]
          },
          {
            "component": "Button",
            "props": {
              "label": "Request the refund",
              "variant": "solid",
              "tone": "accent",
              "onClick": { "$": "onSubmit" }
            }
          }
        ]
      }
    ]
  }
}
```

The person types 40 and a reason, and presses the button. The host is told:

```json
{ "name": "onSubmit", "args": [], "values": { "amount": "40", "reason": "It arrived broken." } }
```

`args` is empty because a Button's `onClick` passes only an event, which says nothing a model can
use. `values` holds each named field's text. The host sends this to the model, which answers with
the next screen: a confirmation, a question, or the same form with an `error` on a field.

### Changing what is drawn

- **New data.** Pass another `data`: the `data` prop in React, `screen.data` on `<poly-screen>`.
  Only what is bound to a value that changed is drawn again. In React, a new object that holds the
  same values draws nothing again.
- **The same answer, growing.** Each element stays drawn while more of the text arrives, with its
  state: a field the person is typing in keeps its text and its focus.
- **A new answer.** The model's next answer is a new document, which arrives from its first
  character. Until its root element is drawn, the screen is empty, and the old screen's elements
  go with what the person entered in them. The action that led to the new answer already carried
  that in `values`.
- **A document replaced whole.** A host that holds the document as an object passes it as
  `document` in React or `spec` on `<poly-screen>`. An element at the same place with the same
  component keeps its rendering and its state.

## The run-time contract

What a document does at run time is decided once, in `createScreen` (`@polymorph/screen/walk`),
and every renderer draws what it resolves, so a document behaves the same in React and as
elements. The tests that hold each rule are named beside it.

### Data inputs

An input whose type is not a function is a data input. The renderer fills it from the host's
`data`, by the input's name. An input the host gives no value for is absent (`undefined`), never a
placeholder, so an optional prop bound to it takes its default. A required prop bound to it is not
passed, and once the document is whole it is a fault:
`` `Select` requires `options`, and the host's data holds nothing at `choices` ``
(`packages/screen/src/walk.test.ts`).

A binding names a declared input, or a dotted path into one (`order.number`). Each later name
reads one of the value's own properties, never one it inherits, so `order.constructor` reads
nothing (`packages/screen/src/actions.test.ts`).

### Callback inputs

An input whose type is a function is a callback. What it returns decides what it is:

- **An action** returns nothing: its declared return type is `void`, `undefined`, or a promise of
  either (`() => void`, `(id: string) => Promise<void>`). When a member calls it, the host is told
  `{ name, args, values }`.
- **A question** returns a value (`(row: Row) => string`, `(date: CalendarDate) => boolean`). A
  member asks it while it draws: a table asks for each row's key on every drawing. The host is
  never told. It is answered by its declared return type: for `string`, a key for its first
  argument (the argument's `id`, the argument itself when it is text or a number, or a serial for
  each object); for `boolean`, `false`; for `number`, `0`; for a list type, an empty list; for
  `Promise<T>`, a promise of `T`'s answer; for anything else, nothing.

A required callback prop the document leaves unbound is answered the same way, by the prop's
type, and the host is not told of it either. So a member that requires a handler still draws when
the document gives it none (`packages/screen/src/actions.test.ts`,
`packages/screen/src/walk.test.ts`).

### What an action holds

| Field | What it is |
| --- | --- |
| `name` | the callback input the member called |
| `args` | the call's arguments, reduced to JSON |
| `values` | each named control's current value, by its `name`, as JSON |

`args` holds what the member passed its callback, reduced to what JSON can say, so a host in
another process or another language reads it as data (`packages/screen/src/walk.test.ts`):

- text, numbers and booleans are themselves; `NaN` and infinities are `null`, and a `bigint` is
  its text;
- a `Date`, and a date or a time from `@internationalized/date`, is its ISO 8601 text;
- a `Set` is a list, a `Map` an object, and a `File` or a `Blob` is `{ size, name, type }`;
- a DOM event, a DOM node, a React or Solid element and a function say nothing a host can use. One
  at the end of the list is dropped, and one before an argument that is kept is `null`, so every
  kept argument stays at its position: `onClick(event)` is `[]`;
- a value that holds itself is cut where it does.

`values` holds every control in the drawing that has a `name` and a controlled value (`value`, or
a checkbox's `checked`), by that name, as JSON. A control's value is what the person sees in it
(`packages/screen/src/walk.test.ts`):

1. what the person chose, until the document or the host gives the control another value, or the
   control at that place becomes another component or takes another name;
2. else the value the document or the host gives it;
3. else its default (`defaultValue`, `defaultChecked`);
4. else the empty value of its type: `null` where the type admits it (a Select with nothing
   chosen, an empty NumberInput or DatePicker), `[]` for a list (MultiSelect, CheckboxGroup),
   `false` for a checkbox or a switch, and `""` for text.

So an action reports every named field, those the person left as they were included. Two
controls with one name are a fault, and `values` holds the later one in document order. A control
named `__proto__`, `constructor` or `prototype` is a fault and is left out of `values`, because a
host that copies `values` into an object with `Object.assign` would set that object's prototype.

### Controls follow the reader

A controlled prop is a prop with the event that reports its change: `value` with `onChange`, `x`
with `onXChange`. The value the person chose stands until the document or the host gives that prop
a different value, so a document replaced with the same value does not undo the person's typing
(`packages/screen/src/walk.test.ts`, `packages/react/src/screen/screen.test.tsx`,
`packages/elements-ui/src/screen/screen.test.ts`). A document's value is compared by its content,
and the host's data by identity. A control the document gives no value keeps its own state, as an
uncontrolled field does, and `values` still holds what the person chose. That choice is passed
back to the member as its default, so a member drawn again, such as a field in a dialog that
opens again, shows what `values` holds. A choice is let go when its control takes another name,
and both renderers draw a control under another name as a new control, so neither `values` nor
the field shows one control's text under another control's name
(`packages/react/src/screen/values.test.tsx`, `packages/elements-ui/src/screen/guards.test.ts`).

When a document binds the change event to an action input (`"onChange": { "$": "onEdit" }`), the
screen holds the new value before it tells the host, so the action's `values` already has it.

### What the handler returns

When the host's action handler returns a promise, a member that waits on its callback waits on
it: a ConfirmDialog stays open and busy until the promise settles. In React the handler is
`onAction`. On `<poly-screen>`, a `poly-action` listener hands the member a promise with
`event.waitUntil(promise)` (`packages/react/src/screen/screen.test.tsx`,
`packages/elements-ui/src/screen/screen.test.ts`). Any other value the handler returns is not
passed on. An action declared to return a promise gets a promise of nothing when the handler
returns none.

### Updating a drawing

A drawing is updated in place. The walk keeps a node's object while nothing it draws changes, and
each renderer keys a node by its place in the document. A longer streamed document, new data or
the person's input therefore draws again only what changed, and mounts no element twice
(`packages/react/src/screen/screen.test.tsx`, `packages/elements-ui/src/screen/screen.test.ts`).

## Streaming

`parsePartial(text)` (`@polymorph/screen/partial`) reads the text a model has written so far as
the document it holds so far. The text may be prose and then a fenced block. The document is read
from the first fence marked `json`, or unmarked, and from the first brace that opens an object
when the text has no fence. It returns:

| Field | What it is |
| --- | --- |
| `document` | the document so far; `undefined` before its first brace |
| `complete` | whether the document's outermost brace has closed |
| `open` | the path of the string still being written, or `null` |
| `cut` | the path of the innermost value the text ends inside, or `null` when the document is whole or has not begun |
| `error` | where the text stops being JSON, and why, or `null`; the document holds what came before |

It keeps a string a person reads while it is written, so text appears as it arrives. It leaves out
anything else until it is whole: a `component` name or a prop name (`Butt` is not `Button`), a
number (`12` may become `120`), `true`, `false` and `null`, a binding, an input, and an object
that does not yet say what it is. Every name, number and binding a cut holds is the one the whole
document holds at the same path, and the whole text gives what `JSON.parse` gives
(`packages/screen/src/partial.test.ts`).

### When an element is drawn

While the document streams, an element is drawn once every prop it requires is written and the
text has moved past its plain props. The text may still be inside its children, or inside an
element one of its props holds. Once drawn, the element stays drawn, and a prop written later
arrives when it is whole. So a member is never drawn without a prop it requires, nor with a
half-written value, and a page is drawn while its content is still arriving
(`packages/screen/src/streaming.test.ts`, which feeds every cut of every screen in
`design/screens/` through one screen).

Cut inside the Amount field of the document above, the text ends in the Input's props:

```text
… "children": [{ "component": "Input", "props": { "name": "amount", "type": "num
```

The screen draws the Card, the Stack, the order's number and the Amount field, with no control in
it yet, because `num` is not yet a type. Once the text reaches `"type": "number" } }`, the Input
is drawn inside the field. The Button is drawn when its closing brace arrives, with its label, its
variant and its action whole. A heading's or a paragraph's text appears as it is written, because
a child string is drawn while it is written. A prop's value appears only once it is whole.

The output contract tells the model to write `spec`, `name`, `purpose`, `inputs` and `root` in
that order, an element's plain props before its props that hold elements, and `props` before
`children`. An element is drawn once its plain props are whole, so in this order each element is
drawn as early as it can be. A document in another order is still read and drawn, later.

### A host that parses the stream itself

`ScreenView` and `<poly-screen>` read `text` with `parsePartial` themselves. A host that parses
the text itself, to log it or to read the prose, passes what `parsePartial` returned: `document`,
`cut`, `open` and `streaming` (`!complete`, or the host's own end of the answer). `ScreenView`
takes them as props, `drawScreen` in its options and in `update`, and `<poly-screen>` takes the
document as `spec` and nothing else, so it draws each element as it arrives with the props it has
so far.

Without `cut`, every element that has arrived is drawn, with the props it has so far. A member
that throws for a prop that has not arrived draws nothing until the document is whole.

## What a document cannot do

A document is data. The renderers read it, and run nothing it says:

- **Nothing is executed or inserted as markup.** A string is drawn as text. The elements renderer
  makes each element with `document.createElement` and sets only the props, events and slots the
  element's definition names (`packages/elements-ui/src/screen/guards.test.ts`), and a law holds
  that its modules name no API that reads or writes markup and hold no tag in a string
  (`packages/elements-ui/screen.test.ts`). No member takes markup, a script's address or an embed
  (`packages/screen/src/parity.test.ts`).
- **A component is drawn only if the vocabulary has it, the host allows it and the framework draws
  it.** Any other is drawn as nothing and reported: `` no component called `Modal` ``.
- **A prop is passed only if the member has it.** Any other is reported and not passed:
  `` `Button` has no prop `className` ``.
- **Every function a member is handed is the screen's own**: an action, a stub or a control's
  handler. A value a document writes where a member takes a function is a fault and is not passed:
  `` `onClick` takes a function: bind it to an input whose type is one ``.
- **A structured object is passed only where data goes.** A `$object` among an element's children
  is a fault and is not drawn. So is a plain object a document writes where the format writes
  `$object`, in a prop, a field or a list, at any depth (`packages/screen/src/hostile.test.ts`).

### What the host decides

A host decides which members a document may use, with one list. `runtimeCard`, `checkScreen` and
`createScreen` take it as `members`, `<poly-screen>` as its `members` attribute or property, and
`ScreenView` as `allow`. A compound part comes with its member: `Table` allows `Table.Row`. A
document that names a member outside the list draws nothing in its place and is reported
(`packages/screen/src/walk.test.ts`, `packages/screen/src/check.test.ts`). A `members` value
`<poly-screen>` cannot read, such as an attribute that is neither a JSON array nor names, allows
no member and is a fault at the path `members`.

When the host gives no list, every member and exception primitive the framework draws is allowed,
except:

- `ThirdParty`, the boundary around another library's component. Drawn from a document, it would
  hold whatever the host puts there for it, so a host allows it only by naming it
  (`packages/screen/src/parity.test.ts`);
- in React, `Toast`, which a React application raises with `toast()` rather than draws as an
  element (`packages/screen/src/card.test.ts`);
- a member the framework's map marks absent ([frameworks.md](frameworks.md#the-framework-map)).

A shorter list gives a shorter card, fewer choices for the model, and a check that refuses
everything else. The same list goes to all three, so the model is never shown a member the
renderer refuses.

### Addresses

A string at a prop or an object key that takes an address (`avatar`, `href`, `src`) must be one
of:

- relative: `/orders/1042`, `orders/1042`, `?page=2`, `../help`;
- a fragment: `#reason`;
- an address with the scheme `http:`, `https:`, `mailto:` or `tel:`, in any case.

Any other scheme (`javascript:`, `data:`, `vbscript:`, `file:`) is a fault, and the value is not
passed. An address that holds a control character or `DEL` anywhere is refused whole, because a
browser removes tabs and line breaks from inside an address (`java\tscript:` is `javascript:`).
Spaces and control characters at either end are stripped before the scheme is read, as a browser
strips them. A colon after a `/`, `?` or `#` names no scheme, so `/a:b` is relative. At an address
key, anything but a string or a list of strings is a fault and is not passed. The check reads the
document's own values and a value a binding puts directly at an address prop or key
(`packages/screen/src/check.test.ts`, `packages/screen/src/walk.test.ts`,
`packages/screen/src/hostile.test.ts`). A law holds that every prop the vocabulary types as text
and names or documents as an address is one of the three keys
(`packages/screen/src/parity.test.ts`).

### Depth

A document nests at most `MAX_DEPTH` objects and lists inside one another, its own object
included: 128, which leaves room for screens several times as deep as any in `design/screens/`.
`parsePartial` stops reading text that goes deeper, with an `error`, and keeps what came before.
`checkScreen` reports a deeper document as one fault and does not validate it, and the walk
reports a fault and draws nothing deeper. No text and no value makes the core throw
(`packages/screen/src/hostile.test.ts`).

### What is not checked

- **The host's data inside a bound value.** A prop bound to a list of the host's objects
  (`"items": { "$": "crumbs" }`) is passed as the host gave it, addresses included. The host's
  data is the host's to check, where it is made.
- **Where a link or a picture leads.** An `https:` link takes the person to the address the
  document names, and a picture or a recording at an `http:` or `https:` address loads from where
  the document points. A host that wants neither leaves `Link`, `Avatar` and the other members
  that take an address out of `members`.
- **Ids and names.** A document can set an `id` (Heading, PhoneInput) and a control's `name`. An
  `id` can match one of the host's own, and a control inside a host's `<form>` posts with it under
  the document's name. Draw a screen outside the host's own forms.

### Faults

A fault never blanks the screen. A node that cannot be drawn (a component the host does not
allow, a member that throws as it first renders) draws nothing in its place, and the rest of the
screen draws (`packages/screen/src/walk.test.ts`, `packages/react/src/screen/screen.test.tsx`,
`packages/elements-ui/src/bridge/kept.test.ts`). Each fault is `{ path, message, component? }`,
with the validator's paths (`$.root.children[2]`). It is told to the host once in a drawing, by
its path and message, when it first appears: to `onFault` in React, and as `poly-fault` on
`<poly-screen>`. A fault that goes and comes back within a drawing is not told again. A drawing
begins when the screen is made, and again when a stream begins (`packages/screen/src/walk.test.ts`).
While the document streams, nothing that has not arrived is a fault.

A host that wants to see the faults draws each in its node's place: `faults="inline"` on
`ScreenView`, which draws the fault's words or what `renderFault` returns, and on
`<poly-screen>`, which draws a `poly-alert` with the message. The workbench's composer draws them
this way.

## Checking an answer and asking again

`checkScreen(document, { framework, members })` (`@polymorph/screen/check`) returns
`{ ok, faults }`. Its faults are the spec validator's, from a table generated from the registry,
then the run-time's: a member the host does not allow, an address a screen may not hold, and a
control's name `values` cannot hold (one two controls share, or one every object has). It needs
no registry and no checkout, and runs in a page, a worker and a server alike. A law holds that the
table gives every screen in `design/screens/` and a set of faulty documents the same faults the
full registry gives (`packages/screen/src/parity.test.ts`).

```ts
import { checkScreen } from '@polymorph/screen/check'
import { parsePartial } from '@polymorph/screen/partial'

import { askModel } from './model'
import { MEMBERS } from './screen-members'

/** Checks a whole answer, and asks the model once to correct it. */
export async function answered(answer: string, onText: (text: string) => void) {
  const { document, complete } = parsePartial(answer)
  if (!complete) return
  const { ok, faults } = checkScreen(document, { members: MEMBERS })
  if (ok) return
  const lines = faults.map((fault) => `${fault.path}: ${fault.message}`)
  // Stand-in: the next turn of the same conversation.
  await askModel(`Your screen has these faults. Answer with the corrected document.\n${lines.join('\n')}`, onText)
}
```

The faults are in the validator's words, with near matches where there are some
(`` no component called `Modal` — did you mean `Dialog`, `Drawer`, `Popover`? ``), so a model can
correct the document from them. The agent eval's `spec` mode measures that loop, with the check as
a tool ([verification.md](verification.md#the-agent-eval)).

The renderers do not need it. They draw while the document streams, before it can be checked,
and they apply the run-time rules as they draw: a member that is not allowed, an unknown prop, a
refused address and a value where a function goes are left out and reported. A host still checks a whole answer, because a
lawful document is the screen the model meant. A fault means part of that screen is missing from
the drawing, and the model can supply it in one more turn. The validator also reads what the
renderers do not, such as a variant and tone cell that does not exist and an icon role outside
the set.

## Reference

### `@polymorph/screen`

The core every renderer shares, with no framework, no DOM and no runtime dependency. It runs in a
page, a worker and a server. Each subpath loads only what it needs.

| Import | What it exports | What it loads |
| --- | --- | --- |
| `@polymorph/screen/partial` | `parsePartial(text)`, `MAX_DEPTH` | nothing else |
| `@polymorph/screen/walk` | `createScreen(options)`, `materialize(drawn, materials)`, and the types `Screen`, `ScreenNode`, `ScreenAction`, `ScreenFault`, `ScreenOptions`, `ScreenUpdate`, `Drawn` | no vocabulary table, no card and no validator: a renderer hands it the table |
| `@polymorph/screen/vocabulary` | `VOCABULARY`: the members, their props, parts, lawful cells and data types, generated from the release's registry | the table |
| `@polymorph/screen/check` | `checkScreen(document, options)` | the table and the validator |
| `@polymorph/screen/card` | `runtimeCard(options)`, `outputContract(options)` | the table and the card |
| `@polymorph/screen` | all of the above, and the helpers the renderers share (`surfaceOf`, `defaultMembers`, `addressFault`, `toJson` and others) | all of the above |

`packages/screen/src/browser-surface.test.ts` holds what each entry reaches: `parsePartial`
reaches no other module, the walk reaches neither the table, the card nor the validator, and
`checkScreen` reaches the table and not the card.

`checkScreen`, `runtimeCard` and `outputContract` take:

| Option | What it is |
| --- | --- |
| `framework` | `react`, `vue`, `svelte`, `solid`, `angular` or `elements`; `react` when absent. It decides the default members and which members are absent |
| `members` | the names the host allows; the framework's default when absent |
| `vocabulary` | another table of `VOCABULARY`'s shape, for a test; the generated one when absent |

`createScreen(options)` takes `document`, `vocabulary` (`VOCABULARY`), `framework`, `members`,
`data`, `fill`, `streaming`, `open`, `cut`, `onAction` and `onFault`. `fill` is `absent`, the
default, or `sample`, which fills an input with no data from its type, for a picture of the
screen. It returns a `Screen`: `root` (the node to draw, or `null`), `faults`, `values`, `fills`
(how each input was filled), `streaming`, `update(change)`, `subscribe(listener)` and
`fail(fault)`, through which a renderer reports a node it could not draw.

### `@polymorph/react/screen`

The React renderer, a subpath of the React foundation. The foundation's root entry loads none of
it.

| Export | What it is |
| --- | --- |
| `ScreenView` | draws a document, or a model's answer as text while it streams |
| `useScreen(source)` | the screen `ScreenView` draws, kept for the component's life: read its `values`, `faults` and `fills`, or draw it with `ScreenDrawing` |
| `ScreenDrawing` | draws a `Screen` with the host's members |
| `componentFor(members, name)` | the component a name resolves to among the members: `members.Table.Row`, or `members['Table.Row']` |
| `parsePartial` | the core's |
| types | `ScreenSource`, `ScreenViewProps`, `DrawOptions`, `ScreenDrawingProps`, `FaultCause`, `ScreenMembers`, `MemberComponent`, `PartialDocument`, `Screen`, `ScreenAction`, `ScreenFault`, `ScreenNode`, `Drawn` |

`ScreenView` takes:

| Prop | What it is |
| --- | --- |
| `members` | required: the components to draw with, by member name (`import * as members from '@polymorph/react-ui'`, a vendored copy, or a map with lazy components) |
| `text` | a model's answer so far; the document is read from it |
| `document` | the document as an object, whole or as far as it has arrived; read when `text` is absent |
| `cut`, `open` | `parsePartial`'s, beside `document`, for a host that parses the stream itself |
| `streaming` | whether more is to come. With `text`, whether the text's document has not closed, unless given |
| `data` | the host's data, by input name |
| `allow` | the members a document may use. Read when the screen is made: a different list makes a new screen |
| `fill` | `absent` (the default) or `sample` |
| `onAction(action)` | told each action; a promise it returns is what the member waits on |
| `onFault(fault)` | told each fault once, and text that stops being JSON as a fault at `$` |
| `faults` | `hidden` (the default) or `inline` |
| `renderFault(fault, cause)` | draws a fault in place when `faults` is `inline`. `cause` is `unknown`, `refused`, `missing`, `threw` or `value` |
| `renderBinding(path, value)` | draws a binding where something is drawn; the value when absent |
| `decorate(drawn, node)` | wraps the drawing of every node, as the composer wraps each in its selection |

No handler runs while React renders, so a server render, a render React discards and the second
render of strict mode tell the host nothing. Each node draws inside its own error boundary, which
tries again when the node changes. A server renders no error boundary, so the screen is drawn
inside one Suspense boundary: a member that throws on the server leaves the screen's place empty
for the browser to draw, and the page around it is still served
(`packages/react/screen-server.test.ts`).

### `@polymorph/elements-ui/screen`

The elements renderer, for an app with a bundler. Importing it defines `<poly-screen>` and every
element, each loading its member's code the first time one of its elements renders. A tag the app
has already defined keeps its element.

| Export | What it is |
| --- | --- |
| `drawScreen(container, options)` | draws into a plain element, appending the drawing's root element to it. Returns `values`, `faults`, `update(change)`, `check()` and `dispose()` |
| `checkScreen(document, options)` | the core's, for the elements: `members` and `vocabulary` |
| `runtimeCard(options)`, `outputContract(options)` | the core's, for the elements: `members` |
| `parsePartial(text)` | the core's |
| `definePolyScreen()`, `PolyScreen`, `SCREEN_TAG` | the element, its class and its tag |
| `ACTION_EVENT`, `FAULT_EVENT` | `'poly-action'` and `'poly-fault'` |

`drawScreen` takes `document`, `data`, `streaming`, `open`, `cut`, `members`, `faults` (`hidden` or
`inline`), `onAction` and `onFault`. It takes no `text`: a host that draws a stream with it passes
what `parsePartial` returned. `update` takes the same fields but `members`.

### `<poly-screen>`

An element written by hand, as `poly-icon` is. It is not a member, and no Solid member is behind
it. It draws its document in the light DOM and draws no box of its own: while it draws, it carries
the custom state `poly-host`, so the screen lays out as content of the element's parent.

It draws the first of these that holds a document:

1. the `spec` property, the document as an object;
2. the `text` property, a model's answer so far, read with `parsePartial`;
3. a `<script type="application/json">` child, for a page a server renders. The element draws
   again when the script's text changes and when a swap replaces its children, a swap that puts
   back the same script included (`packages/elements-ui/src/screen/guards.test.ts`).

| Attribute or property | What it is |
| --- | --- |
| `spec` (property) | the document |
| `text` (property) | a model's answer so far |
| `data` (property) | the host's data, by input name |
| `streaming` (attribute and property) | more of the document is to come. The page sets it while an answer arrives and clears it when the answer ends |
| `members` (attribute and property) | the members the host allows; the elements' default when absent. The attribute holds names separated by spaces, or a JSON array. A value that is not a list of names allows no member and is a fault at the path `members`. A change starts the drawing again |
| `faults` (attribute and property) | `hidden` (the default) or `inline`, which draws each fault as a `poly-alert` in its node's place |
| `values` (property, read only) | each named control's current value |
| `check()` (method) | a promise of what `checkScreen` says of the document it draws, with its members. The first call fetches the validator |

A property set before the element is defined is read when it is.

| Event | `detail` | |
| --- | --- | --- |
| `poly-action` | `{ name, args, values }` | a listener hands the member a promise with `event.waitUntil` |
| `poly-fault` | `{ path, message, component? }` | told once for each fault |

Both bubble and are composed. No member dispatches either (`packages/elements-ui/screen.test.ts`).

### `loadScreen()` on a page with no build

`polymorph.js` and `polymorph-all.js` export `loadScreen()`. It resolves to `drawScreen`,
`parsePartial`, `checkScreen`, `runtimeCard` and `outputContract`, as
`@polymorph/elements-ui/screen` exports them, bound to the elements.

```html
<script type="module">
  import { loadScreen } from './polymorph/polymorph.js'

  const { runtimeCard } = await loadScreen()
  const card = runtimeCard({ members: ['Stack', 'Card', 'Text', 'Button'] })
</script>
```

With `polymorph.js`, a page that writes no `<poly-screen>` fetches none of the screen's code. The
first `<poly-screen>` to connect fetches the renderer and the vocabulary table, `check()` fetches
the validator, and `loadScreen()` fetches the validator and the card. The static-page check holds
each of these ([verification.md](verification.md#the-static-page-check)).

## What it costs

**The card.** Its length depends on the release, the framework and the members. Measure it for
your list from an app that has installed `@polymorph/screen`:

```sh
node --input-type=module -e "
import { runtimeCard } from '@polymorph/screen/card'
console.log(runtimeCard().length)
console.log(runtimeCard({ framework: 'elements' }).length)
console.log(runtimeCard({ members: ['Stack', 'Card', 'Heading', 'Text', 'Button', 'FormField', 'Input'] }).length)
"
```

From a checkout of this repository, the same through the loader the eval uses:

```sh
node --input-type=module -e "
import { createJiti } from 'jiti'
const { runtimeCard } = await createJiti(process.cwd() + '/').import('./packages/screen/src/card.ts')
console.log(runtimeCard().length, runtimeCard({ members: ['Stack', 'Card', 'Text', 'Button'] }).length)
"
```

The repository's card law counts four characters to a token, and keeps the default card and a
card for a few dozen members under ceilings (`packages/screen/src/card.test.ts`). A shorter list
costs less on every request, and most on the first, which the cache has not seen.

**The page.** Besides what every elements page loads, a page with no build that draws one screen
fetches the renderer's chunk, the vocabulary table and the chunks of the members the screen draws.
`pnpm size` measures that page, the `elements-screen` fixture, against its ceiling
([verification.md](verification.md#size-budgets)). In React, `@polymorph/react/screen` adds the
renderer, the walk, `parsePartial` and the vocabulary table to an application's bundle, and the
card and the validator only where the application imports them.

**The model.** `pnpm eval --mode runtime` measures a model in this lane: one request with no
tools, the run-time card as the system prompt and a brief as the message. It records how often
the answer is lawful and meets its brief, the tokens it read and wrote, with cached and uncached
input apart, the time to the first text and the time to the end
([verification.md](verification.md#the-run-time-lane)). `--members` measures a card for a list of
members, and `--framework` a card for another framework.

## What it does not do

- **Native platforms draw screens at compile time only.** A screen for iOS or Android is emitted
  as SwiftUI or Compose ([native.md](native.md)). Nothing draws a screen spec at run time there.
- **Vue, Svelte, Solid and Angular have no renderer of their own.** A page in any of them uses
  `<poly-screen>`, which is a custom element: import `@polymorph/elements-ui/screen` once and
  write the element in the framework's template.
- **A screen computes nothing.** A screen spec has no condition, no loop and no expression. What a
  screen computes (a total, a filtered list, whether to show a warning) is the host's: compute it
  and pass it as data, or ask the model for a new document.
- **No model, no transport.** The host calls the model, keeps the conversation and decides what an
  action means. Polymorph draws the answer and reports what the person does.
