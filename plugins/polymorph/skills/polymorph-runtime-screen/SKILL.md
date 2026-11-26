---
name: polymorph-runtime-screen
description: Let a product answer with real interface while it runs. A model writes a polymorph-screen/1 document, the host checks it with checkScreen, draws it as it streams with ScreenView from @polymorph/react/screen or the <poly-screen> element from @polymorph/elements-ui/screen, and turns each press or submit into an action the product handles. Use when asked for generative UI, to render a model or agent response as components, to let an assistant show a form, a choice or a confirmation, or when code imports @polymorph/screen, runtimeCard, parsePartial, ScreenView or loadScreen. Covers choosing it over an emitted screen, installing, the run-time card in the system prompt, drawing while it streams, actions and values, checking an answer and asking again, what a document cannot do and what stays the host’s job, and what it costs.
---

# Draw a screen a model writes while the product runs

A run-time screen is interface a model writes while the product runs. The model answers with a
`polymorph-screen/1` document in a fenced `json` block. The host checks it and draws it with the
members, in the app's theme, while it streams in. When a member calls one of the document's
actions, such as a press or a submit, the host is told as data and sends that to the model as the
next turn. Nothing is compiled. The host calls the model, keeps the conversation and decides what
each action means; polymorph gives the card the model writes from, the check and the renderer.

## 1. Check that this is the right tool

| The screen | Use |
| --- | --- |
| Is part of the product: known when it is built, reviewed and kept | A spec that `emit` compiles, or code: the `polymorph-screen` skill |
| Depends on what the person asked: a form the agent needs filled before it acts, a summary of what it found, a choice between options it computed | This skill |
| Already exists, and an agent fills and presses in it | The `polymorph-agent-bridge` skill |
| Is drawn by SwiftUI or Compose | Nothing draws a document at run time on iOS or Android: the `polymorph-native` skill emits it |

A document computes nothing: it has no condition, no loop and no expression. A total, a filtered
list or whether to show a warning is computed by the host and passed as data, or the model is asked
for a new document.

## 2. Install the renderer

| The app | Draws with | Builds the card and checks with |
| --- | --- | --- |
| React | `ScreenView` from `@polymorph/react/screen`, in `@polymorph/react` | `runtimeCard` from `@polymorph/screen/card`, `checkScreen` from `@polymorph/screen/check` |
| Vue, Svelte, Solid, Angular, or elements with a bundler | `<poly-screen>`, defined by importing `@polymorph/elements-ui/screen` once | the same, given `framework: 'elements'` |
| A page with no build | `<poly-screen>`, defined by `polymorph.js` | `loadScreen()` from `polymorph.js`, or the same on a server |

React is the only framework with a renderer of its own. Vue, Svelte, Solid and Angular draw with
`<poly-screen>`, a custom element: [references/elements.md](references/elements.md) has that host
and the page with no build.

`@polymorph/screen` has no dependencies and runs in a server, a worker and a page. Add it where the
card is built or an answer checked, under the alias and at the version of the project's other
polymorph packages, so the card, the check and the renderer read one vocabulary:

```json
{ "dependencies": { "@polymorph/screen": "npm:@metamorph-labs/polymorph-screen@^<version>" } }
```

## 3. Choose the members a document may use

```ts
// screen-members.ts: the members a document may use. The card, the renderer and the check read it.
export const MEMBERS = ['Stack', 'Card', 'Heading', 'Text', 'Button', 'FormField', 'Input', 'Textarea']
```

The same list goes to the card and the check (`members`) and to the renderer (`allow` on
`ScreenView`, `members` on `<poly-screen>`), so the model is never shown a member the
renderer refuses. A part comes with its member: `Table` allows `Table.Row`.

- A shorter list gives a shorter card, fewer choices and a check that refuses the rest.
- With no list, every member the framework draws is allowed but `ThirdParty`, which holds
  whatever the host puts in it, and, in React, `Toast`.
- A host that refuses links and remote pictures leaves out every member that takes an address:
  `RichTextContent`, `AvatarButton`, `ImageEditor`, `Link`, `Lightbox`, `Card`, `Avatar`, `Image`, `AudioPlayer`, `List`, `CommentThread`, `CursorPagination`, `Breadcrumbs`, `SectionNav`, `Markdown`, `AttachmentChip`, `ChatMessage`, `Citation`, `SourceList` and `AppShell`.

## 4. Put the run-time card in the system prompt

```ts
import { runtimeCard } from '@polymorph/screen/card'

import { MEMBERS } from './screen-members'

// The same release, framework and members give the same text, so it is built once.
export const SYSTEM = runtimeCard({ members: MEMBERS })
```

