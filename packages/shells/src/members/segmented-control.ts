import { cond, describeMember, each, el, flag, lit, member, run, text } from '../dsl'

const SCOPE = [
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'closed', label: 'Closed' },
]

const APPEARANCE = [
  { value: 'light', label: 'Light', icon: 'mode-light' },
  { value: 'dark', label: 'Dark', icon: 'mode-dark' },
  { value: 'system', label: 'System', icon: 'mode-system' },
]

const CHECKED = 'api.value === option.value'
const OFF = 'disabled || option.disabled === true'

/**
 * SegmentedControl (`design/components/segmented-control.md`): a joined row
 * of segments that always holds one value, applied immediately.
 *
 * Its semantics are a radio group's, so Zag's radio-group machine owns the
 * value; toggle-group's buttons are pressed, not checked, and would announce
 * a different control. Each segment is a `<button role="radio">`, as Radix
 * renders it and as the Vue RadioGroup draws its circles, and arrow keys move
 * focus and selection through `roveRadio`. One segment is a tab stop: the
 * chosen one. An uncontrolled control with no `defaultValue` chooses the first
 * option, because the control is never empty.
 */
export default describeMember({
  member: 'SegmentedControl',
  dir: 'controls',
  recipe: 'controls/segmented-control',
  types: {
    SegmentedControlSize: "NonNullable<SegmentedControlProps['size']>",
    SegmentedControlOption: '{ value: string; label: string; icon?: IconRole; disabled?: boolean }',
  },
  defaults: { size: lit('md'), disabled: 'false' },
  machine: {
    of: 'radio-group',
    context: {
      value: 'value',
      defaultValue: 'defaultValue ?? options[0]?.value',
      disabled: 'disabled',
    },
    events: { onValueChange: { emit: 'change', payload: "details.value ?? ''" } },
  },
  derived: {
    stop: 'api.value ?? options.find((option) => !(disabled || option.disabled === true))?.value',
  },
  // Hands the track to the member that lends this one its identity (ModeSwitch), through the
  // holder, because that member's agent handle names the track and withholds this member.
  effects: [{ run: 'lender && (lender.element = () => track)' }],
  // The spec's `agent` fence. The machine owns the value, controlled or not, so a choice sets it
  // through the machine and the machine reports `change`, as for a person's press.
  agent: {
    on: 'track',
    state: {
      value: 'api.value ?? null',
      options:
        'options.map((option) => ({ id: option.value, label: option.label, ...(option.disabled === true ? { disabled: true } : {}) }))',
      disabled: 'disabled',
    },
    actions: { choose: { argument: 'id', run: 'value !== api.value && api.setValue(value)' } },
  },
  template: el(
    'div',
    {
      part: 'root',
      class: ['track'],
      // The radiogroup an agent reads the name of.
      ref: 'track',
      attrs: {
        role: lit('radiogroup'),
        'aria-label': 'label',
        'data-size': 'size',
        'data-disabled': flag('disabled'),
        // A preset with no track of its own (ModeSwitch) lends its identity.
        'data-member': "lent ?? 'segmented-control'",
      },
    },
    [
      each('options', 'option', 'option.value', [
        el(
          'button',
          {
            part: 'segment',
            class: ['segment'],
            attrs: {
              type: lit('button'),
              role: lit('radio'),
              value: 'option.value',
              'aria-checked': CHECKED,
              disabled: OFF,
              tabindex: 'option.value === stop ? 0 : -1',
              'data-state': `(${CHECKED}) ? 'checked' : 'unchecked'`,
              'data-disabled': flag(OFF),
            },
            on: {
              click: run('api.setValue(option.value)'),
              // Enter does nothing in a radio group (WAI-ARIA); arrows move focus and selection.
              keydown: run(
                "$event.key === 'Enter' ? $event.preventDefault() : roveRadio($event, (next) => api.setValue(next))",
              ),
            },
          },
          [
            // The chip mounts with the state and has no entrance: selection snaps.
            cond(CHECKED, [
              el('span', { class: ['chip'], attrs: { 'data-state': lit('checked') } }),
            ]),
            cond('option.icon !== undefined', [
              el('span', { class: ['glyph'] }, [
                member('Icon', { name: 'option.icon', size: 'size' }),
              ]),
            ]),
            el('span', { class: ['label'] }, [text('option.label')]),
          ],
        ),
      ]),
    ],
  ),
  states: [
    {
      name: 'three options — never empty',
      props: { options: SCOPE, label: 'Queue scope' },
      expect: { role: 'radiogroup', 'data-size': 'md' },
    },
    {
      name: 'with icons — leading, decorative',
      props: { options: APPEARANCE, defaultValue: 'dark', label: 'Appearance' },
    },
    {
      name: 'disabled option',
      props: {
        options: [
          { value: 'open', label: 'Open' },
          { value: 'pending', label: 'Pending' },
          { value: 'closed', label: 'Closed', disabled: true },
        ],
        label: 'Queue scope',
      },
    },
    {
      name: 'disabled',
      props: { options: SCOPE, defaultValue: 'pending', disabled: true, label: 'Queue scope' },
      expect: { 'data-disabled': '' },
    },
    {
      name: 'sm',
      props: { options: SCOPE, size: 'sm', label: 'Queue scope' },
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'controlled',
      props: {
        options: SCOPE,
        value: 'pending',
        onChange: { js: '() => {}' },
        label: 'Queue scope',
      },
    },
  ],
})
