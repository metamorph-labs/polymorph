'use client'

import { type ComponentStates } from '@polymorph/react'
import { Markdown } from './Markdown'
import { ReasoningDisclosure } from './ReasoningDisclosure'
import { StreamingText } from './StreamingText'

/** States fixture, from `design/components/reasoning-disclosure.md`'s States table. */

const REASONING = `The question is about *retries*, not first attempts, so the relevant setting is the backoff cap.

- The docs say five attempts with exponential backoff.
- The incident on the 14th was about duplicate promo codes, which the idempotency key now prevents.

So the answer should lead with the key, then the schedule.`

export const states: ComponentStates = {
  component: 'ReasoningDisclosure',

  entries: [
    {
      name: 'closed — the working is there for whoever wants it',
      render: () => (
        <ReasoningDisclosure label="Thought for 12 seconds">
          <Markdown size="sm">{REASONING}</Markdown>
        </ReasoningDisclosure>
      ),
      expect: { 'data-state': 'closed', 'data-streaming': null },
    },
    {
      name: 'open',
      render: () => (
        <ReasoningDisclosure label="Thought for 12 seconds" defaultOpen>
          <Markdown size="sm">{REASONING}</Markdown>
        </ReasoningDisclosure>
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'thinking — the mark spins, the root is busy',
      render: () => (
        <ReasoningDisclosure label="Thinking…" streaming defaultOpen>
          <StreamingText size="sm" streaming>
            {REASONING.slice(0, 110)}
          </StreamingText>
        </ReasoningDisclosure>
      ),
      expect: { 'data-streaming': '', 'aria-busy': 'true' },
    },
    {
      name: 'controlled — state follows the prop',
      render: () => (
        <ReasoningDisclosure label="Thought for 4 seconds" open onOpenChange={() => {}}>
          <Markdown size="sm">{REASONING}</Markdown>
        </ReasoningDisclosure>
      ),
      expect: { 'data-state': 'open' },
    },
  ],

  /*
   * The same list as Collapsible, for the same reasons. Hover and focus come
   * from the pointer and keyboard. Open and closed are required because the
   * region's animation and the chevron's rotation key on the Radix attribute.
   */
  requiredSelectors: [':hover', ':focus-visible', '[data-state="open"]', '[data-state="closed"]'],
}
