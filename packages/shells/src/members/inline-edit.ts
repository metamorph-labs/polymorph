import { cond, describeMember, el, flag, identity, js, lit, member, run, text } from '../dsl'

const noop = js('() => {}')

const LONG =
  'Acme billing and invoicing for the European and North American subsidiaries, including the reseller programme'

/**
 * InlineEdit (`design/components/inline-edit.md`): a short value shown as
 * text that becomes a field where it stands. It composes Input and three
 * Buttons and owns what an application cannot do with them: focus into the
 * field with its text selected and back to the edit control, Enter and
 * Escape, a save in flight and the error.
 *
 * The open state is mirrored, so an uncontrolled member opens and closes
 * itself. A controlled one is the app's to close after a save, which it holds
 * with `pending` while it waits. Leaving the field neither saves nor cancels.
 *
 * `within` is whether focus was last inside the member. Focus that leaves with
 * a removed element sends no event to another element, so the flag stays set
 * and the edit control takes focus back when the field closes.
 */
export default describeMember({
  member: 'InlineEdit',
  dir: 'controls',
  recipe: 'controls/inline-edit',
  types: {
    InlineEditMessages: '{ edit: (label: string) => string; save: string; cancel: string }',
  },
  defaults: {
    defaultEditing: 'false',
    pending: 'false',
    required: 'false',
    disabled: 'false',
    size: lit('md'),
    valueHidden: 'false',
    messages: "() => ({ edit: (label) => `Edit ${label}`, save: 'Save', cancel: 'Cancel' })",
  },
  state: { mirror: 'defaultEditing', draft: 'value', within: 'false' },
  derived: {
    current: 'editing ?? mirror',
    valueId: '`${uid}-value`',
    errorId: '`${uid}-error`',
    refused: "required && draft.trim() === ''",
    invalid: "current && error !== undefined && error !== ''",
    fieldDescribedBy:
      "[invalid ? errorId : undefined, ariaDescribedby].filter((id) => id !== undefined).join(' ') || undefined",
    editDescribedBy: 'ariaDescribedby === undefined ? valueId : `${valueId} ${ariaDescribedby}`',
    setOpen: "(next: boolean) => { mirror = next; emit('editingChange', next) }",
    open: '() => { draft = value; setOpen(true) }',
    cancel: '() => { if (!pending) setOpen(false) }',
    // A controlled field is the app's to close, once its save has succeeded.
    commit:
      "() => { if (pending || refused) return; if (draft === value) { setOpen(false); return } emit('commit', draft); if (editing === undefined) setOpen(false) }",
    // Enter on a Button presses it. Enter that ends an IME composition is the composition's.
    onKey:
      "(event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); cancel(); return } if (event.key === 'Enter' && event.target instanceof HTMLInputElement && !event.isComposing) { event.preventDefault(); commit() } }",
    leave:
      '(event: FocusEvent) => { const next = event.relatedTarget; if (next instanceof Node && !(root?.contains(next) ?? false)) within = false }',
    // An agent's save: the text goes into the open field and is saved by the rules a person's
    // save keeps. It refuses what a person cannot do: a save from the closed form, a blank
    // required text, and a save while a save is in flight.
    saveText: `(text: string) => {
      if (!current) throw new Error('The field is closed: edit opens it.')
      if (pending) throw new Error('A save is in flight.')
      if (required && text.trim() === '') throw new Error('The field is required.')
      draft = text
      if (text === value) { setOpen(false); return }
      emit('commit', text)
      if (editing === undefined) setOpen(false)
    }`,
  },
  // The spec's `agent` fence. One value is one member: this one registers and withholds the
  // Input and the Buttons it draws. Its element is the control a person reaches, the edit
  // control or the open field.
  agent: {
    on: 'root',
    element: "root?.querySelector('input') ?? root?.querySelector('button')",
    state: {
      value: 'value',
      editing: 'current',
      pending: 'pending',
      error: "invalid ? (error ?? '') : ''",
      disabled: 'disabled',
    },
    actions: {
      edit: '(() => { if (!current) open() })()',
      save: { argument: 'text', run: 'saveText(value)' },
      cancel: `(() => {
        if (pending) throw new Error('A save is in flight.')
        if (current) setOpen(false)
      })()`,
    },
    withholds: 'root',
  },
  effects: [
    // Never on mount: a member that mounts open takes no focus. Each opening starts from the
    // value, with all of it selected; a closing returns focus to the edit control when focus
    // was in the member.
    {
      watch: 'current',
      mount: false,
      run: "current ? ((draft = value), afterRender(() => { const input = root?.querySelector('input'); input?.focus(); input?.select() })) : within && afterRender(() => root?.querySelector('button')?.focus())",
    },
    // A save that ends with the field still open has failed, so focus goes to the field, where
    // the reader corrects the text beside the error.
    {
      watch: 'pending',
      mount: false,
      run: "!pending && current && within && root?.querySelector('input')?.focus()",
    },
  ],
  template: el(
    'div',
    {
      part: 'root',
      ref: 'root',
      class: ['root'],
      attrs: {
        'data-size': 'size',
        'data-disabled': flag('disabled'),
        'data-editing': flag('current'),
        ...identity('InlineEdit'),
      },
      on: { focusin: run('within = true'), focusout: run('leave($event)') },
    },
    [
      cond(
        'current',
        [
          el(
            'div',
            {
              part: 'panel',
              class: ['panel'],
              attrs: { 'data-inline-edit-part': lit('panel') },
              on: { keydown: run('onKey($event)') },
            },
            [
              el('div', { part: 'row', class: ['row'] }, [
                el('div', { part: 'field', class: ['field'] }, [
                  member(
                    'Input',
                    {
                      size: 'size',
                      value: 'draft',
                      placeholder: 'placeholder',
                      maxLength: 'maxLength',
                      readOnly: 'pending',
                      disabled: 'disabled',
                      invalid: 'invalid',
                      'aria-label': 'ariaLabelledby === undefined ? label : undefined',
                      'aria-labelledby': 'ariaLabelledby',
                      'aria-describedby': 'fieldDescribedBy',
                      'aria-required': 'required ? true : undefined',
                    },
                    { on: { change: run('draft = $event') } },
                  ),
                ]),
                member(
                  'Button',
                  {
                    variant: lit('soft'),
                    tone: lit('accent'),
                    size: 'size',
                    iconOnly: 'true',
                    icon: lit('confirm'),
                    label: 'messages.save',
                    loading: 'pending',
                    disabled: 'disabled || refused',
                  },
                  { on: { click: run('commit()') } },
                ),
                member(
                  'Button',
                  {
                    variant: lit('ghost'),
                    tone: lit('neutral'),
                    size: 'size',
                    iconOnly: 'true',
                    icon: lit('close'),
                    label: 'messages.cancel',
                    disabled: 'disabled || pending',
                  },
                  { on: { click: run('cancel()') } },
                ),
              ]),
              // Rendered empty with the row, so a message that arrives after a failed save is
              // announced: focus stays in the field, where its description is not read again.
              el('div', { part: 'status', attrs: { 'aria-live': lit('polite') } }, [
                cond('invalid', [
                  el('p', { part: 'error', class: ['error'], attrs: { id: 'errorId' } }, [
                    el('span', { part: 'glyph', class: ['glyph'] }, [
                      member('Icon', { name: lit('error'), size: lit('sm') }),
                    ]),
                    text('error'),
                  ]),
                ]),
              ]),
            ],
          ),
        ],
        [
          el(
            'span',
            {
              part: 'value',
              class: ['value'],
              // Hidden, it draws nothing and is not read where it stands, and it still describes
              // the edit control, because a description reads a hidden element it names.
              attrs: {
                id: 'valueId',
                hidden: 'valueHidden',
                'data-placeholder': flag("value === ''"),
              },
            },
            [text("(value === '' ? placeholder : value) ?? ''")],
          ),
          member(
            'Button',
            {
              variant: lit('ghost'),
              tone: lit('neutral'),
              size: 'size',
              iconOnly: 'true',
              icon: lit('edit'),
              label: 'messages.edit(label)',
              disabled: 'disabled',
              'aria-describedby': 'editDescribedBy',
            },
            { on: { click: run('open()') } },
          ),
        ],
      ),
    ],
  ),
  states: [
    {
      name: 'rest — the value as text, with its edit control beside it',
      props: { label: 'Project name', value: 'Acme billing', onCommit: noop },
      expect: { 'data-size': 'md' },
    },
    {
      name: 'empty — the placeholder, muted, in place of the value',
      props: { label: 'Device name', value: '', placeholder: 'Unnamed device', onCommit: noop },
    },
    {
      name: 'editing — the field holds the value, with save and cancel beside it',
      props: { label: 'Project name', value: 'Acme billing', defaultEditing: true, onCommit: noop },
      expect: { 'data-editing': '' },
    },
    {
      name: 'pending — a save in flight: the field is read-only and save is busy',
      props: {
        label: 'Workspace name',
        value: 'Acme',
        defaultEditing: true,
        pending: true,
        onCommit: noop,
      },
      expect: { 'data-editing': '' },
    },
    {
      name: 'failed — the error the app passes, under the field and tied to it',
      props: {
        label: 'Project name',
        value: 'Acme billing',
        defaultEditing: true,
        error: 'A project named Acme billing already exists.',
        onCommit: noop,
      },
      expect: { 'data-editing': '' },
    },
    {
      name: 'required, blank — save stays disabled until there is text',
      props: {
        label: 'Team name',
        value: '',
        placeholder: 'Team name',
        required: true,
        defaultEditing: true,
        onCommit: noop,
      },
      expect: { 'data-editing': '' },
    },
    {
      name: 'disabled — the value stays, its edit control does not',
      props: { label: 'Project name', value: 'Acme billing', disabled: true, onCommit: noop },
      expect: { 'data-disabled': '' },
    },
    {
      name: 'size sm',
      props: { label: 'Project name', value: 'Acme billing', size: 'sm', onCommit: noop },
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'size lg',
      props: { label: 'Project name', value: 'Acme billing', size: 'lg', onCommit: noop },
      expect: { 'data-size': 'lg' },
    },
    {
      name: 'long value — it wraps, and its field fills the width it is given',
      many: {
        within: { member: 'Stack', props: { gap: 3 } },
        each: [
          { props: { label: 'Project name', value: LONG, onCommit: noop } },
          { props: { label: 'Project name', value: LONG, defaultEditing: true, onCommit: noop } },
        ],
      },
    },
  ],
})
