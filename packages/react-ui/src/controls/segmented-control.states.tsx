'use client'

import { type ComponentStates } from '@polymorph/react'
import { SegmentedControl, type SegmentedControlOption } from './SegmentedControl'

/**
 * States fixture, from `design/components/segmented-control.md`'s States table.
 *
 * `'use client'` because the controlled entry passes an inline `onChange`. The
 * client-directive law treats a JSX handler prop as needing a browser. The same reason
 * applies to `combobox.states.tsx` and `file-upload.states.tsx`.
 */

const SCOPE: SegmentedControlOption[] = [
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'closed', label: 'Closed' },
]

const APPEARANCE: SegmentedControlOption[] = [
  { value: 'light', label: 'Light', icon: 'mode-light' },
  { value: 'dark', label: 'Dark', icon: 'mode-dark' },
  { value: 'system', label: 'System', icon: 'mode-system' },
]

export const states: ComponentStates = {
  component: 'SegmentedControl',

  entries: [
    {
      name: 'three options — never empty',
      // No value props. The control always has a value, so the first option is
      // selected. The first segment's `data-state="checked"` is on a child, so it is
      // checked in `segmented-control.test.tsx`. Here the root is checked for the
      // radiogroup role.
      render: () => <SegmentedControl options={SCOPE} label="Queue scope" />,
      expect: { role: 'radiogroup', 'data-size': 'md' },
    },
    {
      name: 'with icons — leading, decorative',
      render: () => (
        <SegmentedControl options={APPEARANCE} defaultValue="dark" label="Appearance" />
      ),
    },
    {
      name: 'disabled option',
      render: () => (
        <SegmentedControl
          options={[
            { value: 'open', label: 'Open' },
            { value: 'pending', label: 'Pending' },
            { value: 'closed', label: 'Closed', disabled: true },
          ]}
          label="Queue scope"
        />
      ),
    },
    {
      name: 'disabled',
      render: () => (
        <SegmentedControl options={SCOPE} defaultValue="pending" disabled label="Queue scope" />
      ),
      expect: { 'data-disabled': '' },
    },
    {
      name: 'sm',
      render: () => <SegmentedControl options={SCOPE} size="sm" label="Queue scope" />,
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'controlled',
      render: () => (
        <SegmentedControl options={SCOPE} value="pending" onChange={() => {}} label="Queue scope" />
      ),
    },
  ],

  /*
   * Hover and focus, which no prop can produce, plus the two attribute states Radix
   * writes on the segments. The fixture's `expect` only sees the root, so the checked
   * chip and the disabled segment are covered here and in the browser test.
   */
  requiredSelectors: [':hover', ':focus-visible', '[data-state="checked"]', '[data-disabled]'],
}
