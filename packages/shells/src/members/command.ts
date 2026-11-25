import {
  cond,
  describeMember,
  each,
  el,
  flag,
  fx,
  held,
  hold,
  identity,
  js,
  lit,
  member,
  portal,
  run,
  text,
  type FixtureValue,
  type Node,
  type StateEntry,
} from '../dsl'

const noop = js('() => {}')

const FLAT: FixtureValue[] = [
  { id: 'new', label: 'New ticket', icon: 'add', hint: 'N', onSelect: noop },
  { id: 'search', label: 'Search tickets', icon: 'search', onSelect: noop },
  { id: 'assign', label: 'Assign to me', icon: 'user', onSelect: noop },
  { id: 'archive', label: 'Archive ticket', icon: 'archive', onSelect: noop },
]

const GROUPED: FixtureValue[] = [
  { id: 'new', label: 'New ticket', icon: 'add', hint: 'N', group: 'Tickets', onSelect: noop },
  {
    id: 'assign',
    label: 'Assign to me',
    icon: 'user',
    group: 'Tickets',
    keywords: ['owner', 'mine'],
    onSelect: noop,
  },
  { id: 'theme', label: 'Switch theme', icon: 'mode-dark', group: 'Workspace', onSelect: noop },
  {
    id: 'settings',
    label: 'Open settings',
    icon: 'settings',
    hint: ',',
    group: 'Workspace',
    onSelect: noop,
  },
]

const WITH_DISABLED: FixtureValue[] = [
  { id: 'new', label: 'New ticket', icon: 'add', onSelect: noop },
  { id: 'merge', label: 'Merge tickets', icon: 'duplicate', disabled: true, onSelect: noop },
]

/**
 * The application's side of a palette, as React's fixture `Launcher` is: the
 * entry holds `open`, a Button opens the palette, and the palette reports
 * every change back. The app owns the ⌘K binding and the open state, so a
 * palette with no way in or out would leave out the part an application writes.
 */
const launched = (
  label: string,
  props: Record<string, FixtureValue>,
  opened = false,
): Omit<StateEntry, 'name'> => ({
  holds: { open: opened },
  before: [
    fx('Button', { variant: 'outline', tone: 'neutral', label, onClick: hold('open', true) }),
  ],
  props: { ...props, open: held('open'), onOpenChange: hold('open') },
})

/** One command row: its glyph, its label and its hint. The label alone names the option. */
const row = (item: string): Node =>
  el(
    'li',
    {
      part: 'item',
      class: ['item'],
      // The highlight stays where the pointer left it, as React Aria's focused key does.
      spread: [`api.getItemProps({ item: ${item}, persistFocus: true })`],
      attrs: { 'aria-labelledby': `\`\${uid}-label-\${${item}.id}\`` },
    },
    [
      cond(`${item}.icon !== undefined`, [
        el('span', { class: ['glyph'] }, [
          member('Icon', { name: `${item}.icon`, size: lit('sm') }),
        ]),
      ]),
      el('span', { class: ['label'], attrs: { id: `\`\${uid}-label-\${${item}.id}\`` } }, [
        text(`${item}.label`),
      ]),
      cond(`${item}.hint !== undefined`, [
        el('span', { class: ['hint'] }, [
          member('Kbd', {}, { slots: { default: [text(`${item}.hint`)] } }),
        ]),
      ]),
    ],
  )

/**
 * The rows of a query's results. Each row is keyed on the query as well as on
 * its command, so a committed query mounts new rows and the recipe's cascade
 * runs again, while the arrow keys only move the highlight.
 */
const rows = (of: string): Node => each(of, 'item', '`${query}/${item.id}`', [row('item')])

/**
 * Command (`design/components/command.md`): the command palette, a searchable
 * list of the product's actions in a modal panel.
 *
 * Composed as the React member is: Zag's dialog machine owns modality (the
 * focus trap, Escape, the press outside, focus return and the page hidden
 * beneath), and the panel's own part runs Zag's combobox machine for the
 * field, the filtered listbox and `aria-activedescendant`. The listbox is the
 * panel, so it is held open, and the combobox keeps no dismissal of its own:
 * one layer, the dialog's, closes the palette.
 *
 * Escape follows the APG order: it clears a query that is not empty and keeps
 * the palette open, and closes it when the query is empty. The dialog hears
 * Escape first, on the document, and is held open while the field reports a
 * query; the field then clears itself.
 *
 * The panel part mounts with the panel and unmounts after its exit, so each
 * opening starts from an empty query and the first command highlighted.
 */
