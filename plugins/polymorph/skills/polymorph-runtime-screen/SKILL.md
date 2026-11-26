---
name: polymorph-runtime-screen
description: Let a product answer with real interface while it runs. A model writes a polymorph-screen/1 document, the server checks it with checkAnswer, the page draws it as it streams with ScreenView from @polymorph/react/screen or the <poly-screen> element from @polymorph/elements-ui/screen, and each press or submit becomes an action the product handles. Use when asked for generative UI, to render a model or agent response as components, to let an assistant show a form, a choice or a confirmation, or when code imports @polymorph/screen, runtimeCard, checkAnswer, parsePartial, ScreenView or loadScreen. Covers the members a model may use and refusing links and images, the card and the host’s rules in the system prompt, checking and asking again, drawing the prose and the screen while they stream, actions and values, confirming an action with consequences, and what a request costs.
---

# Draw a screen a model writes while the product runs

A run-time screen is interface a model writes while the product runs. The model answers with a
`polymorph-screen/1` document in a fenced `json` block, sometimes with prose around it. The host
draws the document with the members, in the app's theme, while it streams in. When a member calls
one of the document's actions, such as a press or a submit, the host is told the action's name and
the form's values as data. Nothing is compiled.

The work is in two places, and both are given the same list of members:

- **The server that calls the model** builds the run-time card, sends it with the host's own
  rules, checks each whole answer with `checkAnswer` and asks once more when it has faults.
- **The page** draws the answer while it streams, with `ScreenView` or `<poly-screen>`.
  The renderer applies the member list and the run-time rules itself, so the page treats the
  document as untrusted whatever the server checked.

Polymorph gives the card, the check and the renderers. The host calls the model, keeps the
conversation and decides what each action means.

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

React is the only framework with a renderer of its own.
[references/elements.md](references/elements.md) has the `<poly-screen>` host for the others and
for a page with no build.

`@polymorph/screen` has no dependencies and runs in a server, a worker and a page. Add it where the
card is built or an answer checked, under the alias and at the version of the project's other
polymorph packages, so the card, the check and the renderer read one vocabulary:

```json
{ "dependencies": { "@polymorph/screen": "npm:@metamorph-labs/polymorph-screen@^<version>" } }
```

## 3. Choose the members a document may use

```ts
// screen-members.ts: the members a document may use. The server and the page both import it.
export const MEMBERS = ['Stack', 'Heading', 'Text', 'Button', 'FormField', 'NumberInput', 'Textarea']
```

The list is what the model may write. It goes to the card and the check (`members`) and to the
renderer (`allow` on `ScreenView`, `members` on `<poly-screen>`), so the model is never
shown a member the renderer refuses. The host's own code composes any member, in the list or not:
the `ChatThread` around the screen, the `ConfirmDialog` that confirms an action.

- A part comes with its member: `Table` allows `Table.Row`.
- A shorter list gives a shorter card, fewer choices and a check that refuses the rest.
- With no list, every member the framework draws is allowed but `ThirdParty`, which holds
  whatever the host puts in it, and, in React, `Toast`.

To refuse links and remote pictures, pass `addresses: 'refused'` beside the list: to the card and
the check, as `addresses` on `ScreenView`, and as the `addresses` attribute of
`<poly-screen>`. The card then lists no prop that takes an address, the check reports each one a
document writes, and the renderer passes none: `Card` and `List.Item` are
drawn without their `href`. A member that cannot be drawn without an address is left out of the
card and refused: `Link`, `Lightbox`, `Image`, `AudioPlayer`, `SectionNav`, `Markdown`, `Citation` and `SourceList`. The host's own data, bound whole, is passed as the host gave it.

## 4. Build the system prompt: the card, then the host's rules

