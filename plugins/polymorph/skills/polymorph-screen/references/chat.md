# A conversation with a model

A screen where a person talks with a model, turn by turn, is built from the conversation members.
They draw what the container tells them. The container owns the model, the transport and the
messages.

People who write to each other on a record, such as a ticket's messages or a document's comments,
are not in a conversation with a model. That is `CommentThread`, with
`CommentThread.Comment` for each comment, read from the top of the page.

## 1. The members

| Member | What it is |
| --- | --- |
| `StreamingText` | Plain text still arriving, with a steady caret |
| `Markdown` | Markdown, rendered through the vocabulary |
| `AttachmentChip` | A file attached to a prompt, shown as a chip |
| `PromptInput` | The chat composer, where a prompt is written and sent |
| `ChatMessage` | One turn of a conversation |
| `ChatThread` | A scrolling conversation log that follows the newest turn |
| `Plan` | An agent run's steps, each with its status |
| `ToolCall` | A tool invocation shown as one expandable row |
| `ApprovalCard` | An in-thread request to allow an agent action |
| `Citation` | An inline numbered link to a source, with a hover preview |
| `SourceList` | The numbered list of sources a reply cites |
| `ReasoningDisclosure` | A collapsible section showing the model's reasoning |
| `ArtifactPane` | A side pane that shows one artifact a turn produced |

`component <Name>` prints each one's props and, under `## Types`, the fields of the data types
those props take, such as a trigger, an attachment or a source. Do not build any of these from other
members, and do not bring in a chat library's components.

## 2. The page

`ConversationPage` is the page archetype. Its `thread` takes the
`ChatThread`, its `composer` the `PromptInput`, and its
`aside` an `ArtifactPane`, named by
`asideLabel`. Use it and no other layout. The thread is the one region
that scrolls, and it needs a bounded box that application code cannot draw. The page itself does not
scroll, so the composer stays in view.

Write this screen in code. A screen spec repeats nothing, and a thread has one
`ChatMessage` for each turn. The app's router or root mounts the page as it mounts any
other ([app.md](app.md)).

## 3. The container

```tsx
import { useState } from 'react'
import { ChatMessage, ChatThread, ConversationPage, Markdown, PromptInput } from '@polymorph/react-ui'

import { streamReply } from './model'

interface Turn {
  id: string
  role: 'user' | 'assistant'
  text: string
  status?: 'streaming' | 'complete' | 'stopped' | 'error'
}

export function AssistantPage() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [request, setRequest] = useState<AbortController>()
  const streaming = request !== undefined

  async function send(text: string) {
    const id = crypto.randomUUID()
    const controller = new AbortController()
    const change = (next: Partial<Turn>) =>
      setTurns((all) => all.map((turn) => (turn.id === id ? { ...turn, ...next } : turn)))
    setRequest(controller)
    setTurns((all) => [
      ...all,
      { id: `${id}-asked`, role: 'user', text },
      { id, role: 'assistant', text: '', status: 'streaming' },
    ])
    try {
      let reply = ''
      for await (const piece of streamReply(text, controller.signal)) {
        reply += piece
        change({ text: reply })
      }
      change({ status: 'complete' })
    } catch {
      change({ status: controller.signal.aborted ? 'stopped' : 'error' })
    } finally {
      setRequest(undefined)
    }
  }

  return (
    <ConversationPage
      title="Assistant"
      thread={
        <ChatThread label="Conversation" streaming={streaming}>
          {turns.map((turn) => (
            <ChatMessage key={turn.id} role={turn.role} author={turn.role === 'user' ? 'You' : 'Assistant'} status={turn.status}>
              {turn.role === 'user' ? turn.text : <Markdown streaming={turn.status === 'streaming'}>{turn.text}</Markdown>}
            </ChatMessage>
          ))}
        </ChatThread>
      }
      composer={<PromptInput label="Message" streaming={streaming} onSubmit={(text) => void send(text)} onStop={() => request?.abort()} />}
    />
  )
}
```

`streamReply` stands for the app's own client: an async iterator of the pieces of a reply. A
client that also reports a tool request or a reply's sources yields events of several kinds, and
the container keeps what each one says in the turn. The `PromptInput` here holds its own
text and empties itself when it sends. One given a `value` is the app's to
empty.

In Vue,
Svelte, Solid and Angular the members and props have the same names, and a prop that takes content
(`thread`, `composer`,
`aside`, `actions`) is the framework's own slot,
as [code.md](code.md) writes one.

## 4. What the container must do

- **Own the network.** No member fetches, uploads, retries or stores. A member draws what its props
  say and asks through its handlers: `onSubmit`,
  `onStop`, `onAttach`,
  `onReject`, `onApprove` and
  `onDeny`.
- **Stream by rendering again.** `streaming` means more is coming. Pass the
  longer string each time a piece arrives. Set it on the `Markdown` or
  `StreamingText` that is growing, on the `ChatThread` and on the
  `PromptInput`, whose send control becomes a stop control. Do not animate arriving text and
  do not add a typing indicator: the members show the one pending signal.
