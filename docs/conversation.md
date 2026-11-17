# The conversation tier

How polymorph renders an AI product: the `ai` tier (the thread, its turns, the composer, what a turn
contains and the pane beside it) and the page archetype that holds them. For the model behind the
vocabulary, read [concepts.md](concepts.md). For the laws every member meets, read
[rules.md](rules.md).

Terms used on this page: the **vocabulary** is the closed set of components. A **member** is one of
them. A **tier** is a group of members. A **turn** is one message in a conversation. **The app owns
the network** is FileUpload's rule, and the whole tier follows it.

## What the tier is for

Many of the apps agents build are AI apps, and AI apps need their own set of elements: a reply that
arrives in pieces, markdown a model wrote, a tool that ran, a tool waiting for permission to run, a
sentence that cites a source, and a document the reply produced that is too big to show inline. Chat
products tend to rebuild these, and each rebuild adds a second type scale, a second code block and a
second link style. This tier provides them as members so that they are *selected*, not rebuilt.
It also makes a model's `##` render as this system's `Heading`.

## The members

| Member | What it is | Not to be confused with |
| --- | --- | --- |
| `StreamingText` | plain text still arriving, with a steady caret | `Markdown` (draws structure), `Skeleton` (stands for shape) |
| `Markdown` | a model's markdown drawn through the vocabulary, streaming-tolerant and safe | a document renderer — the reply's shallowest heading is `Heading` level 2, never the page's |
| `AttachmentChip` | a file as a chip, removable in the composer, a record in the message | `Badge` (read-only category), `TagInput`'s chip (a typed word) |
| `PromptInput` | the composer: autosizing field, chips, the app's slots, send that becomes stop, `@` and `/` suggestions | `Textarea` (a field in a form), `FileUpload` (the list and the upload are the app's) |
| `ChatMessage` | one turn — the reader's bubble, the model's full-width prose, the system's notice | `Card` (any surface), `Timeline`'s event (a line about a thing) |
| `ChatThread` | the conversation: the tier's one scroll region, follows the newest turn, announces additions | `ScrollArea` (dresses a region, never creates one) |
| `Plan` | the steps of one agent run, each with its status, read at a glance while the run goes on | `Stepper` (the reader's own flow), `Timeline` (events that are over), `ToolCall` (one invocation) |
| `ToolCall` | a tool invocation: name, status, input and output behind one row | `Alert` (a message to the reader), `ApprovalCard` (asks before the work) |
| `ApprovalCard` | the permission request, with a decided state that stays as the record | `ConfirmDialog` (modal), `Alert` (tells, does not ask) |
| `Citation` | the `[1]` after a sentence — a real link to the source, previewed on dwell | `Link` (a word of the sentence), a footnote (jumps within the page) |
| `SourceList` | the numbered sources beneath a reply that every `[n]` points into | a bibliography (a format), a list of Cards |
| `ReasoningDisclosure` | the model's thinking behind one trigger, with a streaming state | `Collapsible` (content that is simply there), `ToolCall` (something ran) |
| `ArtifactPane` | the pane beside the thread: a frame, a view switch, a scrolling body | `Dialog` (modal), `Tabs` (peer sections, not readings of one thing) |

The tier also has an archetype, `ConversationPage`. It places the thread above the composer, filling
the shell's content region. The aside sits beside them when there is room, and moves into a `Drawer`
when the page's own width is below `48rem`. The archetype exists because the thread's scroll region
needs a bounded box, and application code cannot draw one
(`design/archetypes/conversation-page.md`).

## The rules the tier keeps

**The app owns the network.** No member fetches, buffers, uploads, retries or stores data. Each
member renders what its props say (`streaming`, `status`, `attachments`, `decision`) and requests
actions through handlers (`onSubmit`, `onStop`, `onAttach`/`onReject`, `onApprove`/`onDeny`). An
approval the app did not receive does not count, so `ApprovalCard` never stores an answer on its
own.

**The app owns the microphone.** Voice input is a `RecordButton` in `PromptInput`'s `trailing`
slot. The app calls `getUserMedia` and `MediaRecorder` on `onStart` and `onStop`, and passes
`recording`, `elapsed` and `level` back. The recorded file is the app's to send, and an
`AudioPlayer` in a `ChatMessage` plays it.

**The words are the app's.** Every string a member shows or announces (a status, a control's name, a
duration, a domain) arrives as a prop, formatted by the app in its own language. The generic English
defaults exist so that a region always has a name. Localized hosts pass strings from their own
catalog (`messages` on `PromptInput`, `ChatThread`, `Plan`, `ToolCall`; `approveLabel`/`denyLabel` on
`ApprovalCard`; `label` on `ReasoningDisclosure`). Timeline's rule for time applies to thinking
time: the member displays "Thought for 12 seconds" but never counts the time itself.

