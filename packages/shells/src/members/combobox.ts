import {
  cond,
  describeMember,
  each,
  el,
  flag,
  held,
  hold,
  identity,
  lit,
  member,
  portal,
  run,
  text,
  type Node,
} from '../dsl'

const PEOPLE = [
  { value: 'ada', label: 'Ada Lovelace' },
  { value: 'grace', label: 'Grace Hopper' },
  { value: 'alan', label: 'Alan Turing' },
  { value: 'katherine', label: 'Katherine Johnson' },
]

const DESCRIBED = [
  { value: 'ada', label: 'Ada Lovelace', description: 'Analytical engine' },
  { value: 'grace', label: 'Grace Hopper', description: 'Compilers, COBOL' },
  { value: 'alan', label: 'Alan Turing', description: 'Computability' },
]

const WITH_DISABLED = [
  { value: 'ada', label: 'Ada Lovelace' },
  { value: 'grace', label: 'Grace Hopper' },
  { value: 'archived', label: 'Archived account', disabled: true },
]

/** `open` or `closed`, for the sheet's scrim and panel, whose recipe keys pointer events on it. */
const SHEET_STATE = "api.open ? 'open' : 'closed'"

/**
 * The popup's content, the same in the anchored panel and in the sheet: the
 * listbox, three skeleton rows below it while loading, and one empty row when
 * nothing matches. The listbox is the machine's content, so it is the element
 * the machine scrolls and the one its dismissal reads; a press on the other
 * rows of the panel is kept inside by `onPointerDownOutside`.
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
        // Named as React Aria names a combobox's listbox: the list's word, then the field's
        // label when a reference names the field. A field named only by a `<label for>`
        // leaves the listbox its own word, which a host replaces through `messages.list`.
        'aria-label': 'say.list',
        'aria-labelledby':
          'ariaLabelledby === undefined ? undefined : `${api.getContentProps().id} ${ariaLabelledby}`',
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
      each('shown', 'option', 'option.value', [
        el(
          'li',
          { part: 'option', class: ['option'], spread: ['api.getItemProps({ item: option })'] },
          [
            // Reserved whether or not the row is chosen, so the label does not shift (Select's law).
            el('span', { class: ['check'] }, [
              cond('api.value.includes(option.value)', [
                member('Icon', { name: lit('confirm'), size: lit('sm') }),
              ]),
            ]),
            el('span', { class: ['text'] }, [
              el('span', { class: ['label'] }, [text('option.label')]),
              cond('option.description !== undefined', [
                el('span', { class: ['description'] }, [text('option.description')]),
              ]),
            ]),
          ],
        ),
      ]),
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
 * Combobox (`design/components/combobox.md`): a text input that filters a
 * list down to one choice. Zag's combobox machine owns the value, the typed
 * text, the highlighted option, `aria-activedescendant` and dismissal; DOM
 * focus never leaves the input.
 *
 * The member filters. Its query is the typed text, and the list is every
 * option whose label contains it (or starts with it), compared by the
 * locale's collation at base sensitivity, as React Aria's `useFilter` does.
 * Opening from the chevron or an arrow key shows every option, and the next
 * keystroke filters again. Escape closes the list and, in the same press,
 * reverts the draft to the chosen option's label (to nothing when none is
 * chosen, and keeps it under `allowsCustomValue`): the machine closes on
 * Escape, and the member reverts when the machine reports why it closed.
 *
 * Under `presentation: 'auto'`, below the sheet presentation's threshold
 * (`phone`), the popup is drawn in the bottom sheet instead of the anchored
 * panel, with no focus scope: the field is raised above the scrim
 * (`data-sheeting`), and a press on the scrim is outside the list, so the
 * machine closes it.
 */