For `<poly-screen>`, pass `framework: 'elements'` too. The card lists each allowed member with its
props, parts and lawful variant and tone cells, then the data types and icon roles they take, and
ends with the output contract: one document in a fenced `json` block, and how to write it. It is
not the system card the `card` verb prints, which is for a coding agent and never goes in a
run-time prompt.

The card is the largest part of each request: over 10,000 tokens with every member the framework
draws, over 1,000 with the eight above, at four characters to a token. Measure yours from the
app's root:

```sh
node --input-type=module -e "import { runtimeCard } from '@polymorph/screen/card'; console.log(runtimeCard({ members: ['Stack', 'Card', 'Heading', 'Text', 'Button', 'FormField', 'Input', 'Textarea'] }).length)"
```

Send it as the whole system prompt, before anything that changes between requests, and mark it for
the provider's prompt cache. A provider caches only above a minimum length, which a card for a few
members may not reach. The model needs no tool to write a lawful document.

## 5. Ask for a screen

The person's request is the message. When the screen should show the host's data, the message names
each key the host holds, with its type: a document binds a data input by the key's name.

```ts
const message = [
  'I want a refund for order 1042.',
  'Data you can bind, by input name: order (string, the order number as the person reads it).',
].join('\n\n')
```

The model answers with the document, sometimes after a sentence of prose:

```json
{
  "spec": "polymorph-screen/1",
  "name": "RefundRequest",
  "purpose": "Asks the person how much of an order to refund, and why.",
  "inputs": [{ "name": "order", "type": "string" }, { "name": "onSubmit", "type": "() => void" }],
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
            "props": { "label": "Request the refund", "variant": "solid", "tone": "accent", "onClick": { "$": "onSubmit" } }
          }
        ]
      }
    ]
  }
}
```

## 6. Call the model, and check the whole answer

```ts
import { checkScreen } from '@polymorph/screen/check'
import { parsePartial } from '@polymorph/screen/partial'

// Stand-in: your call to the model, with the card as the system prompt. It keeps the conversation,
// calls `onText` with the answer so far each time more arrives, and resolves with the whole answer.
import { askModel } from './model'
import { MEMBERS } from './screen-members'

/** Asks for a screen, and once more with the faults when the whole answer is not lawful. */
export async function askForScreen(message: string, onText: (text: string) => void) {
  const answer = await askModel(message, onText)
  const { document, complete } = parsePartial(answer)
  if (!complete) return
  const { ok, faults } = checkScreen(document, { members: MEMBERS })
  if (ok) return
  const lines = faults.map((fault) => `${fault.path}: ${fault.message}`)
  await askModel(
    `Your screen has these faults. Answer with the corrected document.\n${lines.join('\n')}`,
    onText,
  )
}
```

`parsePartial` reads the document out of the answer, prose and fence included. `checkScreen` returns
`{ ok, faults }`, each fault `{ path, message }` in words a model corrects from
(``no component called `Modal` — did you mean `Dialog`, …?``). The renderer does not need
the check to be safe, as it applies the run-time rules as it draws. The check is for the screen the
model meant: a fault is a part missing from the drawing, which one more turn can supply. It also
reads what the renderer does not: variant and tone cells, icon roles and the usage rules.

## 7. Draw the answer while it streams

