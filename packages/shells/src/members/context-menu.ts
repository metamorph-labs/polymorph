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
  type Expr,
  type FixtureChild,
  type Node,
  type PartShell,
} from '../dsl'

/**
 * The classes a list's rows take from their member's recipe. Menu's grammar
 * is drawn the same way by every member that shows `MenuEntry` rows, each
 * from its own stylesheet; SplitButton names its row glyph and label apart
 * from its primary's.
 */
export interface MenuRowClasses {
  glyph: string
  label: string
}

const glyph = (name: string, classes: MenuRowClasses) =>
  el('span', { class: [classes.glyph] }, [member('Icon', { name, size: lit('sm') })])

/**
 * The rows of one list, in `menu.md`'s grammar, as Menu draws them: a label, a
 * separator, a checkbox that toggles without closing, a command, and, where
 * `submenu` names the member's submenu part, a submenu. `list` names the
 * entries; `api` is the list's own menu machine.
 */
export const menuRows = (list: string, submenu: string | null, classes: MenuRowClasses): Node =>
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
              attrs: { tabindex: lit('-1') },
              on: { focus: run('api.setHighlightedValue(entry.label)') },
            },
            [
              el('span', { class: ['check'] }, [
                cond('entry.checked', [member('Icon', { name: lit('confirm'), size: lit('sm') })]),
              ]),
              el('span', { class: [classes.label] }, [text('entry.label')]),
            ],
          ),
        ],
        ...(submenu === null
          ? []
          : ["entry.kind === 'submenu'", [member(submenu, { entry: 'entry' })] as Node[]]),
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
              cond('entry.icon !== undefined', [glyph('entry.icon', classes)]),
              el('span', { class: [classes.label] }, [text('entry.label')]),
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

/**
 * A member's submenu part: a row that opens a list of its own, one level
 * deep, on a second menu machine joined to its owner's. Its `entry` is a
 * `MenuEntry` the owner renders only for a submenu, so the part reads it
 * through the submenu arm. `onKey`, when given, runs on a key in the
 * submenu's list before its machine reads the key (Menubar hands the bar to
 * the next menu from inside a submenu).
 */
export const submenuPart = (
  classes: MenuRowClasses,
  measured: Record<string, string>,
  onKey?: Expr,
): PartShell => {
  const row: Node[] = [
    cond('entry.icon !== undefined', [glyph('entry.icon', classes)]),
    el('span', { class: [classes.label] }, [text('entry.label')]),
    // An affordance, where a `kbd` hint would be: this row opens a list.
    el('span', { class: ['hint'] }, [member('Icon', { name: lit('next'), size: lit('sm') })]),
  ]
  return {
    name: 'Submenu',
    public: false,
    purpose: 'a row that opens a list of its own, one level deep',
    props: { entry: { type: 'MenuEntry' } },
    derived: { items: "entry.kind === 'submenu' ? entry.items : []" },
    machine: {
      of: 'menu',
      context: { positioning: "{ placement: 'right-start', gutter: 2 }" },
      events: {
        onSelect: {
          run: "items.forEach((item) => 'onSelect' in item && item.label === details.value && item.onSelect())",
        },
      },
    },
    // The two machines are joined once both exist: the row opens this list.
    effects: [
      { run: '(owner.api?.setChild(service), api.setParent(owner.service))' },
      { watch: 'api.highlightedValue', run: 'followHighlight(panel, api.highlightedValue)' },
      // Closing returns focus to the row that opened the list, as Radix's submenu does, when focus
      // is still in the list: a list that plays its exit keeps focus until it leaves the page.
      { watch: 'api.open', mount: false, run: 'api.open || returnFocus(row, panel)' },
    ],
    presence: { present: { open: 'api.open', ref: 'panel' } },
    template: cond("entry.kind === 'submenu'", [
      // A disabled submenu is a plain disabled row: it does not highlight, and nothing opens it.
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
            row,
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
            row,
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
                geometry: measured,
                ...(onKey === undefined ? {} : { on: { 'keydown.capture': run(onKey) } }),
                ref: 'panel',
              },
              [menuRows('items', null, classes)],
            ),
          ]),
        ]),
      ),
    ]),
  }
}

