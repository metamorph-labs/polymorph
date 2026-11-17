import { type ComponentStates, CONTROL_SIZES } from '@polymorph/react'
import { Stack } from '../layout/Stack'
import { TagInput } from './TagInput'

/** States fixture, from `design/components/tag-input.md`'s States table. */

const INVITES = ['ada@relay.dev', 'grace@relay.dev', 'alan@relay.dev']

const LABELS = [
  'needs-triage',
  'customer-reported',
  'billing',
  'regression',
  'blocked-on-vendor',
  'good-first-issue',
  'awaiting-response',
  'security-review',
]

export const states: ComponentStates = {
  component: 'TagInput',

  entries: [
    {
      name: 'empty',
      render: () => <TagInput placeholder="Add people…" aria-label="Invite" />,
      expect: { 'data-size': 'md', 'data-state': null },
    },
    {
      name: 'with chips',
      render: () => <TagInput defaultValue={INVITES} aria-label="Invite" />,
    },
    {
      name: 'wrapped — the one Input that grows',
      render: () => <TagInput defaultValue={LABELS} aria-label="Labels" />,
    },
    {
      name: 'at max',
      render: () => <TagInput defaultValue={INVITES} max={3} aria-label="Invite" />,
      expect: { 'data-state': 'at-max' },
    },
    {
      name: 'sizes',
      render: () => (
        <Stack gap={3}>
          {CONTROL_SIZES.map((size) => (
            <TagInput
              key={size}
              size={size}
              defaultValue={INVITES.slice(0, 2)}
              aria-label={`Invite ${size}`}
            />
          ))}
        </Stack>
      ),
    },
    {
      name: 'size sm',
      render: () => <TagInput size="sm" defaultValue={INVITES.slice(0, 2)} aria-label="Invite" />,
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'size lg',
      render: () => <TagInput size="lg" defaultValue={INVITES.slice(0, 2)} aria-label="Invite" />,
      expect: { 'data-size': 'lg' },
    },
    {
      name: 'invalid',
      render: () => <TagInput invalid defaultValue={INVITES} aria-label="Invite" />,
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled — the removes go with the affordance',
      render: () => <TagInput disabled defaultValue={INVITES} aria-label="Invite" />,
      expect: { 'data-disabled': '' },
    },
  ],

  requiredSelectors: [
    ':focus-visible',
    '[data-invalid]',
    '[data-disabled]',
    '[data-state="at-max"]',
    '[data-removing]',
  ],
}
