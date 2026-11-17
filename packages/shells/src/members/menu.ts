import {
  cond,
  describeMember,
  each,
  el,
  fx,
  identity,
  lit,
  member,
  portal,
  run,
  slot,
  text,
  type Node,
} from '../dsl'

const noop = { js: '() => {}' }

const ITEMS = [
  { kind: 'label', label: 'This ticket' },
  { label: 'Assign to me', icon: 'user', onSelect: noop },
  { label: 'Snooze', icon: 'time', kbd: 'S', onSelect: noop },
  { label: 'Copy link', icon: 'link', kbd: '⌘', onSelect: noop },
  { kind: 'separator' },
  { label: 'Merge into…', disabled: true, onSelect: noop },
  { label: 'Delete', icon: 'delete', tone: 'danger', onSelect: noop },
]

const NESTED = [
  { label: 'Assign to me', icon: 'user', onSelect: noop },
  {
    kind: 'submenu',
    label: 'Move to',
    icon: 'archive',
    items: [
      { kind: 'label', label: 'Queues' },
      { label: 'Billing', onSelect: noop },
      { label: 'Onboarding', onSelect: noop },
      { kind: 'separator' },
      { label: 'Escalations', disabled: true, onSelect: noop },
    ],
  },
  { kind: 'submenu', label: 'Snooze until', icon: 'time', disabled: true, items: [] },
  { kind: 'separator' },
  { label: 'Delete', icon: 'delete', tone: 'danger', onSelect: noop },
]

const TRIGGER = [
  fx('Button', {
    variant: 'ghost',
    tone: 'neutral',
    iconOnly: true,
    icon: 'overflow',
    label: 'Actions',
  }),
]

/** A row's leading glyph or trailing hint. */
const glyph = (name: string) =>
  el('span', { class: ['glyph'] }, [member('Icon', { name, size: lit('sm') })])

/**
 * The rows of one list, from `menu.md`'s grammar: a label, a separator, a
 * checkbox that toggles without closing, a command, and (in the top list of
 * the anchored panel) a submenu. `list` names the entries; `api` is the list's
 * own machine.
 */
const rows = (list: string, submenus: boolean): Node =>
  each(
    list,
    'entry',
    'index',
    [
      cond(
        "entry.kind === 'separator'",
        [el('div', { class: ['separator'], spread: ['api.getSeparatorProps()'] })],
        "entry.kind === 'label'",
        [el('div', { class: ['groupLabel'] }, [text('entry.label')])],
        "entry.kind === 'checkbox'",
        [
          el(
            'div',
            {
              class: ['item', 'checkbox'],
              // It toggles without closing: people adjust a filter list several items at a time.
              spread: [
                "api.getOptionItemProps({ type: 'checkbox', value: entry.label, checked: entry.checked, disabled: entry.disabled, closeOnSelect: false, onCheckedChange: entry.onCheckedChange })",
              ],
              attrs: { 'data-menu-part': lit('checkbox'), tabindex: lit('-1') },
              on: { focus: run('api.setHighlightedValue(entry.label)') },
            },
            [
              // Select's check column: the space is reserved whether or not checked.
              el('span', { class: ['check'] }, [
                cond('entry.checked', [member('Icon', { name: lit('confirm'), size: lit('sm') })]),
              ]),
              el('span', { class: ['label'] }, [text('entry.label')]),
            ],
          ),
        ],
        ...(submenus
          ? ["entry.kind === 'submenu'", [member('MenuSubmenu', { entry: 'entry' })] as Node[]]
          : []),
        [
          el(
            'div',
            {
              class: ['item'],
              spread: ['api.getItemProps({ value: entry.label, disabled: entry.disabled })'],
              attrs: { 'data-tone': "entry.tone ?? 'neutral'", tabindex: lit('-1') },
              on: { focus: run('api.setHighlightedValue(entry.label)') },
            },
            [
              cond('entry.icon !== undefined', [glyph('entry.icon')]),
              el('span', { class: ['label'] }, [text('entry.label')]),
              cond('entry.kbd !== undefined', [
                el('span', { class: ['hint'] }, [
                  member('Kbd', {}, { slots: { default: [text('entry.kbd')] } }),
                ]),
              ]),
            ],
          ),
        ],
      ),
    ],
    'index',
  )

/** A submenu row's content: its glyph, its label, and the affordance that says it opens a list. */
const submenuRow: Node[] = [
  cond('entry.icon !== undefined', [glyph('entry.icon')]),
  el('span', { class: ['label'] }, [text('entry.label')]),
  // An affordance, where a `kbd` hint would be: this row opens a list.
  el('span', { class: ['hint'] }, [member('Icon', { name: lit('next'), size: lit('sm') })]),
]

/**
 * The recipe reads the positioner's measurements under Radix's names; Zag's
 * positioner sets them as its own variables, which the list inherits.
 */