export default describeMember({
  member: 'Command',
  dir: 'overlays',
  recipe: 'overlays/command',
  types: {
    CommandItem:
      '{ id: string; label: string; icon?: IconRole; hint?: string; group?: string; keywords?: string[]; disabled?: boolean; onSelect: () => void }',
  },
  defaults: {
    placeholder: lit('Type a command…'),
    label: lit('Command palette'),
    escapeHint: lit('esc'),
    filter: lit('contains'),
    loading: 'false',
    emptyMessage: lit('No results'),
    closeOnSelect: 'true',
  },
  // The field's text, as the panel reports it, for the Escape that closes.
  state: { query: "''" },
  machine: {
    of: 'dialog',
    context: {
      open: 'open',
      // The panel's name; no title is rendered, so nothing else names it.
      'aria-label': 'label',
      // Escape closes the palette only when the query is empty; the field clears a query itself.
      onEscapeKeyDown: "(event) => query !== '' && event.preventDefault()",
    },
    events: { onOpenChange: { emit: 'openChange', payload: 'details.open' } },
  },
  // The spec's `agent` fence. An agent chooses a command by its id, open or not, and the
  // command's own `onSelect` runs; a palette that is open then closes unless it chains. A close
  // asks the app through `openChange`. The panel names the palette, and a closed palette has none;
  // the query is the field's, empty while closed.
  agent: {
    on: 'panel',
    state: {
      open: 'api.open',
      items:
        'items.map((item) => ({ id: item.id, label: item.label, ...(item.disabled === true ? { disabled: true } : {}) }))',
      query: "api.open ? query : ''",
    },
    actions: {
      choose: {
        argument: 'id',
        run: '(items.find((item) => item.id === value)?.onSelect(), api.open && closeOnSelect && api.setOpen(false))',
      },
      close: 'api.open && api.setOpen(false)',
    },
  },
  presence: {
    scrimPresent: { open: 'api.open', ref: 'scrim', binding: 'dialog.scrim' },
    // The panel opens below its place, centred, so it grows from its top edge, as the React
    // member's surface takes `side` and `align`.
    panelPresent: {
      open: 'api.open',
      ref: 'panel',
      binding: 'command.panel',
      side: 'bottom',
      align: 'center',
    },
  },
  template: portal(
    cond('scrimPresent', [
      el('div', {
        part: 'scrim',
        class: ['scrim'],
        spread: ['api.getBackdropProps()'],
        // Present through the exit, which `hidden` would cut short.
        attrs: { hidden: 'undefined' },
        ref: 'scrim',
      }),
    ]),
    // The palette sits high, so results grow downward into free space instead of moving it.
    cond('panelPresent', [
      el('div', { class: ['positioner'], spread: ['api.getPositionerProps()'] }, [
        el(
          'div',
          {
            part: 'panel',
            class: ['panel'],
            spread: ['api.getContentProps()'],
            attrs: {
              hidden: 'undefined',
              'aria-describedby': 'undefined',
              'data-loading': flag('loading'),
              ...identity('Command'),
            },
            ref: 'panel',
          },
          [
            member(
              'CommandPanel',
              {
                items: 'items',
                placeholder: 'placeholder',
                escapeHint: 'escapeHint',
                filter: 'filter',
                loading: 'loading',
                emptyMessage: 'emptyMessage',
              },
              {
                on: {
                  queryChange: run('query = $event'),
                  // A command ran: the palette closes unless it chains.
                  command: run('closeOnSelect && api.setOpen(false)'),
                },
              },
            ),
          ],
        ),
      ]),
    ]),
  ),
  parts: [
    {
      name: 'Panel',
      public: false,
      purpose:
        'the search row, the listbox and the status inside the palette, mounted with the panel so each opening starts from an empty query',
      props: {
        items: { type: 'CommandItem[]' },
        placeholder: { type: 'string' },
        escapeHint: { type: 'string' },
        filter: { type: "'contains' | false" },
        loading: { type: 'boolean' },
        emptyMessage: { type: 'string' },
        onQueryChange: { type: '(query: string) => void', optional: true },
        onCommand: { type: '() => void', optional: true },
      },
      // The text the list is filtered by, as the machine reports it.
      state: { query: "''" },
      derived: {
        collator: "new Intl.Collator(undefined, { usage: 'search', sensitivity: 'base' })",
        needle: "query.normalize('NFC')",
        // React Aria's `contains` at base sensitivity: the label and the keywords, which are
        // matched and never shown.
        matches:
          "(item: CommandItem) => ((text: string) => needle === '' || Array.from({ length: Math.max(0, text.length - needle.length + 1) }, (_, at) => text.slice(at, at + needle.length)).some((part) => collator.compare(part, needle) === 0))((item.keywords === undefined ? item.label : `${item.label} ${item.keywords.join(' ')}`).normalize('NFC'))",
        // `false` means the app filters, so its list is shown as it is.
        shown: 'filter === false ? items : items.filter((item) => matches(item))',
        // The list in the author's order: a run of items sharing a group is one group, and an
        // ungrouped item stands alone. Re-sorting would decide which commands matter.
        runs: 'shown.reduce((into, item) => (item.group !== undefined && into.at(-1)?.[0]?.group === item.group ? into.at(-1)?.push(item) : into.push([item]), into), [] as CommandItem[][])',
        firstEnabled: 'shown.find((item) => item.disabled !== true)?.id',
        showEmpty: '!loading && shown.length === 0',
        // The only live region: loading, the count and the empty message.
        announcement:
          "loading ? 'Loading commands…' : shown.length === 0 ? emptyMessage : `${shown.length} commands`",
      },
      machine: {
        of: 'combobox',
        context: {
          collection:
            'zag.collection({ items: shown, itemToValue: (item) => item.id, itemToString: (item) => item.label, isItemDisabled: (item) => item.disabled === true })',
          // The listbox is the panel: always open, with no dismissal of its own.
          open: 'true',
          disableLayer: 'true',
          // No stored selection: an item is a command, and a command runs twice.
          value: '[]',
          closeOnSelect: 'false',
          // The query stays after a command runs, for a palette that chains.
          selectionBehavior: "'preserve' as const",
          allowCustomValue: 'true',
          inputBehavior: "'autohighlight' as const",
          placeholder: 'placeholder',
        },
        events: {
          onInputValueChange: {
            run: "((query = details.inputValue), emit('queryChange', details.inputValue))",
          },
          onSelect: {
            run: "(items.find((item) => item.id === details.itemValue)?.onSelect(), emit('command'))",
          },
        },
      },
      effects: [
        // The palette hears this panel's query from its first render.
        { run: "emit('queryChange', query)" },
        // An item is always highlighted, so Enter runs the top match without an arrow key first.
        {
          watch: 'api.highlightedValue ?? firstEnabled',
          run: 'api.highlightedValue === null && firstEnabled !== undefined && api.setHighlightValue(firstEnabled)',
        },
      ],
      template: [
        el('div', { part: 'search', class: ['search'] }, [
          member('Icon', { name: lit('search'), size: lit('md') }),
          el('input', {
            part: 'input',
            class: ['input'],
            spread: ['api.getInputProps()'],
            attrs: { 'aria-label': 'placeholder' },
            // The dialog held itself open for a query; Escape clears it here, unless an input
            // method is handling the key (`composingKey`).
            on: {
              keydown: run(
                "api.setInputValue('')",
                "$event.key === 'Escape' && !composingKey($event)",
              ),
            },
          }),
          member('Kbd', {}, { slots: { default: [text('escapeHint')] } }),
        ]),
        el('div', { part: 'body', class: ['body'], attrs: { 'data-dialog-part': lit('body') } }, [
          el(
            'ul',
            {
              part: 'list',
              class: ['listbox'],
              spread: ['api.getContentProps()'],
              // Named as React Aria names a combobox's listbox, in English, which React Aria
              // localizes; no label element exists for the machine's reference.
              attrs: {
                hidden: 'undefined',
                'aria-labelledby': 'undefined',
                'aria-label': lit('Suggestions'),
              },
            },
            [
              each(
                'runs',
                'run',
                "run.map((item) => item.id).join(' ')",
                [
                  cond(
                    'run[0]?.group === undefined',
                    [rows('run')],
                    [
                      // Menu's group label, and the group it names.
                      el('li', { class: ['section'], attrs: { role: lit('presentation') } }, [
                        el(
                          'span',
                          {
                            class: ['groupLabel'],
                            spread: ['api.getItemGroupLabelProps({ htmlFor: `${at}` })'],
                          },
                          [text('run[0]?.group')],
                        ),
                        el(
                          'ul',
                          {
                            class: ['group'],
                            spread: ['api.getItemGroupProps({ id: `${at}` })'],
                          },
                          [rows('run')],
                        ),
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
              each('[0, 1, 2]', 'skeleton', 'skeleton', [
                el('div', { class: ['row'] }, [member('Skeleton', { textStep: lit('sm') })]),
              ]),
            ]),
          ]),
          // Heard once, through the status region, so the visible row is hidden from it.
          cond('showEmpty', [
            el('div', { class: ['empty'], attrs: { 'aria-hidden': lit('true') } }, [
              text('emptyMessage'),
            ]),
          ]),
        ]),
        el(
          'div',
          { class: ['status'], attrs: { role: lit('status'), 'aria-live': lit('polite') } },
          [text('announcement')],
        ),
      ],
    },
  ],
  states: [
    { name: 'open', ...launched('Open the palette', { items: FLAT }, true) },
    {
      // Command takes no query prop, because the query is the reader's: the entry types it
      // into the field once the panel is up, as a reader would.
      name: 'open with a query — the results narrowed, Escape clears before it closes',
      ...launched('Open the palette', { placeholder: 'Search the commands…', items: FLAT }, true),
      types: {
        into: '[data-member="command"] input[placeholder="Search the commands…"]',
        text: 'ticket',
      },
    },
    {
      name: 'closed — the launcher is all there is',
      ...launched('Open the palette', { items: FLAT }),
    },
    { name: 'groups', ...launched('Grouped commands', { items: GROUPED }) },
    { name: 'with hints and icons', ...launched('Hints and icons', { items: FLAT }) },
    { name: 'loading', ...launched('Loading commands', { loading: true, items: [] }) },
    {
      name: 'empty',
      ...launched('No commands', { items: [], emptyMessage: 'No matching commands' }),
    },
    {
      name: 'a disabled command',
      ...launched('With a disabled command', { items: WITH_DISABLED }),
    },
    {
      name: 'chaining — the palette stays open',
      ...launched('Chained commands', { closeOnSelect: false, items: FLAT }),
    },
  ],
})