```ts
// prompt.ts, on the server.
import { runtimeCard } from '@polymorph/screen/card'

import { MEMBERS } from './screen-members'

// The same release, framework and members give the same text, so it is built once.
export const CARD = runtimeCard({ members: MEMBERS })

// What only this host knows. A document's action is a name the host maps to its own handler,
// so the rules name each action the host handles and the fields it reads.
export const RULES = [
  'Actions this host handles:',
  '- requestRefund, of type () => void, bound to the Button that asks for a refund. It reads the fields amount (a NumberInput) and reason (a Textarea).',
  'Any other action you declare is sent back to you as the next turn.',
  'Never say that a refund is made or approved. The host asks the person to confirm it, and tells you what happened.',
].join('\n')
```

Send the card first and unchanged, then the rules, as the system prompt, and mark the end of the
two for the provider's prompt cache. The card says what the check and the renderer hold a document
to, so the host adds to it after it and never edits it. The card names no action: the model names
each callback input itself, so the rules declare the names the host handles. A cache holds the longest prefix that is
the same in every request, so what differs between requests, such as the host's data and the
person's words, goes after both, in the messages. A provider caches only above a minimum length,
which a card for a few members may not reach. The model needs no tool to write a lawful document.

For `<poly-screen>`, pass `framework: 'elements'` too. The card lists each allowed member with its
props, parts and lawful cells, the data types and icon roles they take, and the output contract:
one document in a fenced `json` block. The system card the `card` verb prints is for a coding
agent and never goes in a run-time prompt.

## 5. Ask for a screen

The person's request is the message. When the screen should show the host's data, the message names
each key the host holds, with its type: a document binds a data input by the key's name.

```ts
const message = [
  'I want a refund for order 1042.',
  'Data you can bind, by input name: order (string, the order number as the person reads it).',
].join('\n\n')
```

The model answers with prose, a document, or both:

```json
{
  "spec": "polymorph-screen/1",
  "name": "RefundRequest",
  "purpose": "Asks the person how much of an order to refund, and why.",
  "inputs": [{ "name": "order", "type": "string" }, { "name": "requestRefund", "type": "() => void" }],
  "root": {
    "component": "Stack",
    "props": { "gap": 4 },
    "children": [
      { "component": "Heading", "children": ["Refund an order"] },
      { "component": "Text", "props": { "tone": "secondary" }, "children": [{ "$": "order" }] },
      {
        "component": "FormField",
        "props": { "label": "Amount" },
        "children": [{ "component": "NumberInput", "props": { "name": "amount", "min": 0 } }]
      },
      {
        "component": "FormField",
        "props": { "label": "Reason" },
        "children": [{ "component": "Textarea", "props": { "name": "reason" } }]
      },
      {
        "component": "Button",
        "props": { "label": "Request the refund", "variant": "solid", "tone": "accent", "onClick": { "$": "requestRefund" } }
      }
    ]
  }
}
```

## 6. On the server: call the model, check the whole answer, ask once more

```ts
// ask.ts, on the server that calls the model.
import { checkAnswer } from '@polymorph/screen/check'

// Stand-in: your call to the model. It sends CARD and RULES as the system prompt and `turns` as
// the conversation, calls `onText` with the answer so far each time more arrives, and resolves
// with the whole answer. A Turn is { role: 'user' | 'assistant', content: string }.
import { askModel, type Turn } from './model'
import { MEMBERS } from './screen-members'

/** Answers the conversation, and asks once more, with the faults, when the answer is not lawful. */
export async function answer(turns: Turn[], onText: (text: string) => void): Promise<Turn[]> {
  const first = await askModel(turns, onText)
  const answered: Turn[] = [...turns, { role: 'assistant', content: first }]
  const { ok, faults } = checkAnswer(first, { members: MEMBERS })
  if (ok) return answered
  const lines = faults.map((fault) => `${fault.path}: ${fault.message}`)
  const retry: Turn[] = [
    ...answered,
    { role: 'user', content: `Your screen has these faults. Answer with the corrected document.\n${lines.join('\n')}` },
  ]
  // Once: a second answer is drawn as it is, and the renderer leaves out what it refuses.
  return [...retry, { role: 'assistant', content: await askModel(retry, onText) }]
}
```

