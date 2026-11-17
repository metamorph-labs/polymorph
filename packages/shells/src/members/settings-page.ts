import { describeMember, el, fx, identity, member, slot } from '../dsl'

const THEMES = [
  { value: 'pastel', label: 'pastel' },
  { value: 'terminal', label: 'terminal' },
]

/**
 * SettingsPage (`design/archetypes/settings-page.md`): a page header over the
 * app's `SettingsRow.Group`s. The page owns the `h1` (PageHeader's) and the
 * spacing between groups; the groups are its children.
 */
export default describeMember({
  member: 'SettingsPage',
  dir: 'archetypes',
  recipe: 'archetypes/settings-page',
  template: el('div', { class: ['page'], attrs: { ...identity('SettingsPage') } }, [
    member('PageHeader', { title: 'title', description: 'description' }),
    slot(),
  ]),
  states: [
    {
      name: 'two groups, which is what a settings screen looks like',
      props: {
        title: 'Settings',
        description: 'Appearance applies to every screen the moment it changes.',
      },
      slots: {
        default: [
          fx(
            'SettingsRowGroup',
            { title: 'Appearance' },
            {
              default: [
                fx(
                  'SettingsRow',
                  { label: 'Theme', description: 'Palette, type and shape, as one decision.' },
                  { control: [fx('Select', { options: THEMES, defaultValue: 'pastel' })] },
                ),
                fx('SettingsRow', { label: 'Reduce motion' }, { control: [fx('Switch')] }),
              ],
            },
          ),
          fx(
            'SettingsRowGroup',
            { title: 'Notifications' },
            {
              default: [
                fx(
                  'SettingsRow',
                  {
                    label: 'Daily digest',
                    description: 'One summary each morning instead of a notification per reply.',
                  },
                  { control: [fx('Switch', { defaultChecked: true })] },
                ),
              ],
            },
          ),
        ],
      },
    },
    {
      name: 'a header with no description',
      props: { title: 'Settings' },
      slots: {
        default: [
          fx(
            'SettingsRowGroup',
            { title: 'Appearance' },
            {
              default: [fx('SettingsRow', { label: 'Reduce motion' }, { control: [fx('Switch')] })],
            },
          ),
        ],
      },
    },
    {
      name: 'one group, the least a settings screen can be',
      props: { title: 'Account' },
      slots: {
        default: [
          fx(
            'SettingsRowGroup',
            { title: 'Security' },
            {
              default: [
                fx(
                  'SettingsRow',
                  {
                    label: 'Two-factor authentication',
                    description: 'Required for everyone on your plan.',
                  },
                  { control: [fx('Switch', { defaultChecked: true, disabled: true })] },
                ),
              ],
            },
          ),
        ],
      },
    },
  ],
})
