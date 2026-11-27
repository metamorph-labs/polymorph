import {
  cond,
  describeMember,
  each,
  el,
  emit,
  flag,
  identity,
  lit,
  member,
  run,
  text,
  when,
} from '../dsl'

const INVITES = ['ada@relay.dev', 'grace@relay.dev', 'alan@relay.dev']

const LABELS = [
  'needs-triage',
  'customer-reported',
  'billing',
  'regression',
  'blocked-on-vendor',
  'good-first-issue',
  'awaiting-response',
  'security-review',
]

/**
 * TagInput (`design/components/tag-input.md`): free-text entry of several
 * values, shown as chips. No machine draws it, because it has no substrate in
 * React either: it is an Input-styled container holding a list of chips and one
 * real `<input>`, and the member is mostly its commit rules (what counts as a
 * tag, what a duplicate does, what Backspace removes).
 *
 * The chips are a list presence: a removed chip stays at its place, marked
 * `data-removing`, while its part plays `taginput.chip`'s exit, and leaves the
 * list when the part says its exit is over. A chip is a part of its own because
 * the motion engine plays one exit per element. A chip added after the member
 * mounts plays the binding's enter, and the chips beside a gap slide into it
 * with `taginput.reflow`. Focus never follows a removed
 * chip to the body: it moves to the remove button of the chip that takes its
 * place, read from the list before the removal renders, or back to the field.
 *
 * The handlers live in script, where the input's own type is known. Their local
 * names are none of the member's own, because a block body's declarations are
 * not scope the renderer knows.
 */
