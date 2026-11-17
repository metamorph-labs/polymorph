import {
  AppShell,
  ApprovalCard,
  ArtifactPane,
  AttachmentChip,
  Badge,
  Button,
  ChatMessage,
  ChatThread,
  CodeBlock,
  ConversationPage,
  EmptyState,
  Inline,
  Markdown,
  PromptInput,
  ReasoningDisclosure,
  SourceList,
  ToolCall,
  Tooltip,
  type ApprovalDecision,
  type CitationSource,
  type FileRejection,
  type PromptAttachment,
} from '@polymorph/react-ui'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { navigate } from '../harness/router'
import { PAGES_ROOT } from './routes'

/**
 * Exemplar: **Pilot**, a workspace assistant. The ConversationPage archetype inside a full product
 * frame, showing the whole `ai` tier on one screen.
 *
 * The thread holds every kind of turn the tier renders: the user's message with an attached file,
 * the model's full-width reply with its reasoning, the tool it ran, the sources it cited and the
 * hover row, and a permission request the user answers in place. When a prompt is sent, a reply
 * arrives in pieces. A timer simulates this, because the network belongs to the app and this app
 * has none. The artifact pane next to the thread shows the file the reply produced, in two views.
 *
 * Vocabulary only: no CSS, no `className`, no raw controls. The timer and the state machine are
 * application logic, which belongs in application code.
 */

const ASSISTANT = 'Pilot'

const SOURCES: CitationSource[] = [
  {
    title: 'Webhook delivery and retries',
    href: 'https://docs.example.org/webhooks/retries',
    domain: 'docs.example.org',
    snippet:
      'Deliveries are retried with exponential backoff, up to five attempts, with the original ' +
      'idempotency key on every attempt.',
  },
  {
    title: 'Incident 2026-08-14: duplicate promo codes on retry',
    href: 'https://status.example.org/incidents/2026-08-14',
    domain: 'status.example.org',
    snippet: 'Retries minted a fresh idempotency key, so the receiver applied the promo twice.',
  },
]

const FIRST_REPLY = `The retry **did** carry a promo code twice, and the cause is in the retry path rather than the first attempt.

1. The first delivery timed out after the receiver had already applied the code.
2. The retry minted a *new* idempotency key, so the receiver treated it as a new order [2].
3. Since the fix, every attempt carries the original key and the receiver refuses the duplicate [1].

\`\`\`ts
return retry(() => post(event), { attempts: 5, idempotencyKey: event.id })
\`\`\`

The schedule itself was never the problem — it is exponential with a cap at five attempts [1].`

const REASONING = `The question is about *retries*, not first attempts, so the relevant setting is the backoff cap.

- The docs say five attempts with exponential backoff.
- The incident on the 14th was about duplicate promo codes, which the idempotency key now prevents.

So the answer should lead with the key, then the schedule.`

const ARTIFACT_CODE = `export async function deliver(event: WebhookEvent) {
  return retry(() => post(event), {
    attempts: 5,
    firstDelayMs: 2_000,
    idempotencyKey: event.id,
  })
}
`

const ARTIFACT_NOTES = `## deliver.ts

Every attempt now carries the original idempotency key, so a receiver that already applied the event refuses the retry.

| Attempt | Wait |
| --- | ---: |
| 1 | 2s |
| 2 | 4s |
| 3 | 8s |`

/**
 * The reply to a sent prompt, split into the pieces it arrives in. It is one fixed answer,
 * because the page demonstrates the states, not a model.
 */
const NEXT_REPLY =
  'I checked the delivery log you attached. Two deliveries of event `evt_8821` reached the ' +
  'receiver eleven seconds apart with different idempotency keys — the second is the retry. ' +
  'That matches the incident on the 14th [2], and the fix in `deliver.ts` closes it: the key is ' +
  'now the event id on every attempt [1].\n\nWant me to open a pull request with the change?'

const CHUNK_MS = 45
const CHUNK_CHARS = 6

type ReplyPhase = 'idle' | 'thinking' | 'streaming'

interface Turn {
  id: string
  role: 'user' | 'assistant'
  text: string
  attachments?: PromptAttachment[]
}

function replyActions(onCopy: () => void): ReactNode {
  return (
    <>
      <Button
        variant="ghost"
        tone="neutral"
        size="sm"
        iconOnly
        icon="copy"
        label="Copy"
        onClick={onCopy}
      />
      <Button variant="ghost" tone="neutral" size="sm" iconOnly icon="refresh" label="Regenerate" />
      <Button variant="ghost" tone="neutral" size="sm" iconOnly icon="helpful" label="Helpful" />
      <Button
        variant="ghost"
        tone="neutral"
        size="sm"
        iconOnly
        icon="unhelpful"
        label="Not helpful"
      />
    </>
  )
}

