import { cond, describeMember, el, flag, identity, lit, run, text } from '../dsl'

/**
 * The track: the focusable control, a `<button role="switch">` as Radix renders
 * it, for the reason Checkbox gives: Zag's switch focuses a hidden native
 * input, and the recipe rings the track. The machine owns the value.
 */
const track = el(
  'button',
  {
    part: 'track',
    class: ['track'],
    // The control an agent reads the name of.
    ref: 'track',
    attrs: {
      type: lit('button'),
      role: lit('switch'),
      id: 'id',
      'aria-checked': 'api.checked',
      disabled: 'disabled',
      'aria-label': 'ariaLabel',
      'aria-labelledby': 'ariaLabelledby',
      'aria-describedby': 'ariaDescribedby',
      'aria-required': 'ariaRequired',
      'data-state': 'dataState',
      'data-disabled': flag('disabled'),
      'data-required': flag('ariaRequired'),
      ...identity('Switch'),
    },
    on: { click: run('api.toggleChecked()') },
  },
  [el('span', { part: 'thumb', class: ['thumb'], attrs: { 'data-state': 'dataState' } })],
)

/** Switch (`design/components/switch.md`): an immediate on/off setting. */
export default describeMember({
  member: 'Switch',
  dir: 'controls',
  recipe: 'controls/switch',
  defaults: { disabled: 'false' },
  statics: { controlKind: lit('row-labelled') },
  machine: {
    of: 'switch',
    context: {
      checked: 'checked',
      defaultChecked: 'defaultChecked',
      disabled: 'disabled',
      required: 'ariaRequired',
      name: 'name',
      value: 'value',
    },
    events: { onCheckedChange: { emit: 'checkedChange', payload: 'details.checked' } },
  },
  // Not named `state`: Svelte reads `$state` as a store of a value of that name.
  derived: { dataState: "api.checked ? 'on' : 'off'" },
  // The spec's `agent` fence. The machine owns the value, controlled or not, so an action sets
  // it through the machine and the machine calls `checkedChange`.
  agent: {
    on: 'track',
    state: { checked: 'api.checked', disabled: 'disabled' },
    actions: { check: 'api.setChecked(true)', uncheck: 'api.setChecked(false)' },
  },
  template: [
    cond(
      'label === undefined',
      [track],
      [
        el(
          'label',
          {
            part: 'row',
            class: ['row'],
            attrs: {
              'data-state': 'dataState',
              'data-disabled': flag('disabled'),
              'data-required': flag('ariaRequired'),
              ...identity('Switch'),
            },
          },
          [track, el('span', { part: 'label', class: ['label'] }, [text('label')])],
        ),
      ],
    ),
    cond('name !== undefined && api.checked', [
      el('input', { attrs: { type: lit('hidden'), name: 'name', value: "value ?? 'on'" } }),
    ]),
  ],
  states: [
    { name: 'off', props: { label: 'Desktop notifications' }, expect: { 'data-state': 'off' } },
    {
      name: 'on',
      props: { defaultChecked: true, label: 'Desktop notifications' },
      expect: { 'data-state': 'on' },
    },
    {
      name: 'required — the marker the field row cannot render for it',
      props: { 'aria-required': true, label: 'Accept the terms' },
      expect: { 'data-required': '' },
    },
    {
      name: 'disabled off',
      props: { disabled: true, label: 'Desktop notifications' },
      expect: { 'data-state': 'off', 'data-disabled': '' },
    },
    {
      name: 'disabled on',
      props: { disabled: true, defaultChecked: true, label: 'Desktop notifications' },
      expect: { 'data-state': 'on', 'data-disabled': '' },
    },
    {
      name: 'unlabelled — labelled by its context',
      props: { 'aria-label': 'Desktop notifications' },
      expect: { 'aria-label': 'Desktop notifications', 'data-state': 'off' },
    },
    {
      name: 'a settings stack',
      many: {
        within: { member: 'Stack', props: { gap: 3 } },
        each: [
          { props: { defaultChecked: true, label: 'Desktop notifications' } },
          { props: { label: 'Email digest' } },
          { props: { disabled: true, label: 'SMS alerts (not available on this plan)' } },
        ],
      },
    },
  ],
})
