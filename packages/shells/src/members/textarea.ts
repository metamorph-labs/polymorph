import { describeMember, el, emit, flag, identity, js, run, when } from '../dsl'

const NOTE =
  'Retries stop after the first 5xx and never resume. Re-delivering by hand works, ' +
  'so the endpoint is reachable.'

/**
 * Long enough that a four-row box would scroll, and split into lines rather than left to
 * wrap, so the growth does not depend on the gallery's width.
 */
const LONG = [
  'Steps:',
  '1. Create a webhook endpoint that returns 502 once.',
  '2. Send a delivery.',
  '3. Watch the retry schedule stop instead of backing off.',
  '',
  'First failure 09:12 UTC, POST /hooks/deliveries. Re-delivering by hand works,',
  'so the endpoint is reachable and nothing appears in the request log.',
].join('\n')

/**
 * Textarea (`design/components/textarea.md`): multi-line text entry, Input's
 * design extended vertically. `autosize` grows the box to its content through
 * the foundation's `fitTextarea`, never below the height `rows` gives it.
 *
 * The value is held as a draft while the caller does not control it, so a
 * re-render writes back what the user typed rather than `defaultValue`.
 */
export default describeMember({
  member: 'Textarea',
  dir: 'controls',
  recipe: 'controls/textarea',
  types: {
    TextareaResize: "NonNullable<TextareaProps['resize']>",
  },
  defaults: {
    rows: '4',
    autosize: 'false',
    invalid: 'false',
    disabled: 'false',
    readOnly: 'false',
    autoFocus: 'false',
  },
  state: { draft: "defaultValue ?? ''" },
  derived: {
    // A box that resizes itself and can also be dragged would have two owners for one height.
    resizing: "resize ?? (autosize ? 'none' : 'vertical')",
  },
  controlRefs: { control: 'controlRef' },
  effects: [
    {
      watch: '[value, defaultValue, autosize]',
      run: 'autosize && control && fitTextarea(control)',
    },
    // On mount only, as React's `autoFocus`.
    { run: 'autoFocus && control?.focus()' },
  ],
  // The spec's `agent` fence. An agent writes through the field as typing does (`agentFill`),
  // so the input handler runs, the box fits its text and `change` is emitted. A read-only
  // field refuses both actions.
  agent: {
    on: 'control',
    state: {
      value: 'value ?? draft',
      disabled: 'disabled',
      invalid: 'invalid',
      readonly: 'readOnly',
    },
    actions: {
      fill: {
        argument: 'text',
        run: `(() => {
          if (readOnly) throw new Error('The field is read-only.')
          agentFill(control, value)
        })()`,
      },
      clear: `(() => {
        if (readOnly) throw new Error('The field is read-only.')
        agentFill(control, '')
      })()`,
    },
  },
  template: el('textarea', {
    ref: 'control',
    class: ['textarea'],
    attrs: {
      id: 'id',
      rows: 'rows',
      value: 'value ?? draft',
      placeholder: 'placeholder',
      name: 'name',
      maxlength: 'maxLength',
      disabled: 'disabled',
      readonly: 'readOnly',
      'aria-label': 'ariaLabel',
      'aria-labelledby': 'ariaLabelledby',
      'aria-describedby': 'ariaDescribedby',
      'aria-required': 'ariaRequired',
      'aria-invalid': when('invalid', 'true'),
      'data-resize': 'resizing',
      'data-autosize': flag('autosize'),
      'data-invalid': flag('invalid'),
      'data-disabled': flag('disabled'),
      'data-readonly': flag('readOnly'),
      ...identity('Textarea'),
    },
    on: {
      input: run(
        "(draft = control?.value ?? '', autosize && control && fitTextarea(control), emit('change', draft, $event))",
      ),
      blur: emit('blur', { args: ['$event'] }),
      focus: emit('focus', { args: ['$event'] }),
      select: emit('select', { args: ['$event'] }),
      compositionstart: emit('compositionStart', { args: ['$event'] }),
      compositionend: emit('compositionEnd', { args: ['$event'] }),
    },
  }),
  states: [
    {
      name: 'rest',
      props: { placeholder: 'What happened?', 'aria-label': 'Notes' },
      expect: { 'data-resize': 'vertical', 'data-invalid': null },
    },
    { name: 'with a value', props: { defaultValue: NOTE, 'aria-label': 'Notes' } },
    {
      name: 'invalid',
      props: { defaultValue: 'Too short.', invalid: true, 'aria-label': 'Notes' },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      props: { defaultValue: NOTE, disabled: true, 'aria-label': 'Notes' },
      expect: { 'data-disabled': '' },
    },
    {
      name: 'read only',
      props: { defaultValue: NOTE, readOnly: true, 'aria-label': 'Notes' },
      expect: { 'data-readonly': '' },
    },
    {
      name: 'taller — the height decision, in line units',
      props: { rows: 8, defaultValue: NOTE, 'aria-label': 'Notes' },
    },
    {
      name: 'not resizable',
      props: { resize: 'none', defaultValue: NOTE, 'aria-label': 'Notes' },
      expect: { 'data-resize': 'none' },
    },
    {
      name: 'autosize — the box is as tall as what is in it',
      // Its newlines are written as escapes.
      props: { autosize: true, defaultValue: js(JSON.stringify(LONG)), 'aria-label': 'Notes' },
      expect: { 'data-autosize': '', 'data-resize': 'none' },
    },
    {
      name: 'autosize, with one line — `rows` is still the floor',
      props: { autosize: true, defaultValue: 'It broke.', 'aria-label': 'Notes' },
      expect: { 'data-autosize': '' },
    },
    {
      name: 'in a FormField, in error',
      many: {
        within: {
          member: 'FormField',
          props: { label: 'What happened?', error: 'Tell us what you were doing at the time.' },
        },
        each: [{ props: { defaultValue: 'It broke.' } }],
      },
    },
  ],
})