```tsx
import { useState } from 'react'
import * as members from '@polymorph/react-ui'
import { ScreenView, type ScreenAction } from '@polymorph/react/screen'

import { askForScreen } from './ask'
import { MEMBERS } from './screen-members'

const { PromptInput, Stack } = members

export function Assistant({ data }: { data: Record<string, unknown> }) {
  const [answer, setAnswer] = useState('')
  const [done, setDone] = useState(true)

  const send = async (message: string) => {
    setDone(false)
    await askForScreen(message, setAnswer)
    setDone(true)
  }

  const onAction = (action: ScreenAction) => {
    void send(`An action from the screen: ${JSON.stringify(action)}`)
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

- `members` is the components to draw with. `import * as members` bundles every member; a map of
  the allowed ones (`{ Stack, Card, … }`) keeps the rest out.
- `streaming` is on while the answer arrives and off when it ends, so an answer cut short reports
  what it lacks. Left out, it is whether the document in `text` is still open, and an answer that
  stops early never reports. Off while chunks still arrive, each chunk is a new whole document whose
  faults are told again.
- An element is drawn once every prop it requires is written, and stays drawn, so a field keeps its
  text and focus while the answer grows. A child's text appears as it is written; a prop's value
  only once whole.
- [references/contract.md](references/contract.md) says what new `data`, a new answer and a
  replaced document keep. [references/api.md](references/api.md) has every prop, and a host that
  parses the stream itself.

## 8. Handle each action

The person types 40 and a reason and presses the button. `onAction` is called with a
`ScreenAction`:

```json
{ "name": "onSubmit", "args": [], "values": { "amount": "40", "reason": "It arrived broken." }, "changed": ["amount", "reason"] }
```

| Field | What it is |
| --- | --- |
| `name` | the callback input the document bound, which the member called |
| `args` | what the member passed, as JSON. An event is dropped: a `Button`'s `onClick` gives `[]` |
| `values` | every control with a `name`, on screen or not: what the person chose, else the document's or host's value, else its default, else its type's empty value |
| `changed` | the names in `values` whose value the person chose |

- Send it to the model as the next turn, as step 7 does. The next answer is the next screen.
- An action is the document's word, not the person's: the document chose its `name` and each
  control's default. Confirm anything with consequences, such as a payment, a deletion or a message
  sent, with the person outside the screen, in the host's own words.
- An action does not prove that a person acted. `Countdown` calls `onEnd`
  when its time is reached, a field drawn with `autoFocus` calls
  `onFocus`, and an agent on the page presses as a person does. Each such action has
  an empty `changed`, as a plain press does. Bound how many model turns actions may start in a
  row, so a screen that calls its own action as it is drawn cannot loop.
- A promise `onAction` returns is what a member that waits on its callback waits on:
  `ConfirmDialog` stays open and busy until it settles. A `Button` does not wait.

## 9. Use the tools while you build

Save an answer's document to a file to look at it:

```sh
npx -y @metamorph-labs/polymorph@1.0.18 render answer.json --system plain --data data.json
npx -y @metamorph-labs/polymorph@1.0.18 validate answer.json --framework react
npx -y @metamorph-labs/polymorph@1.0.18 component FormField --framework react
```

- `render` draws it with the React members, every member allowed, and reports layout faults.
  `--data` takes a JSON file of the host's data by input name. It does not apply the host's list
  or report a run-time fault, such as a refused address.
- `validate` checks it as `emit` would: names, props, values, cells and usage rules. It does not
  apply the host's list or the run-time rules; only `checkScreen` does.
- `component` prints what a member takes. No verb prints the run-time card.

## What a document cannot do, and what stays the host's job

Whatever a model writes, the renderers and the check hold it to these rules:

- Nothing in it runs or is inserted as markup. A string is drawn as text in every member but
  `Markdown`, which draws the Markdown its text holds.
- A component is drawn only if the vocabulary has it, the host allows it and the framework draws
  it, and a prop is passed only if the member has it.
- A callback prop takes only a function the screen makes. A function in the host's `data` is never
  handed to a member through a binding.
- An address is relative, a fragment, or `http:`, `https:`, `mailto:` or `tel:`; any other
  scheme (`javascript:`, `data:`) is refused.
- Depth and the lengths of keys and types are bounded, no text makes the core throw, and a fault
  takes out only the element it is in.

These stay the host's job:

- What an action means, and confirming one with consequences.
- The host's own data inside a bound value, addresses included: it is passed as the host gave it.
- Where a link leads and where a picture loads from: an `https:` address can name any site.
- Ids and names: a document can set an `id` and a control's `name`, so draw the screen outside the
  host's own `<form>`.
- The words: a screen shows any text the model writes and asks for any field it names. Treat
  `values` as input from the page.

[references/contract.md](references/contract.md) has each rule, every fault and the limits.

## A run-time document is not a spec to emit

The format and the validator are the same, so `emit` reads a document a model wrote. What happens
to it differs:

| | A spec `emit` compiles | A run-time document |
| --- | --- | --- |
| A data input | a prop the container passes | the host's `data` under its name, empty when absent |
| A callback input | a function the container passes | an action the host is told of |
| Members | every member the framework ships | the host's list |
| Checked by | `validate` | `checkScreen`: the validator, then the run-time rules |
| Becomes | a source file, reviewed and built | a drawing in the person's page |
| Platforms | web, iOS and Android | web |

## What it costs

- **Every request** carries the card; a shorter list costs less on each.
- **Every action** sent to the model is a turn, and the person sees the next screen's first
  elements before its last.
- **React**: `@polymorph/react/screen` adds the renderer and the vocabulary table to the bundle,
  and the members map adds its members. The card and the validator come only where imported.
- **`<poly-screen>`**: the first to connect fetches the renderer and the vocabulary table, each
  member's code loads when its element first renders, and the validator on the first check.