export default describeMember({
  member: 'Combobox',
  dir: 'controls',
  recipe: 'controls/combobox',
  recipes: { sheet: 'overlays/sheet' },
  types: {
    ComboboxFilter: "NonNullable<ComboboxProps['filter']>",

    ComboboxOption: '{ value: string; label: string; description?: string; disabled?: boolean }',
    ComboboxMessages:
      '{ showOptions?: string; clear?: string; loadingOptions?: string; options?: (count: number) => string; list?: string }',
  },
  defaults: {
    allowsCustomValue: 'false',
    filter: lit('contains'),
    loading: 'false',
    emptyMessage: lit('No results'),
    clearable: 'false',
    size: lit('md'),
    disabled: 'false',
    invalid: 'false',
    presentation: lit('auto'),
  },
  media: { phone: 'phone' },
  state: {
    // The typed text the list is filtered by: at first the chosen option's label, as the field shows.
    query: "options.find((option) => option.value === (value ?? defaultValue))?.label ?? ''",
    // A list opened from the chevron or an arrow key shows every option until the next keystroke.
    showAll: 'false',
    // Paging fires once per `options` length, and again only after the app appends.
    loadMoreAt: '-1',
  },
  derived: {
    sheeting: "presentation === 'auto' && phone",
    say: "{ showOptions: 'Show options', clear: 'Clear', loadingOptions: 'Loading options…', options: (count: number) => `${count} options`, list: 'Suggestions', ...messages }",
    collator: "new Intl.Collator(undefined, { usage: 'search', sensitivity: 'base' })",
    needle: "(inputValue ?? query).normalize('NFC')",
    matches:
      "(label: string) => ((text: string) => needle === '' || (filter === 'startsWith' ? collator.compare(text.slice(0, needle.length), needle) === 0 : Array.from({ length: Math.max(0, text.length - needle.length + 1) }, (_, at) => text.slice(at, at + needle.length)).some((part) => collator.compare(part, needle) === 0)))(label.normalize('NFC'))",
    // `false` means the app has filtered, so its list is shown as it is.
    shown:
      'filter === false || showAll ? options : options.filter((option) => matches(option.label))',
    lastEnabled: 'shown.findLast((option) => option.disabled !== true)?.value',
    requestMore:
      "() => !loading && loadMoreAt !== options.length && ((loadMoreAt = options.length), emit('loadMore'), true)",
    // The app hears the blur after it is resolved: the dismissal that reverts a draft runs when
    // focus arrives elsewhere, after the input's own blur.
    emitBlur: "(event: FocusEvent) => setTimeout(() => emit('blur', event))",
    // Escape's revert: the chosen option's label, or nothing; a kept custom draft stays.
    revert:
      "() => (allowsCustomValue && api.value.length === 0) || api.setInputValue(options.find((option) => option.value === api.value[0])?.label ?? '')",
    showClear: "clearable && api.inputValue !== '' && !disabled",
    showEmpty: 'api.open && !loading && shown.length === 0',
    // One live region, in the field: a region that mounts with its words announces nothing.
    announcement:
      "!api.open ? '' : loading ? say.loadingOptions : shown.length === 0 ? emptyMessage : say.options(shown.length)",
    // The chosen value; under `allowsCustomValue`, the typed text when nothing is chosen.
    formValue: "api.value[0] ?? (allowsCustomValue ? api.inputValue : '')",
  },
  machine: {
    of: 'combobox',
    context: {
      collection:
        'zag.collection({ items: shown, itemToValue: (item) => item.value, itemToString: (item) => item.label, isItemDisabled: (item) => item.disabled === true })',
      value: 'value === undefined ? undefined : value === null ? [] : [value]',
      defaultValue: 'defaultValue == null ? undefined : [defaultValue]',
      inputValue: 'inputValue',
      defaultOpen: 'defaultOpen',
      disabled: 'disabled',
      invalid: 'invalid',
      placeholder: 'placeholder',
      allowCustomValue: 'allowsCustomValue',
      // Typing highlights the first match, as React Aria's list does.
      inputBehavior: "'autohighlight' as const",
      // Two pixels: the panel's border must not merge with the field's. The recipe sets the width.
      positioning: "{ placement: 'bottom-start' as const, gutter: 2, sameWidth: false }",
      ids: 'id === undefined ? undefined : { input: id }',
      // The skeleton and empty rows are part of the panel, not outside it.
      onPointerDownOutside:
        '(event) => panel?.contains(event.detail.originalEvent.target as Node) && event.preventDefault()',
    },
    events: {
      onValueChange: { emit: 'change', payload: 'details.value[0] ?? null' },
      onInputValueChange: {
        run: "((query = details.inputValue), details.reason === 'input-change' && (showAll = false), emit('inputChange', details.inputValue))",
      },
      onOpenChange: {
        run: "((showAll = details.open && (details.reason === 'trigger-click' || details.reason === 'arrow-key')), !details.open && details.reason === 'escape-key' && revert())",
      },
    },
  },
  // The spec's `agent` fence. The machine owns the value, the typed text and the open state,
  // controlled or not, so an action sets them through the machine and the machine reports
  // `change` and `inputChange`. An agent chooses among every option the app passed, not only
  // the ones the typed text leaves, so the field is given the option's label after the value,
  // because the machine names a value only from the items it holds. Opening shows every option,
  // as the chevron does. Each option's id is its value.
  agent: {
    on: 'input',
    state: {
      value: 'api.value[0] ?? null',
      options:
        'options.map((option) => ({ id: option.value, label: option.label, ...(option.disabled === true ? { disabled: true } : {}) }))',
      'input-value': 'api.inputValue',
      open: 'api.open',
      disabled: 'disabled',
      invalid: 'invalid',
    },
    actions: {
      choose: {
        argument: 'id',
        run: `(() => {
          if (api.value[0] === value) return
          api.setValue([value])
          api.setInputValue(options.find((option) => option.value === value)?.label ?? '')
        })()`,
      },
      fill: { argument: 'text', run: 'api.setInputValue(value)' },
      clear: "(api.setValue([]), api.setInputValue(''))",
      open: "api.setOpen(true, 'trigger-click')",
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
  effects: [
    // An open list always has a highlighted row: the chosen option, or the first enabled one.
    {
      watch: 'api.open',
      run: 'api.open && api.highlightedValue === null && ((next) => next !== undefined && api.setHighlightValue(next))(api.value.find((chosen) => shown.some((option) => option.value === chosen)) ?? shown.find((option) => option.disabled !== true)?.value)',
    },
    // The highlight trigger for paging, the primary one: keyboard navigation reaches the last
    // row even when the page fits the panel and there is no scroll edge.
    {
      watch: 'api.highlightedValue',
      run: 'api.open && api.highlightedValue !== null && api.highlightedValue === lastEnabled && requestMore()',
    },
  ],
  template: [
    el(
      'div',
      {
        part: 'field',
        class: ['field'],
        attrs: {
          // The machine anchors the panel to this element, which it finds by this id.
          id: 'api.getControlProps().id',
          'data-size': 'size',
          'data-state': "api.open ? 'open' : 'closed'",
          'data-disabled': flag('disabled'),
          'data-invalid': flag('invalid'),
          'data-loading': flag('loading'),
          // The field and its sheet are one composite: the field sits above the scrim.
          'data-sheeting': flag('sheeting && api.open'),
          ...identity('Combobox'),
        },
      },
      [
        el('input', {
          part: 'trigger',
          class: ['input'],
          spread: ['api.getInputProps()'],
          attrs: {
            // The form value is the hidden input's; the requirement is announced, not enforced.
            name: 'undefined',
            required: 'undefined',
            'aria-label': 'ariaLabel',
            'aria-labelledby': 'ariaLabelledby',
            'aria-describedby': 'ariaDescribedby',
            'aria-required': 'ariaRequired',
          },
          // The control an agent's handle names.
          ref: 'input',
          on: {
            // Tab commits the highlighted option before focus leaves, as React Aria's does.
            keydown: run(
              'api.open && api.highlightedValue !== null && api.selectValue(api.highlightedValue)',
              "$event.key === 'Tab'",
            ),
            focusout: run('emitBlur($event)'),
          },
        }),
        cond('name !== undefined', [
          el('input', {
            attrs: {
              type: lit('hidden'),
              name: 'name',
              value: 'formValue',
              disabled: 'disabled || undefined',
            },
          }),
        ]),
        // A plain button in the tab order, as React's is: focus arriving on it leaves the field,
        // so the draft resolves. Clearing reports `null` and puts focus back in the field.
        cond('showClear', [
          el(
            'button',
            {
              part: 'clear',
              class: ['clear'],
              attrs: { type: lit('button'), 'aria-label': 'say.clear' },
              on: { click: run('(api.clearValue(), api.focus())') },
            },
            [member('Icon', { name: lit('clear'), size: 'size' })],
          ),
        ]),
        // A real, labelled button. While loading, the spinning glyph takes the chevron's place.
        el(
          'button',
          {
            part: 'chevron',
            class: ['chevron'],
            spread: ['api.getTriggerProps()'],
            attrs: { 'aria-label': 'say.showOptions' },
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
        el(
          'div',
          { class: ['status'], attrs: { role: lit('status'), 'aria-live': lit('polite') } },
          [text('announcement')],
        ),
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
                ...identity('Combobox'),
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
                  attrs: { 'data-size': 'size', ...identity('Combobox') },
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
  states: [
    {
      name: 'closed rest',
      props: { options: PEOPLE, placeholder: 'Search people', 'aria-label': 'Assignee' },
      expect: { 'data-state': 'closed', 'data-size': 'md', 'data-loading': null },
    },
    {
      name: 'with value',
      props: { options: PEOPLE, defaultValue: 'grace', 'aria-label': 'Assignee' },
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'sizes side by side',
      many: {
        within: { member: 'Inline', props: { gap: 3 } },
        each: (['sm', 'md', 'lg'] as const).map((size) => ({
          props: { size, options: PEOPLE, defaultValue: 'ada', 'aria-label': `Assignee (${size})` },
        })),
      },
    },
    {
      name: 'size sm',
      props: { size: 'sm', options: PEOPLE, defaultValue: 'ada', 'aria-label': 'Assignee' },
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'size lg',
      props: { size: 'lg', options: PEOPLE, defaultValue: 'ada', 'aria-label': 'Assignee' },
      expect: { 'data-size': 'lg' },
    },
    {
      // Open with a query typed, and still typeable: the entry holds the text, as React's does.
      name: 'open filtered',
      holds: { text: 'a' },
      props: {
        defaultOpen: true,
        options: PEOPLE,
        inputValue: held('text'),
        onInputChange: hold('text'),
        placeholder: 'Search people',
        'aria-label': 'Assignee, filtered',
      },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'open with selection',
      props: {
        defaultOpen: true,
        options: PEOPLE,
        defaultValue: 'grace',
        'aria-label': 'Assignee, open on its selection',
      },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'loading',
      props: {
        defaultOpen: true,
        loading: true,
        options: [],
        placeholder: 'Search people',
        'aria-label': 'Assignee, loading',
      },
      expect: { 'data-state': 'open', 'data-loading': '' },
    },
    {
      // A query that matches no option, typed and still typeable.
      name: 'empty results',
      holds: { text: 'zzzz' },
      props: {
        defaultOpen: true,
        options: PEOPLE,
        inputValue: held('text'),
        onInputChange: hold('text'),
        placeholder: 'Search people',
        'aria-label': 'Assignee, no matches',
      },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'descriptions',
      props: {
        defaultOpen: true,
        options: DESCRIBED,
        placeholder: 'Search people',
        'aria-label': 'Assignee, with descriptions',
      },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'open with a disabled option',
      props: {
        defaultOpen: true,
        options: WITH_DISABLED,
        placeholder: 'Search people',
        'aria-label': 'Assignee, with a disabled option',
      },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'clearable with value',
      props: { clearable: true, options: PEOPLE, defaultValue: 'alan', 'aria-label': 'Assignee' },
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'custom value',
      // A kept draft that matches no option, still editable: the entry holds the text.
      holds: { text: 'Quarterly review' },
      props: {
        allowsCustomValue: true,
        options: PEOPLE,
        inputValue: held('text'),
        onInputChange: hold('text'),
        name: 'assignee',
        'aria-label': 'Assignee, holding a custom value',
      },
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'loading more',
      props: {
        defaultOpen: true,
        loading: true,
        options: PEOPLE,
        placeholder: 'Search people',
        'aria-label': 'Assignee, next page loading',
      },
      expect: { 'data-state': 'open', 'data-loading': '' },
    },
    {
      name: 'invalid',
      props: { invalid: true, options: PEOPLE, placeholder: 'Required', 'aria-label': 'Assignee' },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      props: { disabled: true, options: PEOPLE, defaultValue: 'ada', 'aria-label': 'Assignee' },
      expect: { 'data-disabled': '' },
    },
  ],
})
