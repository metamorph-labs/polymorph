import { cond, describeMember, each, el, flag, identity, lit, run, text, when } from '../dsl'

/** Every write path goes through this, so `change` only ever reports digits. */
const sanitize = (raw: string) => `(${raw}).replace(/\\D/g, '').slice(0, length)`

/** The keys that would move the caret, which stays at the end. */
const CARET_KEYS = "['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']"

/**
 * OTPInput (`design/components/otp-input.md`): a one-time code drawn as cells
 * over one real, invisible input.
 *
 * One input, not one per cell: the code is one value with one name, one tab
 * stop and one label, platform autofill writes one value into one input, and
 * FormField's `<label for>` has one target. So no machine draws it; Zag's pin
 * input renders an input per cell, which is the shape the spec rejects. The
 * cells are drawn from the value and hidden from assistive technology. The
 * caret stays at the end: the keys that would move it do nothing, and a press
 * or a selection anywhere puts it back.
 *
 * The handlers live in script, where the input's own type is known: each
 * reads the event's input and writes the sanitized code back to it, so a
 * filtered keystroke never stays on screen, as React's controlled input has it.
 */
export default describeMember({
  member: 'OTPInput',
  dir: 'controls',
  recipe: 'controls/otp-input',
  types: {
    OTPLength: "NonNullable<OTPInputProps['length']>",
  },
  defaults: { length: '6', invalid: 'false', disabled: 'false' },
  statics: { controlKind: lit('field') },
  state: { uncontrolled: sanitize("defaultValue ?? ''"), focused: 'false' },
  derived: {
    code: sanitize('value ?? uncontrolled'),
    // When full, the caret cell is the last one: a focused control shows focus somewhere.
    caretIndex: 'code.length === length ? length - 1 : code.length',
    cells: 'Array.from({ length }, (_, index) => index)',
    // `complete` fires once, after `change`, when the code becomes full.
    commit:
      "(next: string) => ((before: string) => (uncontrolled = next, next !== before && emit('change', next), next.length === length && before.length < length && emit('complete', next)))(code)",
    receive: `(event: Event) => ((input: HTMLInputElement) => (commit(${sanitize('input.value')}), (input.value = code)))(event.target as HTMLInputElement)`,
    // A pasted code fills from the first cell and replaces what was there.
    receivePaste: `(event: ClipboardEvent) => (event.preventDefault(), commit(${sanitize("event.clipboardData?.getData('text') ?? ''")}), ((event.target as HTMLInputElement).value = code))`,
    pinCaret:
      '(event: Event) => ((node: HTMLInputElement) => (node.selectionStart !== code.length || node.selectionEnd !== code.length) && node.setSelectionRange(code.length, code.length))(event.currentTarget as HTMLInputElement)',
  },
  // The spec's `agent` fence. The code is read only so the bridge keeps it out of every
  // output: it is secret, and no action writes it, because a person types the code they were sent.
  agent: {
    on: 'field',
    state: { value: 'code', disabled: 'disabled', invalid: 'invalid' },
    actions: {},
    secret: ['value'],
  },
  template: el(
    'div',
    {
      class: ['root'],
      attrs: {
        'data-invalid': flag('invalid'),
        'data-disabled': flag('disabled'),
        ...identity('OTPInput'),
      },
    },
    [
      el('input', {
        part: 'field',
        ref: 'field',
        class: ['input'],
        attrs: {
          type: lit('text'),
          value: 'code',
          disabled: 'disabled',
          name: 'name',
          id: 'id',
          inputmode: lit('numeric'),
          autocomplete: lit('one-time-code'),
          // A code must never be corrected (PasswordInput's list).
          spellcheck: lit('false'),
          autocapitalize: lit('off'),
          autocorrect: lit('off'),
          maxlength: 'length',
          'aria-label': 'ariaLabel',
          'aria-labelledby': 'ariaLabelledby',
          'aria-describedby': 'ariaDescribedby',
          'aria-required': 'ariaRequired',
          'aria-invalid': when('invalid', 'true'),
        },
        on: {
          input: run('receive($event)'),
          paste: run('receivePaste($event)'),
          keydown: run('$event.preventDefault()', `${CARET_KEYS}.includes($event.key)`),
          // Every way a selection changes puts the caret back at the end.
          select: run('pinCaret($event)'),
          mouseup: run('pinCaret($event)'),
          keyup: run('pinCaret($event)'),
          focus: run('(focused = true, pinCaret($event))'),
          blur: run('focused = false'),
        },
      }),
      // The drawn cells, one character each. The caret cell is marked only while the field
      // holds focus. A digit is keyed by its value, so a replaced digit plays its entrance.
      each('cells', 'index', 'index', [
        el(
          'span',
          {
            part: 'cell',
            class: ['cell'],
            attrs: {
              'aria-hidden': lit('true'),
              'data-filled': flag('code[index] !== undefined'),
              'data-caret': flag('focused && index === caretIndex'),
            },
          },
          [
            cond('code[index] !== undefined', [
              each('[code[index]]', 'digit', '`${index}-${digit}`', [
                el('span', { class: ['digit'] }, [text('digit')]),
              ]),
            ]),
          ],
        ),
      ]),
    ],
  ),
  states: [
    {
      name: 'empty — six cells, no placeholder dots',
      props: { 'aria-label': 'Verification code' },
      expect: { 'data-invalid': null, 'data-disabled': null },
    },
    {
      name: 'four — the other length real code systems use',
      props: { length: 4, 'aria-label': 'Verification code' },
    },
    {
      name: 'partial — the code so far, the caret riding the tail',
      props: { defaultValue: '42', 'aria-label': 'Verification code' },
    },
    {
      name: 'full — read-complete',
      props: { defaultValue: '428051', 'aria-label': 'Verification code' },
    },
    {
      name: 'invalid — the code is wrong, not a digit',
      props: { invalid: true, defaultValue: '428051', 'aria-label': 'Verification code' },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      props: { disabled: true, 'aria-label': 'Verification code' },
      expect: { 'data-disabled': '' },
    },
    {
      name: 'via FormField — one label, one honest target',
      many: {
        within: {
          member: 'FormField',
          props: { label: 'Verification code', error: 'That code didn’t match.' },
        },
        each: [{ props: { defaultValue: '428051' } }],
      },
    },
  ],
})
