import { type ComponentStates } from '@polymorph/react'
import type { ReactNode } from 'react'
import { EmptyState } from '../structure/EmptyState'
import { ChatMessage } from './ChatMessage'
import { REPLY_ACTIONS } from './chat-message.states'
import { ChatThread } from './ChatThread'
import { Markdown } from './Markdown'
import { PROSE, STRUCTURE } from './markdown.states'
import { StreamingText } from './StreamingText'
import styles from '@polymorph/recipes/ai/chat-thread.module.css'

/**
 * States fixture, from `design/components/chat-thread.md`'s States table.
 *
 * The thread fills its box. Entries that test the box (a long thread that
 * scrolls, following) render inside a fixed-height harness (ScrollArea's
 * pattern). Entries about the turns render without a box and grow to fit their
 * content.
 */

export const TURNS = (
  <>
    <ChatMessage role="user" author="You" time="09:40">
      Why did the webhook retry twice with the same promo code?
    </ChatMessage>
    <ChatMessage role="assistant" author="Pilot" time="09:41" actions={REPLY_ACTIONS}>
      <Markdown>{PROSE}</Markdown>
    </ChatMessage>
    <ChatMessage role="user" author="You" time="09:43">
      What changed in the last release?
    </ChatMessage>
    <ChatMessage role="assistant" author="Pilot" time="09:43" actions={REPLY_ACTIONS}>
      <Markdown>{STRUCTURE}</Markdown>
    </ChatMessage>
  </>
)

/** ScrollArea's harness pattern: a fixed-height box for the thread to fill. */
function Boxed({ children }: { children: ReactNode }) {
  return <div className={styles.harness}>{children}</div>
}

export const states: ComponentStates = {
  component: 'ChatThread',

  entries: [
    {
      name: 'a conversation — four turns, both registers',
      render: () => <ChatThread label="Conversation">{TURNS}</ChatThread>,
      expect: { 'data-state': null, 'data-streaming': null },
    },
    {
      name: 'streaming — the newest turn still arriving, the log busy',
      render: () => (
        <ChatThread label="Conversation" streaming>
          <ChatMessage role="user" author="You" time="09:40">
            Why did the webhook retry twice with the same promo code?
          </ChatMessage>
          <ChatMessage role="assistant" author="Pilot" status="streaming">
            <StreamingText streaming>{PROSE.slice(0, 120)}</StreamingText>
          </ChatMessage>
        </ChatThread>
      ),
      expect: { 'data-streaming': '' },
    },
    {
      name: 'in a box — the thread scrolls inside itself, reading from the bottom',
      render: () => (
        <Boxed>
          <ChatThread label="Conversation">
            {TURNS}
            {TURNS}
          </ChatThread>
        </Boxed>
      ),
    },
    {
      name: 'empty — the app’s first words, not the thread’s',
      render: () => (
        <ChatThread
          label="Conversation"
          empty={
            <EmptyState
              icon="model"
              title="Ask Pilot anything"
              description="It can read the workspace, run the tools you allow, and cite what it finds."
            />
          }
        />
      ),
    },
  ],

  /*
   * `detached` is set by the reader scrolling up, which no prop reaches. The
   * stylesheet keys the jump control on it. Focus comes from the keyboard,
   * because the region is a tab stop while it overflows.
   */
  requiredSelectors: [':focus-visible', '[data-state="detached"]'],
}