/**
 * The sheet's rows: a submenu flattens to its label and then its items, and a
 * disabled one to its label alone, as `menu.md`'s sheet cell has it.
 */
export const flattened = (list: string): string =>
  `${list}.flatMap((entry) => entry.kind === 'submenu' ? [{ kind: 'label' as const, label: entry.label }, ...(entry.disabled ? [] : entry.items)] : [entry])`

/** `open` or `closed`, for the sheet's scrim and panel, whose recipe keys pointer events on it. */
export const SHEET_STATE = "api.open ? 'open' : 'closed'"

/**
 * The bottom sheet a menu's list is drawn in below the sheet presentation's
 * threshold: a scrim that dismisses, and the flattened rows on the member's
 * own sheet list, which carries its identity.
 */
export const menuSheet = (name: string, classes: MenuRowClasses): Node[] => [
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
              attrs: { hidden: 'undefined', ...identity(name) },
              on: { focus: run('followHighlight(panel, api.highlightedValue)') },
              ref: 'panel',
            },
            [menuRows('flat', null, classes)],
          ),
        ],
      ),
    ]),
  ]),
]

/** The presences of a menu with a sheet form: the anchored panel, the sheet and its scrim. */
export const MENU_PRESENCE = {
  present: { open: 'api.open && !sheeting', ref: 'panel' },
  sheetPresent: {
    open: 'api.open && sheeting',
    ref: 'sheetPanel',
    binding: 'sheet.panel',
    sheetSide: 'bottom' as const,
  },
  scrimPresent: { open: 'api.open && sheeting', ref: 'scrim', binding: 'dialog.scrim' },
}

const ROWS: MenuRowClasses = { glyph: 'glyph', label: 'label' }

/**
 * The recipe reads the positioner's measurements under Radix's context-menu
 * names; Zag's positioner sets them as its own variables, which the list
 * inherits.
 */
const MEASURED = {
  '--radix-context-menu-content-available-height': "'var(--available-height)'",
  '--radix-context-menu-content-transform-origin': "'var(--transform-origin)'",
}

const noop = { js: '() => {}' }

/** Every entry kind in the grammar, on one surface. */
const FULL_MIX = [
  { kind: 'label', label: 'This ticket' },
  { label: 'Assign to me', icon: 'user', onSelect: noop },
  { label: 'Snooze', icon: 'time', kbd: 'S', onSelect: noop },
  { label: 'Merge into…', disabled: true, onSelect: noop },
  { kind: 'separator' },
  { kind: 'checkbox', label: 'Watching', checked: true, onCheckedChange: noop },
  { label: 'Delete', icon: 'delete', tone: 'danger', onSelect: noop },
]

/** One array used by both menus in the pairing, declared once, as the spec asks screens to do. */
const ROW_COMMANDS = [
  { label: 'Assign to me', icon: 'user', onSelect: noop },
  { label: 'Snooze', icon: 'time', onSelect: noop },
  { kind: 'separator' },
  { label: 'Archive', icon: 'archive', onSelect: noop },
]

const OVERFLOW: FixtureChild[] = [
  fx('Button', {
    variant: 'ghost',
    tone: 'neutral',
    iconOnly: true,
    icon: 'overflow',
    label: 'Ticket actions',
  }),
]

/**
 * ContextMenu (`design/components/context-menu.md`): Menu's command list,
 * opened by right-click or touch long-press at the press point. Zag's menu
 * machine owns the gesture (its context trigger), the anchoring at the point,
 * the highlighted row, typeahead and dismissal; a submenu is a second machine
 * in its own part, as in Menu.
 *
 * The surface is the caller's element inside a span with no box of its own,
 * so a wrapped row still renders as a row; the span keeps the surface's text
 * selectable, as Radix's trigger does. The panel has no trigger control, so
 * focus returns to where it was when the press began.
 *
 * Under `presentation: 'auto'`, below the sheet presentation's threshold
 * (`phone`), the list is drawn in the bottom sheet with its submenus
 * flattened, as Menu's is.
 */
