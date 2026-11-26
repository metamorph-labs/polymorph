import {
  cond,
  describeMember,
  each,
  el,
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

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
]

const WITH_DISABLED = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'archived', label: 'Archived', disabled: true },
]

const GROUPED = [
  {
    label: 'Queues',
    options: [
      { value: 'billing', label: 'Billing' },
      { value: 'onboarding', label: 'Onboarding' },
    ],
  },
  {
    label: 'Archived',
    options: [
      { value: 'q3', label: 'Q3 backlog' },
      { value: 'legacy', label: 'Legacy imports' },
    ],
  },
]

const DESCRIBED = [
  { value: 'urgent', label: 'Urgent', description: 'Answer within the hour' },
  { value: 'high', label: 'High', description: 'Same business day' },
  { value: 'normal', label: 'Normal', description: 'Within two days' },
]

/**
 * The empty choice's value inside the machine, and nowhere else: it maps to
 * `null` on the way out and back on the way in, and never reaches the form.
 */
const EMPTY = "'__polymorph-empty-choice__'"

/** The member's value as the machine's list of values. */
const asList = (value: string) =>
  `(${value} === undefined ? undefined : ${value} === null ? (emptyOption === undefined ? [] : [${EMPTY}]) : [${value}])`

/** One option row, the same inside and outside a group. */
const option = (name: string): Node =>
  el(
    'div',
    {
      part: 'option',
      class: ['item'],
      spread: [`api.getItemProps({ item: ${name} })`],
      // Real focus on the highlighted row, as Radix's listbox has it (see `followHighlight`).
      attrs: { tabindex: lit('-1') },
      on: { focus: run(`api.setHighlightValue(${name}.value)`) },
    },
    [
      el('span', { class: ['check'] }, [
        cond(`api.value.includes(${name}.value)`, [
          member('Icon', { name: lit('confirm'), size: lit('sm') }),
        ]),
      ]),
      el('span', { class: ['text'] }, [
        el('span', {}, [text(`${name}.label`)]),
        cond(`${name}.description !== undefined`, [
          el('span', { class: ['description'] }, [text(`${name}.description`)]),
        ]),
      ]),
    ],
  )

/** The list's rows, the same in the popper and in the sheet: the empty choice, then each option or group. */
const listContent = (): Node[] => [
  cond('emptyOption !== undefined', [option('emptyChoice')]),
  each('options', 'entry', "'options' in entry ? `group-${entry.label}` : entry.value", [
    cond(
      "'options' in entry",
      [
        el('div', { class: ['group'], spread: ['api.getItemGroupProps({ id: entry.label })'] }, [
          el(
            'div',
            {
              class: ['groupLabel'],
              spread: ['api.getItemGroupLabelProps({ htmlFor: entry.label })'],
            },
            [text('entry.label')],
          ),
          each('entry.options', 'choice', 'choice.value', [option('choice')]),
        ]),
      ],
      [option('entry')],
    ),
  ]),
]

/** `open` or `closed`, for the sheet's scrim and panel, whose recipe keys pointer events on it. */
const SHEET_STATE = "api.open ? 'open' : 'closed'"

/**
 * Select (`design/components/select.md`): one value from a closed list. Zag's
 * machine owns the value, the highlighted option, typeahead and dismissal.
 *
 * Under `presentation: 'auto'`, below the sheet presentation's threshold
 * (`phone`), the list is drawn in a bottom sheet instead of the anchored
 * panel: the shared sheet anatomy (`overlays/sheet`), a scrim that dismisses,
 * and the list with its own sheet recipe. The machine is the same in both, so
 * the rows, the keys and the value do not change with the width.
 */
