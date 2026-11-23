import { type ComponentStates } from '@polymorph/react'
import { Stack } from '../layout/Stack'
import { Accordion } from './Accordion'

/**
 * States fixture, from `design/components/accordion.md`'s States table.
 *
 * The meaningful states are per item, but the completeness law checks the root.
 * So this file asserts the root, and `accordion.test.tsx` asserts the rows.
 */

const SHIPPING = [
  {
    value: 'delivery',
    label: 'When will my order arrive?',
    content: 'Two to four working days, and you get a tracking link the moment it ships.',
  },
  {
    value: 'returns',
    label: 'How do returns work?',
    content: 'Thirty days, no reason needed. The label is in the box.',
  },
  {
    value: 'sizing',
    label: 'Do these run large or small?',
    content: 'True to size. The one exception is the wide fit, which runs half a size up.',
  },
]

export const states: ComponentStates = {
  component: 'Accordion',

  entries: [
    {
      name: 'single, first open',
      render: () => <Accordion items={SHIPPING} defaultValue="delivery" />,
      // Radix's own attribute, passed through unchanged. This is the reason for
      // using this substrate.
      expect: { 'data-orientation': 'vertical' },
    },
    {
      name: 'single, all closed',
      render: () => <Accordion items={SHIPPING} collapsible />,
    },
    {
      name: 'multiple, two open',
      render: () => (
        <Accordion type="multiple" items={SHIPPING} defaultValue={['delivery', 'sizing']} />
      ),
    },
    {
      name: 'one item disabled',
      render: () => (
        <Accordion
          items={SHIPPING.map((item) =>
            item.value === 'returns' ? { ...item, disabled: true } : item,
          )}
          defaultValue="delivery"
        />
      ),
    },
    {
      name: 'long content',
      render: () => (
        <Accordion
          defaultValue="policy"
          items={[
            {
              value: 'policy',
              label: 'What is the full returns policy?',
              content: (
                <Stack gap={3}>
                  <p>
                    You have thirty days from delivery. Anything unworn, with its tags, goes back
                    for a full refund — including the shipping you paid to receive it.
                  </p>
                  <p>
                    Worn items are assessed individually, and the answer is usually yes. Sale items
                    are refunded as credit rather than to the card.
                  </p>
                  <p>
                    Exchanges are a return and a new order, which is slower but means you are never
                    waiting on stock that has already gone.
                  </p>
                </Stack>
              ),
            },
            ...SHIPPING.slice(1),
          ]}
        />
      ),
    },
    {
      // Every region is closed, in the DOM and `hidden`: out of the layout and
      // the accessibility tree, but its content is in the markup. The root
      // cannot show that, so the browser test checks it directly.
      name: 'kept mounted — every answer in the markup while its row is closed',
      render: () => <Accordion keepMounted items={SHIPPING} />,
    },
  ],

  requiredSelectors: [
    ':hover',
    ':focus-visible',
    '[data-state="open"]',
    '[data-state="closed"]',
    '[data-disabled]',
  ],
}
