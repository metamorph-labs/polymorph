import { cond, describeMember, el, flag, identity, lit, member, run, text } from '../dsl'

/** Whether a press landed on a control, read from the event's path (as Input reads it). */
const onControl =
  "$event.composedPath().some((node) => 'nodeName' in node && ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(String(node.nodeName)))"

/** The machine's value is the field's text; the member's is a number, and `null` for empty. */
const asText = (value: string) =>
  `(${value} === undefined ? undefined : ${value} === null ? '' : String(${value}))`

/** The machine's event behind a callback: `INPUT.CHANGE` is typing, a step is `INPUT.ARROW_UP` and the like. */
const CAUSE = 'service.event.current().type'

/**
 * Reports a committed number as React's `onChange` does: `null` for the empty
 * field, never `NaN`, and nothing when it is the number last reported.
 */
const report = (number: string) =>
  `((next) => next === committed || ((committed = next), emit('change', next)))(Number.isNaN(${number}) ? null : ${number})`

/** An affix: static text beside the value, hidden because it is not part of the value. */
const affix = (prop: string) =>
  cond(`${prop} !== undefined`, [
    el('span', { part: 'affix', class: ['affix'], attrs: { 'aria-hidden': lit('true') } }, [
      text(prop),
    ]),
  ])

/**
 * NumberInput (`design/components/number-input.md`): a parsed, formatted
 * number. Zag's machine owns the text, the formatting and the keys (the
 * arrows step, Home and End go to the rails). The field stays a textbox, as
 * the spec's contract has it, with the machine's own role description, so the
 * range attributes a spinbutton would carry are left off it; the value is in
 * the field's text.
 *
 * `change` reports committed numbers, never drafts: typed text commits on blur
 * and Enter, a step commits as it fires, and unparseable text restores the
 * last committed number. The machine holds the text uncontrolled, because a
 * draft such as `1.` or a lone `-` is not a number a parent could hold; the
 * member keeps the committed number and moves the machine to a controlled
 * `value` when the parent changes it, or back when the parent keeps its own.
 */
