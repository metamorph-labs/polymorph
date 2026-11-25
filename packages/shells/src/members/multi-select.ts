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
  portal,
  run,
  text,
  when,
  type Node,
} from '../dsl'

const ASSIGNEES = [
  { value: 'ada', label: 'Ada Lovelace', description: 'Support · London' },
  { value: 'grace', label: 'Grace Hopper', description: 'Support · New York' },
  { value: 'alan', label: 'Alan Turing', description: 'Escalations · Manchester' },
  { value: 'annie', label: 'Annie Easley', description: 'Billing · Cleveland' },
  { value: 'edsger', label: 'Edsger Dijkstra', description: 'On leave', disabled: true },
  { value: 'katherine', label: 'Katherine Johnson', description: 'Escalations · Hampton' },
]

const WATCHERS = [
  'needs-triage',
  'customer-reported',
  'billing',
  'regression',
  'blocked-on-vendor',
  'good-first-issue',
  'awaiting-response',
  'security-review',
].map((label) => ({ value: label, label }))

const FIRST_THREE = ['ada', 'grace', 'alan']

/** `open` or `closed`, for the sheet's scrim and panel, whose recipe keys pointer events on it. */
const SHEET_STATE = "api.open ? 'open' : 'closed'"

/** An option's own ids, from its place in the list, which the option's label and description take. */
const optionId = '`${uid}-opt-${at}`'

/**
 * The popup's content, the same in the anchored panel and in the sheet: the
 * listbox, three skeleton rows below it while loading, and one empty row when
 * nothing matches. The listbox is the machine's content; a press on the other
 * rows of the panel is kept inside by `onInteractOutside`.
 */
const popup = (): Node[] => [
  el(
    'ul',
    {
      part: 'list',
      class: ['listbox'],
      spread: ['api.getContentProps()'],
      attrs: {
        // Present through the panel's exit, which `hidden` would cut short.
        hidden: 'undefined',
        'aria-label': 'ariaLabelledby === undefined ? ariaLabel : undefined',
        'aria-labelledby': 'ariaLabelledby',
      },
      // The scroll trigger for paging: the end is reached within 32px of the bottom, about one
      // option row, which allows for a wheel's last notch.
      on: {
        scroll: run(
          '(list?.scrollHeight ?? 0) - (list?.scrollTop ?? 0) - (list?.clientHeight ?? 0) <= 32 && requestMore()',
        ),
      },
      ref: 'list',
    },
    [
      each(
        'rows',
        'row',
        'row.value',
        [
          el(
            'li',
            {
              part: 'option',
              class: ['option'],
              spread: ['api.getItemProps({ item: row })'],
              attrs: {
                // A selectable option says whether it is chosen either way, as React Aria's does.
                'aria-selected': "values.includes(row.value) ? 'true' : 'false'",
                // Named by its label alone; the description describes it.
                'aria-labelledby': `${optionId} + '-label'`,
                'aria-describedby': when(
                  'row.description !== undefined',
                  `${optionId} + '-description'`,
                ),
                'data-mint': flag('row.value === mint'),
              },
            },
            [
              // Reserved whether or not the row is chosen (Select's law). The mint row's `add`
              // glyph is an offer, never the check's chosen colour.
              el('span', { class: ['check'] }, [
                cond(
                  'row.value === mint',
                  [member('Icon', { name: lit('add'), size: lit('sm') })],
                  'values.includes(row.value)',
                  [member('Icon', { name: lit('confirm'), size: lit('sm') })],
                ),
              ]),
              el('span', { class: ['text'] }, [
                el('span', { class: ['optionLabel'], attrs: { id: `${optionId} + '-label'` } }, [
                  text('row.label'),
                ]),
                cond('row.description !== undefined', [
                  el(
                    'span',
                    { class: ['description'], attrs: { id: `${optionId} + '-description'` } },
                    [text('row.description')],
                  ),
                ]),
              ]),
            ],
          ),
        ],
        'at',
      ),
    ],
  ),
  cond('loading', [
    el('div', { class: ['rows'], attrs: { 'aria-hidden': lit('true') } }, [
      each('[0, 1, 2]', 'row', 'row', [
        el('div', { class: ['row'] }, [member('Skeleton', { textStep: lit('sm') })]),
      ]),
    ]),
  ]),
  // Heard once, through the field's status region, so the visible row is hidden from it.
  cond('showEmpty', [
    el('div', { class: ['empty'], attrs: { 'aria-hidden': lit('true') } }, [text('emptyMessage')]),
  ]),
]

