import { type ComponentStates } from '@polymorph/react'
import { Stack } from '../layout/Stack'
import { Switch } from './Switch'

/** States fixture, from `design/components/switch.md`'s States table. */

export const states: ComponentStates = {
  component: 'Switch',

  entries: [
    {
      name: 'off',
      render: () => <Switch label="Desktop notifications" />,
      expect: { 'data-state': 'off' },
    },
    {
      name: 'on',
      render: () => <Switch defaultChecked label="Desktop notifications" />,
      expect: { 'data-state': 'on' },
    },
    {
      name: 'required — the marker the field row cannot render for it',
      render: () => <Switch aria-required label="Accept the terms" />,
      expect: { 'data-required': '' },
    },
    {
      name: 'disabled off',
      render: () => <Switch disabled label="Desktop notifications" />,
      expect: { 'data-state': 'off', 'data-disabled': '' },
    },
    {
      name: 'disabled on',
      render: () => <Switch disabled defaultChecked label="Desktop notifications" />,
      expect: { 'data-state': 'on', 'data-disabled': '' },
    },
    {
      name: 'unlabelled — labelled by its context',
      render: () => <Switch aria-label="Desktop notifications" />,
      expect: { 'aria-label': 'Desktop notifications', 'data-state': 'off' },
    },
    {
      name: 'a settings stack',
      render: () => (
        <Stack gap={3}>
          <Switch defaultChecked label="Desktop notifications" />
          <Switch label="Email digest" />
          <Switch disabled label="SMS alerts (not available on this plan)" />
        </Stack>
      ),
    },
  ],

  requiredSelectors: [
    ':hover',
    ':focus-visible',
    '[data-state="on"]',
    '[data-disabled]',
    '[data-required]',
  ],
}
