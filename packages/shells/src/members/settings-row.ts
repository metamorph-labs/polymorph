import { cond, describeMember, el, fx, identity, member, slot, text } from '../dsl'

const THEMES = [
  { value: 'pastel', label: 'pastel' },
  { value: 'terminal', label: 'terminal' },
]

const row = (label: string, control: ReturnType<typeof fx>, description?: string) => ({
  props: { label, ...(description === undefined ? {} : { description }) },
  slots: { control: [control] },
})

/**
 * SettingsRow (`design/components/settings-row.md`): a label and a
 * description beside one control, and `SettingsRow.Group`, a titled card of
 * rows. The label is a span, not a `<label>`, because a Switch or a Select is
 * not always labelable: the row hands its control `aria-labelledby` (and
 * `aria-describedby` when it has a description), as React's `cloneElement`
 * does, so every row uses one mechanism.
 *
 * The Group's props are the registry's, listed under SettingsRow as
 * `Group.title` and `Group.children`.
 */
export default describeMember({
  member: 'SettingsRow',
  dir: 'structure',
  recipe: 'structure/settings-row',
  uses: ['SettingsRowGroupProps'],
  types: {
    SettingsGroupProps: 'SettingsRowGroupProps',
  },
  derived: { labelId: '`${uid}-label`', descriptionId: '`${uid}-description`' },
  template: el('div', { class: ['row'], attrs: { ...identity('SettingsRow') } }, [
    el('div', { class: ['text'] }, [
      el('span', { class: ['label'], attrs: { id: 'labelId' } }, [text('label')]),
      cond('description !== undefined', [
        el('span', { class: ['description'], attrs: { id: 'descriptionId' } }, [
          text('description'),
        ]),
      ]),
    ]),
    el('div', { class: ['control'] }, [
      slot('control', {
        pass: {
          'aria-labelledby': 'labelId',
          'aria-describedby': 'description === undefined ? undefined : descriptionId',
        },
      }),
    ]),
  ]),
  parts: [
    {
      name: 'Group',
      public: true,
      purpose: 'a titled card of settings rows',
      // A real `h2`: the settings page's outline sets the level, and a styled span
      // would leave the page with one heading and unlabelled boxes.
      template: el('section', { class: ['group'] }, [
        el('h2', { class: ['groupTitle'] }, [text('title')]),
        member('Card', {}, { slots: { default: [el('div', { class: ['rows'] }, [slot()])] } }),
      ]),
    },
  ],
  states: [
    {
      name: 'a group of three, one control each',
      many: {
        within: { member: 'SettingsRowGroup', props: { title: 'Notifications' } },
        each: [
          row(
            'Daily digest',
            fx('Switch', { defaultChecked: true }),
            'One summary each morning instead of a notification per reply.',
          ),
          row(
            'Theme',
            fx('Select', { options: THEMES, defaultValue: 'pastel' }),
            'Palette, type and shape, as one decision.',
          ),
          row(
            'Export your data',
            fx('Button', {
              variant: 'outline',
              tone: 'neutral',
              size: 'sm',
              label: 'Request export',
            }),
            'A zip of every ticket you can see, emailed to you.',
          ),
        ],
      },
    },
    {
      name: 'a row that needs no explanation',
      many: {
        within: { member: 'SettingsRowGroup', props: { title: 'Appearance' } },
        each: [row('Reduce motion', fx('Switch'))],
      },
    },
    {
      name: 'two groups, which is what a settings page looks like',
      many: {
        within: { member: 'Stack', props: { gap: 6 } },
        each: [],
        also: [
          fx(
            'SettingsRowGroup',
            { title: 'Notifications' },
            {
              default: [
                fx(
                  'SettingsRow',
                  { label: 'Daily digest' },
                  { control: [fx('Switch', { defaultChecked: true })] },
                ),
                fx('SettingsRow', { label: 'Mentions' }, { control: [fx('Switch')] }),
              ],
            },
          ),
          fx(
            'SettingsRowGroup',
            { title: 'Appearance' },
            {
              default: [
                fx(
                  'SettingsRow',
                  { label: 'Theme', description: 'Applies everywhere, immediately.' },
                  { control: [fx('Select', { options: THEMES, defaultValue: 'terminal' })] },
                ),
              ],
            },
          ),
        ],
      },
    },
  ],
})
