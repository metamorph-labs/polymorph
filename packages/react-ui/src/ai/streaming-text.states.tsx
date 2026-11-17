import { type ComponentStates } from '@polymorph/react'
import { StreamingText } from './StreamingText'

/** States fixture, from `design/components/streaming-text.md`'s States table. */

const REPLY =
  'The retry schedule is exponential with a cap at five attempts. The first retry fires ' +
  'after two seconds and each one after that doubles the wait.'

export const states: ComponentStates = {
  component: 'StreamingText',

  entries: [
    {
      name: 'arriving — the caret marks where the next word lands',
      render: () => <StreamingText streaming>{REPLY.slice(0, 70)}</StreamingText>,
      expect: { 'data-state': 'streaming', 'aria-busy': 'true', 'data-pending': null },
    },
    {
      name: 'pending — nothing has landed, so the bar stands where the first line will',
      render: () => <StreamingText streaming>{''}</StreamingText>,
      expect: { 'data-state': 'streaming', 'data-pending': '' },
    },
    {
      name: 'complete — Text, with no caret and nothing busy',
      render: () => <StreamingText>{REPLY}</StreamingText>,
      expect: { 'data-state': null, 'aria-busy': null },
    },
    {
      name: 'sm — the secondary step, for a status sentence',
      render: () => (
        <StreamingText size="sm" streaming>
          Searching the workspace for the retry policy
        </StreamingText>
      ),
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'line breaks — whitespace is content',
      render: () => (
        <StreamingText>{'First line.\nSecond line, after a hard break.'}</StreamingText>
      ),
    },
  ],

  /*
   * Every state (streaming, pending, complete) is reachable through props, and
   * the member has no hover, focus or press because it is a paragraph. So the
   * list is empty.
   */
  requiredSelectors: [],
}
