import type { Registry } from '@polymorph/registry'

import { all, Facts } from './facts'

/**
 * The conversation screen: the members of the `ai` tier, the page that holds
 * them, and what the container owns. The screen skill sends a model here when
 * the screen holds a conversation with a model. The member table is read from
 * the registry, so a member added to the tier is listed without an edit.
 */
export function chatReference(registry: Registry): string {
  const f = new Facts(registry)
  const members = f
    .tier('ai')
    .map((name) => `| ${f.m(name)} | ${f.purpose(name)} |`)
    .join('\n')
  const turn = all(f.values('ChatMessage', 'status').map((value) => `\`${value}\``))
  const tool = all(f.values('ToolCall', 'status').map((value) => `\`${value}\``))
  const step = all(f.fieldValues('PlanStep', 'status').map((value) => `\`${value}\``))
  const attachment = all(f.fieldValues('PromptAttachment', 'status').map((value) => `\`${value}\``))
  return `
# A conversation with a model

A screen where a person talks with a model, turn by turn, is built from the conversation members.
They draw what the container tells them. The container owns the model, the transport and the
messages.

People who write to each other on a record, such as a ticket's messages or a document's comments,
are not in a conversation with a model. That is ${f.m('CommentThread')}, with
${f.part('CommentThread', 'Comment')} for each comment, read from the top of the page.

## 1. The members

| Member | What it is |
| --- | --- |
${members}

\`component <Name>\` prints each one's props and, under \`## Types\`, the fields of the data types
those props take, such as a trigger, an attachment or a source. Do not build any of these from other
members, and do not bring in a chat library's components.

## 2. The page

${f.m('ConversationPage')} is the page archetype. Its ${f.p('ConversationPage', 'thread')} takes the
${f.m('ChatThread')}, its ${f.p('ConversationPage', 'composer')} the ${f.m('PromptInput')}, and its
${f.p('ConversationPage', 'aside')} an ${f.m('ArtifactPane')}, named by
${f.p('ConversationPage', 'asideLabel')}. Use it and no other layout. The thread is the one region
that scrolls, and it needs a bounded box that application code cannot draw. The page itself does not
scroll, so the composer stays in view.

Write this screen in code. A screen spec repeats nothing, and a thread has one
${f.m('ChatMessage')} for each turn. The app's router or root mounts the page as it mounts any
other ([app.md](app.md)).

## 3. The container

\`\`\`tsx
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
      { id: \`\${id}-asked\`, role: 'user', text },
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
\`\`\`

\`streamReply\` stands for the app's own client: an async iterator of the pieces of a reply. A
client that also reports a tool request or a reply's sources yields events of several kinds, and
the container keeps what each one says in the turn. The ${f.m('PromptInput')} here holds its own
text and empties itself when it sends. One given a ${f.p('PromptInput', 'value')} is the app's to
empty.

In Vue,
Svelte, Solid and Angular the members and props have the same names, and a prop that takes content
(${f.p('ConversationPage', 'thread')}, ${f.p('ConversationPage', 'composer')},
${f.p('ConversationPage', 'aside')}, ${f.p('ChatMessage', 'actions')}) is the framework's own slot,
as [code.md](code.md) writes one.

## 4. What the container must do

- **Own the network.** No member fetches, uploads, retries or stores. A member draws what its props
  say and asks through its handlers: ${f.p('PromptInput', 'onSubmit')},
  ${f.p('PromptInput', 'onStop')}, ${f.p('PromptInput', 'onAttach')},
  ${f.p('PromptInput', 'onReject')}, ${f.p('ApprovalCard', 'onApprove')} and
  ${f.p('ApprovalCard', 'onDeny')}.
- **Stream by rendering again.** ${f.p('Markdown', 'streaming')} means more is coming. Pass the
  longer string each time a piece arrives. Set it on the ${f.m('Markdown')} or
  ${f.m('StreamingText')} that is growing, on the ${f.m('ChatThread')} and on the
  ${f.m('PromptInput')}, whose send control becomes a stop control. Do not animate arriving text and
  do not add a typing indicator: the members show the one pending signal.
- **Say how each turn ended.** ${f.m('ChatMessage')}'s ${f.p('ChatMessage', 'status')} is ${turn},
  with the reason in ${f.p('ChatMessage', 'statusMessage')}. A reply the person stopped keeps the
  text that arrived.
- **Show a model's text as ${f.m('Markdown')}.** It draws headings, lists, code and links through
  the vocabulary, tolerates text that is half written, shows raw HTML as literal text and drops a
  link whose target is unsafe. Use ${f.m('StreamingText')} only for text with no structure. Do not
  render a model's text any other way.
- **Cite with numbers.** Give ${f.m('Markdown')} the reply's ${f.p('Markdown', 'sources')}, each
  with ${f.field('CitationSource', 'title')} and ${f.field('CitationSource', 'href')}. A \`[1]\` in
  the text becomes a ${f.m('Citation')} of the first one. Put a ${f.m('SourceList')} of the same
  sources under the reply.
- **Show work as members.** A tool that ran is a ${f.m('ToolCall')}, its
  ${f.p('ToolCall', 'status')} one of ${tool}. The steps of a run are a ${f.m('Plan')}, each
  ${f.field('PlanStep', 'status')} one of ${step}. Thinking is a ${f.m('ReasoningDisclosure')}. A
  document the reply produced goes in the ${f.m('ArtifactPane')}.
- **Ask before a tool acts with ${f.m('ApprovalCard')}** (step 5). It stores no answer.
- **Hold attachments as data.** ${f.m('PromptInput')}'s ${f.p('PromptInput', 'attachments')} is a
  list with ${f.field('PromptAttachment', 'id')}, ${f.field('PromptAttachment', 'name')} and
  ${f.field('PromptAttachment', 'status')}, one of ${attachment}. The app uploads a file when
  ${f.p('PromptInput', 'onAttach')} gives it, and removes one on
  ${f.p('PromptInput', 'onRemoveAttachment')}. ${f.p('PromptInput', 'onReject')} gives each file
  the composer refused with the reason, which the app says in a ${f.m('Toast')}. The app sends the
  ids of the uploaded files with the message.
- **Offer mentions and commands through ${f.p('PromptInput', 'triggers')}.** Each has a
  ${f.field('PromptTrigger', 'char')} such as \`@\` or \`/\`, a ${f.field('PromptTrigger', 'label')}
  and the app's ${f.field('PromptTrigger', 'options')}. A pick writes text into the prompt and calls
  ${f.field('PromptTrigger', 'onSelect')} with the option. The prompt holds text and no ids, so the
  app keeps the picked options and, when the prompt is sent, sends the ids of those whose text is
  still in it. ${f.m('RichTextInput')} differs: its mention is an entity the document stores, and
  it names the character ${f.field('RichTextEntitySource', 'trigger')}
  ([rich-text.md](rich-text.md)). For
  options the app searches for, set ${f.field('PromptTrigger', 'filter')} to \`false\`, read the
  query from ${f.field('PromptTrigger', 'onQueryChange')} and set
  ${f.field('PromptTrigger', 'loading')} until they arrive.
- **Take voice with ${f.m('RecordButton')}** in ${f.m('PromptInput')}'s
  ${f.p('PromptInput', 'trailing')}. The app records, and passes
  ${f.p('RecordButton', 'elapsed')} and ${f.p('RecordButton', 'level')} back. An
  ${f.m('AudioPlayer')} in a turn plays the recording.
- **Pass the words.** Every label and status a member shows or announces is a prop, in the app's
  language: ${f.p('ChatThread', 'label')} and ${f.p('ChatThread', 'messages')},
  ${f.p('PromptInput', 'label')}, ${f.p('ApprovalCard', 'approveLabel')} and
  ${f.p('ApprovalCard', 'denyLabel')}, ${f.p('ReasoningDisclosure', 'label')}. The app formats a
  duration ("Thought for 12 seconds"). No member counts time.

The thread announces each turn once to a screen reader when it is added. Do not add a live region
of your own, and do not put the thread inside another scrolling box.

## 5. A tool that asks first

\`\`\`tsx
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
        title={\`Run \${call.name}?\`}
        description={call.summary}
        pending={call.sending}
        decision={call.decision}
        onApprove={() => onAnswer(call.id, 'approved')}
        onDeny={() => onAnswer(call.id, 'denied')}
      />
    </ChatMessage>
  )
}
\`\`\`

- The model's client reports the request, and the container adds the call to the turn of the reply
  that asked. The ${f.m('ToolCall')} and the ${f.m('ApprovalCard')} sit side by side in that turn's
  ${f.m('ChatMessage')}.
- On an answer the container sets ${f.p('ApprovalCard', 'pending')} and sends the answer to its
  server. When the server has it, the container sets ${f.p('ApprovalCard', 'decision')}.
- Both stay in the turn. The ${f.m('ToolCall')}'s ${f.p('ToolCall', 'status')} goes from
  \`approval\` to \`running\` and then \`done\` or \`error\`, or to \`denied\`. The card with a
  ${f.p('ApprovalCard', 'decision')} is the record of who allowed what, so do not remove it.
- Write ${f.p('ApprovalCard', 'title')} as a question the person can answer, from the app's own
  data: the order's number and the amount, not the model's sentence. Set
  ${f.p('ApprovalCard', 'tone')} to \`danger\` for what cannot be undone.
- The tool runs on the server, and only after the server has the approval. A page that runs the
  tool because its own state says "approved" has asked nobody.

## 6. What the members do not do

- They hold no model client, no stream reader and no message store. Those are the app's.
- A code block is not coloured by token.
- Editing, branching and regenerating a turn are the app's ${f.m('Button')}s in
  ${f.m('ChatMessage')}'s ${f.p('ChatMessage', 'actions')}.
- A turn that holds a screen the model wrote, such as a form to fill, is the
  \`polymorph-runtime-screen\` skill's.
`.trimStart()
}