export function AssistantPage() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<PromptAttachment[]>([])
  const [phase, setPhase] = useState<ReplyPhase>('idle')
  const [partial, setPartial] = useState('')
  const [decision, setDecision] = useState<ApprovalDecision>()
  const [pendingDecision, setPendingDecision] = useState<ApprovalDecision>()
  const [paneOpen, setPaneOpen] = useState(true)
  const timer = useRef<number>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  /** The simulated reply: a short thinking phase, then the answer in pieces. */
  const beginReply = useCallback(() => {
    setPhase('thinking')
    setPartial('')
    let at = 0
    const step = () => {
      at += CHUNK_CHARS
      setPartial(NEXT_REPLY.slice(0, at))
      if (at < NEXT_REPLY.length) timer.current = window.setTimeout(step, CHUNK_MS)
      else {
        setTurns((current) => [
          ...current,
          { id: `a-${current.length}`, role: 'assistant', text: NEXT_REPLY },
        ])
        setPhase('idle')
        setPartial('')
      }
    }
    timer.current = window.setTimeout(() => {
      setPhase('streaming')
      step()
    }, 900)
  }, [])

  function send(text: string) {
    setTurns((current) => [
      ...current,
      {
        id: `u-${current.length}`,
        role: 'user',
        text,
        attachments: attachments.length > 0 ? attachments : undefined,
      },
    ])
    setDraft('')
    setAttachments([])
    beginReply()
  }

  function stop() {
    window.clearTimeout(timer.current)
    if (partial !== '') {
      setTurns((current) => [
        ...current,
        { id: `a-${current.length}`, role: 'assistant', text: partial },
      ])
    }
    setPhase('idle')
    setPartial('')
  }

  function attach(files: File[]) {
    setAttachments((current) => [
      ...current,
      ...files.map((file, index) => ({
        id: `${Date.now()}-${index}`,
        name: file.name,
        size: file.size,
      })),
    ])
  }

  function reject(rejections: FileRejection[]) {
    setAttachments((current) => [
      ...current,
      ...rejections.map((rejection, index) => ({
        id: `${Date.now()}-r${index}`,
        name: rejection.file.name,
        status: 'error' as const,
        message: rejection.reason === 'size' ? 'Over 10 MB' : 'Not a file type Pilot reads',
      })),
    ])
  }

  function decide(next: ApprovalDecision) {
    setPendingDecision(next)
    window.setTimeout(() => {
      setPendingDecision(undefined)
      setDecision(next)
    }, 700)
  }

  const copyReply = (text: string) => () => void navigator.clipboard.writeText(text)
  const streaming = phase !== 'idle'

  const pane = paneOpen ? (
    <ArtifactPane
      title="deliver.ts"
      kind="code"
      meta="TypeScript · 9 lines"
      actions={
        <>
          <Button
            variant="ghost"
            tone="neutral"
            size="sm"
            iconOnly
            icon="copy"
            label="Copy"
            onClick={copyReply(ARTIFACT_CODE)}
          />
          <Button
            variant="ghost"
            tone="neutral"
            size="sm"
            iconOnly
            icon="download"
            label="Download"
          />
        </>
      }
      onClose={() => setPaneOpen(false)}
      views={[
        { id: 'code', label: 'Code', content: <CodeBlock copyable>{ARTIFACT_CODE}</CodeBlock> },
        { id: 'notes', label: 'Notes', content: <Markdown>{ARTIFACT_NOTES}</Markdown> },
      ]}
    />
  ) : undefined

  // The pane and its name are set together (ConversationPage pairs them in its types), so the
  // page's two states are written as two objects rather than two optional props.
  const asideProps = paneOpen
    ? ({ aside: pane, asideLabel: 'Artifact' } as const)
    : ({ aside: undefined, asideLabel: undefined } as const)

  return (
    <AppShell
      brand={
        <Badge variant="solid" tone="accent">
          Pilot
        </Badge>
      }
      sidebar={
        <>
          <AppShell.NavGroup label="Workspace">
            <AppShell.NavItem icon="comment" label="Chats" current onSelect={() => {}} />
            <AppShell.NavItem icon="folder" label="Projects" onSelect={() => {}} />
            <AppShell.NavItem
              icon="ledger"
              label="Runs"
              end={<Badge>3</Badge>}
              onSelect={() => {}}
            />
          </AppShell.NavGroup>
          <AppShell.NavGroup label="Pilot">
            <AppShell.NavItem icon="tool" label="Tools" onSelect={() => {}} />
            <AppShell.NavItem icon="settings" label="Settings" onSelect={() => {}} />
          </AppShell.NavGroup>
        </>
      }
      sidebarFooter={<AppShell.UserCard name="Ada Okonkwo" detail="ada@relay.example" />}
      topbar={{
        leading: (
          <Button
            variant="ghost"
            tone="neutral"
            size="sm"
            icon="back"
            label="All pages"
            onClick={() => navigate(PAGES_ROOT)}
          />
        ),
        trailing: (
          <Tooltip content="Show the artifact pane">
            <Button
              variant="ghost"
              tone="neutral"
              size="sm"
              iconOnly
              icon="artifact"
              label="Artifact pane"
              disabled={paneOpen}
              onClick={() => setPaneOpen(true)}
            />
          </Tooltip>
        ),
      }}
    >
      <ConversationPage
        title="Webhook retries"
        description="Pilot can read the workspace, run the tools you allow, and cite what it finds."
        actions={<Button variant="outline" tone="neutral" size="sm" icon="add" label="New chat" />}
        thread={
          <ChatThread
            label="Conversation"
            streaming={streaming}
            empty={
              <EmptyState
                icon="model"
                title="Ask Pilot anything"
                description="It can read the workspace, run the tools you allow, and cite what it finds."
              />
            }
          >
            <ChatMessage role="user" author="You" time="09:40">
              Why did the webhook retry twice with the same promo code?
              <Inline gap={2} wrap>
                <AttachmentChip name="delivery.log" size={48_210} />
              </Inline>
            </ChatMessage>

            <ChatMessage
              role="assistant"
              author={ASSISTANT}
              time="09:41"
              actions={replyActions(copyReply(FIRST_REPLY))}
            >
              <ReasoningDisclosure label="Thought for 6 seconds">
                <Markdown size="sm">{REASONING}</Markdown>
              </ReasoningDisclosure>
              <ToolCall
                name="read_file"
                summary="src/webhooks/retry.ts"
                status="done"
                duration="0.4s"
                input={{ path: 'src/webhooks/retry.ts', range: { start: 1, end: 80 } }}
                output={
                  <CodeBlock>
                    {'export const RETRY_CAP = 5\nexport const FIRST_RETRY_MS = 2_000'}
                  </CodeBlock>
                }
              />
              <Markdown sources={SOURCES}>{FIRST_REPLY}</Markdown>
              <SourceList sources={SOURCES} label="Sources" />
            </ChatMessage>

            <ChatMessage role="assistant" author={ASSISTANT} time="09:42">
              <Markdown>
                I can apply the fix to staging now. It runs three pending migrations in order and
                stops at the first failure.
              </Markdown>
              <ToolCall
                name="run_command"
                icon="terminal"
                summary="pnpm db:migrate --env staging"
                status={
                  decision === 'approved' ? 'done' : decision === 'denied' ? 'denied' : 'approval'
                }
                duration={decision === 'approved' ? '12s' : undefined}
              />
              <ApprovalCard
                title="Run the migration against the staging database?"
                description="Pilot will run three pending migrations in order and stop at the first failure."
                onApprove={() => decide('approved')}
                onDeny={() => decide('denied')}
                decision={decision}
                pending={pendingDecision}
              >
                <CodeBlock>pnpm db:migrate --env staging</CodeBlock>
              </ApprovalCard>
            </ChatMessage>

            {turns.map((turn) =>
              turn.role === 'user' ? (
                <ChatMessage key={turn.id} role="user" author="You">
                  {turn.text}
                  {turn.attachments === undefined ? null : (
                    <Inline gap={2} wrap>
                      {turn.attachments.map((attachment) => (
                        <AttachmentChip
                          key={attachment.id}
                          name={attachment.name}
                          size={attachment.size}
                        />
                      ))}
                    </Inline>
                  )}
                </ChatMessage>
              ) : (
                <ChatMessage
                  key={turn.id}
                  role="assistant"
                  author={ASSISTANT}
                  actions={replyActions(copyReply(turn.text))}
                >
                  <Markdown sources={SOURCES}>{turn.text}</Markdown>
                </ChatMessage>
              ),
            )}

            {streaming ? (
              <ChatMessage role="assistant" author={ASSISTANT} status="streaming">
                <ReasoningDisclosure
                  label={phase === 'thinking' ? 'Thinking…' : 'Thought for a second'}
                  streaming={phase === 'thinking'}
                >
                  <Markdown size="sm">Reading the attached log for duplicate event ids.</Markdown>
                </ReasoningDisclosure>
                <Markdown streaming sources={SOURCES}>
                  {partial}
                </Markdown>
              </ChatMessage>
            ) : null}
          </ChatThread>
        }
        composer={
          <PromptInput
            label="Message"
            placeholder="Ask Pilot anything…"
            value={draft}
            onChange={setDraft}
            onSubmit={send}
            onStop={stop}
            streaming={streaming}
            attachments={attachments}
            onAttach={attach}
            onReject={reject}
            onRemoveAttachment={(id) =>
              setAttachments((current) => current.filter((item) => item.id !== id))
            }
            maxSize={10 * 1024 * 1024}
            hint="Enter to send · Shift+Enter for a new line · Pilot can make mistakes"
          />
        }
        {...asideProps}
      />
    </AppShell>
  )
}
