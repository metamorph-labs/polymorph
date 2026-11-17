import { type ComponentStates } from '@polymorph/react'
import { Inline } from '../layout/Inline'
import { Stack } from '../layout/Stack'
import { Badge } from './Badge'
import { Card } from './Card'

/** States fixture, from `design/components/card.md`'s States table. */

function Content() {
  return (
    <Stack gap={3}>
      <Inline gap={2}>
        <Badge tone="accent">Open</Badge>
        <Badge>Billing</Badge>
      </Inline>
      <p>A card is a bounded surface. What goes in it composes freely.</p>
    </Stack>
  )
}

export const states: ComponentStates = {
  component: 'Card',

  entries: [
    {
      name: 'default',
      render: () => (
        <Card>
          <Content />
        </Card>
      ),
    },
    {
      name: 'patched padding — rung 3',
      render: () => (
        <Card patch={{ p: 4 }}>
          <Content />
        </Card>
      ),
      expect: { 'data-p': '4' },
    },
    {
      name: 'patched radius — rung 3',
      render: () => (
        <Card patch={{ radius: 'sm' }}>
          <Content />
        </Card>
      ),
      expect: { 'data-radius': 'sm' },
    },
    {
      name: 'as section',
      render: () => (
        <Card as="section">
          <Content />
        </Card>
      ),
    },
    {
      name: 'titled — one heading, drawn as Dashboard.Panel draws its own',
      render: () => (
        <Card title="Billing">
          <Content />
        </Card>
      ),
    },
    {
      name: 'titled section, level 3 — named by its title',
      render: () => (
        <Card as="section" title="Billing" headingLevel={3}>
          <Content />
        </Card>
      ),
    },
    {
      name: 'a row of them, so the surface reads as one plane',
      render: () => (
        <Inline gap={4} align="stretch">
          <Card>
            <Content />
          </Card>
          <Card>
            <Content />
          </Card>
        </Inline>
      ),
    },
    {
      name: 'linked — one large target, named by its label, without becoming a button',
      render: () => (
        <Card href="#ticket-4182" label="Open ticket 4182">
          <Content />
        </Card>
      ),
      expect: { 'data-interactive': '' },
    },
  ],

  // Hover and focus on the linked card. The plain card is static and has
  // neither.
  requiredSelectors: ['[data-interactive]:hover', '[data-interactive]:has(:focus-visible)'],
}
