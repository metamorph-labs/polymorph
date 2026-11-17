import { cond, describeMember, each, el, flag, identity, lit, run, text, when } from '../dsl'

const PLANS = [
  { value: 'starter', label: 'Starter' },
  { value: 'team', label: 'Team' },
  { value: 'enterprise', label: 'Enterprise' },
]

/** The option's state, for the circle's attributes. */
const CHECKED = 'api.value === option.value'
const OFF = 'disabled || option.disabled === true'

/**
 * RadioGroup (`design/components/radio-group.md`): one choice from a short list.
 *
 * Each radio is a `<button role="radio">`, as Radix renders it: Zag's radio
 * group makes visually hidden native inputs the radios, and the recipe rings
 * the circle and the conformance locator finds it as a button. So the circles
 * are drawn here, the machine owns the value, and arrow keys move focus and
 * selection through `roveRadio`. One radio is a tab stop: the chosen one, or
 * the first enabled one when nothing is chosen.
 */
export default describeMember({
  member: 'RadioGroup',
  dir: 'controls',
  fixture: 'radio',
  recipe: 'controls/radio-group',
  types: {
    RadioOrientation: "NonNullable<RadioGroupProps['orientation']>",
    RadioOption: '{ value: string; label: string; disabled?: boolean }',
  },
  defaults: { orientation: lit('vertical'), invalid: 'false', disabled: 'false' },
  statics: { controlKind: lit('group') },
  machine: {
    of: 'radio-group',
    context: {
      value: 'value',
      defaultValue: 'defaultValue',
      disabled: 'disabled',
      name: 'name',
      orientation: 'orientation',
    },
    events: { onValueChange: { emit: 'change', payload: "details.value ?? ''" } },
  },
  derived: {
    stop: 'api.value ?? options.find((option) => !(disabled || option.disabled === true))?.value',
  },
  // The spec's `agent` fence. The machine owns the value, controlled or not, so a choice sets it
  // through the machine and the machine reports `change`, as for a person's press.
  agent: {
    on: 'group',
    state: {
      value: 'api.value ?? null',
      options:
        'options.map((option) => ({ id: option.value, label: option.label, ...(option.disabled === true ? { disabled: true } : {}) }))',
      disabled: 'disabled',
      invalid: 'invalid',
    },
    actions: { choose: { argument: 'id', run: 'value !== api.value && api.setValue(value)' } },
  },
  template: [
    el(
      'div',
      {
        part: 'root',
        class: ['group'],
        // The radiogroup an agent reads the name of.
        ref: 'group',
        attrs: {
          role: lit('radiogroup'),
          id: 'id',
          'aria-label': 'ariaLabel',
          'aria-labelledby': 'ariaLabelledby',
          'aria-describedby': 'ariaDescribedby',
          'aria-required': 'ariaRequired',
          'aria-invalid': when('invalid', 'true'),
          'data-orientation': 'orientation',
          'data-disabled': flag('disabled'),
          'data-invalid': flag('invalid'),
          'data-required': flag('ariaRequired'),
          ...identity('RadioGroup'),
        },
      },
      [
        each('options', 'option', 'option.value', [
          el('label', { part: 'row', class: ['row'] }, [
            el(
              'button',
              {
                part: 'radio',
                class: ['circle'],
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
                  // Enter does nothing, as WAI-ARIA's radio group pattern has it: without this the
                  // browser would make it a click on the button, which chooses the radio.
                  keydown: run(
                    "$event.key === 'Enter' ? $event.preventDefault() : roveRadio($event, (next) => api.setValue(next))",
                  ),
                },
              },
              [
                cond(CHECKED, [
                  el('span', {
                    part: 'dot',
                    class: ['dot'],
                    attrs: { 'data-state': lit('checked') },
                  }),
                ]),
              ],
            ),
            el('span', { class: ['label'] }, [text('option.label')]),
          ]),
        ]),
      ],
    ),
    cond('name !== undefined', [
      el('input', {
        attrs: {
          type: lit('hidden'),
          name: 'name',
          value: "api.value ?? ''",
          disabled: 'disabled',
        },
      }),
    ]),
  ],
  states: [
    {
      name: 'nothing chosen yet',
      props: { options: PLANS, 'aria-label': 'Plan' },
      expect: { 'data-orientation': 'vertical' },
    },
    { name: 'one chosen', props: { options: PLANS, defaultValue: 'team', 'aria-label': 'Plan' } },
    {
      name: 'horizontal — three short labels at most',
      props: {
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
        orientation: 'horizontal',
        defaultValue: 'yes',
        'aria-label': 'Notify',
      },
      expect: { 'data-orientation': 'horizontal' },
    },
    {
      name: 'invalid',
      props: { options: PLANS, invalid: true, 'aria-label': 'Plan' },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'the whole group disabled',
      props: { options: PLANS, defaultValue: 'team', disabled: true, 'aria-label': 'Plan' },
      expect: { 'data-disabled': '' },
    },
    {
      name: 'one option disabled — the plan you cannot pick yet',
      props: {
        options: [
          { value: 'starter', label: 'Starter' },
          { value: 'team', label: 'Team' },
          { value: 'enterprise', label: 'Enterprise (contact sales)', disabled: true },
        ],
        defaultValue: 'starter',
        'aria-label': 'Plan',
      },
    },
    {
      name: 'in a FormField — the label is the question',
      many: {
        within: {
          member: 'FormField',
          props: {
            label: 'Which plan?',
            description: 'You can change this at any time.',
            required: true,
          },
        },
        each: [{ props: { options: PLANS, defaultValue: 'team' } }],
      },
    },
    {
      name: 'in a FormField, in error',
      many: {
        within: {
          member: 'FormField',
          props: { label: 'Which plan?', error: 'Pick a plan to continue.' },
        },
        each: [{ props: { options: PLANS } }],
      },
    },
  ],
})
