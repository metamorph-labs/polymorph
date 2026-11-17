import { type ComponentStates } from '@polymorph/react'
import { Select } from '../controls/Select'
import { Switch } from '../controls/Switch'
import { SettingsRow } from '../structure/SettingsRow'
import { SettingsPage } from './SettingsPage'

/** States fixture, from `design/archetypes/settings-page.md`'s States table. */

const THEMES = [
  { value: 'pastel', label: 'pastel' },
  { value: 'terminal', label: 'terminal' },
]

export const states: ComponentStates = {
  component: 'SettingsPage',

  entries: [
    {
      name: 'two groups, which is what a settings screen looks like',
      render: () => (
        <SettingsPage
          title="Settings"
          description="Appearance applies to every screen the moment it changes."
        >
          <SettingsRow.Group title="Appearance">
            <SettingsRow
              label="Theme"
              description="Palette, type and shape, as one decision."
              control={<Select options={THEMES} defaultValue="pastel" />}
            />
            <SettingsRow label="Reduce motion" control={<Switch />} />
          </SettingsRow.Group>

          <SettingsRow.Group title="Notifications">
            <SettingsRow
              label="Daily digest"
              description="One summary each morning instead of a notification per reply."
              control={<Switch defaultChecked />}
            />
          </SettingsRow.Group>
        </SettingsPage>
      ),
    },
    {
      name: 'a header with no description',
      render: () => (
        <SettingsPage title="Settings">
          <SettingsRow.Group title="Appearance">
            <SettingsRow label="Reduce motion" control={<Switch />} />
          </SettingsRow.Group>
        </SettingsPage>
      ),
    },
    {
      name: 'one group, the least a settings screen can be',
      render: () => (
        <SettingsPage title="Account">
          <SettingsRow.Group title="Security">
            <SettingsRow
              label="Two-factor authentication"
              description="Required for everyone on your plan."
              control={<Switch defaultChecked disabled />}
            />
          </SettingsRow.Group>
        </SettingsPage>
      ),
    },
  ],

  requiredSelectors: [],
}
