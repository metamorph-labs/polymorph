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
} from '../dsl'
import { menuRows, submenuPart, type MenuRowClasses } from './context-menu'

const ROWS: MenuRowClasses = { glyph: 'glyph', label: 'label' }

/**
 * The recipe reads the positioner's measurements under Radix's dropdown-menu
 * names, through Menu's panel class; Zag's positioner sets them as its own
 * variables, which the list inherits.
 */
const MEASURED = {
  '--radix-dropdown-menu-content-available-height': "'var(--available-height)'",
  '--radix-dropdown-menu-content-transform-origin': "'var(--transform-origin)'",
}

const noop = { js: '() => {}' }

const FILE = [
  { label: 'New', icon: 'add', kbd: '⌘N', onSelect: noop },
  { label: 'Open…', icon: 'folder', kbd: '⌘O', onSelect: noop },
  {
    kind: 'submenu',
    label: 'Open recent',
    items: [
      { label: 'Quarterly plan', onSelect: noop },
      { label: 'Launch checklist', onSelect: noop },
    ],
  },
  { kind: 'separator' },
  { label: 'Save', kbd: '⌘S', onSelect: noop },
  { label: 'Export…', icon: 'download', onSelect: noop },
  { kind: 'separator' },
  { label: 'Move to trash', icon: 'delete', tone: 'danger', onSelect: noop },
]

const EDIT = [
  { label: 'Undo', icon: 'undo', kbd: '⌘Z', onSelect: noop },
  { label: 'Redo', kbd: '⇧⌘Z', disabled: true, onSelect: noop },
  { kind: 'separator' },
  { label: 'Cut', kbd: '⌘X', onSelect: noop },
  { label: 'Copy', icon: 'copy', kbd: '⌘C', onSelect: noop },
  { label: 'Paste', kbd: '⌘V', onSelect: noop },
]

const VIEW = [
  { kind: 'label', label: 'Show' },
  { kind: 'checkbox', label: 'Ruler', checked: true, onCheckedChange: noop },
  { kind: 'checkbox', label: 'Grid', checked: false, onCheckedChange: noop },
  { kind: 'checkbox', label: 'Comments', checked: true, disabled: true, onCheckedChange: noop },
  { kind: 'separator' },
  { label: 'Zoom in', onSelect: noop },
  { label: 'Zoom out', onSelect: noop },
]

const HELP = [
  { label: 'Keyboard shortcuts', icon: 'help', onSelect: noop },
  { label: 'Send feedback', icon: 'comment', onSelect: noop },
]

const MENUS = [
  { label: 'File', entries: FILE },
  { label: 'Edit', entries: EDIT },
  { label: 'View', entries: VIEW },
  { label: 'Help', entries: HELP },
]

const WITH_DISABLED = [
  { label: 'File', entries: FILE },
  { label: 'Edit', entries: EDIT },
  { label: 'Insert', disabled: true, entries: [{ label: 'Table', onSelect: noop }] },
  { label: 'View', entries: VIEW },
  { label: 'Help', entries: HELP },
]

const LONG = [
  'File',
  'Edit',
  'View',
  'Insert',
  'Format',
  'Arrange',
  'Tools',
  'Table',
  'Window',
  'Help',
].map((label) => ({ label, entries: [{ label: `${label} settings`, onSelect: noop }] }))

/** Whether this title's menu is the open one. */
const OPEN = 'api.open && api.triggerValue === menu.label'

/**
 * Menubar (`design/components/menubar.md`): an application's command menus in
 * one row.
 *
 * The bar is one Zag menu machine with a trigger per title (the machine's
 * `triggerValue`), so one menu is open at most, a press on another title
 * moves the open menu to it, and the panel holds the open title's entries.
 * The rows are Menu's, drawn by Menu's row grammar with Menu's recipe classes
 * through the bar's own recipe, and a submenu is a second machine in its own
 * part, as in Menu.
 *
 * The bar's keys, its tab stop and the hand-off between neighbouring menus are
 * the engine's menubar model, which the React member runs too: a title moves
 * along the row with `roveMenubar`, the machine opens it on the keys that
 * open a menu, and a key in the panel or a submenu hands the bar over with
 * `menubarNeighbour`. Below the sheet presentation's threshold (`phone`) the
 * bar is one Menu behind one Button, its entries from `menubarEntries`.
 */