**Streaming is a state, not a mechanism.** `streaming` on `StreamingText`, `Markdown`,
`ReasoningDisclosure`, `ArtifactPane`, `PromptInput` and `ChatThread` means "more is coming". It is
shown as a caret, a spinner, a stop control or `aria-busy`. The app re-renders with the longer
string. Each member's cost is linear in its input, and a reply is a few kilobytes. The caret does
not blink, because a blink is an ambient loop with no pattern behind it ([motion.md](motion.md)).
Nothing in the tier animates arriving text, because new text appearing is already a visible change.

**Mentions and commands are text.** `PromptInput`'s `triggers` open a list of the app's
suggestions when the reader types `@` or `/`. A pick writes text in the prompt in place of what was
typed (`@Ada Lovelace`) and calls the trigger's `onSelect` with the option, so the app keeps the
ids it sends with the message. The prompt holds no chips and no rich text, and the composer does
not follow the text a pick wrote: the app checks, when the prompt is sent, which picked options'
text is still in it. An app that loads options for a query sets `filter: false`, hears the query
through `onQueryChange` and sets `loading` until its results arrive. A command the app runs at
once takes `insert: ''`, which removes the typed token and writes nothing
(`design/components/prompt-input.md`).

**Announcing is the thread's.** `ChatThread` is a `log` region with `aria-relevant="additions"`, so
a screen reader announces a turn once when it is added, not on every token. `StreamingText` and
`Markdown` therefore announce nothing themselves, and `ChatMessage` sets `aria-busy` while its turn
streams. A status that changes inside a turn already added is not an addition, so `Plan` adds one
polite status line that names the step at the front of its run and changes once for each step the
run reaches.

**Markdown is safe by construction.** Raw HTML is shown as literal text. A link whose target is not
`http`, `https`, `mailto` or a relative path is shown as plain text. Heading levels are relative to
the reply's shallowest heading, never to the page's levels. The supported syntax is the CommonMark
core that models actually write (`design/components/markdown.md` has the table), plus one addition
of this tier's own: `[n]` is a `Citation` to the nth item of the `sources` the member receives.

**One scroll region, lawfully.** The thread scrolls inside itself, because a conversation outgrows
any box and must be read from the bottom while it grows. The artifact pane scrolls its body for the
same reason. Each is a tab stop when, and only when, it overflows (CodeBlock's rule in
[`scroll-area.md`](../design/components/scroll-area.md)). The page does not scroll. A composer
pinned under a scrolling page would scroll away, and preventing that is the reason
`ConversationPage` exists.

## Composing a screen

