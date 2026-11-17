import {
  cond,
  describeMember,
  each,
  el,
  flag,
  identity,
  lit,
  member,
  run,
  text,
  when,
} from '../dsl'

const NOTIFY = [
  { value: 'replies', label: 'Replies' },
  { value: 'status', label: 'Status changes' },
  { value: 'assignments', label: 'Assignments' },
]

const DESCRIBED = [
  { value: 'replies', label: 'Replies', description: 'Every public reply on the ticket.' },
  { value: 'status', label: 'Status changes', description: 'Open, pending and solved.' },
  {
    value: 'assignments',
    label: 'Assignments',
    description: 'When the ticket moves to another agent.',
  },
]

const LABEL = { 'aria-label': 'Notify the reporter about' }

/** The option's state, for its row and its box. */
const CHECKED = 'current.includes(option.value)'
const OFF = 'disabled || option.disabled === true'
const DESCRIPTION_ID = '`${id ?? uid}-option-${index}-description`'

/**
 * CheckboxGroup (`design/components/checkbox-group.md`): several independent
 * choices under one named group, the multiple-choice counterpart of
 * RadioGroup.
 *
 * Every box is its own tab stop and arrow keys do nothing, so there is no
 * composite and no machine: each box is a `<button role="checkbox">`, as
 * Radix renders it and as the Vue Checkbox draws its box, and the group holds
 * the checked values. A toggle rebuilds the list from `options`, so `change`
 * reports values in options order, never click order.
 */
