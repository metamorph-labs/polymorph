import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { Select } from '../controls/Select'
import { Switch } from '../controls/Switch'
import { Stack } from '../layout/Stack'
import { SettingsRow } from './SettingsRow'

/** States fixture, from `design/components/settings-row.md`'s States table. */

const THEMES = [
  { value: 'pastel', label: 'pastel' },
  { value: 'terminal', label: 'terminal' },
]

export const states: ComponentStates = {
  component: 'SettingsRow',

  entries: [
    {
      name: 'a group of three, one control each',
      render: () => (
        <SettingsRow.Group title="Notifications">
          <SettingsRow
            label="Daily digest"
            description="One summary each morning instead of a notification per reply."
            control={<Switch defaultChecked />}
          />
          <SettingsRow
            label="Theme"
            description="Palette, type and shape, as one decision."
            control={<Select options={THEMES} defaultValue="pastel" />}
          />
          <SettingsRow
            label="Export your data"
            description="A zip of every ticket you can see, emailed to you."
            control={<Button variant="outline" tone="neutral" size="sm" label="Request export" />}
          />
        </SettingsRow.Group>
      ),
    },
    {
      name: 'a row that needs no explanation',
      render: () => (
        <SettingsRow.Group title="Appearance">
          <SettingsRow label="Reduce motion" control={<Switch />} />
        </SettingsRow.Group>
      ),
    },
    {
      name: 'two groups, which is what a settings page looks like',
      render: () => (
        <Stack gap={6}>
          <SettingsRow.Group title="Notifications">
            <SettingsRow label="Daily digest" control={<Switch defaultChecked />} />
            <SettingsRow label="Mentions" control={<Switch />} />
          </SettingsRow.Group>
          <SettingsRow.Group title="Appearance">
            <SettingsRow
              label="Theme"
              description="Applies everywhere, immediately."
              control={<Select options={THEMES} defaultValue="terminal" />}
            />
          </SettingsRow.Group>
        </Stack>
      ),
    },
  ],

  requiredSelectors: [],
}