export default describeMember({
  member: 'TagInput',
  dir: 'controls',
  recipe: 'controls/tag-input',
  types: {
    // A function, not two words, because the plural and the order of the words are the catalog's.
    TagInputCountLabel: '(tags: { count: number; max?: number; atMax: boolean }) => string',
  },
  defaults: {
    // Trim, and refuse the empty string.
    validate: "(raw: string) => (raw.trim() === '' ? null : raw.trim())",
    size: lit('md'),
    disabled: 'false',
    invalid: 'false',
    removeLabel: '(tag: string) => `Remove ${tag}`',
    countLabel:
      '({ count, max, atMax }: Parameters<TagInputCountLabel>[0]) => (atMax ? `Maximum of ${max} added` : `${count} added`)',
  },
  statics: { controlKind: lit('field') },
  state: {
    uncontrolled: 'defaultValue ?? []',
    draft: "''",
    // The chip a duplicate entry matched, and whether the last entry was refused: the two flashes.
    flashing: 'null as string | null',
    refused: 'false',
    announcement: "''",
    // Whether the member has mounted: only a chip that joins after it plays its enter.
    settled: 'false',
  },
  derived: {
    values: 'value ?? uncontrolled',
    atMax: 'max !== undefined && values.length >= max',
    countId: '`${id ?? uid}-count`',
    commit: "(next: string[]) => { uncontrolled = next; emit('change', next) }",
    // Adds what it can, and flags refused entries and duplicates. A duplicate is never
    // added: the existing chip flashes instead.
    add: `(raws: string[]) => {
      const next = [...values]
      let refusal = false
      let duplicate: string | null = null
      for (const raw of raws) {
        if (max !== undefined && next.length >= max) break
        const tag = validate(raw)
        if (tag === null) { refusal = true; continue }
        if (next.includes(tag)) { duplicate = tag; continue }
        next.push(tag)
      }
      refused = refusal
      flashing = duplicate
      if (next.length !== values.length) commit(next)
    }`,
    // A chip's remove button by its place among the chips that are not leaving, which is
    // its place in `values` as the list last rendered it.
    removeButton:
      "(at: number) => chipList?.querySelectorAll<HTMLElement>(':scope > li:not([data-removing]) button')[at] ?? null",
    // Focus moves to the chip that takes the removed one's place, or back to the field,
    // never to the body. The target is read before the removal renders.
    remove: `(tag: string) => {
      const before = values
      const at = before.indexOf(tag)
      const target = at === -1 || at + 1 >= before.length ? null : removeButton(at + 1)
      commit(before.filter((other) => other !== tag))
      announcement = \`\${tag} removed, \${before.length - 1} remain\`
      if (target) target.focus()
      else field?.focus()
    }`,
    receive: '(event: Event) => { draft = (event.target as HTMLInputElement).value }',
    // Uncommitted text Escape clears: while there is some, Escape is the field's and a Dialog
    // around it stays open (`holdFieldEscape`).
    clearable: "draft !== ''",
    // Every key an input method is handling is its own (`composingKey`). Enter and comma
    // commit; Escape clears uncommitted text only, so inside a Dialog it closes the Dialog
    // once there is no text left; Backspace in an empty field removes the last chip; the key
    // toward the line's start (← left to right, → right to left, read on the member as Tree
    // reads it) at the start of the field moves into the chips.
    fieldKeyDown: `(event: KeyboardEvent) => {
      if (composingKey(event)) return
      if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault()
        add([draft])
        draft = ''
        return
      }
      if (event.key === 'Escape' && draft !== '') {
        event.preventDefault()
        draft = ''
        return
      }
      if (event.key === 'Backspace' && draft === '') {
        const last = values[values.length - 1]
        if (last !== undefined) remove(last)
        return
      }
      // The direction is a computed style, read only for an arrow.
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const input = event.target as HTMLInputElement
      if (event.key === lineStartKey(chipList ?? input) && input.selectionStart === 0) {
        removeButton(values.length - 1)?.focus()
      }
    }`,
    // Chip navigation: the key toward the line's start moves to the previous chip and the other
    // to the next, past the last one back to the field; Backspace or Delete removes the chip.
    chipKeyDown: `(event: KeyboardEvent, tag: string) => {
      const at = values.indexOf(tag)
      if (at === -1) return
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        remove(tag)
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const step = event.key === lineStartKey(chipList ?? (event.target as Element)) ? -1 : 1
        if (at + step === values.length) field?.focus()
        else if (at + step >= 0) removeButton(at + step)?.focus()
      }
    }`,
    // Only a list is intercepted. One pasted value goes into the field, where it can be
    // edited before it commits.
    receivePaste: `(event: ClipboardEvent) => {
      const pasted = event.clipboardData?.getData('text') ?? ''
      if (!/[\\n,]+/.test(pasted)) return
      event.preventDefault()
      add(pasted.split(/[\\n,]+/))
      draft = ''
    }`,
    // A press on the container focuses the field, except on parts that are controls themselves.
    pressContainer: `(event: MouseEvent) => {
      if ((event.target as HTMLElement).closest('button, input')) return
      event.preventDefault()
      field?.focus()
    }`,
    // Focus leaving the whole field is a blur; moving between its chips and its field is not.
    leave: `(event: FocusEvent) => {
      if ((event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) return
      emit('blur', event)
    }`,
  },
  // The spec's `agent` fence. An agent commits one tag as Enter does, through `add`, and
  // refuses what Enter would not add: a refused or duplicate tag, a field at the maximum, and
  // text a person's comma or line break would split. `clear` removes every chip at once.
  agent: {
    on: 'field',
    state: { value: 'values', disabled: 'disabled', invalid: 'invalid' },
    actions: {
      add: {
        argument: 'text',
        run: `(() => {
          if (/[\\n,]/.test(value)) {
            throw new Error('A tag holds no comma or line break: add each tag on its own.')
          }
          if (atMax) throw new Error(\`The field holds its maximum of \${max} tags.\`)
          const tag = validate(value)
          if (tag === null) throw new Error(\`The field refuses "\${value}" as a tag.\`)
          if (values.includes(tag)) throw new Error(\`The field already holds "\${tag}".\`)
          add([value])
        })()`,
      },
      clear: '(() => { if (values.length > 0) commit([]) })()',
    },
  },
  listPresence: { chips: { of: 'values', key: '(tag: string) => tag' } },
  effects: [
    { run: 'settled = true' },
    {
      watch: 'clearable',
      run: 'clearable && field ? holdFieldEscape(field) : () => {}',
      release: 'ran()',
    },
  ],
  template: el(
    'div',
    {
      part: 'container',
      class: ['container'],
      attrs: {
        'data-size': 'size',
        'data-state': when('atMax', lit('at-max')),
        'data-disabled': flag('disabled'),
        'data-invalid': flag('invalid'),
        // The refusal flash: the danger border without `data-invalid`, which is the
        // field's steady state.
        'data-refused': flag('refused'),
        ...identity('TagInput'),
      },
      on: {
        mousedown: run('pressContainer($event)'),
        focusout: run('leave($event)'),
        // Both flashes end here: `animationend` bubbles from a chip's duplicate flash and
        // from the container's own refusal flash. The motion engine's animations fire none.
        animationend: run('((refused = false), (flashing = null))'),
      },
    },
    [
      el('ul', { part: 'chips', class: ['chips'], ref: 'chipList' }, [
        each('chips', 'chip', 'chip.key', [
          member(
            'TagInputChip',
            {
              tag: 'chip.item',
              open: 'chip.open',
              appear: 'settled',
              flash: 'flashing === chip.item',
              disabled: 'disabled',
              removeLabel: 'removeLabel(chip.item)',
            },
            {
              on: {
                remove: run('remove(chip.item)'),
                keyDown: run('chipKeyDown($event, chip.item)'),
                done: run('chip.done()'),
              },
            },
          ),
        ]),
      ]),
      // Always mounted, and read-only at the maximum rather than removed or disabled: it
      // is the field FormField's label points at, with the description, the required
      // flag and the invalid state. A half-typed tag is not a value, so a blur commits
      // nothing.
      el('input', {
        part: 'field',
        ref: 'field',
        class: ['input'],
        attrs: {
          type: lit('text'),
          value: 'draft',
          placeholder: 'values.length === 0 ? placeholder : undefined',
          readonly: 'atMax',
          disabled: 'disabled',
          id: 'id',
          'aria-label': 'ariaLabel',
          'aria-labelledby': 'ariaLabelledby',
          // The count is added to the field's description rather than replacing it.
          'aria-describedby': "[ariaDescribedby, countId].filter(Boolean).join(' ')",
          'aria-required': 'ariaRequired',
          'aria-invalid': when('invalid', 'true'),
        },
        on: {
          input: run('receive($event)'),
          keydown: run('fieldKeyDown($event)'),
          paste: run('receivePaste($event)'),
        },
      }),
      // The count, and at the maximum the reason, in the host's words from `countLabel`: one
      // element, so the field's associations never change while a reader is in it.
      el('span', { part: 'count', class: ['reader'], attrs: { id: 'countId' } }, [
        text('countLabel({ count: values.length, max, atMax })'),
      ]),
      // A removal is announced, because the chip and the focus on it are gone.
      el('span', { part: 'announcer', class: ['reader'], attrs: { 'aria-live': lit('polite') } }, [
        text('announcement'),
      ]),
      // Disabled with the member, because a disabled field posts nothing.
      cond('name !== undefined', [
        el('input', {
          attrs: {
            type: lit('hidden'),
            name: 'name',
            value: "values.join(',')",
            disabled: 'disabled',
          },
        }),
      ]),
    ],
  ),
  parts: [
    {
      name: 'Chip',
      public: false,
      purpose: 'one value, with its remove button, playing its exit when it is removed',
      props: {
        tag: { type: 'string' },
        open: {
          type: 'boolean',
          doc: 'False once the value is removed, while the chip plays its exit.',
        },
        appear: {
          type: 'boolean',
          doc: 'The chip joined after the list’s first render, so it plays its enter.',
        },
        flash: { type: 'boolean', doc: 'A duplicate entry matched this chip.' },
        disabled: { type: 'boolean' },
        removeLabel: { type: 'string', doc: 'The remove button’s accessible name.' },
        onRemove: { type: '() => void', optional: true },
        onKeyDown: { type: '(event: KeyboardEvent) => void', optional: true },
        onDone: {
          type: '() => void',
          optional: true,
          doc: 'The exit has played, and the member can drop the chip.',
        },
      },
      // A chip that joins after the list's first render plays its enter, and every chip
      // slides into a gap a removed one leaves, as React's chips do.
      presence: {
        present: {
          open: 'open',
          ref: 'chip',
          binding: 'taginput.chip',
          appear: 'appear',
          reflow: 'taginput.reflow',
        },
      },
      effects: [{ watch: 'present', mount: false, run: "present || emit('done')" }],
      template: el(
        'li',
        {
          part: 'chip',
          class: ['chip'],
          ref: 'chip',
          attrs: { 'data-removing': flag('!open'), 'data-flash': flag('flash') },
        },
        [
          el('span', { part: 'label', class: ['label'] }, [text('tag')]),
          // The removes go with the affordance: a disabled field offers none.
          cond('!disabled', [
            el(
              'button',
              {
                part: 'remove',
                class: ['remove'],
                attrs: { type: lit('button'), 'aria-label': 'removeLabel' },
                on: {
                  click: emit('remove'),
                  keydown: emit('keyDown', { args: ['$event'] }),
                },
              },
              [member('Icon', { name: lit('close'), size: lit('sm') })],
            ),
          ]),
        ],
      ),
    },
  ],
  states: [
    {
      name: 'empty',
      props: { placeholder: 'Add people…', 'aria-label': 'Invite' },
      expect: { 'data-size': 'md', 'data-state': null },
    },
    { name: 'with chips', props: { defaultValue: INVITES, 'aria-label': 'Invite' } },
    {
      name: 'wrapped — the one Input that grows',
      props: { defaultValue: LABELS, 'aria-label': 'Labels' },
    },
    {
      name: 'at max',
      props: { defaultValue: INVITES, max: 3, 'aria-label': 'Invite' },
      expect: { 'data-state': 'at-max' },
    },
    {
      name: 'sizes',
      many: {
        within: { member: 'Stack', props: { gap: 3 } },
        each: (['sm', 'md', 'lg'] as const).map((size) => ({
          props: { size, defaultValue: INVITES.slice(0, 2), 'aria-label': `Invite ${size}` },
        })),
      },
    },
    {
      name: 'size sm',
      props: { size: 'sm', defaultValue: INVITES.slice(0, 2), 'aria-label': 'Invite' },
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'size lg',
      props: { size: 'lg', defaultValue: INVITES.slice(0, 2), 'aria-label': 'Invite' },
      expect: { 'data-size': 'lg' },
    },
    {
      name: 'invalid',
      props: { invalid: true, defaultValue: INVITES, 'aria-label': 'Invite' },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled — the removes go with the affordance',
      props: { disabled: true, defaultValue: INVITES, 'aria-label': 'Invite' },
      expect: { 'data-disabled': '' },
    },
  ],
})
