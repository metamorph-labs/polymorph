import { type ComponentStates } from '@polymorph/react'
import { ChoiceCard, type ChoiceCardOption } from './ChoiceCard'

/** States fixture, from `design/components/choice-card.md`'s States table. */

const PLANS: ChoiceCardOption[] = [
  { value: 'starter', label: 'Starter', description: 'For side projects and solo queues' },
  { value: 'team', label: 'Team', description: 'Shared inboxes for up to 20 agents' },
  { value: 'scale', label: 'Scale', description: 'SSO, audit log, unlimited agents' },
]

const CHANNELS: ChoiceCardOption[] = [
  {
    value: 'email',
    label: 'Email',
    icon: 'inbox',
    description: 'Every public reply, in your inbox',
  },
  {
    value: 'inapp',
    label: 'In-app',
    icon: 'notification',
    description: 'Badges in the sidebar as it happens',
  },
  {
    value: 'chat',
    label: 'Chat',
    icon: 'comment',
    description: 'Mirror threads to your chat tool',
  },
  {
    value: 'webhook',
    label: 'Webhook',
    icon: 'link',
    description: 'POST every event to your endpoint',
  },
]

export const states: ComponentStates = {
  component: 'ChoiceCard',

  entries: [
    {
      name: 'single 3-up — plan tiers',
      // That exactly one card has `data-state="checked"` and the glyph is a claim about children,
      // tested in `choice-card.test.tsx`. The root claims here are the radiogroup role and the
      // column maximum.
      render: () => (
        <ChoiceCard mode="single" options={PLANS} columns={3} defaultValue="team" label="Plan" />
      ),
      expect: { role: 'radiogroup', 'data-columns': '3' },
    },
    {
      name: 'multiple, 2 selected — notification channels',
      render: () => (
        <ChoiceCard
          mode="multiple"
          options={CHANNELS}
          defaultValue={['email', 'inapp']}
          label="Notification channels"
        />
      ),
      expect: { role: 'group' },
    },
    {
      name: 'descriptions + icons — icon top, two-line copy',
      render: () => <ChoiceCard mode="multiple" options={CHANNELS} label="Notification channels" />,
    },
    {
      name: 'disabled option — available on Scale',
      render: () => (
        <ChoiceCard
          mode="multiple"
          options={[...CHANNELS.slice(0, 3), { ...CHANNELS[3]!, disabled: true }]}
          label="Notification channels"
        />
      ),
    },
    {
      name: 'disabled',
      render: () => (
        <ChoiceCard mode="single" options={PLANS} defaultValue="team" disabled label="Plan" />
      ),
      expect: { 'data-disabled': '' },
    },
    {
      name: '2-column — the ceiling, container-resolved',
      render: () => (
        <ChoiceCard mode="single" options={PLANS} columns={2} defaultValue="starter" label="Plan" />
      ),
      expect: { 'data-columns': '2' },
    },
  ],

  /*
   * Hover and the card-level ring, which no prop can produce. The hidden control receives focus,
   * so the ring is checked as the `:has()` rule. Also the two attribute states on the cards, which
   * the fixture's root-only `expect` cannot see.
   */
  requiredSelectors: [
    ':hover',
    ':has(:focus-visible)',
    '[data-state="checked"]',
    '[data-disabled]',
  ],
}