- `checkAnswer` takes the whole answer as text and the host's options, and returns `ok`, `faults`,
  `document`, `complete` and `prose`. It reads the document as the renderer does
  (`parsePartial`): the first fence marked `json` or unmarked, or the first brace that opens an
  object. An answer with neither is prose, which is lawful: `document` is `undefined`.
- An answer that ends before its document does, at a token limit or a dropped stream, is one fault
  at `$`: `the answer ends before its document does`, in words that ask for the whole document
  again. Call it once the answer has ended; while it streams, a document that has not closed is
  normal.
- Each fault is `{ path, message }` in words a model corrects from
  (``no component called `Modal` — did you mean `Dialog`, …?``). The check reads what the
  renderer does not: variant and tone cells, icon roles and the usage rules. `checkScreen` checks a
  document object the host already holds.

## 7. On the page: draw the prose and the screen while they stream

```tsx
import { useState } from 'react'
import * as members from '@polymorph/react-ui'
import { parsePartial, ScreenView, type ScreenAction } from '@polymorph/react/screen'

import { MEMBERS } from './screen-members'
// Stand-in: posts the person's message, or an action, to your server, which adds it to the
// conversation and calls `answer` (step 6). It calls `onText` with the answer so far as it
// streams back, and resolves when the answer ends.
import { streamTurn } from './server'

const { PromptInput, Stack, StreamingText } = members

export function Assistant({ data }: { data: Record<string, unknown> }) {
  const [answer, setAnswer] = useState('')
  const [done, setDone] = useState(true)

  const send = async (message: string) => {
    setDone(false)
    await streamTurn(message, setAnswer)
    setDone(true)
  }

  const onAction = (action: ScreenAction) => {
    void send(`An action from the screen: ${JSON.stringify(action)}`)
  }

  const { document, prose, fence } = parsePartial(answer)

  return (
    <Stack gap={4}>
      {prose !== '' && <StreamingText streaming={!done && fence !== 'open'}>{prose}</StreamingText>}
      {document !== undefined && (
        <ScreenView
          text={answer}
          streaming={!done}
          members={members}
          allow={MEMBERS}
          data={data}
          onAction={onAction}
          onFault={(fault) => console.warn(fault.path, fault.message)}
        />
      )}
      <PromptInput label="Message" streaming={!done} onSubmit={(text) => void send(text)} />
    </Stack>
  )
}
```

- `ScreenView` applies `allow` and the run-time rules as it draws: a member outside the
  list, a prop the member lacks, a refused address and a value where a function goes are left out
  and reported. Without `allow` it draws every member React draws but `ThirdParty` and
  `Toast`, so the page gets the server's list.
- `prose` is the text outside the fenced block that holds the document, as the reader finds it:
  the text before the block, and after it once the block closes. `fence` is `open` from the
  block's first backtick to its closing line. `StreamingText` draws the prose as it is.
  `Markdown` draws the links its text writes, so it is for a host that allows links.
- Draw `ScreenView` only when the answer holds a document. Given none, with `streaming`
  off, it reports `the document has no root element` at `$.root`.
- `streaming` is on while the answer arrives and off when it ends, so an answer cut short reports
  what it lacks. Left out, an answer that stops early never reports.
- An element is drawn once every prop it requires is written, and stays drawn, so a field keeps its
  text and focus while the answer grows. A new answer replaces the screen from its first element.
  [references/contract.md](references/contract.md) says what new `data` and a replaced document
  keep.

## 8. Handle each action

The person types 40 and a reason and presses the button. `onAction` is called with a
`ScreenAction`:

```json
{ "name": "requestRefund", "args": [], "values": { "amount": 40, "reason": "It arrived broken." }, "changed": ["amount", "reason"] }
```