export default describeMember({
  member: 'NumberInput',
  dir: 'controls',
  recipe: 'controls/number-input',
  types: {
    NumberFormat:
      "{ style?: 'decimal' | 'percent' | 'currency'; currency?: string; maximumFractionDigits?: number }",
  },
  defaults: { size: lit('md'), disabled: 'false', readOnly: 'false', invalid: 'false' },
  state: {
    // The number last committed: the parent's `value` when it controls one.
    committed: 'value === undefined ? (defaultValue ?? null) : value',
    // The text typed since the last commit, so a commit can tell empty from unparseable.
    draft: "''",
  },
  machine: {
    of: 'number-input',
    context: {
      defaultValue: asText('(value === undefined ? defaultValue : value)'),
      min: 'min',
      max: 'max',
      step: 'step',
      formatOptions: 'format',
      disabled: 'disabled',
      readOnly: 'readOnly',
      invalid: 'invalid',
      required: 'ariaRequired',
      // The wheel does not step the value, as the spec decides.
      allowMouseWheel: 'false',
      // The caller's id names the field, and the steppers' `aria-controls` follow it.
      ids: 'id === undefined ? undefined : { input: id }',
    },
    events: {
      // Typing is a draft. A blur or Enter commits through `onValueCommit`, and the
      // member's own move to a controlled value reports nothing. Anything else is a step.
      onValueChange: {
        run: `${CAUSE} === 'INPUT.CHANGE' ? (draft = details.value) : ['INPUT.BLUR', 'INPUT.ENTER', 'VALUE.SET', 'VALUE.CLEAR'].includes(${CAUSE}) || ${report('details.valueAsNumber')}`,
      },
      // An empty field commits `null`; text that does not parse restores the last committed number.
      onValueCommit: {
        run: `Number.isNaN(details.valueAsNumber) && draft.trim() !== '' ? (committed === null ? api.clearValue() : api.setValue(committed)) : ${report('details.valueAsNumber')}`,
      },
    },
  },
  // The spec's `agent` fence. An agent commits a number as a typed commit does: the machine
  // holds it within `min` and `max`, and the member reports it only when it differs from the
  // committed number. The machine reports nothing for a value the member sets itself, so the
  // action reports. A read-only field refuses both actions.
  agent: {
    on: 'control',
    state: {
      value: 'committed',
      disabled: 'disabled',
      invalid: 'invalid',
      readonly: 'readOnly',
    },
    actions: {
      set: {
        argument: 'number',
        run: `(() => {
          if (readOnly) throw new Error('The field is read-only.')
          const next = Math.min(Math.max(value, min ?? -Infinity), max ?? Infinity)
          api.setValue(next);
          ${report('next')}
        })()`,
      },
      clear: `(() => {
        if (readOnly) throw new Error('The field is read-only.')
        api.clearValue();
        ${report('NaN')}
      })()`,
    },
  },
  effects: [
    // A controlled `value` the parent changed, or kept when the member reported another.
    {
      watch: '[value, committed]',
      mount: false,
      run: 'value === undefined || value === committed || ((committed = value), value === null ? api.clearValue() : api.setValue(value))',
    },
  ],
  template: el(
    'div',
    {
      part: 'field',
      class: ['field'],
      spread: ['api.getRootProps()'],
      attrs: {
        'data-size': 'size',
        'data-disabled': flag('disabled'),
        'data-invalid': flag('invalid'),
        'data-readonly': flag('readOnly'),
        ...identity('NumberInput'),
      },
      // A press on the frame focuses the field, except on parts that are controls themselves.
      on: { mousedown: run('($event.preventDefault(), api.focus())', `!(${onControl})`) },
    },
    [
      affix('prefix'),
      el('input', {
        part: 'field',
        ref: 'control',
        class: ['input'],
        spread: ['api.getInputProps()'],
        attrs: {
          name: 'undefined',
          placeholder: 'placeholder',
          role: 'undefined',
          'aria-valuemin': 'undefined',
          'aria-valuemax': 'undefined',
          'aria-valuenow': 'undefined',
          'aria-valuetext': 'undefined',
          'aria-label': 'ariaLabel',
          'aria-labelledby': 'ariaLabelledby',
          'aria-describedby': 'ariaDescribedby',
          'aria-required': 'ariaRequired',
        },
        on: {
          blur: { emit: 'blur', args: ['$event'] },
          focus: { emit: 'focus', args: ['$event'] },
        },
      }),
      affix('suffix'),
      // Down then up, as a number line reads. Not drawn under readOnly: a value that cannot be edited cannot be stepped.
      cond('!readOnly', [
        el('div', { class: ['steppers'] }, [
          el(
            'button',
            { part: 'stepper', class: ['stepper'], spread: ['api.getDecrementTriggerProps()'] },
            [member('Icon', { name: lit('down'), size: 'size' })],
          ),
          el(
            'button',
            { part: 'stepper', class: ['stepper'], spread: ['api.getIncrementTriggerProps()'] },
            [member('Icon', { name: lit('up'), size: 'size' })],
          ),
        ]),
      ]),
      // The plain number under `name`, so a server never receives "$1,234.56".
      cond('name !== undefined', [
        el('input', {
          attrs: {
            type: lit('hidden'),
            name: 'name',
            value: "committed ?? ''",
            disabled: 'disabled || undefined',
          },
        }),
      ]),
    ],
  ),
  states: [
    {
      name: 'rest md',
      many: {
        within: { member: 'FormField', props: { label: 'Agents on this plan' } },
        each: [{ props: { placeholder: '0' } }],
      },
    },
    {
      name: 'with value',
      props: { defaultValue: 5, min: 1, step: 1, 'aria-label': 'Agents on this plan' },
      expect: { 'data-size': 'md' },
    },
    {
      name: 'at the rail',
      props: { defaultValue: 1, min: 1, 'aria-label': 'Agents on this plan' },
    },
    {
      name: 'currency',
      props: {
        defaultValue: 29,
        format: { style: 'currency', currency: 'USD' },
        'aria-label': 'Price per seat',
      },
    },
    {
      name: 'percent',
      props: { defaultValue: 0.9, format: { style: 'percent' }, 'aria-label': 'CSAT target' },
    },
    {
      name: 'affixed',
      props: { suffix: 'hrs', defaultValue: 4, 'aria-label': 'First response within' },
    },
    {
      name: 'sm',
      props: { size: 'sm', 'aria-label': 'Agents on this plan' },
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'invalid',
      props: { invalid: true, 'aria-label': 'Agents on this plan' },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      props: { disabled: true, defaultValue: 5, 'aria-label': 'Agents on this plan' },
      expect: { 'data-disabled': '' },
    },
    {
      name: 'readOnly',
      props: { readOnly: true, defaultValue: 5, 'aria-label': 'Agents on this plan' },
      expect: { 'data-readonly': '' },
    },
  ],
})