- **Say how each turn ended.** `ChatMessage`'s `status` is `error`, `streaming`, `complete` and `stopped`,
  with the reason in `statusMessage`. A reply the person stopped keeps the
  text that arrived.
- **Show a model's text as `Markdown`.** It draws headings, lists, code and links through
  the vocabulary, tolerates text that is half written, shows raw HTML as literal text and drops a
  link whose target is unsafe. Use `StreamingText` only for text with no structure. Do not
  render a model's text any other way.
- **Cite with numbers.** Give `Markdown` the reply's `sources`, each
  with `title` and `href`. A `[1]` in
  the text becomes a `Citation` of the first one. Put a `SourceList` of the same
  sources under the reply.
- **Show work as members.** A tool that ran is a `ToolCall`, its
  `status` one of `error`, `denied`, `done`, `pending`, `running` and `approval`. The steps of a run are a `Plan`, each
  `status` one of `error`, `done`, `pending`, `running` and `skipped`. Thinking is a `ReasoningDisclosure`. A
  document the reply produced goes in the `ArtifactPane`.
- **Ask before a tool acts with `ApprovalCard`** (step 5). It stores no answer.
- **Hold attachments as data.** `PromptInput`'s `attachments` is a
  list with `id`, `name` and
  `status`, one of `error`, `uploading` and `done`. The app uploads a file when
  `onAttach` gives it, and removes one on
  `onRemoveAttachment`. `onReject` gives each file
  the composer refused with the reason, which the app says in a `Toast`. The app sends the
  ids of the uploaded files with the message.
- **Offer mentions and commands through `triggers`.** Each has a
  `char` such as `@` or `/`, a `label`
  and the app's `options`. A pick writes text into the prompt and calls
  `onSelect` with the option. The prompt holds text and no ids, so the
  app keeps the picked options and, when the prompt is sent, sends the ids of those whose text is
  still in it. `RichTextInput` differs: its mention is an entity the document stores, and
  it names the character `trigger`
  ([rich-text.md](rich-text.md)). For
  options the app searches for, set `filter` to `false`, read the
  query from `onQueryChange` and set
  `loading` until they arrive.
- **Take voice with `RecordButton`** in `PromptInput`'s
  `trailing`. The app records, and passes
  `elapsed` and `level` back. An
  `AudioPlayer` in a turn plays the recording.
- **Pass the words.** Every label and status a member shows or announces is a prop, in the app's
  language: `label` and `messages`,
  `label`, `approveLabel` and
  `denyLabel`, `label`. The app formats a
  duration ("Thought for 12 seconds"). No member counts time.

The thread announces each turn once to a screen reader when it is added. Do not add a live region
of your own, and do not put the thread inside another scrolling box.

## 5. A tool that asks first

```tsx
import { ApprovalCard, ChatMessage, ToolCall } from '@polymorph/react-ui'

type Answer = 'approved' | 'denied'

interface Call {
  id: string
  name: string
  summary: string
  input: unknown
  /** The answer on its way to the server. */
  sending?: Answer
  /** The answer the server has. */
  decision?: Answer
  /** How the run stands once it is approved. */
  run: 'running' | 'done' | 'error'
}

export function ToolTurn({ call, onAnswer }: { call: Call; onAnswer: (id: string, answer: Answer) => void }) {
  const status = call.decision === undefined ? 'approval' : call.decision === 'denied' ? 'denied' : call.run
  return (
    <ChatMessage role="assistant" author="Assistant">
      <ToolCall name={call.name} summary={call.summary} input={call.input} status={status} />
      <ApprovalCard
        title={`Run ${call.name}?`}
        description={call.summary}
        pending={call.sending}
        decision={call.decision}
        onApprove={() => onAnswer(call.id, 'approved')}
        onDeny={() => onAnswer(call.id, 'denied')}
      />
    </ChatMessage>
  )
}
```

- The model's client reports the request, and the container adds the call to the turn of the reply
  that asked. The `ToolCall` and the `ApprovalCard` sit side by side in that turn's
  `ChatMessage`.
- On an answer the container sets `pending` and sends the answer to its
  server. When the server has it, the container sets `decision`.
- Both stay in the turn. The `ToolCall`'s `status` goes from
  `approval` to `running` and then `done` or `error`, or to `denied`. The card with a
  `decision` is the record of who allowed what, so do not remove it.
- Write `title` as a question the person can answer, from the app's own
  data: the order's number and the amount, not the model's sentence. Set
  `tone` to `danger` for what cannot be undone.
- The tool runs on the server, and only after the server has the approval. A page that runs the
  tool because its own state says "approved" has asked nobody.

## 6. What the members do not do

- They hold no model client, no stream reader and no message store. Those are the app's.
- A code block is not coloured by token.
- Editing, branching and regenerating a turn are the app's `Button`s in
  `ChatMessage`'s `actions`.
- A turn that holds a screen the model wrote, such as a form to fill, is the
  `polymorph-runtime-screen` skill's.
