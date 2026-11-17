'use client'

import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { Inline } from '../layout/Inline'
import { AttachmentChip } from './AttachmentChip'
import { ChatMessage } from './ChatMessage'
import { Markdown } from './Markdown'
import { PROSE } from './markdown.states'
import { StreamingText } from './StreamingText'

/** States fixture, from `design/components/chat-message.md`'s States table. */

const noop = () => {}

/** The hover row used by every reply in the fixture. */
export const REPLY_ACTIONS = (
  <>
    <Button
      variant="ghost"
      tone="neutral"
      size="sm"
      iconOnly
      icon="copy"
      label="Copy"
      onClick={noop}
    />
    <Button
      variant="ghost"
      tone="neutral"
      size="sm"
      iconOnly
      icon="refresh"
      label="Regenerate"
      onClick={noop}
    />
    <Button
      variant="ghost"
      tone="neutral"
      size="sm"
      iconOnly
      icon="helpful"
      label="Helpful"
      onClick={noop}
    />
    <Button
      variant="ghost"
      tone="neutral"
      size="sm"
      iconOnly
      icon="unhelpful"
      label="Not helpful"
      onClick={noop}
    />
  </>
)

export const states: ComponentStates = {
  component: 'ChatMessage',

  entries: [
    {
      name: 'the reader — a bubble at the end edge',
      render: () => (
        <ChatMessage role="user" author="You" time="09:41">
          Why did the webhook retry twice with the same promo code?
        </ChatMessage>
      ),
      expect: { 'data-role': 'user', 'data-status': null },
    },
    {
      name: 'the reader, with files — chips under the words',
      render: () => (
        <ChatMessage role="user" author="You" time="09:41">
          Here is the delivery log and the policy we agreed on.
          <Inline gap={2} wrap>
            <AttachmentChip name="delivery.log" size={48_210} />
            <AttachmentChip name="retry-policy.pdf" size={184_320} />
          </Inline>
        </ChatMessage>
      ),
    },
    {
      name: 'the model — full-width prose with the mark, and the hover row',
      render: () => (
        <ChatMessage role="assistant" author="Pilot" time="09:41" actions={REPLY_ACTIONS}>
          <Markdown>{PROSE}</Markdown>
        </ChatMessage>
      ),
      expect: { 'data-role': 'assistant', 'aria-label': 'Pilot' },
    },
    {
      name: 'the model, streaming — busy, no actions yet',
      render: () => (
        <ChatMessage role="assistant" author="Pilot" status="streaming">
          <StreamingText streaming>{PROSE.slice(0, 80)}</StreamingText>
        </ChatMessage>
      ),
      expect: { 'data-status': 'streaming', 'aria-busy': 'true' },
    },
    {
      name: 'stopped — the app’s words for a turn the reader ended',
      render: () => (
        <ChatMessage
          role="assistant"
          author="Pilot"
          status="stopped"
          statusMessage="Stopped generating"
          actions={REPLY_ACTIONS}
        >
          <Markdown>{PROSE.slice(0, 140)}</Markdown>
        </ChatMessage>
      ),
      expect: { 'data-status': 'stopped' },
    },
    {
      name: 'error — a turn that failed',
      render: () => (
        <ChatMessage
          role="assistant"
          author="Pilot"
          status="error"
          statusMessage="The model did not respond. Try again."
          actions={REPLY_ACTIONS}
        >
          <Markdown>{''}</Markdown>
        </ChatMessage>
      ),
      expect: { 'data-status': 'error' },
    },
    {
      name: 'a pictured speaker — an Avatar in the mark',
      render: () => (
        <ChatMessage
          role="user"
          author="Ada Okonkwo"
          avatar="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%236b7280'/%3E%3C/svg%3E"
          time="09:40"
        >
          Can you check the retry schedule?
        </ChatMessage>
      ),
    },
    {
      name: 'a system notice — the thread talking about itself',
      render: () => (
        <ChatMessage role="system" author="System">
          Context was summarised to make room for the conversation.
        </ChatMessage>
      ),
      expect: { 'data-role': 'system' },
    },
  ],

  /*
   * The actions row shows on hover and on focus within. No prop reaches those
   * pointer and keyboard states. The error notice is the only status the
   * stylesheet keys beyond the base. The buttons' own states belong to Button.
   */
  requiredSelectors: [':hover', ':focus-within', '[data-status="error"]'],
}