/**
 * MultiSelect (`design/components/multi-select.md`): several values picked
 * from a filtered closed list, shown as chips. Zag's combobox machine, in its
 * multiple mode, owns the open state, the highlighted option,
 * `aria-activedescendant`, the panel's position and its dismissal; DOM focus
 * never leaves the input.
 *
 * The member owns the rest, as React's does over its collection hooks. The
 * value is the member's and always in options order, so the machine's is
 * controlled by it and a toggle is reordered before it is reported. The text
 * is the member's too: it filters by the locale's collation at base
 * sensitivity, as React Aria's `useFilter` does, and typing opens the list.
 * The input's keys are the member's, because they follow React's model:
 * arrows walk the enabled rows without wrapping and open the list at its first
 * or last row, Enter toggles the highlighted row and keeps the list open, a
 * commit against a hidden mint row is refused with a flash and a sentence,
 * Backspace in an empty field removes the last chip, and the key toward the
 * line's start (← left to right, → right to left) at the field's start moves
 * into the chips. Escape's first press is the machine's, which closes; the
 * second clears the text, inside a Dialog too; and no key an input method is
 * handling is the member's.
 *
 * The chips are TagInput's: a list presence whose removed chip plays
 * `taginput.chip`'s exit in its own part, with focus moved to the chip that
 * takes its place or back to the field; a chip chosen after the member mounts
 * plays the enter, and the chips beside a gap slide into it. Focus moving among the chips, the
 * field and the panel stays inside one control, so it neither closes the list
 * nor blurs the member.
 *
 * Under `presentation: 'auto'`, below the sheet presentation's threshold
 * (`phone`), the popup is drawn in the bottom sheet, as Combobox's is.
 *
 * While the list is open the machine keeps an assertive live region of its
 * own, in which it speaks the highlighted option on Apple platforms only,
 * where VoiceOver does not follow `aria-activedescendant`. React Aria's
 * combobox does the same for React's Combobox; React's MultiSelect, built on
 * the listbox hooks alone, has no such announcer. The machine has no option
 * that drops it, so the member keeps it.
 *
 * The handlers live in script. Their local names are none of the member's
 * own, because a block body's declarations are not scope the renderer knows.
 */