```tsx
<ConversationPage
  title="Webhook retries"
  thread={
    <ChatThread label="Conversation" streaming={reply.streaming}>
      <ChatMessage role="user" author="You" time="09:40">
        Why did the webhook retry twice with the same promo code?
      </ChatMessage>
      <ChatMessage role="assistant" author="Pilot" status={reply.status} actions={replyActions}>
        <ReasoningDisclosure label="Thought for 6 seconds">
          <Markdown size="sm">{reply.reasoning}</Markdown>
        </ReasoningDisclosure>
        <ToolCall name="read_file" summary="src/webhooks/retry.ts" status="done" input={call.input} />
        <Markdown streaming={reply.streaming} sources={reply.sources}>{reply.text}</Markdown>
        <SourceList sources={reply.sources} label="Sources" />
      </ChatMessage>
    </ChatThread>
  }
  composer={
    <PromptInput
      label="Message"
      streaming={reply.streaming}
      onStop={stop}
      onSubmit={send}
      attachments={attachments}
      onAttach={attach}
      onReject={reject}
      onRemoveAttachment={remove}
    />
  }
  aside={<ArtifactPane title="deliver.ts" kind="code" views={views} onClose={closePane} />}
  asideLabel="Artifact"
/>
```

Everything above is composition and content binding, with no stylesheet, no `className` and no raw
control. The sample is React. Every other web framework and both native renderers also ship the
tier's members and `ConversationPage` ([frameworks.md](frameworks.md), [native.md](native.md)).
The workbench's page exemplar **Pilot** (`apps/workbench/src/pages/AssistantPage.tsx`,
`/pages/assistant`) is this screen as a product. It uses a simulated reply so that the streaming
states are visible. Run `pnpm dev` and try it under any pairing.

## The tier's icon roles

The roles are `send`, `stop`, `attach`, `record`, `helpful`, `unhelpful` (the conversation's actions) and
`reasoning`, `cite`, `artifact` (its objects). They are listed in
[`design/icons.md`](../design/icons.md) with the other roles. `stop` is a plain square, not a
circled one, because it sits inside a Button that already draws the frame.

## The tier's motion bindings

The tier's own bindings are `chat.message` (a turn's arrival: `slide-fade` `sm` from the bottom
edge, control class, enter only), `streaming.pending` (Skeleton's `shimmer` on the bar shown where
text is still to arrive) and `toolcall.status` (the status glyph's `fade`). `ReasoningDisclosure`
uses `collapsible.content`, `Citation`'s preview uses `popover.panel` through HoverCard, and
`ArtifactPane`'s view swap is a re-render. Those three reuse what already exists, so none of them
adds an entry to `motion.json` ([`design/motion/motion.md`](../design/motion/motion.md)).

## Comments are not a conversation

People who leave comments on a record, such as a ticket, an artifact or a document, are not in a
conversation with a model. Their comments are a `CommentThread`, a member of the `structure`
tier (`design/components/comment-thread.md`), and not a `ChatThread`.

| Use | When | Because |
| --- | --- | --- |
| `ChatThread` and `ChatMessage` | the reader talks with a model, turn by turn | the thread fills a box, follows the newest turn and announces each turn. A turn is the reader's or the model's, and its frame says which |
| `CommentThread` | people write on a record and reply to each other: a ticket's messages, an artifact's comments, an internal note | the thread sits in the page and is read from the top. Each comment has an author, a time, the app's labels and actions, and replies one level deep. It announces nothing |

The messages between a customer and a support desk on a ticket are a `CommentThread` too, because
neither author is a model. The composer under a `CommentThread` is a
`Textarea` in a `FormField` with a `Button`, or a `PromptInput`, placed after the thread. A
comment that arrives while the reader is on the page is the app's to announce, with a `Toast`.

## What the tier does not do

- **No model, no transport.** There is no `useChat`, no SSE client and no message store. Those are
  application logic, and a design system that shipped them would be a framework.
- **No syntax highlighting.** This is also a non-goal of CodeBlock. Colouring code by token would
  need a colour system that nobody has specified.
- **No message editing, branching or regeneration UI beyond a Button.** `actions` on `ChatMessage`
  holds the app's Buttons, and the app decides what they do.
- **No typing-dots indicator.** The pending bar (Skeleton's shimmer) is the only "nothing yet"
  signal, so a product never shows two.