export default describeMember({
  member: 'CheckboxGroup',
  dir: 'controls',
  recipe: 'controls/checkbox-group',
  types: {
    CheckboxGroupOrientation: "NonNullable<CheckboxGroupProps['orientation']>",
    CheckboxGroupOption:
      '{ value: string; label: string; description?: string; disabled?: boolean }',
  },
  defaults: { orientation: lit('vertical'), invalid: 'false', disabled: 'false' },
  // Named by association, as RadioGroup: `<label for>` binds only to a labelable element.
  statics: { controlKind: lit('group') },
  state: { mirror: 'defaultValue ?? []' },
  derived: {
    current: 'value ?? mirror',
    toggle:
      "(optionValue: string, checked: boolean) => ((next: string[]) => (mirror = next, emit('change', next)))(options.filter((option) => (option.value === optionValue ? checked : current.includes(option.value))).map((option) => option.value))",
    // An agent's choice: the whole selection of the enabled options, in options order. A disabled
    // option keeps what it holds, because a person cannot change it either.
    choose:
      "(chosen: readonly string[]) => ((next: string[]) => next.length === current.length && next.every((each) => current.includes(each)) ? undefined : (mirror = next, emit('change', next)))(options.filter((option) => (disabled || option.disabled === true ? current.includes(option.value) : chosen.includes(option.value))).map((option) => option.value))",
  },
  // The spec's `agent` fence. The member holds the checked values while the caller does not, so
  // a choice goes through the same path as a person's toggle and reports `change`.
  agent: {
    on: 'group',
    state: {
      value: 'current',
      options:
        'options.map((option) => ({ id: option.value, label: option.label, ...(option.disabled === true ? { disabled: true } : {}) }))',
      disabled: 'disabled',
      invalid: 'invalid',
    },
    actions: { choose: { argument: 'ids', run: 'choose(value)' } },
  },
  template: el(
    'div',
    {
      part: 'root',
      class: ['group'],
      // The group an agent reads the name of.
      ref: 'group',
      attrs: {
        id: 'id',
        role: lit('group'),
        'data-orientation': 'orientation',
        'data-invalid': flag('invalid'),
        'data-disabled': flag('disabled'),
        // `aria-required` is not allowed on a group, so the injected requirement is mirrored here
        // for CSS and tests, and FormField's marker shows it.
        'data-required': flag('ariaRequired'),
        'aria-label': 'ariaLabel',
        'aria-labelledby': 'ariaLabelledby',
        'aria-describedby': 'ariaDescribedby',
        'aria-invalid': when('invalid', 'true'),
        ...identity('CheckboxGroup'),
      },
    },
    [
      each(
        'options',
        'option',
        'option.value',
        [
          el('div', { class: ['item'], attrs: { 'data-disabled': flag(OFF) } }, [
            el(
              'label',
              {
                part: 'row',
                class: ['row'],
                attrs: {
                  'data-state': `(${CHECKED}) ? 'checked' : 'unchecked'`,
                  'data-disabled': flag(OFF),
                },
              },
              [
                el(
                  'button',
                  {
                    part: 'box',
                    class: ['box'],
                    attrs: {
                      type: lit('button'),
                      role: lit('checkbox'),
                      value: 'option.value',
                      'aria-checked': CHECKED,
                      disabled: OFF,
                      // Per-option help is announced with its own option, never the group's.
                      'aria-describedby': when('option.description !== undefined', DESCRIPTION_ID),
                      'data-state': `(${CHECKED}) ? 'checked' : 'unchecked'`,
                      'data-disabled': flag(OFF),
                    },
                    on: {
                      click: run(`toggle(option.value, !(${CHECKED}))`),
                      // A checkbox toggles on Space only (WAI-ARIA); Enter is a form's key.
                      keydown: run('$event.preventDefault()', "$event.key === 'Enter'"),
                    },
                  },
                  [
                    // Never `indeterminate`: independent choices have no third state.
                    cond(CHECKED, [
                      el(
                        'span',
                        { class: ['indicator'], attrs: { 'data-state': lit('checked') } },
                        [member('Icon', { name: lit('confirm'), size: lit('sm') })],
                      ),
                    ]),
                  ],
                ),
                el('span', { class: ['label'] }, [text('option.label')]),
              ],
            ),
            // Outside the `<label>`: a wrapping label names its control from all its content.
            cond('option.description !== undefined', [
              el('span', { class: ['description'], attrs: { id: DESCRIPTION_ID } }, [
                text('option.description'),
              ]),
            ]),
            // Each checked box serializes under `name` with its own value.
            cond(`name !== undefined && ${CHECKED}`, [
              el('input', {
                attrs: { type: lit('hidden'), name: 'name', value: 'option.value' },
              }),
            ]),
          ]),
        ],
        'index',
      ),
    ],
  ),
  states: [
    {
      name: 'none checked — an empty answer is an answer',
      props: { options: NOTIFY, ...LABEL },
      expect: { role: 'group', 'data-orientation': 'vertical' },
    },
    {
      name: 'two checked',
      props: { options: NOTIFY, defaultValue: ['replies', 'status'], ...LABEL },
    },
    { name: 'descriptions — the two-line item register', props: { options: DESCRIBED, ...LABEL } },
    {
      name: 'horizontal — three short labels at most',
      props: { options: NOTIFY, orientation: 'horizontal', defaultValue: ['replies'], ...LABEL },
      expect: { 'data-orientation': 'horizontal' },
    },
    {
      name: 'invalid',
      props: { options: NOTIFY, invalid: true, ...LABEL },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'the whole group disabled',
      props: { options: NOTIFY, defaultValue: ['status'], disabled: true, ...LABEL },
      expect: { 'data-disabled': '' },
    },
    {
      name: 'one option disabled',
      props: {
        options: [
          { value: 'replies', label: 'Replies' },
          { value: 'status', label: 'Status changes' },
          { value: 'assignments', label: 'Assignments', disabled: true },
        ],
        defaultValue: ['replies'],
        ...LABEL,
      },
    },
    {
      name: 'via FormField — the question is the field label',
      many: {
        within: {
          member: 'FormField',
          props: {
            label: 'Notify the reporter about',
            description: 'You can change this per ticket.',
            required: true,
          },
        },
        each: [{ props: { options: NOTIFY, defaultValue: ['replies'] } }],
      },
      expect: { 'data-kind': 'group' },
    },
  ],
})
