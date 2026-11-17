import { cond, describeMember, el, flag, identity, lit, member, run, text, when } from '../dsl'

/**
 * The box: the focusable control, a `<button role="checkbox">` as Radix renders
 * it. Zag's checkbox makes a visually hidden native input the control and
 * marks its drawn box `aria-hidden`; the recipe draws the focus ring on the box
 * itself and the conformance locator finds the box as a button, so the box is
 * drawn here and reads the machine's state, and the machine owns the checked
 * value, controlled or not, and its transitions.
 */
const box = el(
  'button',
  {
    part: 'box',
    class: ['box'],
    // The control an agent reads the name of.
    ref: 'box',
    attrs: {
      type: lit('button'),
      role: lit('checkbox'),
      id: 'id',
      'aria-checked': "api.indeterminate ? 'mixed' : api.checked",
      disabled: 'disabled',
      'aria-label': 'ariaLabel',
      'aria-labelledby': 'ariaLabelledby',
      'aria-describedby': 'ariaDescribedby',
      'aria-required': 'ariaRequired',
      'aria-invalid': when('invalid', 'true'),
      'data-state': 'dataState',
      'data-disabled': flag('disabled'),
      // Mirrored so the row can draw the required marker FormField has no row for.
      'data-required': flag('ariaRequired'),
      'data-invalid': flag('invalid'),
      ...identity('Checkbox'),
    },
    on: {
      click: run('api.toggleChecked()'),
      // A checkbox toggles on Space only (WAI-ARIA); Enter is a form's key.
      keydown: run('$event.preventDefault()', "$event.key === 'Enter'"),
    },
  },
  [
    cond('api.checked || api.indeterminate', [
      el(
        'span',
        { part: 'indicator', class: ['indicator'], attrs: { 'data-state': 'dataState' } },
        [
          member('Icon', {
            name: "api.indeterminate ? 'indeterminate' : 'confirm'",
            size: lit('sm'),
          }),
        ],
      ),
    ]),
  ],
)

/** The form value, for a checkbox inside a form: present while it is checked. */
const formValue = cond('name !== undefined && api.checked', [
  el('input', { attrs: { type: lit('hidden'), name: 'name', value: "value ?? 'on'" } }),
])

/** Checkbox (`design/components/checkbox.md`): a boolean or indeterminate choice. */
export default describeMember({
  member: 'Checkbox',
  dir: 'controls',
  recipe: 'controls/checkbox',
  types: { CheckedState: "boolean | 'indeterminate'" },
  defaults: { disabled: 'false', invalid: 'false' },
  statics: { controlKind: lit('row-labelled') },
  machine: {
    of: 'checkbox',
    context: {
      checked: 'checked',
      defaultChecked: 'defaultChecked',
      disabled: 'disabled',
      invalid: 'invalid',
      required: 'ariaRequired',
      name: 'name',
      value: 'value',
    },
    events: { onCheckedChange: { emit: 'checkedChange', payload: 'details.checked' } },
  },
  derived: {
    dataState: "api.indeterminate ? 'indeterminate' : api.checked ? 'checked' : 'unchecked'",
  },
  // The spec's `agent` fence. The machine owns the value, controlled or not, so an action sets
  // it through the machine and the machine calls `checkedChange`.
  agent: {
    on: 'box',
    state: { checked: "api.indeterminate ? 'mixed' : api.checked", disabled: 'disabled' },
    actions: { check: 'api.setChecked(true)', uncheck: 'api.setChecked(false)' },
  },
  template: [
    cond(
      'label === undefined',
      [box],
      [
        // With a label the row is the root and the hit target: a click anywhere in it toggles.
        el(
          'label',
          {
            part: 'row',
            class: ['row'],
            attrs: {
              'data-state': 'dataState',
              'data-disabled': flag('disabled'),
              'data-invalid': flag('invalid'),
              'data-required': flag('ariaRequired'),
              ...identity('Checkbox'),
            },
          },
          [box, el('span', { part: 'label', class: ['label'] }, [text('label')])],
        ),
      ],
    ),
    formValue,
  ],
  states: [
    {
      name: 'unchecked',
      props: { label: 'Email me about replies' },
      expect: { 'data-state': 'unchecked' },
    },
    {
      name: 'checked',
      props: { defaultChecked: true, label: 'Email me about replies' },
      expect: { 'data-state': 'checked' },
    },
    {
      name: 'indeterminate',
      props: { checked: 'indeterminate', label: 'Select all' },
      expect: { 'data-state': 'indeterminate' },
    },
    {
      name: 'invalid',
      props: { invalid: true, label: 'Accept the terms' },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'required — the marker the field row cannot render for it',
      props: { 'aria-required': true, label: 'Accept the terms' },
      expect: { 'data-required': '' },
    },
    {
      name: 'disabled',
      props: { disabled: true, label: 'Email me about replies' },
      expect: { 'data-disabled': '' },
    },
    {
      name: 'disabled checked',
      props: { disabled: true, defaultChecked: true, label: 'Email me about replies' },
      expect: { 'data-disabled': '', 'data-state': 'checked' },
    },
    {
      name: 'no label — a Table selection cell',
      props: { 'aria-label': 'Select row' },
      expect: { 'aria-label': 'Select row', 'data-state': 'unchecked' },
    },
    {
      name: 'a stack of them, so the rhythm is visible',
      many: {
        within: { member: 'Stack', props: { gap: 2 } },
        each: [
          { props: { defaultChecked: true, label: 'Urgent' } },
          { props: { label: 'Waiting on customer' } },
          {
            props: {
              label:
                'A label long enough to wrap onto a second line, so the box stays on the first',
            },
          },
        ],
      },
    },
  ],
})
