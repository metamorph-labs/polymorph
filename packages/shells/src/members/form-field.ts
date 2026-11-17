import {
  cond,
  describeMember,
  el,
  flag,
  fx,
  identity,
  lit,
  member,
  slot,
  text,
  when,
  words,
} from '../dsl'

/**
 * The slotted control's kind: its component's `controlKind`, `field` when it
 * declares none (`controlKindOf`). Read in the template, where the slot is.
 */
const KIND = "slotted(slots.default).kind ?? 'field'"

/** The control's own `disabled`: `true`, or `''` from a template's bare attribute. */
const DISABLED =
  "slotted(slots.default).props.disabled === true || slotted(slots.default).props.disabled === ''"

/** The help text: above a column-labelled control, below a row-labelled one. */
const descriptionRow = cond('showDescription', [
  el('p', { part: 'description', class: ['description'], attrs: { id: 'descriptionId' } }, [
    text('description'),
  ]),
])

const PRIORITY = 'How fast this needs an answer.'

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
]

/**
 * FormField (`design/components/form-field.md`): a control with its label,
 * help text and error, and the wiring between them. The control is the
 * caller's element, given its id and descriptions as React's `cloneElement`
 * gives them.
 *
 * `errorPresentation: 'toast'` reports the message through the application's
 * toast viewport (`Toast.Viewport`), as React's ToastNotice does: a retained,
 * pinned danger toast, titled with the label, raised through the foundation's
 * toast store while the field is invalid. A new message raises it again after
 * a dismissal, and it is removed when the field is valid again or unmounts.
 * The field keeps `data-invalid`, and draws no inline error.
 */