export default describeMember({
  member: 'MultiSelect',
  dir: 'controls',
  recipe: 'controls/multi-select',
  recipes: { sheet: 'overlays/sheet' },
  types: {
    MultiSelectOption: '{ value: string; label: string; description?: string; disabled?: boolean }',
    MultiSelectMessages:
      '{ add?: (text: string) => string; added?: (value: string, count: number) => string; removed?: (label: string, count: number) => string; refused?: (text: string) => string; alreadySelected?: (value: string) => string; selected?: (count: number, max: number | undefined) => string; showOptions?: string; remove?: (label: string) => string; loadingOptions?: string; options?: (count: number) => string }',
  },
  defaults: {
    allowCustom: 'false',
    filter: 'true',
    loading: 'false',
    emptyMessage: lit('No results'),
    size: lit('md'),
    disabled: 'false',
    invalid: 'false',
    presentation: lit('auto'),
  },
  media: { phone: 'phone' },
  state: {
    uncontrolled: 'defaultValue ?? []',
    uncontrolledText: "defaultInputValue ?? ''",
    // The refusal flash, cleared by its own `animationend`.
    refused: 'false',
    announcement: "''",
    // Paging fires once per `options` length, and again only after the app appends.
    loadMoreAt: '-1',
    // Whether the member has mounted: only a chip that joins after it plays its enter.
    settled: 'false',
  },
  derived: {
    values: 'value ?? uncontrolled',
    text: 'inputValue ?? uncontrolledText',
    sheeting: "presentation === 'auto' && phone",
    say: '{ add: (text: string) => `Add "${text}"`, added: (value: string, count: number) => `${value} added, ${count} selected`, removed: (label: string, count: number) => `${label} removed, ${count} selected`, refused: (text: string) => `Cannot add "${text}"`, alreadySelected: (value: string) => `"${value}" is already selected`, selected: (count: number, max: number | undefined) => (max !== undefined && count >= max ? `Maximum of ${max} selected` : `${count} selected`), showOptions: \'Show options\', remove: (label: string) => `Remove ${label}`, loadingOptions: \'Loading options…\', options: (count: number) => `${count} options`, ...messages }',
    atMax: 'max !== undefined && values.length >= max',
    countId: '`${uid}-count`',
    labels: 'new Map(options.map((option) => [option.value, option.label] as const))',
    labelOf: '(entry: string) => labels.get(entry) ?? entry',
    // Options order, then any chosen value the current options do not carry (a narrowed
    // async list, a minted value), labelled by itself.
    ordered:
      '(chosen: ReadonlySet<string>) => [...options.filter((option) => chosen.has(option.value)).map((option) => option.value), ...[...chosen].filter((entry) => !options.some((option) => option.value === entry))]',
    orderedValues: 'ordered(new Set(values))',
    collator: "new Intl.Collator(undefined, { usage: 'search', sensitivity: 'base' })",
    contains: `(haystack: string, needle: string) => {
      const hay = haystack.normalize('NFC')
      const pin = needle.normalize('NFC')
      for (let from = 0; from + pin.length <= hay.length; from += 1) {
        if (collator.compare(hay.slice(from, from + pin.length), pin) === 0) return true
      }
      return pin === ''
    }`,
    sameText:
      "(a: string, b: string) => collator.compare(a.normalize('NFC'), b.normalize('NFC')) === 0",
    // `false` means the app has filtered, so its list is shown as it is.
    shown:
      "filter && text !== '' ? options.filter((option) => contains(option.label, text)) : options",
    // The custom value `allowCustom` may add for this text: none when the text is empty or
    // refused, names an option by value or label, is already chosen, or the field is full.
    normalized:
      "allowCustom && !atMax ? (validate ?? ((raw: string) => (raw.trim() === '' ? null : raw.trim())))(text) : null",
    mint: `(() => {
      const candidate = normalized
      if (candidate === null || values.includes(candidate)) return null
      return options.some((option) => option.value === candidate || sameText(option.label, candidate)) ? null : candidate
    })()`,
    // The list's rows: the filtered options, and the mint row last, which no filter removes.
    rows: '(mint === null ? shown : [...shown, { value: mint, label: say.add(mint) }]) as MultiSelectOption[]',
    // At the maximum an unchosen option is disabled; a chosen one stays, because unchoosing
    // is how a full field makes room.
    isOff:
      '(row: MultiSelectOption) => row.disabled === true || (atMax && !values.includes(row.value))',
    navigable: 'rows.filter((row) => !isOff(row)).map((row) => row.value)',
    // The mint row is an offer, not a page's end, so reaching it requests nothing.
    lastReal: 'navigable.filter((key) => key !== mint).at(-1)',
    commit: "(next: string[]) => { uncontrolled = next; emit('change', next) }",
    commitText: "(next: string) => { uncontrolledText = next; emit('inputChange', next) }",
    // A toggle in the list, reported in options order. Adding the mint clears the text and
    // is announced as a removal is.
    pick: `(chosen: string[]) => {
      const before = values
      const minted = mint
      const next = ordered(new Set(chosen))
      const dropped = before.filter((entry) => !next.includes(entry))
      commit(next)
      if (minted !== null && next.includes(minted) && !before.includes(minted)) {
        commitText('')
        announcement = say.added(minted, next.length)
        return
      }
      if (dropped.length > 0 && next.length < before.length) {
        announcement = say.removed(labelOf(dropped[0] ?? ''), next.length)
      }
    }`,
    requestMore:
      "() => !loading && loadMoreAt !== options.length && ((loadMoreAt = options.length), emit('loadMore'), true)",
    status:
      "!api.open ? '' : loading ? say.loadingOptions : rows.length === 0 ? emptyMessage : say.options(rows.length)",
    showEmpty: 'api.open && !loading && rows.length === 0',
    // The highlight on the first enabled row, as the list opens and whenever the text changes.
    aimFirst:
      '() => (navigable[0] === undefined ? api.clearHighlightValue() : api.setHighlightValue(navigable[0]))',
    removeButton:
      "(at: number) => chipList?.querySelectorAll<HTMLElement>(':scope > li:not([data-removing]) button')[at] ?? null",
    // Focus moves to the chip that takes the removed one's place, or back to the field,
    // never to the body. The target is read before the removal renders.
    remove: `(entry: string) => {
      const before = orderedValues
      const at = before.indexOf(entry)
      const target = at === -1 || at + 1 >= before.length ? null : removeButton(at + 1)
      const next = before.filter((held) => held !== entry)
      commit(next)
      announcement = say.removed(labelOf(entry), next.length)
      if (target) target.focus()
      else api.focus()
    }`,
    // Typing opens the list. A controlled text shows the app's value until the app changes
    // it, as a controlled input does: the field is put back once the app's update has rendered,
    // which each foundation's `afterRender` waits for. Text the app takes keeps the caret where
    // the reader typed: the machine moves it to the end in a microtask after it writes the
    // field, unless typing was the last thing it heard, and the highlight that follows a change
    // of text is, so the caret goes back after that microtask, while the field still holds
    // what was typed and has focus.
    typed: `(event: Event) => {
      const input = event.target as HTMLInputElement
      const typedText = input.value
      const start = input.selectionStart
      const end = input.selectionEnd
      commitText(typedText)
      if (!api.open) api.setOpen(true)
      afterRender(() => {
        if (input.value !== text) {
          input.value = text
          return
        }
        queueMicrotask(() => {
          if (start === null || end === null || input.value !== typedText) return
          if (input.ownerDocument.activeElement === input) input.setSelectionRange(start, end)
        })
      })
    }`,
    // With the list closed, Escape clears the filter text, and that Escape is the field's: a
    // Dialog around the field stays open (`holdFieldEscape`). With the list open, the list's
    // layer takes the first Escape; with no text left, Escape is the Dialog's again.
    clearable: "!api.open && text !== ''",
    // Every key an input method is handling is its own (`composingKey`): the Enter that
    // confirms a candidate toggles no row, and Escape abandons the composition, not the text.
    fieldKeyDown: `(event: KeyboardEvent) => {
      if (composingKey(event)) return
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const down = event.key === 'ArrowDown'
        const from = api.open && api.highlightedValue !== null ? navigable.indexOf(api.highlightedValue) : -1
        const target = from === -1 ? (down ? navigable[0] : navigable[navigable.length - 1]) : navigable[from + (down ? 1 : -1)]
        if (!api.open) api.setOpen(true)
        if (target !== undefined) api.setHighlightValue(target)
        return
      }
      if (event.key === 'Enter') {
        if (!api.open) return
        event.preventDefault()
        const highlighted = api.highlightedValue
        if (highlighted !== null) {
          if (navigable.includes(highlighted)) api.selectValue(highlighted)
          return
        }
        if (allowCustom && text.trim() !== '') {
          refused = true
          announcement = normalized !== null && values.includes(normalized) ? say.alreadySelected(normalized) : say.refused(text.trim())
        }
        return
      }
      if (event.key === 'Escape') {
        if (api.open) {
          event.preventDefault()
          api.setOpen(false)
          return
        }
        if (text !== '') {
          event.preventDefault()
          commitText('')
        }
        return
      }
      if (event.key === 'Backspace' && text === '') {
        const last = orderedValues[orderedValues.length - 1]
        if (last !== undefined) remove(last)
        return
      }
      // The key toward the line's start moves into the chips, as in TagInput. The direction is
      // the field's: the machine writes the document's on the input. It is a computed style, read
      // only for an arrow.
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const input = event.target as HTMLInputElement
      if (event.key === lineStartKey(frame ?? input) && input.selectionStart === 0) {
        removeButton(orderedValues.length - 1)?.focus()
      }
    }`,
    chipKeyDown: `(event: KeyboardEvent, entry: string) => {
      const at = orderedValues.indexOf(entry)
      if (at === -1) return
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        remove(entry)
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const step = event.key === lineStartKey(frame ?? (event.target as Element)) ? -1 : 1
        if (at + step === orderedValues.length) api.focus()
        else if (at + step >= 0) removeButton(at + step)?.focus()
      }
    }`,
    // The chevron acts on press, so the field keeps focus; a keyboard click acts on click.
    toggle: `() => {
      if (disabled) return
      api.setOpen(!api.open)
      api.focus()
    }`,
    // A press on the field focuses the input, except on parts that are controls themselves.
    pressField: `(event: MouseEvent) => {
      if ((event.target as HTMLElement).closest('button, input')) return
      event.preventDefault()
      api.focus()
    }`,
    // Focus leaving the field and the panel closes the list and blurs the member, as React's
    // blur does. The machine hears focus that arrives outside, and not focus that arrives
    // nowhere (the window losing it). The close is the event the machine's own dismissal
    // sends, which leaves focus where it went: its public `setOpen(false)` moves focus back
    // into the field.
    leave: `(event: FocusEvent) => {
      const landed = event.relatedTarget as Node | null
      if ((event.currentTarget as HTMLElement).contains(landed)) return
      if (landed !== null && panel?.contains(landed)) return
      if (api.open) service.send({ type: 'LAYER.INTERACT_OUTSIDE', src: 'interact-outside', restoreFocus: false })
      emit('blur', event)
    }`,
  },
  machine: {
    of: 'combobox',
    context: {
      collection:
        'zag.collection({ items: rows, itemToValue: (item) => item.value, itemToString: (item) => item.label, isItemDisabled: (item) => isOff(item) })',
      multiple: 'true',
      // The member's value and text, always: the machine reports a toggle, and the member
      // decides the order and when the text changes.
      value: 'values',
      inputValue: 'text',
      defaultOpen: 'defaultOpen',
      disabled: 'disabled',
      closeOnSelect: 'false',
      selectionBehavior: "'preserve' as const",
      // Text that matches nothing is the member's to answer (the mint row, or a refusal),
      // never the machine's to revert.
      allowCustomValue: 'true',
      // Two pixels: the panel's border must not merge with the field's. The recipe sets the width.
      positioning: "{ placement: 'bottom-start' as const, gutter: 2, sameWidth: false }",
      // An option's id is its place in the list, as React's is, so a value with a space in it
      // never reaches an id.
      ids: '{ ...(id === undefined ? {} : { input: id }), item: (key: string) => `${uid}-opt-${rows.findIndex((row) => row.value === key)}` }',
      // The field and the panel are one control: focus or a press on a chip, the chevron or
      // the panel's other rows is not outside it.
      onInteractOutside:
        '(event) => ((target) => (frame?.contains(target) || panel?.contains(target)) && event.preventDefault())(event.detail.originalEvent.target as Node | null)',
    },
    events: {
      onValueChange: { run: 'pick(details.value)' },
      onInputValueChange: { run: 'commitText(details.inputValue)' },
    },
  },
  // The spec's `agent` fence. The member holds the value and the text, so an action sets them
  // through `commit` and `commitText`, which report `change` and `inputChange`. At the maximum an
  // unchosen option is disabled, as a person sees it, and a set larger than the maximum is
  // refused. A chosen value no option carries (a minted one) is a choice labelled by itself. The
  // machine owns the open state.
  agent: {
    on: 'textField',
    state: {
      value: 'orderedValues',
      options:
        '[...options.map((option) => ({ id: option.value, label: option.label, ...(option.disabled === true || (atMax && !values.includes(option.value)) ? { disabled: true } : {}) })), ...orderedValues.filter((entry) => !labels.has(entry)).map((entry) => ({ id: entry, label: entry }))]',
      'input-value': 'text',
      open: 'api.open',
      disabled: 'disabled',
      invalid: 'invalid',
    },
    actions: {
      choose: {
        argument: 'ids',
        run: `(() => {
          const next = ordered(new Set(value))
          if (max !== undefined && next.length > max) throw new Error(\`The field holds at most \${max} values.\`)
          if (next.length === orderedValues.length && next.every((entry, at) => entry === orderedValues[at])) return
          commit(next)
        })()`,
      },
      fill: {
        argument: 'text',
        run: `(() => {
          if (atMax) throw new Error('The field is full, so its text is read-only.')
          commitText(value)
        })()`,
      },
      open: 'api.setOpen(true)',
      close: 'api.setOpen(false)',
    },
  },
  presence: {
    // The anchored panel's recipe animates it; the sheet's panel and scrim play their bindings.
    present: { open: 'api.open && !sheeting', ref: 'panel' },
    sheetPresent: {
      open: 'api.open && sheeting',
      ref: 'sheetPanel',
      binding: 'sheet.panel',
      sheetSide: 'bottom',
    },
    scrimPresent: { open: 'api.open && sheeting', ref: 'scrim', binding: 'dialog.scrim' },
  },
  listPresence: { chips: { of: 'orderedValues', key: '(entry: string) => entry' } },
  effects: [
    { run: 'settled = true' },
    {
      watch: 'clearable',
      run: 'clearable && textField ? holdFieldEscape(textField) : () => {}',
      release: 'ran()',
    },
    // An open list highlights its first enabled row: on mount, and whenever the text changes.
    { watch: 'text', run: 'api.open && aimFirst()' },
    // A list opened without a highlight (the chevron, typing) starts on its first row; an arrow
    // key sets its own first or last row before it.
    {
      watch: 'api.open',
      mount: false,
      run: 'api.open && api.highlightedValue === null && aimFirst()',
    },
    // The highlight trigger for paging, the primary one: keyboard navigation reaches the last
    // row even when the page fits the panel and there is no scroll edge.
    {
      watch: 'api.highlightedValue',
      run: 'api.open && api.highlightedValue !== null && api.highlightedValue === lastReal && requestMore()',
    },
  ],
  template: [
    el(
      'div',
      {
        part: 'field',
        class: ['field'],
        ref: 'frame',
        attrs: {
          // The machine anchors the panel to this element, which it finds by this id.
          id: 'api.getControlProps().id',
          'data-size': 'size',
          'data-state': "api.open ? 'open' : 'closed'",
          'data-disabled': flag('disabled'),
          'data-invalid': flag('invalid'),
          'data-loading': flag('loading'),
          // The refusal flash, apart from `data-invalid`, which is the field's steady state.
          'data-refused': flag('refused'),
          // A presence flag beside `data-state`, because the field can be open and full at once.
          'data-at-max': flag('atMax'),
          // The field and its sheet are one composite: the field sits above the scrim.
          'data-sheeting': flag('sheeting && api.open'),
          ...identity('MultiSelect'),
        },
        on: {
          mousedown: run('pressField($event)'),
          focusout: run('leave($event)'),
          // The chevron's glyph animates too, and its `animationend` bubbles here, so the
          // flash ends on its own animation.
          animationend: run('(refused = false)', "$event.animationName.includes('refusal')"),
        },
      },
      [
        el('ul', { part: 'chips', class: ['chips'], ref: 'chipList' }, [
          each('chips', 'chip', 'chip.key', [
            member(
              'MultiSelectChip',
              {
                label: 'labelOf(chip.item)',
                open: 'chip.open',
                appear: 'settled',
                disabled: 'disabled',
                removeLabel: 'say.remove(labelOf(chip.item))',
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
        // Always mounted, and read-only at the maximum, as TagInput's field is: it is the
        // label's target, and a full field still takes Backspace.
        el('input', {
          part: 'trigger',
          class: ['input'],
          // The control an agent's handle names.
          ref: 'textField',
          spread: ['{ ...api.getInputProps(), onKeydown: fieldKeyDown, onInput: typed }'],
          attrs: {
            placeholder: 'values.length === 0 ? placeholder : undefined',
            readonly: 'atMax',
            'aria-controls': when('api.open', 'api.getContentProps().id'),
            'aria-label': 'ariaLabel',
            'aria-labelledby': 'ariaLabelledby',
            // The count is added to the field's description rather than replacing it.
            'aria-describedby': "[ariaDescribedby, countId].filter(Boolean).join(' ')",
            'aria-required': 'ariaRequired',
            'aria-invalid': when('invalid', 'true'),
          },
        }),
        // A real, labelled button, out of the tab order because the input is the field's one
        // tab stop. While loading, the spinning glyph takes the chevron's place.
        el(
          'button',
          {
            part: 'chevron',
            class: ['chevron'],
            spread: ['{ ...api.getTriggerProps(), onClick: undefined, onPointerdown: undefined }'],
            attrs: { 'aria-label': 'say.showOptions' },
            on: {
              mousedown: run('($event.preventDefault(), toggle())'),
              click: run('toggle()', '$event.detail === 0'),
            },
          },
          [
            cond(
              'loading',
              [
                el('span', { class: ['spinner'] }, [
                  member('Icon', { name: lit('loading'), size: 'size' }),
                ]),
              ],
              [member('Icon', { name: lit('expand'), size: 'size' })],
            ),
          ],
        ),
        // The count, and at the maximum the reason, in one sentence and one element.
        el('span', { part: 'count', class: ['reader'], attrs: { id: 'countId' } }, [
          text('say.selected(values.length, max)'),
        ]),
        // Removals, mints and refusals are announced, because a reader cannot see them happen.
        el(
          'span',
          { part: 'announcer', class: ['reader'], attrs: { 'aria-live': lit('polite') } },
          [text('announcement')],
        ),
        // The async status, in the field, so the panel's rows are not announced twice.
        el(
          'div',
          { class: ['status'], attrs: { role: lit('status'), 'aria-live': lit('polite') } },
          [text('status')],
        ),
        cond('name !== undefined', [
          el('input', {
            attrs: {
              type: lit('hidden'),
              name: 'name',
              value: "orderedValues.join(',')",
              disabled: 'disabled',
            },
          }),
        ]),
      ],
    ),
    portal(
      cond('present', [
        el('div', { spread: ['api.getPositionerProps()'] }, [
          el(
            'div',
            {
              part: 'panel',
              class: ['content'],
              attrs: {
                'data-size': 'size',
                'data-state': "api.open ? 'open' : 'closed'",
                ...identity('MultiSelect'),
              },
              // The recipe reads the positioner's measurements under Radix's names; Zag's
              // positioner sets them as its own variables, which the panel inherits.
              geometry: {
                '--radix-popover-trigger-width': "'var(--reference-width)'",
                '--radix-popover-content-available-height': "'var(--available-height)'",
                '--radix-popover-content-transform-origin': "'var(--transform-origin)'",
              },
              ref: 'panel',
            },
            popup(),
          ),
        ]),
      ]),
      cond('scrimPresent', [
        el('div', { class: ['sheet.scrim'], attrs: { 'data-state': SHEET_STATE }, ref: 'scrim' }),
      ]),
      cond('sheetPresent', [
        el('div', { class: ['sheet.positioner'] }, [
          el(
            'div',
            {
              class: ['sheet.panel'],
              attrs: { 'data-presentation': lit('sheet'), 'data-state': SHEET_STATE },
              ref: 'sheetPanel',
            },
            [
              el(
                'div',
                {
                  part: 'panel',
                  class: ['sheetBody'],
                  attrs: { 'data-size': 'size', ...identity('MultiSelect') },
                  ref: 'panel',
                },
                popup(),
              ),
            ],
          ),
        ]),
      ]),
    ),
  ],
  parts: [
    {
      name: 'Chip',
      public: false,
      purpose: 'one chosen value, with its remove button, playing its exit when it is removed',
      props: {
        label: { type: 'string' },
        open: {
          type: 'boolean',
          doc: 'False once the value is removed, while the chip plays its exit.',
        },
        appear: {
          type: 'boolean',
          doc: 'The chip joined after the list’s first render, so it plays its enter.',
        },
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
        { part: 'chip', class: ['chip'], ref: 'chip', attrs: { 'data-removing': flag('!open') } },
        [
          el('span', { part: 'label', class: ['label'] }, [text('label')]),
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
      props: { options: ASSIGNEES, placeholder: 'Add assignees…', 'aria-label': 'Assignees' },
      expect: { 'data-state': 'closed', 'data-size': 'md' },
    },
    {
      name: 'with chips — options order, never click order',
      props: { options: ASSIGNEES, defaultValue: FIRST_THREE, 'aria-label': 'Assignees' },
    },
    {
      name: 'wrapped — the container grew',
      props: {
        options: WATCHERS,
        defaultValue: WATCHERS.map((option) => option.value),
        'aria-label': 'Labels',
      },
    },
    {
      name: 'open filtered — a typed query, first option highlighted',
      props: {
        defaultOpen: true,
        defaultInputValue: 'an',
        options: ASSIGNEES,
        'aria-label': 'Assignees',
      },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'open with selections — check glyphs say chosen',
      props: {
        defaultOpen: true,
        options: ASSIGNEES,
        defaultValue: FIRST_THREE,
        'aria-label': 'Assignees',
      },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'loading — skeleton rows hold the panel',
      props: { loading: true, defaultOpen: true, options: ASSIGNEES, 'aria-label': 'Assignees' },
      expect: { 'data-loading': '' },
    },
    {
      name: 'empty results — a sentence, not a scene',
      props: {
        defaultOpen: true,
        defaultInputValue: 'zzz',
        options: ASSIGNEES,
        'aria-label': 'Assignees',
      },
    },
    {
      name: 'at max — the input goes read-only, unchecked options refuse',
      props: {
        defaultOpen: true,
        max: 3,
        options: ASSIGNEES,
        defaultValue: FIRST_THREE,
        'aria-label': 'Assignees',
      },
      expect: { 'data-at-max': '' },
    },
    {
      name: 'custom — the mint row offers what the list lacks',
      props: {
        allowCustom: true,
        defaultOpen: true,
        defaultInputValue: 'on-call rotation',
        options: ASSIGNEES,
        'aria-label': 'Labels',
      },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'custom — the minted chip stands, labelled by its value',
      props: {
        allowCustom: true,
        options: ASSIGNEES,
        defaultValue: ['ada', 'on-call rotation'],
        'aria-label': 'Labels',
      },
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'loading more — the next page rides below the rows',
      props: {
        loading: true,
        defaultOpen: true,
        options: ASSIGNEES,
        defaultValue: FIRST_THREE.slice(0, 2),
        'aria-label': 'Assignees',
      },
      expect: { 'data-loading': '' },
    },
    {
      name: 'size sm',
      props: {
        size: 'sm',
        options: ASSIGNEES,
        defaultValue: FIRST_THREE.slice(0, 2),
        'aria-label': 'Assignees',
      },
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'size lg',
      props: {
        size: 'lg',
        options: ASSIGNEES,
        defaultValue: FIRST_THREE.slice(0, 2),
        'aria-label': 'Assignees',
      },
      expect: { 'data-size': 'lg' },
    },
    {
      name: 'invalid',
      props: {
        invalid: true,
        options: ASSIGNEES,
        defaultValue: FIRST_THREE,
        'aria-label': 'Assignees',
      },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled — the removes go with the affordance',
      props: {
        disabled: true,
        options: ASSIGNEES,
        defaultValue: FIRST_THREE,
        'aria-label': 'Assignees',
      },
      expect: { 'data-disabled': '' },
    },
  ],
})
