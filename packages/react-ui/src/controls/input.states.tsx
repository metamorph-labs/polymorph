import { type ComponentStates, CONTROL_SIZES } from '@polymorph/react'
import { Inline } from '../layout/Inline'
import { Input } from './Input'

/** States fixture, from `design/components/input.md`'s States table. */

export const states: ComponentStates = {
  component: 'Input',

  entries: [
    {
      name: 'rest md',
      render: () => <Input placeholder="Search tickets…" aria-label="Search tickets" />,
      expect: { 'data-size': 'md' },
    },
    {
      name: 'sizes side by side',
      render: () => (
        <Inline gap={3}>
          {CONTROL_SIZES.map((size) => (
            <Input key={size} size={size} placeholder={size} aria-label={`Size ${size}`} />
          ))}
        </Inline>
      ),
    },
    {
      name: 'size sm',
      render: () => <Input size="sm" placeholder="Search…" aria-label="Search" />,
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'size lg',
      render: () => <Input size="lg" placeholder="Search…" aria-label="Search" />,
      expect: { 'data-size': 'lg' },
    },
    {
      name: 'leading icon',
      render: () => <Input icon="search" placeholder="Search…" aria-label="Search" />,
    },
    {
      name: 'with value',
      render: () => <Input defaultValue="urgent: login loop" aria-label="Subject" />,
    },
    {
      // The three attributes are on the inner input, where the completeness law's root check
      // cannot see them. The contract reads them there.
      name: 'exact — a phrase taken as typed, with no correction, capitals or spell check',
      render: () => <Input exact defaultValue="acme-billing" aria-label="Project name" />,
    },
    {
      name: 'clearable, with value',
      render: () => <Input clearable defaultValue="urgent: login loop" aria-label="Subject" />,
    },
    {
      name: 'clearable, suppressed — an uneditable value offers no clear',
      render: () => (
        <Input clearable readOnly defaultValue="urgent: login loop" aria-label="Subject" />
      ),
      expect: { 'data-readonly': '' },
    },
    {
      name: 'clearable, empty — no clear button',
      render: () => <Input clearable placeholder="Nothing to clear" aria-label="Subject" />,
    },
    {
      // The three constraints are on the inner input, where the completeness law's root check
      // cannot see them. input.test.tsx reads them from the inner input.
      name: 'number — min, max and step ride the native contract',
      render: () => <Input type="number" min={0} max={10} step={2} aria-label="Retries" />,
      expect: { 'data-size': 'md' },
    },
    {
      name: 'affixes — a currency mark and a unit, muted beside the value',
      render: () => <Input prefix="$" suffix="USD" defaultValue="120" aria-label="Amount" />,
    },
    {
      name: 'trailing slot',
      render: () => (
        <Input defaultValue="relay" aria-label="Workspace" trailing={<span>.example.com</span>} />
      ),
    },
    {
      name: 'invalid',
      render: () => <Input invalid icon="search" defaultValue="???" aria-label="Query" />,
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      render: () => <Input disabled defaultValue="locked" aria-label="Locked" />,
      expect: { 'data-disabled': '' },
    },
    {
      name: 'readOnly',
      render: () => <Input readOnly defaultValue="read only" aria-label="Read only" />,
      expect: { 'data-readonly': '' },
    },
  ],

  requiredSelectors: [
    ':hover',
    ':focus-visible',
    '[data-invalid]',
    '[data-disabled]',
    '::placeholder',
  ],
}