export default describeMember({
  member: 'ContextMenu',
  dir: 'overlays',
  recipe: 'overlays/context-menu',
  recipes: { sheet: 'overlays/sheet' },
  uses: ['MenuEntry'],
  defaults: { presentation: lit('auto') },
  media: { phone: 'phone' },
  state: { restoreTo: 'null as HTMLElement | null' },
  derived: {
    sheeting: "presentation === 'auto' && phone",
    flat: flattened('entries'),
    // Where focus is when a gesture begins, read before the machine moves it into the list. A
    // press reads it at `pointerdown`. `contextmenu` reads it for the keyboard's menu key, which
    // no press precedes. After a press it keeps the first reading where focus is nowhere: WebKit
    // takes focus off a button on `mousedown`, before `contextmenu`.
    remember: `(pressed: boolean) => {
      const active = document.activeElement
      const focused = active instanceof HTMLElement && active !== document.body ? active : null
      restoreTo = pressed ? focused : (focused ?? restoreTo)
    }`,
  },
  machine: {
    of: 'menu',
    context: {
      // At the press point, with no offset: a pointer has no border to keep apart from.
      positioning: "{ placement: 'right-start', gutter: 0 }",
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
  // choice; a command closes a menu that is open. The surface names the menu.
  agent: {
    on: 'surface',
    state: { open: 'api.open', entries: 'menuChoices(entries)' },
    actions: {
      choose: {
        argument: 'id',
        run: 'chooseMenuEntry(entries, value) && api.open && api.setOpen(false)',
      },
    },
  },
  presence: MENU_PRESENCE,
  effects: [
    // Real focus on the highlighted row, as Radix's menus have it (see `followHighlight`).
    { watch: 'api.highlightedValue', run: 'followHighlight(panel, api.highlightedValue)' },
    // Closing returns focus to where the press began, at the next frame, after the machine's
    // own frame callbacks have run. Not on mount: nothing has closed.
    {
      watch: 'api.open',
      mount: false,
      run: 'api.open || requestAnimationFrame(() => (restoreTo?.focus(), (restoreTo = null)))',
    },
  ],
  template: [
    el(
      'span',
      {
        part: 'surface',
        class: ['surface'],
        spread: ['api.getContextTriggerProps()'],
        attrs: identity('ContextMenu'),
        ref: 'surface',
        // The machine's context trigger turns selection off for long-press; Radix's trigger
        // keeps the surface's text selectable, and so does this one.
        geometry: { 'user-select': "'auto'", '-webkit-user-select': "'auto'" },
        // In the capture phase, so the press point's focus is read before the menu takes it.
        on: {
          'contextmenu.capture': run('remember(false)'),
          'pointerdown.capture': run('remember(true)'),
        },
      },
      [slot()],
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
              attrs: { hidden: 'undefined', ...identity('ContextMenu') },
              geometry: MEASURED,
              on: { focus: run('followHighlight(panel, api.highlightedValue)') },
              ref: 'panel',
            },
            [menuRows('entries', 'ContextMenuSubmenu', ROWS)],
          ),
        ]),
      ]),
      ...menuSheet('ContextMenu', ROWS),
    ),
  ],
  parts: [submenuPart(ROWS, MEASURED)],
  states: [
    {
      name: 'closed — the surface is all there is',
      props: { entries: FULL_MIX },
      slots: {
        default: [
          fx(
            'Card',
            {},
            {
              default: [
                {
                  element: 'p',
                  children: [
                    'Login loop after password reset. Right-click for the ticket commands.',
                  ],
                },
              ],
            },
          ),
        ],
      },
      expect: { 'data-state': 'closed' },
    },
    {
      // React's entry makes a Table row the surface: Radix's trigger takes the row as its own
      // element. The shells' surface is an element of its own, and a table cannot hold one
      // around a row, so the row is a Card: the surface wraps it, and its own overflow Menu,
      // open, holds the same entries.
      name: 'the pairing — the same commands, one visible door and one faster one',
      props: { entries: ROW_COMMANDS },
      slots: {
        default: [
          fx(
            'Card',
            {},
            {
              default: [
                fx(
                  'Inline',
                  { gap: 3, align: 'center', justify: 'between' },
                  {
                    default: [
                      fx('Text', {}, { default: ['T-1041 · Login loop after password reset'] }),
                      fx('Menu', { defaultOpen: true, items: ROW_COMMANDS }, { trigger: OVERFLOW }),
                    ],
                  },
                ),
              ],
            },
          ),
        ],
      },
    },
  ],
})