const MEASURED = {
  '--radix-dropdown-menu-content-available-height': "'var(--available-height)'",
  '--radix-dropdown-menu-content-transform-origin': "'var(--transform-origin)'",
}

/** `open` or `closed`, for the sheet's scrim and panel, whose recipe keys pointer events on it. */
const SHEET_STATE = "api.open ? 'open' : 'closed'"

/**
 * Menu (`design/components/menu.md`): a list of commands behind a trigger.
 * Zag's machine owns opening, the highlighted row, typeahead and dismissal; a
 * submenu is a second machine, joined to the first, in its own part.
 *
 * Under `presentation: 'auto'`, below the sheet presentation's threshold
 * (`phone`), the list is drawn in a bottom sheet instead of the anchored
 * panel, with its submenus flattened into it (`menu.md`'s sheet cell): the
 * shared sheet anatomy (`overlays/sheet`), a scrim that dismisses, and the rows
 * on the member's own sheet list.
 */
export default describeMember({
  member: 'Menu',
  dir: 'overlays',
  recipe: 'overlays/menu',
  recipes: { triggerAnchor: 'overlays/trigger-anchor', sheet: 'overlays/sheet' },
  types: {
    MenuPresentation: "NonNullable<MenuProps['presentation']>",
    MenuAlign: "NonNullable<MenuProps['align']>",

    MenuItemEntry:
      "{ kind?: 'item'; label: string; icon?: IconRole; kbd?: string; tone?: 'neutral' | 'danger'; disabled?: boolean; onSelect: () => void }",
    MenuCheckboxEntry:
      "{ kind: 'checkbox'; label: string; checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean }",
    MenuSeparatorEntry: "{ kind: 'separator' }",
    MenuLabelEntry: "{ kind: 'label'; label: string }",
    MenuLeafEntry: 'MenuItemEntry | MenuCheckboxEntry | MenuSeparatorEntry | MenuLabelEntry',
    MenuSubmenuEntry:
      "{ kind: 'submenu'; label: string; icon?: IconRole; disabled?: boolean; items: MenuLeafEntry[] }",
    MenuEntry: 'MenuLeafEntry | MenuSubmenuEntry',
  },
  defaults: { align: lit('start'), presentation: lit('auto') },
  media: { phone: 'phone' },
  derived: {
    // The sheet form under `'auto'` and below the threshold; `'popover'` keeps the anchored panel.
    sheeting: "presentation === 'auto' && phone",
    // The sheet's rows: a submenu flattens to its label and then its items, and a disabled one to
    // its label alone, as `menu.md`'s sheet cell has it.
    flat: "items.flatMap((entry) => entry.kind === 'submenu' ? [{ kind: 'label' as const, label: entry.label }, ...(entry.disabled ? [] : entry.items)] : [entry])",
  },
  machine: {
    of: 'menu',
    context: {
      open: 'open',
      defaultOpen: 'defaultOpen',
      // Two pixels: a menu grows out of the control that opened it, so the gap is a seam.
      positioning: '{ placement: `bottom-${align}`, gutter: 2 }',
    },
    events: {
      onOpenChange: { emit: 'openChange', payload: 'details.open' },
      // Commands run from the machine's selection, found by label, a flattened submenu's among
      // them; a checkbox reports through its own callback.
      onSelect: {
        run: "flat.forEach((entry) => 'onSelect' in entry && entry.label === details.value && entry.onSelect())",
      },
    },
  },
  provide: { api: 'api', service: 'service' },
  // The spec's `agent` fence. An agent chooses an entry by its id without opening the menu, and
  // the entry's own `onSelect` (or a checkbox entry's `onCheckedChange`) runs, as for a person's
  // choice; a command closes a menu that is open. The machine owns the open state, controlled or
  // not, and reports `openChange`. The trigger, a control in the anchor, names the menu.
  agent: {
    on: 'anchor',
    element: "anchor?.querySelector('button, a[href], [tabindex]')",
    state: { open: 'api.open', entries: 'menuChoices(items)' },
    actions: {
      choose: {
        argument: 'id',
        run: 'chooseMenuEntry(items, value) && api.open && api.setOpen(false)',
      },
      open: 'api.open || api.setOpen(true)',
      close: 'api.open && api.setOpen(false)',
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
    { watch: 'api.open', run: 'syncTriggerAnchor(anchor, api.getTriggerProps(), api.open)' },
    // Real focus on the highlighted row, as Radix's menus have it (see `followHighlight`).
    { watch: 'api.highlightedValue', run: 'followHighlight(panel, api.highlightedValue)' },
  ],
  template: [
    el(
      'span',
      {
        part: 'trigger',
        class: ['triggerAnchor.anchor'],
        spread: ['anchorProps(api.getTriggerProps())'],
        ref: 'anchor',
      },
      [slot('trigger')],
    ),
    portal(
      cond('present', [
        el('div', { spread: ['api.getPositionerProps()'] }, [
          el(
            'div',
            {
              part: 'panel',
              class: ['content'],
              spread: ['api.getContentProps()'],
              attrs: { hidden: 'undefined', ...identity('Menu') },
              geometry: MEASURED,
              // The machine focuses the list; focus goes on to the highlighted row.
              on: { focus: run('followHighlight(panel, api.highlightedValue)') },
              ref: 'panel',
            },
            [rows('items', true)],
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
                  attrs: { hidden: 'undefined', ...identity('Menu') },
                  on: { focus: run('followHighlight(panel, api.highlightedValue)') },
                  ref: 'panel',
                },
                [rows('flat', false)],
              ),
            ],
          ),
        ]),
      ]),
    ),
  ],
  parts: [
    {
      name: 'Submenu',
      public: false,
      purpose: 'a row that opens a list of its own, one level deep',
      props: { entry: { type: 'MenuSubmenuEntry' } },
      machine: {
        of: 'menu',
        context: { positioning: "{ placement: 'right-start', gutter: 2 }" },
        events: {
          onSelect: {
            run: "entry.items.forEach((item) => 'onSelect' in item && item.label === details.value && item.onSelect())",
          },
        },
      },
      derived: { items: 'entry.items' },
      // The two machines are joined once both exist: the row opens this list.
      effects: [
        { run: '(owner.api?.setChild(service), api.setParent(owner.service))' },
        { watch: 'api.highlightedValue', run: 'followHighlight(panel, api.highlightedValue)' },
        // Closing returns focus to the row that opened the list, as Radix's submenu does, when
        // focus is still in the list: a list that plays its exit keeps focus until it leaves.
        { watch: 'api.open', mount: false, run: 'api.open || returnFocus(row, panel)' },
      ],
      presence: { present: { open: 'api.open', ref: 'panel' } },
      template: [
        // A disabled submenu is a plain disabled row of the list it sits in: it does not
        // highlight, and no pointer or key opens it.
        cond(
          'entry.disabled',
          [
            el(
              'div',
              {
                class: ['item'],
                spread: ['owner.api?.getItemProps({ value: entry.label, disabled: true }) ?? {}'],
                attrs: { 'data-tone': lit('neutral') },
              },
              submenuRow,
            ),
          ],
          [
            el(
              'div',
              {
                class: ['item'],
                spread: ['owner.api?.getTriggerItemProps(api) ?? {}'],
                // Focusable as every other row is, so focus follows the highlight onto it.
                attrs: { 'data-tone': lit('neutral'), tabindex: lit('-1') },
                ref: 'row',
              },
              submenuRow,
            ),
          ],
        ),
        portal(
          cond('present', [
            el('div', { spread: ['api.getPositionerProps()'] }, [
              el(
                'div',
                {
                  class: ['content'],
                  spread: ['api.getContentProps()'],
                  attrs: { hidden: 'undefined' },
                  geometry: MEASURED,
                  ref: 'panel',
                },
                [rows('items', false)],
              ),
            ]),
          ]),
        ),
      ],
    },
  ],
  states: [
    {
      name: 'closed — the trigger is all there is',
      props: { items: [{ label: 'Assign to me', onSelect: noop }] },
      slots: { trigger: TRIGGER },
    },
    {
      name: 'open — labels, icons, hints, a separator and a danger command',
      props: { defaultOpen: true, items: ITEMS },
      slots: { trigger: TRIGGER },
    },
    {
      name: 'aligned to the end, for a trigger at the right edge',
      props: {
        defaultOpen: true,
        align: 'end',
        items: [
          { label: 'Assign to me', icon: 'user', onSelect: noop },
          { label: 'Snooze', icon: 'time', onSelect: noop },
        ],
      },
      slots: { trigger: TRIGGER },
    },
    {
      name: 'a submenu — one row that opens a list instead of running a command',
      props: { defaultOpen: true, items: NESTED },
      slots: { trigger: TRIGGER },
    },
    {
      name: 'commands only — no icons, no hints',
      props: {
        defaultOpen: true,
        items: [
          { label: 'Mark as read', onSelect: noop },
          { label: 'Mark as unread', onSelect: noop },
        ],
      },
      slots: { trigger: TRIGGER },
    },
    {
      name: 'checkbox entries — checked and unchecked, toggling without dismissal',
      props: {
        defaultOpen: true,
        items: [
          { kind: 'label', label: 'Columns' },
          { kind: 'checkbox', label: 'Status', checked: true, onCheckedChange: noop },
          { kind: 'checkbox', label: 'Assignee', checked: false, onCheckedChange: noop },
          {
            kind: 'checkbox',
            label: 'Replies',
            checked: true,
            onCheckedChange: noop,
            disabled: true,
          },
        ],
      },
      slots: { trigger: TRIGGER },
    },
  ],
})
