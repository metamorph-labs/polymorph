import { type ComponentStates } from '@polymorph/react'
import { SectionNav } from './SectionNav'

/** States fixture, from `design/components/section-nav.md`'s States table. */

const FOUR = [
  { label: 'Users', href: '#users' },
  { label: 'Groups', href: '#groups' },
  { label: 'Roles', href: '#roles' },
  { label: 'Sessions', href: '#sessions' },
]

const NINE = [
  ...FOUR,
  { label: 'Service accounts', href: '#service-accounts' },
  { label: 'Sign-in policies', href: '#sign-in-policies' },
  { label: 'Identity providers', href: '#identity-providers' },
  { label: 'Delegations', href: '#delegations' },
  { label: 'Recovery', href: '#recovery' },
]

export const states: ComponentStates = {
  component: 'SectionNav',

  entries: [
    {
      name: 'the first page is current',
      render: () => <SectionNav label="Identity sections" items={FOUR} current="#users" />,
      expect: { 'aria-label': 'Identity sections' },
    },
    {
      name: 'a later page is current',
      render: () => <SectionNav label="Identity sections" items={FOUR} current="#roles" />,
    },
    {
      name: 'no page is current — the reader is outside every item',
      render: () => <SectionNav label="Identity sections" items={FOUR} />,
    },
    {
      name: 'many pages — the row wraps onto further lines',
      render: () => <SectionNav label="Identity sections" items={NINE} current="#delegations" />,
    },
    {
      name: 'a long label — clipped, so the row does not widen the page',
      render: () => (
        <SectionNav
          label="Identity sections"
          items={[
            { label: 'Users', href: '#users' },
            {
              label:
                'Delegated administration approvals awaiting a second reviewer in every region',
              href: '#approvals',
            },
          ]}
          current="#users"
        />
      ),
    },
  ],

  requiredSelectors: [':hover', ':focus-visible', '[aria-current="page"]'],
}