export default describeMember({
  member: 'FormField',
  dir: 'controls',
  recipe: 'controls/form-field',
  types: {
    FormFieldControlProps:
      "{ id?: string; label?: string; invalid?: boolean; disabled?: boolean; 'aria-describedby'?: string; 'aria-labelledby'?: string; 'aria-required'?: boolean }",
  },
  defaults: { errorPresentation: lit('inline'), required: 'false' },
  derived: {
    // The base is the control's id, and the message ids derive from it: `id="priority"` makes
    // the control reachable as `#priority`.
    controlId: 'id ?? uid',
    descriptionId: '`${controlId}-description`',
    errorId: '`${controlId}-error`',
    labelId: '`${controlId}-label`',
    invalid: "error !== undefined && error !== ''",
    inline: "invalid && errorPresentation === 'inline'",
    // The toast notice's id, the field's own, so one field raises one notice.
    noticeId: '`${controlId}-notice`',
    showDescription: "description !== undefined && description !== '' && !invalid",
    // Error first, and the description's id only while the description is rendered: a
    // reference to a node that is not there announces nothing.
    describedBy:
      "[inline ? errorId : undefined, showDescription ? descriptionId : undefined].filter((value) => value !== undefined).join(' ') || undefined",
  },
  effects: [
    // The toast notice: raised while the field is invalid, raised again for a new message or
    // label, and removed when the field is valid again or unmounts.
    {
      watch: '[invalid, errorPresentation, error, label]',
      run: "invalid && errorPresentation === 'toast' ? toast({ id: noticeId, title: label, description: error, tone: 'danger', dismissible: true, retained: true, durationMs: Number.POSITIVE_INFINITY }) : ''",
      release: "ran === '' || removeToast(ran)",
    },
  ],
  template: el(
    'div',
    {
      class: ['field'],
      attrs: {
        // The layout depends on it: a row-labelled control is a row that must not be stretched.
        'data-kind': KIND,
        'data-invalid': flag('invalid'),
        'data-disabled': flag(DISABLED),
        ...identity('FormField'),
      },
    },
    [
      // A row-labelled control (Checkbox, Switch) renders the label in its own row.
      cond(`(${KIND}) !== 'row-labelled'`, [
        el('div', { part: 'labelRow', class: ['labelRow'] }, [
          // A group cannot be the target of `for`, so it is named by association instead.
          el(
            'label',
            {
              part: 'label',
              class: ['label'],
              attrs: {
                id: when(`(${KIND}) === 'group'`, 'labelId'),
                for: when(`(${KIND}) !== 'group'`, 'controlId'),
              },
            },
            [
              text('label'),
              cond('required', [
                el('span', { class: ['required'], attrs: { 'aria-hidden': lit('true') } }, [
                  words(' *'),
                ]),
              ]),
            ],
          ),
          cond('slots.labelEnd', [el('span', { class: ['labelEnd'] }, [slot('labelEnd')])]),
        ]),
        descriptionRow,
      ]),
      slot('default', {
        // The field adds wiring and never overrides what the control was given:
        // an `undefined` here leaves the control's own value.
        pass: {
          id: 'controlId',
          'aria-describedby': 'describedBy',
          'aria-required': when('required', 'true'),
          'aria-labelledby': when(`(${KIND}) === 'group'`, 'labelId'),
          invalid: when('invalid', 'true'),
          label: when(`(${KIND}) === 'row-labelled'`, 'label'),
        },
      }),
      // A settings row is read control first, so its description sits below the row.
      cond(`(${KIND}) === 'row-labelled'`, [descriptionRow]),
      cond('inline', [
        el('p', { part: 'error', class: ['error'], attrs: { id: 'errorId' } }, [
          // Decorative: the danger role and `aria-describedby` carry the state.
          el('span', { class: ['glyph'] }, [
            member('Icon', { name: lit('error'), size: lit('sm') }),
          ]),
          text('error'),
        ]),
      ]),
    ],
  ),
  states: [
    {
      name: 'plain',
      props: { label: 'Subject' },
      slots: { default: [fx('Input', { placeholder: 'What went wrong?' })] },
    },
    {
      name: 'described',
      props: { label: 'Subject', description: 'One line, as the customer would say it.' },
      slots: { default: [fx('Input', { placeholder: 'What went wrong?' })] },
    },
    {
      name: 'required',
      props: { required: true, label: 'Subject' },
      slots: { default: [fx('Input', { placeholder: 'What went wrong?' })] },
    },
    {
      name: 'labelEnd — the row has two ends',
      props: { label: 'Password' },
      slots: {
        default: [fx('Input', { type: 'password', autoComplete: 'current-password' })],
        labelEnd: [
          fx(
            'Link',
            { href: '#reset', variant: 'standalone' },
            { default: ['Forgot your password?'] },
          ),
        ],
      },
    },
    {
      name: 'labelEnd, required and in error — the row holds all three',
      props: { required: true, label: 'Password', error: 'That password does not match.' },
      slots: {
        default: [fx('Input', { type: 'password', autoComplete: 'current-password' })],
        labelEnd: [
          fx(
            'Link',
            { href: '#reset', variant: 'standalone' },
            { default: ['Forgot your password?'] },
          ),
        ],
      },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'error',
      props: { label: 'Subject', error: 'A subject is required.' },
      slots: { default: [fx('Input')] },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'error replaces description',
      props: {
        label: 'Subject',
        description: 'One line, as the customer would say it.',
        error: 'A subject is required.',
      },
      slots: { default: [fx('Input')] },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled control',
      props: { label: 'Subject', description: 'Locked while the ticket is closed.' },
      slots: { default: [fx('Input', { disabled: true, defaultValue: 'Login loop' })] },
      expect: { 'data-disabled': '' },
    },
    {
      name: 'with Select',
      props: { required: true, label: 'Priority', description: PRIORITY },
      slots: { default: [fx('Select', { options: PRIORITIES, placeholder: 'Choose one' })] },
    },
    {
      name: 'with Select, in error',
      props: { required: true, label: 'Priority', error: 'Pick a priority before sending.' },
      slots: { default: [fx('Select', { options: PRIORITIES, placeholder: 'Choose one' })] },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'with Checkbox — the field label becomes the row label',
      props: { label: 'Email me about replies', description: 'You can turn this off later.' },
      slots: { default: [fx('Checkbox')] },
    },
    {
      name: 'with Checkbox, in error',
      props: { label: 'Accept the terms', error: 'You have to accept the terms to continue.' },
      slots: { default: [fx('Checkbox')] },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'required Checkbox — the row carries the marker',
      props: { required: true, label: 'Accept the terms' },
      slots: { default: [fx('Checkbox')] },
    },
    {
      name: 'with Switch',
      props: { label: 'Desktop notifications' },
      slots: { default: [fx('Switch')] },
    },
    {
      name: 'described Switch — the message sits below the row',
      props: {
        label: 'Send a daily digest',
        description:
          'One summary each morning instead of a notification per reply. Long enough to wrap, because the message runs the full width of the field and is not indented under the row label.',
      },
      slots: { default: [fx('Switch')] },
    },
  ],
})
