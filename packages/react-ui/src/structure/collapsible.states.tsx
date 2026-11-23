'use client'

import { type ComponentStates } from '@polymorph/react'
import { Collapsible } from './Collapsible'

/** States fixture, from `design/components/collapsible.md`'s States table. */

const PAYLOAD =
  'Retries follow the backoff schedule configured on the workspace. Delivery ' +
  'headers include the signature, the attempt number and the event id.'

export const states: ComponentStates = {
  component: 'Collapsible',

  entries: [
    {
      name: 'closed — a disclosure that ships open is hiding nothing',
      render: () => <Collapsible label="Advanced options">{PAYLOAD}</Collapsible>,
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'open',
      render: () => (
        <Collapsible label="Advanced options" defaultOpen>
          {PAYLOAD}
        </Collapsible>
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'controlled — state follows the prop',
      render: () => (
        <Collapsible label="Raw payload" open onOpenChange={() => {}}>
          {PAYLOAD}
        </Collapsible>
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'long content — the label, not the region, sizes the trigger',
      render: () => (
        <Collapsible label="Details" defaultOpen>
          {`${PAYLOAD} ${PAYLOAD} ${PAYLOAD}`}
        </Collapsible>
      ),
    },
    {
      // The closed region is in the DOM and `hidden`: out of the layout and the
      // accessibility tree, but its content is in the markup. The root cannot
      // show that, so the browser test checks it directly.
      name: 'kept mounted — the closed region stays in the markup, hidden',
      render: () => (
        <Collapsible label="Advanced options" keepMounted>
          {PAYLOAD}
        </Collapsible>
      ),
      expect: { 'data-state': 'closed' },
    },
  ],

  /*
   * Hover and focus, which no prop can produce, and open and closed, which the
   * animation and the chevron key on.
   */
  requiredSelectors: [':hover', ':focus-visible', '[data-state="open"]', '[data-state="closed"]'],
}
