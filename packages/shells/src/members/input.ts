import {
  cond,
  describeMember,
  el,
  emit,
  flag,
  identity,
  lit,
  member,
  run,
  slot,
  text,
  when,
} from '../dsl'

/**
 * Whether a press landed on a control (`closest('button, a, input, select,
 * textarea')`), read from the event's path because a template cannot call
 * `closest` on an `EventTarget` without a cast.
 */
const onControl =
  "$event.composedPath().some((node) => 'nodeName' in node && ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(String(node.nodeName)))"

/** An affix: static text beside the value, hidden because it is not part of the value. */
const affix = (prop: string) =>
  cond(`${prop} !== undefined`, [
    el('span', { part: 'affix', class: ['affix'], attrs: { 'aria-hidden': lit('true') } }, [
      text(prop),
    ]),
  ])

/**
 * Input (`design/components/input.md`): single-line text entry. The states
 * are on the frame, and the focusable element is the native `<input>` inside
 * it, which the member hands to the caller's `controlRef`.
 *
 * The value is held as a draft while the caller does not control it, so the
 * clear button knows when there is something to clear.
 */
export default describeMember({
  member: 'Input',
  dir: 'controls',
  recipe: 'controls/input',
  types: {
    InputType: "NonNullable<InputProps['type']>",
  },
  defaults: {
    size: lit('md'),
    clearable: 'false',
    clearLabel: lit('Clear'),
    invalid: 'false',
    disabled: 'false',
    readOnly: 'false',
    type: lit('text'),
    autoFocus: 'false',
    exact: 'false',
  },
  state: { draft: "defaultValue ?? ''" },
  derived: {
    current: 'value ?? draft',
    showClear: "clearable && current !== '' && !disabled && !readOnly",
  },
  controlRefs: { control: 'controlRef' },
  // On mount only, as React's `autoFocus`.
  effects: [{ run: 'autoFocus && control?.focus()' }],
  // The spec's `agent` fence. An agent writes through the field as typing does (`agentFill`),
  // so the input handler runs and `change` is emitted. A read-only field refuses both actions,
  // and a password field refuses `fill`: a person types a password.
  agent: {
    on: 'control',
    state: { value: 'current', disabled: 'disabled', invalid: 'invalid', readonly: 'readOnly' },
    actions: {
      fill: {
        argument: 'text',
        run: `(() => {
          if (type === 'password') throw new Error('A person types a password; an agent does not.')
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
  template: el(
    'div',
    {
      part: 'field',
      class: ['field'],
      attrs: {
        'data-size': 'size',
        'data-disabled': flag('disabled'),
        'data-invalid': flag('invalid'),
        'data-readonly': flag('readOnly'),
        ...identity('Input'),
      },
      // A press on the frame focuses the field, except on parts that are controls themselves.
      on: { mousedown: run('($event.preventDefault(), control?.focus())', `!(${onControl})`) },
    },
    [
      cond('icon !== undefined', [
        el('span', { part: 'leading', class: ['leading'] }, [
          member('Icon', { name: 'icon', size: 'size' }),
        ]),
      ]),
      affix('prefix'),
      el('input', {
        part: 'input',
        ref: 'control',
        class: ['input'],
        attrs: {
          type: 'type',
          value: 'current',
          placeholder: 'placeholder',
          disabled: 'disabled',
          readonly: 'readOnly',
          min: 'min',
          max: 'max',
          step: 'step',
          name: 'name',
          id: 'id',
          autocomplete: 'autoComplete',
          // An exact field's text is typed as it is: nothing corrects, capitalises or checks it.
          autocorrect: when('exact', lit('off')),
          autocapitalize: when('exact', lit('off')),
          spellcheck: when('exact', lit('false')),
          maxlength: 'maxLength',
          'aria-label': 'ariaLabel',
          'aria-labelledby': 'ariaLabelledby',
          'aria-describedby': 'ariaDescribedby',
          'aria-required': 'ariaRequired',
          'aria-invalid': when('invalid', 'true'),
        },
        on: {
          input: run("(draft = control?.value ?? '', emit('change', draft, $event))"),
          blur: emit('blur', { args: ['$event'] }),
          focus: emit('focus', { args: ['$event'] }),
          select: emit('select', { args: ['$event'] }),
          compositionstart: emit('compositionStart', { args: ['$event'] }),
          compositionend: emit('compositionEnd', { args: ['$event'] }),
        },
      }),
      affix('suffix'),
      cond('showClear', [
        el(
          'button',
          {
            part: 'clear',
            class: ['clear'],
            attrs: { type: lit('button'), 'aria-label': 'clearLabel' },
            // Clearing is the change path typing takes: the draft empties and `change` reports ''.
            on: { click: run("(draft = '', emit('change', '', $event), control?.focus())") },
          },
          [member('Icon', { name: lit('clear'), size: 'size' })],
        ),
      ]),
      cond('slots.trailing', [
        el('span', { part: 'trailing', class: ['trailing'] }, [slot('trailing')]),
      ]),
    ],
  ),
  states: [
    {
      name: 'rest md',
      props: { placeholder: 'Search tickets…', 'aria-label': 'Search tickets' },
      expect: { 'data-size': 'md' },
    },
    {
      name: 'sizes side by side',
      many: {
        within: { member: 'Inline', props: { gap: 3 } },
        each: (['sm', 'md', 'lg'] as const).map((size) => ({
          props: { size, placeholder: size, 'aria-label': `Size ${size}` },
        })),
      },
    },
    {
      name: 'size sm',
      props: { size: 'sm', placeholder: 'Search…', 'aria-label': 'Search' },
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'size lg',
      props: { size: 'lg', placeholder: 'Search…', 'aria-label': 'Search' },
      expect: { 'data-size': 'lg' },
    },
    {
      name: 'leading icon',
      props: { icon: 'search', placeholder: 'Search…', 'aria-label': 'Search' },
    },
    { name: 'with value', props: { defaultValue: 'urgent: login loop', 'aria-label': 'Subject' } },
    {
      name: 'exact — a phrase taken as typed, with no correction, capitals or spell check',
      props: { exact: true, defaultValue: 'acme-billing', 'aria-label': 'Project name' },
    },
    {
      name: 'clearable, with value',
      props: { clearable: true, defaultValue: 'urgent: login loop', 'aria-label': 'Subject' },
    },
    {
      name: 'clearable, suppressed — an uneditable value offers no clear',
      props: {
        clearable: true,
        readOnly: true,
        defaultValue: 'urgent: login loop',
        'aria-label': 'Subject',
      },
      expect: { 'data-readonly': '' },
    },
    {
      name: 'clearable, empty — no clear button',
      props: { clearable: true, placeholder: 'Nothing to clear', 'aria-label': 'Subject' },
    },
    {
      name: 'number — min, max and step ride the native contract',
      props: { type: 'number', min: 0, max: 10, step: 2, 'aria-label': 'Retries' },
      expect: { 'data-size': 'md' },
    },
    {
      name: 'affixes — a currency mark and a unit, muted beside the value',
      props: { prefix: '$', suffix: 'USD', defaultValue: '120', 'aria-label': 'Amount' },
    },
    {
      name: 'trailing slot',
      props: { defaultValue: 'relay', 'aria-label': 'Workspace' },
      slots: { trailing: [{ element: 'span', children: ['.example.com'] }] },
    },
    {
      name: 'invalid',
      props: { invalid: true, icon: 'search', defaultValue: '???', 'aria-label': 'Query' },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      props: { disabled: true, defaultValue: 'locked', 'aria-label': 'Locked' },
      expect: { 'data-disabled': '' },
    },
    {
      name: 'readOnly',
      props: { readOnly: true, defaultValue: 'read only', 'aria-label': 'Read only' },
      expect: { 'data-readonly': '' },
    },
  ],
})