export default describeMember({
  member: 'Select',
  dir: 'controls',
  recipe: 'controls/select',
  recipes: { sheet: 'overlays/sheet' },
  types: {
    SelectOption: '{ value: string; label: string; description?: string; disabled?: boolean }',
    SelectOptionGroup: '{ label: string; options: SelectOption[] }',
  },
  defaults: { size: lit('md'), invalid: 'false', disabled: 'false', presentation: lit('auto') },
  media: { phone: 'phone' },
  derived: {
    // The sheet form under `'auto'` and below the threshold; `'popover'` keeps the anchored panel.
    sheeting: "presentation === 'auto' && phone",
    emptyChoice: `{ value: ${EMPTY}, label: emptyOption ?? '', description: undefined, disabled: false }`,
    // The machine's flat list, the empty choice first.
    flat: "[...(emptyOption === undefined ? [] : [emptyChoice]), ...options.flatMap((entry) => ('options' in entry ? entry.options : [entry]))]",
    shown: 'flat.find((choice) => api.value.includes(choice.value))',
    placeholderShown: 'shown === undefined',
  },
  machine: {
    of: 'select',
    context: {
      collection:
        'zag.collection({ items: flat, itemToValue: (item) => item.value, itemToString: (item) => item.label, isItemDisabled: (item) => item.disabled === true })',
      value: asList('value'),
      // With an empty choice and no default, the empty choice is chosen, as React's Select has it.
      defaultValue: `defaultValue === undefined && emptyOption !== undefined ? [${EMPTY}] : ${asList('defaultValue')}`,
      defaultOpen: 'defaultOpen',
      disabled: 'disabled',
      invalid: 'invalid',
      // Two pixels: the panel's border must not merge with the trigger's.
      positioning: "{ placement: 'bottom-start' as const, gutter: 2 }",
      // The caller's id names the trigger, through the machine, which finds its parts by id.
      ids: 'id === undefined ? undefined : { trigger: id }',
    },
    events: {
      onValueChange: {
        emit: 'change',
        payload: `details.value[0] === undefined || details.value[0] === ${EMPTY} ? null : details.value[0]`,
      },
    },
  },
  // The spec's `agent` fence. The machine owns the value and the open state, controlled or not,
  // so an action sets them through the machine and the machine reports `change`. An agent
  // chooses without opening the list. Each option's id is its value, and the empty choice's is
  // `''`, which `change` reports as `null`.
  agent: {
    on: 'trigger',
    state: {
      value: `api.value[0] === undefined ? (emptyOption === undefined ? null : '') : api.value[0] === ${EMPTY} ? '' : api.value[0]`,
      options: `flat.map((choice) => ({ id: choice.value === ${EMPTY} ? '' : choice.value, label: choice.label, ...(choice.disabled === true ? { disabled: true } : {}) }))`,
      open: 'api.open',
      disabled: 'disabled',
    },
    actions: {
      choose: { argument: 'id', run: `api.setValue([value === '' ? ${EMPTY} : value])` },
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
  effects: [
    // Opening puts focus on the chosen option, or the first enabled one, as Radix's listbox does.
    {
      watch: 'api.open',
      run: "api.open && api.highlightedValue === null && api.setHighlightValue(api.value[0] ?? flat.find((choice) => !choice.disabled)?.value ?? '')",
    },
    // Closing returns focus to the trigger. Not on mount: a closed Select has closed nothing.
    { watch: 'api.open', mount: false, run: 'api.open || returnFocus(trigger, panel)' },
    { watch: 'api.highlightedValue', run: 'followHighlight(panel, api.highlightedValue)' },
  ],
  template: [
    el(
      'button',
      {
        part: 'trigger',
        class: ['trigger'],
        spread: ['api.getTriggerProps()'],
        ref: 'trigger',
        attrs: {
          'aria-label': 'ariaLabel',
          'aria-labelledby': 'ariaLabelledby',
          'aria-describedby': 'ariaDescribedby',
          'aria-required': 'ariaRequired',
          'aria-invalid': when('invalid', 'true'),
          'data-size': 'size',
          'data-invalid': flag('invalid'),
          'data-disabled': flag('disabled'),
          'data-placeholder': flag('placeholderShown'),
          ...identity('Select'),
        },
      },
      [
        el('span', { class: ['value'] }, [
          text("shown?.label ?? (emptyOption === undefined ? (placeholder ?? '') : '')"),
        ]),
        el('span', { class: ['chevron'], attrs: { 'aria-hidden': lit('true') } }, [
          member('Icon', { name: lit('expand'), size: 'size' }),
        ]),
      ],
    ),
    // The form value: the chosen option, `''` for none and for the empty choice.
    cond('name !== undefined', [
      el('input', {
        attrs: {
          type: lit('hidden'),
          name: 'name',
          value: `api.value[0] === undefined || api.value[0] === ${EMPTY} ? '' : api.value[0]`,
          disabled: 'disabled || undefined',
        },
      }),
    ]),
    portal(
      cond('present', [
        el('div', { spread: ['api.getPositionerProps()'] }, [
          el(
            'div',
            {
              part: 'panel',
              class: ['content'],
              spread: ['api.getContentProps()'],
              attrs: { hidden: 'undefined', 'data-size': 'size', ...identity('Select') },
              // The machine focuses the list; focus goes on to the highlighted option.
              on: { focus: run('followHighlight(panel, api.highlightedValue)') },
              // The recipe reads the positioner's measurements under Radix's names; Zag's
              // positioner sets them as its own variables, which the panel inherits.
              geometry: {
                '--radix-select-trigger-width': "'var(--reference-width)'",
                '--radix-select-content-available-height': "'var(--available-height)'",
                '--radix-select-content-transform-origin': "'var(--transform-origin)'",
              },
              ref: 'panel',
            },
            [el('div', { class: ['viewport'] }, listContent())],
          ),
        ]),
      ]),
      // The sheet: a press on the scrim is outside the list, so the machine closes it.
      cond('scrimPresent', [
        el('div', { class: ['sheet.scrim'], attrs: { 'data-state': SHEET_STATE }, ref: 'scrim' }),
      ]),
      cond('sheetPresent', [
        el('div', { class: ['sheet.positioner'] }, [
          el(
            'div',
            {
              class: ['sheet.panel'],
              attrs: {
                'data-presentation': lit('sheet'),
                'data-state': SHEET_STATE,
                tabindex: lit('-1'),
              },
              ref: 'sheetPanel',
            },
            [
              el(
                'div',
                {
                  part: 'panel',
                  class: ['sheetList'],
                  spread: ['api.getContentProps()'],
                  attrs: { hidden: 'undefined', 'data-size': 'size', ...identity('Select') },
                  on: { focus: run('followHighlight(panel, api.highlightedValue)') },
                  ref: 'panel',
                },
                listContent(),
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
      props: { options: PRIORITIES, placeholder: 'Choose a priority', 'aria-label': 'Priority' },
      expect: { 'data-state': 'closed', 'data-size': 'md', 'data-placeholder': '' },
    },
    {
      name: 'with value',
      props: { options: PRIORITIES, defaultValue: 'high', 'aria-label': 'Priority' },
      expect: { 'data-placeholder': null },
    },
    {
      name: 'nothing chosen, held as null',
      props: {
        options: PRIORITIES,
        placeholder: 'Choose a priority',
        value: null,
        'aria-label': 'Priority',
      },
      expect: { 'data-placeholder': '' },
    },
    {
      name: 'sizes side by side',
      many: {
        within: { member: 'Inline', props: { gap: 3 } },
        each: (['sm', 'md', 'lg'] as const).map((size) => ({
          props: {
            size,
            options: PRIORITIES,
            defaultValue: 'normal',
            'aria-label': `Priority (${size})`,
          },
        })),
      },
    },
    {
      name: 'size sm',
      props: { size: 'sm', options: PRIORITIES, defaultValue: 'normal', 'aria-label': 'Priority' },
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'size lg',
      props: { size: 'lg', options: PRIORITIES, defaultValue: 'normal', 'aria-label': 'Priority' },
      expect: { 'data-size': 'lg' },
    },
    {
      name: 'open',
      props: {
        defaultOpen: true,
        options: PRIORITIES,
        placeholder: 'Choose a priority',
        'aria-label': 'Priority, open',
      },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'open with selection',
      props: {
        defaultOpen: true,
        options: PRIORITIES,
        defaultValue: 'high',
        'aria-label': 'Priority, open with a selection',
      },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'empty choice, selected',
      props: {
        options: PRIORITIES,
        emptyOption: 'All statuses',
        defaultValue: null,
        'aria-label': 'Status',
      },
      expect: { 'data-placeholder': null },
    },
    {
      name: 'empty choice, open',
      props: {
        defaultOpen: true,
        options: PRIORITIES,
        emptyOption: 'All statuses',
        'aria-label': 'Status, open on the empty choice',
      },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'open with a disabled option',
      props: {
        defaultOpen: true,
        options: WITH_DISABLED,
        defaultValue: 'high',
        'aria-label': 'Priority, with a disabled option',
      },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'grouped, open — group labels present, options selectable',
      props: {
        defaultOpen: true,
        options: GROUPED,
        placeholder: 'Choose a queue',
        'aria-label': 'Queue, grouped',
      },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'descriptions, open — two-line items',
      props: {
        defaultOpen: true,
        options: DESCRIBED,
        defaultValue: 'high',
        'aria-label': 'Priority, with descriptions',
      },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'invalid',
      props: {
        invalid: true,
        options: PRIORITIES,
        placeholder: 'Required',
        'aria-label': 'Priority',
      },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      props: {
        disabled: true,
        options: PRIORITIES,
        defaultValue: 'normal',
        'aria-label': 'Priority',
      },
      expect: { 'data-disabled': '' },
    },
  ],
})