| Field | What it is |
| --- | --- |
| `name` | the callback input the document bound, which the member called |
| `args` | what the member passed, as JSON. An event is dropped: a `Button`'s `onClick` gives `[]` |
| `values` | every control with a `name`, on screen or not: what the person chose, else the document's or host's value, else its default, else its type's empty value |
| `changed` | the names in `values` whose value the person chose |

- `values` is JSON. `NumberInput` gives a number, or `null` while empty. `Input`
  gives text for every `type`, `type="number"` included.
- Map each name the rules declared to the host's own handler. Send any other action to the model as
  the next turn, as step 7 does; the next answer is the next screen.
- An action is the document's word, not the person's: the model chose its `name`, and each value
  is what a control holds. An action with consequences, such as a refund, a deletion or a message
  sent, opens the host's own `ConfirmDialog`, written from the host's data, and the server
  authorises and checks again before it acts, once for each idempotency key.
  [references/contract.md](references/contract.md) has the pattern.
- An action does not prove that a person acted: `Countdown` calls
  `onEnd` when its time is reached, and an agent on the page presses as a person
  does, each with an empty `changed`. Bound how many model turns actions may start in a row, so a
  screen that calls its own action as it is drawn cannot loop.
- A promise `onAction` returns is what a member that waits on its callback waits on: a
  `ConfirmDialog` in the document stays open and busy until it settles. A `Button`
  does not wait.

## 9. Look at an answer while you build

Save an answer's document to a file, and draw it, validate it or read a member with the CLI:
[references/api.md](references/api.md) has the commands and what each does not apply.

## What a document cannot do, and what stays the host's job

Nothing a document holds runs or is inserted as markup, a callback prop takes only a function the
screen makes, an address is relative, a fragment, or `http:`, `https:`, `mailto:` or `tel:`, and a
fault takes out only the element it is in. These stay the host's job:

- What an action means, and confirming one with consequences.
- The host's own data inside a bound value, addresses included: it is passed as the host gave it.
- Where an allowed link leads and where a picture loads from: an `https:` address can name any
  site.
- Ids and names: a document can set an `id` and a control's `name`, so draw the screen outside the
  host's own `<form>`.
- The words: a screen shows any text the model writes and asks for any field it names. Treat
  `values` as input from the page.

[references/contract.md](references/contract.md) has each rule, every fault, the limits, and how a
run-time document differs from a spec `emit` compiles.

## What a request costs

| Part | What it costs |
| --- | --- |
| The card | input on every request: measure it with the command below. After the first request a prompt cache holds it (step 4) |
| The host's rules | input on every request, held in the cache with the card |
| The conversation | input on every request: each earlier message and answer, documents included |
| The answer | output: the prose and the document the model writes |
| A retry | one more request: the same prefix, the conversation with the first answer and the fault list, and a second answer |
| An action | nothing, unless the host sends it to the model. One the host handles itself, such as `requestRefund`, costs no model call; telling the model the outcome is one request |

A request's price is these counts at the provider's rates for input, cached input and output; the
provider's response reports each count. The card's length depends on the release, the framework,
the members and `--addresses`. This prints the card for the list in step 3, the text
`runtimeCard` returns for the same options, and its length in characters on stderr; a provider's
tokenizer reads about four characters to a token:

```sh
npx -y @metamorph-labs/polymorph@1.0.18 card --runtime --framework react --members Stack,Heading,Text,Button,FormField,NumberInput,Textarea
```

Its standard output is the whole card, so a server that runs no JavaScript writes it to a file
once for each release (`> card.md`) and sends that.

The page pays once, in what it loads:

- **React**: `@polymorph/react/screen` adds the renderer and the vocabulary table to the bundle.
  `import * as members` adds every member; a map of the allowed ones (`{ Stack, Heading, … }`)
  adds only those. The card and the validator come only where imported.
- **`<poly-screen>`**: the first to connect fetches the renderer and the vocabulary table, each
  member's code loads when its element first renders, and the validator on the first check.
