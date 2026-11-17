import { cond, describeMember, el, flag, identity, lit, member, run } from '../dsl'

/** The toggle's name, which every entry gives, because the member has no built-in text. */
const TOGGLE = { toggleLabel: 'Show password' }

/**
 * PasswordInput (`design/components/password-input.md`): an Input preset for
 * passwords, with a reveal toggle in Input's trailing slot.
 *
 * Revealing changes the same input's `type` in place, so the value, the
 * password manager's wiring and the caret are kept. The browser moves the
 * selection to the start when a live input's `type` changes, so the toggle
 * saves the selection before the flip and an effect restores it after the
 * document updates, and again at the next frame, when Chromium resets it a
 * second time. A revealed password is still a secret: the input never goes to
 * a spellcheck service or autocorrect, set once on mount on the inner input.
 *
 * Visibility is the member's own state and cannot be controlled, because the
 * toggle's placement is what this member decides.
 */
export default describeMember({
  member: 'PasswordInput',
  dir: 'controls',
  recipe: 'controls/password-input',
  defaults: {
    size: lit('md'),
    disabled: 'false',
    readOnly: 'false',
    invalid: 'false',
    autoComplete: lit('current-password'),
  },
  state: {
    revealed: 'false',
    held: "{ start: null as number | null, end: null as number | null, direction: 'none' as 'forward' | 'backward' | 'none' }",
  },
  derived: { field: "frame?.querySelector('input') ?? null" },
  // The spec's `agent` fence. The password is read from the field only so the bridge keeps it
  // out of every output: it is secret. No action writes it, and the toggle is not an agent's.
  // The field is the Input's, so the element is read through the frame.
  agent: {
    on: 'frame',
    element: "frame?.querySelector('input')",
    state: {
      value: "frame?.querySelector('input')?.value ?? ''",
      revealed: 'revealed',
      disabled: 'disabled',
      invalid: 'invalid',
      readonly: 'readOnly',
    },
    actions: {},
    secret: ['value'],
  },
  effects: [
    {
      run: "(field?.setAttribute('spellcheck', 'false'), field?.setAttribute('autocapitalize', 'off'), field?.setAttribute('autocorrect', 'off'))",
    },
    {
      watch: 'revealed',
      mount: false,
      run: 'held.start !== null && held.end !== null && (field?.setSelectionRange(held.start, held.end, held.direction), requestAnimationFrame(() => field?.setSelectionRange(held.start, held.end, held.direction)))',
    },
  ],
  template: el(
    'span',
    {
      class: ['password'],
      ref: 'frame',
      attrs: {
        'data-size': 'size',
        'data-disabled': flag('disabled'),
        'data-invalid': flag('invalid'),
        'data-readonly': flag('readOnly'),
        'data-state': "revealed ? 'visible' : 'hidden'",
        ...identity('PasswordInput'),
      },
    },
    [
      member(
        'Input',
        {
          type: "revealed ? 'text' : 'password'",
          value: 'value',
          defaultValue: 'defaultValue',
          placeholder: 'placeholder',
          size: 'size',
          disabled: 'disabled',
          readOnly: 'readOnly',
          invalid: 'invalid',
          autoComplete: 'autoComplete',
          name: 'name',
          id: 'id',
          'aria-label': 'ariaLabel',
          'aria-labelledby': 'ariaLabelledby',
          'aria-describedby': 'ariaDescribedby',
          'aria-required': 'ariaRequired',
        },
        {
          on: { change: run("(next, event) => emit('change', next, event)") },
          slots: {
            trailing: [
              // Always rendered, even on an empty field. Disabled with the field; a read-only
              // field keeps it, because revealing is not editing. The name stays the same in
              // both states, and `aria-pressed` carries the state.
              el(
                'button',
                {
                  part: 'toggle',
                  class: ['toggle'],
                  attrs: {
                    type: lit('button'),
                    disabled: 'disabled',
                    'aria-pressed': 'revealed',
                    'aria-label': 'toggleLabel',
                  },
                  on: {
                    click: run(
                      "(held = { start: field?.selectionStart ?? null, end: field?.selectionEnd ?? null, direction: field?.selectionDirection ?? 'none' }, revealed = !revealed)",
                    ),
                  },
                },
                [
                  // `visible` while masked (the action is to show), `hidden` while revealed. Two
                  // branches, so each glyph is a fresh node and the recipe's crossfade plays.
                  cond(
                    'revealed',
                    [member('Icon', { name: lit('hidden'), size: 'size' })],
                    [member('Icon', { name: lit('visible'), size: 'size' })],
                  ),
                ],
              ),
            ],
          },
        },
      ),
    ],
  ),
  states: [
    {
      name: 'rest',
      props: { ...TOGGLE, 'aria-label': 'Password' },
      expect: { 'data-state': 'hidden' },
    },
    {
      name: 'with value — masked, and never in an announcement',
      props: { ...TOGGLE, defaultValue: 'hunter2', 'aria-label': 'Password' },
      expect: { 'data-state': 'hidden' },
    },
    {
      name: 'sm',
      props: { ...TOGGLE, size: 'sm', 'aria-label': 'Password' },
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'invalid',
      props: { ...TOGGLE, invalid: true, 'aria-label': 'Password' },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled — the toggle goes with the field',
      props: { ...TOGGLE, disabled: true, 'aria-label': 'Password' },
      expect: { 'data-disabled': '' },
    },
    {
      name: 'readOnly — reveal still matters for a generated password',
      props: { ...TOGGLE, readOnly: true, defaultValue: 'k9!vX2#mQ8', 'aria-label': 'Password' },
      expect: { 'data-readonly': '' },
    },
    {
      // A fixture's layout member takes props alone, so the label row's `labelEnd` link is not
      // rendered; the field, its label and its id are.
      name: 'via FormField — the login block',
      many: {
        within: { member: 'FormField', props: { label: 'Password', id: 'password' } },
        each: [{ props: { ...TOGGLE } }],
      },
      expect: { 'data-kind': 'field' },
    },
  ],
})
