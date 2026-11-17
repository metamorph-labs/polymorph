import {
  cond,
  describeMember,
  el,
  fx,
  identity,
  lit,
  member,
  run,
  slot,
  type FixtureChild,
  type Node,
} from '../dsl'

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'normal', label: 'Normal' },
]

const SETUP_STEPS = [{ label: 'Collection' }, { label: 'First file' }, { label: 'Served URL' }]

const ACTIONS = [
  fx('Button', { variant: 'ghost', tone: 'neutral', label: 'Cancel' }),
  fx('Button', { icon: 'confirm', label: 'Create ticket', type: 'submit' }),
]

const card = (...children: FixtureChild[]) => [fx('Card', {}, { default: children })]

/**
 * The form's body: the caller's cards, then the committing row, anchored to
 * the column it submits. The row wraps, so actions too wide for the column
 * take a second line and stay at the end.
 */
const body: Node[] = [
  slot(),
  el('div', { part: 'actions', class: ['actions'] }, [
    member(
      'Inline',
      { gap: '3', justify: lit('end'), wrap: 'true' },
      { slots: { default: [slot('actions')] } },
    ),
  ]),
]

/**
 * FormPage (`design/archetypes/form-page.md`): the create and edit screen, a
 * reading column. With `submit` handled, the body is a real `<form>`, so
 * Enter submits from any field; a failed submit focuses the first invalid
 * field instead.
 */
export default describeMember({
  member: 'FormPage',
  dir: 'archetypes',
  recipe: 'archetypes/form-page',
  derived: {
    // The archetype's own behaviour: on a failed submit, focus the first invalid field. It
    // reads the DOM, where FormField already sets `aria-invalid`, so no second copy of the
    // fact can disagree.
    submit:
      "(event: Event) => { event.preventDefault(); const invalid = form?.querySelector<HTMLElement>('[aria-invalid=\"true\"]'); if (invalid) { invalid.focus(); return } emit('submit') }",
  },
  template: el('div', { class: ['page'], attrs: { ...identity('FormPage') } }, [
    member('PageHeader', { title: 'title', description: 'description' }),
    cond(
      'listening.submit',
      [
        el(
          'form',
          {
            part: 'form',
            class: ['form'],
            ref: 'form',
            attrs: { novalidate: 'true' },
            on: { submit: run('submit($event)') },
          },
          body,
        ),
      ],
      body,
    ),
  ]),
  states: [
    {
      name: 'a header, one card and the committing row',
      props: { title: 'New ticket', description: "Raise a conversation on someone's behalf." },
      slots: {
        actions: ACTIONS,
        default: card(
          fx(
            'Stack',
            { gap: 5 },
            {
              default: [
                fx(
                  'FormField',
                  { label: 'Subject', required: true, description: 'One line.' },
                  {
                    default: [
                      fx('Input', { placeholder: 'Webhook retries stop after the first 5xx' }),
                    ],
                  },
                ),
                fx('FormField', { label: 'Details' }, { default: [fx('Textarea', { rows: 4 })] }),
              ],
            },
          ),
        ),
      },
    },
    {
      name: 'a two-column row, where both cells carry a description or neither',
      props: { title: 'New ticket' },
      slots: {
        actions: ACTIONS,
        default: card(
          fx(
            'Grid',
            { columns: 2, gap: 5 },
            {
              default: [
                fx(
                  'FormField',
                  { label: 'Requester', required: true, description: 'Where replies go.' },
                  {
                    default: [
                      fx('Input', { type: 'email', placeholder: 'dana@northwind.example' }),
                    ],
                  },
                ),
                fx(
                  'FormField',
                  { label: 'Priority', description: 'Urgent pages the on-call engineer.' },
                  { default: [fx('Select', { options: PRIORITIES, defaultValue: 'normal' })] },
                ),
              ],
            },
          ),
        ),
      },
    },
    {
      name: 'with a destructive tertiary, leftmost and quiet',
      props: { title: 'Edit ticket' },
      slots: {
        actions: [
          fx('Button', { variant: 'ghost', tone: 'danger', label: 'Delete ticket…' }),
          fx('Button', { variant: 'outline', tone: 'neutral', label: 'Cancel' }),
          fx('Button', { label: 'Save changes', type: 'submit' }),
        ],
        default: card(
          fx(
            'FormField',
            { label: 'Subject', required: true },
            {
              default: [fx('Input', { defaultValue: 'Webhook retries stop after the first 5xx' })],
            },
          ),
        ),
      },
    },
    {
      name: 'a real form — Enter submits from any field',
      props: { title: 'New ticket', onSubmit: { js: '() => {}' } },
      slots: {
        actions: ACTIONS,
        default: card(
          fx('FormField', { label: 'Subject', required: true }, { default: [fx('Input')] }),
        ),
      },
    },
    {
      name: 'a step of a flow — the progress above the step’s card',
      props: {
        title: 'Set up Northwind',
        description: 'Three steps, and the first file is served.',
      },
      slots: {
        actions: [
          fx('Button', { variant: 'outline', tone: 'neutral', label: 'Back' }),
          fx('Button', { label: 'Continue', type: 'submit' }),
        ],
        default: [
          fx('Stepper', { steps: SETUP_STEPS, activeIndex: 1 }),
          fx(
            'Card',
            { title: 'First file' },
            {
              default: [
                fx(
                  'FormField',
                  { label: 'File name', required: true },
                  { default: [fx('Input', { placeholder: 'logo.svg' })] },
                ),
              ],
            },
          ),
        ],
      },
    },
  ],
})