export default describeMember({
  member: 'Menubar',
  dir: 'overlays',
  recipe: 'overlays/menubar',
  uses: ['MenuEntry'],
  types: {
    MenubarMenu: '{ label: string; entries: MenuEntry[]; disabled?: boolean }',
  },
  media: { phone: 'phone' },
  // The title focus was last on, which holds the bar's one tab stop.
  state: { last: '(defaultOpen ?? null) as string | null' },
  derived: {
    stop: 'menubarStop(menus, last)',
    // The open title's entries: the one panel draws whichever menu is open.
    entries: 'menus.find((menu) => menu.label === api.triggerValue)?.entries ?? []',
    collapsed: 'menubarEntries(menus)',
    // A key in the panel or in a submenu (`child`, the submenu's machine): the neighbour the bar
    // hands over to opens, with its first enabled row highlighted once its rows are drawn.
    handOff: `(event: KeyboardEvent, child?: { setOpen(open: boolean): void }): void => {
      const to = menubarNeighbour(event, bar, panel)
      const next = to === undefined ? undefined : menus[to]
      if (next === undefined) return
      event.preventDefault()
      event.stopPropagation()
      child?.setOpen(false)
      api.setTriggerValue(next.label)
      afterRender(() => {
        const first = menubarEdge(panel, 'first')?.getAttribute('data-value')
        if (first) api.setHighlightedValue(first)
      })
    }`,
    // The desktop convention: while one menu is open, the title a mouse moves onto opens its own.
    // A touch has no hover, so a tap opens a title as a press does.
    hover: `(event: Event, menu: MenubarMenu): void => {
      if (!(event instanceof PointerEvent) || event.pointerType !== 'mouse') return
      if (menu.disabled === true) return
      if (!api.open || api.triggerValue === menu.label) return
      api.setTriggerValue(menu.label)
      // The machine reads an empty value as no row, so the last menu's row is not carried over.
      api.setHighlightedValue('')
    }`,
  },
  machine: {
    of: 'menu',
    context: {
      defaultOpen: 'defaultOpen !== undefined',
      defaultTriggerValue: 'defaultOpen',
      // Under its title, at its start edge, two pixels off: Menu's anchored-surface seam.
      positioning: "{ placement: 'bottom-start', gutter: 2 }",
    },
    events: {
      // Commands run from the machine's selection, found by label in the open menu; a checkbox
      // reports through its own callback, and a submenu's commands through its own machine.
      onSelect: {
        run: "entries.forEach((entry) => 'onSelect' in entry && entry.label === details.value && entry.onSelect())",
      },
    },
  },
  provide: { api: 'api', service: 'service', handOff: 'handOff' },
  // The spec's `agent` fence. An agent chooses an entry by its id, which begins with its title,
  // without opening its menu, and the entry's own `onSelect` (or a checkbox entry's
  // `onCheckedChange`) runs, as for a person's choice; a command closes the menu that is open,
  // and so does `close`. The bar names the menubar.
  agent: {
    on: 'bar',
    state: { open: 'api.open', entries: 'menubarChoices(menus)' },
    actions: {
      choose: {
        argument: 'id',
        run: 'chooseMenubarEntry(menus, value) && api.open && api.setOpen(false)',
      },
      close: 'api.open && api.setOpen(false)',
    },
  },
  presence: { present: { open: 'api.open && !phone', ref: 'panel' } },
  effects: [
    // Real focus on the highlighted row, as Radix's menus have it (see `followHighlight`).
    { watch: 'api.highlightedValue', run: 'followHighlight(panel, api.highlightedValue)' },
    // The tab stop follows the open title, which a press opens without focusing it.
    {
      watch: 'api.triggerValue',
      mount: false,
      run: 'api.triggerValue && (last = api.triggerValue)',
    },
  ],
  template: cond(
    'phone',
    [
      // A phone has no room for the row: one Menu behind one Button, each menu a group.
      el('div', { class: ['collapsed'], attrs: identity('Menubar') }, [
        member(
          'Menu',
          { items: 'collapsed' },
          {
            slots: {
              trigger: [
                member('Button', {
                  variant: lit('ghost'),
                  tone: lit('neutral'),
                  iconOnly: 'true',
                  icon: lit('overflow'),
                  label: 'label',
                }),
              ],
            },
          },
        ),
      ]),
    ],
    [
      el(
        'div',
        {
          part: 'bar',
          class: ['bar'],
          attrs: { role: lit('menubar'), 'aria-label': 'label', ...identity('Menubar') },
          ref: 'bar',
        },
        [
          each('menus', 'menu', 'menu.label', [
            el(
              'button',
              {
                part: 'title',
                class: ['title'],
                spread: ['api.getTriggerProps({ value: menu.label })'],
                attrs: {
                  role: lit('menuitem'),
                  'data-menubar-part': lit('title'),
                  // The machine's state is the bar's; each title is open only while its menu is.
                  'data-state': `${OPEN} ? 'open' : 'closed'`,
                  'aria-expanded': OPEN,
                  'aria-controls': `${OPEN} ? api.getContentProps().id : undefined`,
                  disabled: 'menu.disabled === true',
                  'data-disabled': flag('menu.disabled === true'),
                  tabindex: 'menu.label === stop ? 0 : -1',
                },
                on: {
                  keydown: run('roveMenubar($event)'),
                  pointerenter: run('hover($event, menu)'),
                  focus: run('last = menu.label'),
                },
              },
              [text('menu.label')],
            ),
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
                spread: ['api.getContentProps()'],
                attrs: {
                  hidden: 'undefined',
                  'data-menubar-part': lit('panel'),
                  ...identity('Menubar'),
                },
                geometry: MEASURED,
                on: {
                  // The machine focuses the list; focus goes on to the highlighted row.
                  focus: run('followHighlight(panel, api.highlightedValue)'),
                  // Before the machine reads the key, so an arrow that hands the bar over is
                  // not also a move inside the list.
                  'keydown.capture': run('handOff($event)'),
                },
                ref: 'panel',
              },
              [menuRows('entries', 'MenubarSubmenu', ROWS)],
            ),
          ]),
        ]),
      ),
    ],
  ),
  // The owner's hand-off has no type outside the member, so the part checks it is a function.
  parts: [
    submenuPart(
      ROWS,
      MEASURED,
      "typeof owner.handOff === 'function' && owner.handOff($event, api)",
    ),
  ],
  states: [
    {
      name: 'resting — the titles, and no menu open',
      props: { label: 'Document', menus: MENUS },
    },
    {
      name: 'one menu open — its panel under its title, at its start edge',
      props: { label: 'Document', menus: MENUS, defaultOpen: 'File' },
    },
    {
      name: 'checkbox entries — toggles that leave the menu open',
      props: { label: 'Document', menus: MENUS, defaultOpen: 'View' },
    },
    {
      name: 'a disabled title — passed over by the keys',
      props: { label: 'Document', menus: WITH_DISABLED },
    },
    {
      name: 'a long row in a narrow box — the row scrolls inside it',
      many: {
        within: { element: 'div', class: ['harness'] },
        each: [{ props: { label: 'Document', menus: LONG } }],
      },
    },
  ],
})
