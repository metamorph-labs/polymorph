import {
  cond,
  describeMember,
  el,
  emit,
  flag,
  fx,
  held,
  hold,
  identity,
  lit,
  member,
  run,
  slot,
  text,
  type FixtureChild,
} from '../dsl'

/*
 * The grid keyboard model: the roving-grid pattern a Table opts into with
 * `grid` (`design/components/data-table.md`, "Keyboard — the grid model"), as
 * the React member's `grid-keyboard.ts` writes it. The table has one tab stop,
 * and the arrow keys, Home and End move it between cells.
 *
 * It is written here, in the description's scope, rather than as an engine
 * helper, because it reads and writes the DOM: the table's rows and cells, the
 * focused element, and `tabindex`. The stop is set on the DOM and never
 * rendered, so a held arrow key re-renders no row. The position is held in
 * `at` and re-derived from wherever focus lands, so a click and a key end in
 * the same state. Nothing here touches roles: in a grid table a `<td>` is
 * already a `gridcell` and a `<tr>` a `row`.
 *
 * A detail row (`tr[data-detail]`, DataTable's `rowDetail`) has one cell across
 * every column, and the arrow keys reach it as they reach a cell of text:
 * ArrowDown from a cell of the row above it, ArrowUp from a cell of the row
 * below. A position's row counts the rows that are not a detail, and a detail
 * is found from the row it follows. The detail cell takes the stop itself. No
 * `tabindex` is written on what it holds, so its controls stay in the page's
 * tab order, and a key pressed in one of them is that control's own.
 */

/** The controls a cell can hold: a checkbox or a sort button in practice. */
const WIDGETS = 'button, a[href], input, select, textarea'

/** Text fields keep their arrow keys and Home for the caret. No member puts one in a cell. */
const TEXT_ENTRY = 'input:not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable]'

/**
 * A cell's position: its row's index among the grid's rows and its own index in the row.
 * With `detail` the stop is on the detail cell under the row, and `column` is the column
 * the reader came from, which ArrowDown and ArrowUp return to.
 */
const AT = '{ row: number; column: number; detail: boolean }'

/**
 * What a member puts in a cell that only names its column: the name is announced and not
 * drawn (DataTable's expansion column).
 */
const UNDRAWN = '[data-undrawn]'

/** The table element, which the helpers read through its ref. */
const TABLE = 'const element = table as HTMLTableElement | null'

/* -------------------------------------------------------------------------- */
/* The states fixture                                                          */
/* -------------------------------------------------------------------------- */

interface Ticket {
  id: string
  subject: string
  status: 'Open' | 'Waiting' | 'Closed'
  replies: number
}

const TICKETS: readonly Ticket[] = [
  { id: 'T-1041', subject: 'Login loop after password reset', status: 'Open', replies: 4 },
  { id: 'T-1039', subject: 'Invoice shows the wrong currency', status: 'Waiting', replies: 12 },
  { id: 'T-1032', subject: 'Export finishes but the file is empty', status: 'Open', replies: 2 },
  { id: 'T-1027', subject: 'Cannot invite a teammate', status: 'Closed', replies: 7 },
]

const TONE = { Open: 'accent', Waiting: 'warning', Closed: 'neutral' } as const

const cell = (children: readonly FixtureChild[] = [], numeric = false): FixtureChild =>
  fx(
    'TableCell',
    numeric ? { numeric: true } : {},
    children.length > 0 ? { default: children } : undefined,
  )

const rows = (interactive = false, selectedId?: string, picks = false): FixtureChild[] =>
  TICKETS.map((ticket, at) =>
    fx(
      'TableRow',
      picks
        ? { interactive, selected: held(`picked${at}`), onClick: hold(`picked${at}`, true) }
        : { interactive, selected: ticket.id === selectedId },
      {
        default: [
          cell([ticket.id]),
          cell([ticket.subject]),
          cell([fx('Badge', { tone: TONE[ticket.status] }, { default: [ticket.status] })]),
          cell([String(ticket.replies)], true),
        ],
      },
    ),
  )

const header = (label: string): FixtureChild => fx('TableHeader', {}, { default: [label] })

const headers = (sortDirection?: 'asc' | 'desc'): FixtureChild =>
  fx(
    'TableRow',
    {},
    {
      default: [
        header('Ticket'),
        header('Subject'),
        header('Status'),
        fx(
          'TableHeader',
          { numeric: true, sortable: true, ...(sortDirection ? { sortDirection } : {}) },
          { default: ['Replies'] },
        ),
      ],
    },
  )

/** A head, a body and anything after them, as the React fixture composes each entry. */
const composed = (
  body: readonly FixtureChild[],
  { sortDirection, after = [] }: { sortDirection?: 'asc' | 'desc'; after?: FixtureChild[] } = {},
) => ({
  default: [
    fx('TableHead', {}, { default: [headers(sortDirection)] }),
    fx('TableBody', {}, { default: body }),
    ...after,
  ],
})

/**
 * Table (`design/components/table.md`): a styled native table, composed from
 * its parts. A caller's `Table.Row` is a `<tr>` and `Table.Cell` a `<td>`, so
 * assistive tech reads a real table. With `grid` it is DataTable's grid: one
 * tab stop, the arrow keys between cells, and rows that carry `aria-selected`.
 */
export default describeMember({
  member: 'Table',
  dir: 'structure',
  recipe: 'structure/table',
  uses: ['TableCellProps', 'TableHeaderProps', 'TableRowProps'],
  types: {
    CellProps: 'TableCellProps',
    HeaderProps: 'TableHeaderProps',
    RowProps: 'TableRowProps',
    SortDirection: "'asc' | 'desc'",
  },
  defaults: {
    stickyHeader: 'false',
    grid: 'false',
    multiselectable: 'false',
    captionVisible: 'false',
  },
  state: {
    overflowing: 'false',
    at: '{ row: 0, column: 0, detail: false }',
    // Whether focus or a key has placed the stop. Until then it is where the grid starts.
    placed: 'false',
  },
  derived: {
    // Where the stop goes in a cell, per the APG: its one enabled control, so reaching a
    // checkbox and pressing Space is one action, else the cell itself, so its text can be
    // read. A hidden form mirror is `aria-hidden` and is skipped.
    stopIn: `(cell: HTMLTableCellElement): HTMLElement => { for (const node of Array.from(cell.querySelectorAll<HTMLElement>('${WIDGETS}'))) { if (node.hasAttribute('disabled') || node.getAttribute('aria-hidden') === 'true') continue; return node } return cell }`,
    // The grid's rows, in order: every row of the table that is not a detail row.
    gridRows: `(element: HTMLTableElement): HTMLTableRowElement[] => Array.from(element.rows).filter((row) => !row.hasAttribute('data-detail'))`,
    // The detail cell under a grid row, or `null`. A detail row directly follows its row.
    detailUnder: `(row: HTMLTableRowElement | undefined): HTMLTableCellElement | null => { const next = row?.nextElementSibling; return next instanceof HTMLTableRowElement && next.hasAttribute('data-detail') ? (next.cells[0] ?? null) : null }`,
    // The grid's cell an event came from, or `null`. The nearest cell may belong to a table
    // inside a detail, so the search climbs to a cell of this table. Inside a detail only the
    // detail cell itself is the grid's: what it holds keeps its own focus and its own keys.
    gridCellOf: `(element: HTMLTableElement, target: EventTarget | null): HTMLTableCellElement | null => { let cell = target instanceof HTMLElement ? target.closest<HTMLTableCellElement>('th, td') : null; while (cell !== null && cell.closest('table') !== element) { cell = cell.parentElement?.closest<HTMLTableCellElement>('th, td') ?? null } if (cell === null || cell.parentElement === null) return null; return cell.parentElement.hasAttribute('data-detail') && cell !== target ? null : cell }`,
    // A cell's position among the grid's rows. A detail cell has its row's, and keeps the
    // column the stop was in.
    positionOf: `(element: HTMLTableElement, cell: HTMLTableCellElement, column: number): ${AT} => { const row = cell.parentElement as HTMLTableRowElement; const rows = gridRows(element); return row.hasAttribute('data-detail') ? { row: rows.indexOf(row.previousElementSibling as HTMLTableRowElement), column, detail: true } : { row: rows.indexOf(row), column: cell.cellIndex, detail: false } }`,
    // A position that names a cell that exists, or `null` when the table has none. A detail
    // that closed leaves the stop on its row, in the column it came from.
    clampCell: `(element: HTMLTableElement, to: ${AT}): ${AT} | null => { const rows = gridRows(element); const row = Math.min(Math.max(to.row, 0), rows.length - 1); const cells = rows[row]?.cells; if (cells === undefined || cells.length === 0) return null; return { row, column: Math.min(Math.max(to.column, 0), cells.length - 1), detail: to.detail && row === to.row && detailUnder(rows[row]) !== null } }`,
    // Where the stop is before the reader has placed it: the first cell of the first row that
    // draws something. A cell that only names its column is passed, because a tab stop on a
    // cell that shows nothing gives a sighted reader no place. The arrow keys still reach it.
    startOf: `(element: HTMLTableElement): ${AT} => { const cells = Array.from(gridRows(element)[0]?.cells ?? []); const column = cells.findIndex((cell) => cell.querySelector('${UNDRAWN}') === null); return { row: 0, column: Math.max(column, 0), detail: false } }`,
    // The stop's position: where the reader placed it, else where the grid starts.
    whereIn: `(element: HTMLTableElement): ${AT} => (placed ? at : startOf(element))`,
    // The element that holds the stop at a position.
    stopAt: `(element: HTMLTableElement, to: ${AT}): HTMLElement | null => { const row = gridRows(element)[to.row]; if (to.detail) return detailUnder(row); const cell = row?.cells[to.column]; return cell === undefined ? null : stopIn(cell) }`,
    // Moves the stop: exactly one `tabindex="0"` in the grid, every other cell reachable and
    // not tabbable. When a control holds a cell's stop, the cell holds none, or Tab would
    // stop twice in one place. The detail cell takes the stop itself, whatever it holds. The
    // attribute is compared before it is written, so a cell already in place is left alone.
    rove: `(element: HTMLTableElement, to: ${AT}) => { at = to; for (const [index, row] of gridRows(element).entries()) { for (const cell of Array.from(row.cells)) { const stop = stopIn(cell); const wanted = !to.detail && index === to.row && cell.cellIndex === to.column ? '0' : '-1'; if (stop !== cell && cell.getAttribute('tabindex') !== '-1') cell.setAttribute('tabindex', '-1'); if (stop.getAttribute('tabindex') !== wanted) stop.setAttribute('tabindex', wanted) } const under = detailUnder(row); const held = to.detail && index === to.row ? '0' : '-1'; if (under !== null && under.getAttribute('tabindex') !== held) under.setAttribute('tabindex', held) } }`,
    // Focus says where the current cell is, so a click and a key end in the same state.
    focusIn: `(event: FocusEvent) => { ${TABLE}; if (element === null) return; const cell = gridCellOf(element, event.target); if (cell === null) return; const to = clampCell(element, positionOf(element, cell, whereIn(element).column)); if (to === null) return; placed = true; rove(element, to) }`,
    // The arrows are physical, so which one moves to the next cell follows the writing
    // direction. The grid takes its keys even at an edge, so a held ArrowDown on the last
    // row stays there instead of scrolling the page. Ctrl or Meta with Home or End reaches
    // the grid's first or last cell. ArrowDown from an open row reaches its detail before the
    // next row. A detail cell is one cell across every column, so the keys that move along a
    // row stay in it. ArrowUp and ArrowDown leave it, and so do Home and End with Ctrl or
    // Meta, which name a cell of the grid. A key pressed in what a detail holds is its own.
    keyDown: `(event: KeyboardEvent) => { ${TABLE}; const target = event.target instanceof HTMLElement ? event.target : null; if (element === null || target === null || target.closest('${TEXT_ENTRY}') !== null) return; const cell = gridCellOf(element, target); if (cell === null) return; const rows = gridRows(element); const here = positionOf(element, cell, whereIn(element).column); const forward = getComputedStyle(element).direction === 'rtl' ? -1 : 1; const far = event.ctrlKey || event.metaKey; const last = Number.MAX_SAFE_INTEGER; let next: ${AT} | null; if (here.detail) { switch (event.key) { case 'ArrowDown': next = here.row + 1 < rows.length ? { ...here, row: here.row + 1, detail: false } : null; break; case 'ArrowUp': next = { ...here, detail: false }; break; case 'ArrowRight': case 'ArrowLeft': next = null; break; case 'Home': next = far ? { row: 0, column: 0, detail: false } : null; break; case 'End': next = far ? { row: last, column: last, detail: false } : null; break; default: return } } else { switch (event.key) { case 'ArrowRight': next = { ...here, column: here.column + forward }; break; case 'ArrowLeft': next = { ...here, column: here.column - forward }; break; case 'ArrowDown': next = detailUnder(rows[here.row]) !== null ? { ...here, detail: true } : { ...here, row: here.row + 1 }; break; case 'ArrowUp': next = detailUnder(rows[here.row - 1]) !== null ? { ...here, row: here.row - 1, detail: true } : { ...here, row: here.row - 1 }; break; case 'Home': next = far ? { row: 0, column: 0, detail: false } : { ...here, column: 0 }; break; case 'End': next = far ? { row: last, column: last, detail: false } : { ...here, column: last }; break; default: return } } event.preventDefault(); const to = next === null ? null : clampCell(element, next); if (to === null) return; placed = true; rove(element, to); stopAt(element, to)?.focus() }`,
    // Sorting, paging and loading replace rows, and a stop on a removed cell would leave the
    // table with none. Clamping again also covers a shorter last page.
    reclamp: `() => { ${TABLE}; if (element === null || !grid) return; const to = clampCell(element, whereIn(element)); if (to !== null) rove(element, to) }`,
  },
  effects: [
    // The wrapper is a tab stop only while it overflows, because a tab stop with nothing to
    // scroll is worse than none. Its size and the table's both change whether it does.
    {
      run: 'overflowing = wrapper !== null && wrapper.scrollWidth > wrapper.clientWidth',
      resize: ['wrapper', 'wrapper?.firstElementChild'],
    },
    // Again when rows are replaced, and when a cell's control is disabled or enabled, which
    // moves the cell's stop between the control and the cell.
    { run: 'reclamp()', watch: 'grid', mutation: ['table'], attributes: ['disabled'] },
  ],
  // Whether the table is a grid decides whether a row may carry `aria-selected` and whether
  // Enter opens it. The table holds it, so two rows in one table cannot disagree.
  provide: { grid: 'grid' },
  // The spec's `agent` fence. The headers are the caller's parts and the caller holds the sort, so
  // the handle reads the table's own sortable headers and their `aria-sort`, and a sort presses a
  // header's control once, so the caller's `sort` handler runs and the caller decides the order,
  // as for a person's press. A table with no sortable header lists no column.
  agent: {
    on: 'wrapper',
    // The Table a DataTable draws is the DataTable's part: the nearest member around it is the
    // DataTable, which registers its columns and its sort from its own props in its place. A
    // Table inside one of the DataTable's cells has that Table around it, and registers.
    unless:
      "wrapper?.parentElement?.closest('[data-member]')?.getAttribute('data-member') === 'data-table'",
    state: {
      'sort-key': 'tableSort(table).key',
      'sort-direction': 'tableSort(table).direction',
      columns: 'tableSortColumns(table)',
    },
    actions: { sort: { argument: 'id', run: 'pressTableSort(table, value)' } },
  },
  template: el(
    'div',
    {
      part: 'wrapper',
      ref: 'wrapper',
      class: ['wrapper'],
      attrs: {
        'data-sticky-header': flag('stickyHeader'),
        'data-overflowing': flag('overflowing'),
        // A tab stop once it scrolls, so a keyboard reaches the columns past the edge, except
        // in a grid, where moving to a column scrolls it into view. The landmark exists only
        // with a name, because an unnamed region is announced and cannot be identified.
        tabindex: "overflowing && !grid ? '0' : undefined",
        role: "overflowing && label !== undefined ? 'region' : undefined",
        'aria-label': 'overflowing ? label : undefined',
        ...identity('Table'),
      },
    },
    [
      el(
        'table',
        {
          part: 'table',
          ref: 'table',
          class: ['table'],
          attrs: {
            role: "grid ? 'grid' : undefined",
            'aria-multiselectable': "grid && multiselectable ? 'true' : undefined",
          },
          on: {
            focusin: run('focusIn($event)', 'grid'),
            keydown: run('keyDown($event)', 'grid'),
          },
        },
        [
          // The first child, because a `<caption>` names the table only there. A prop rather
          // than a part, because a composition cannot enforce that order.
          cond('caption !== undefined', [
            el(
              'caption',
              {
                part: 'caption',
                class: [
                  { name: 'caption', when: 'captionVisible' },
                  { name: 'captionHidden', when: '!captionVisible' },
                ],
              },
              [text('caption')],
            ),
          ]),
          slot(),
        ],
      ),
    ],
  ),
  parts: [
    {
      name: 'Head',
      public: true,
      purpose: 'the header rows, a `<thead>`',
      props: { children: { type: 'ReactNode', optional: true } },
      template: el('thead', { class: ['head'] }, [slot()]),
    },
    {
      name: 'Body',
      public: true,
      purpose: 'the body rows, a `<tbody>`',
      props: { children: { type: 'ReactNode', optional: true } },
      template: el('tbody', {}, [slot()]),
    },
    {
      name: 'Foot',
      public: true,
      purpose: 'totals for numeric columns, a `<tfoot>`',
      props: { children: { type: 'ReactNode', optional: true } },
      template: el('tfoot', { class: ['foot'] }, [slot()]),
    },
    {
      name: 'Row',
      public: true,
      purpose: 'a row, a `<tr>`',
      defaults: { interactive: 'false' },
      derived: {
        // A grid row that opens on click also opens on Enter, or the keyboard could reach its
        // cells and do nothing. Only from a cell itself: a control in a cell handles its own
        // Enter, so a checkbox does not open the row.
        open: "(event: KeyboardEvent) => { if (event.key !== 'Enter' || !(event.target instanceof HTMLElement) || !event.target.matches('th, td')) return; event.preventDefault(); emit('click') }",
      },
      template: el(
        'tr',
        {
          class: ['row'],
          attrs: {
            'data-interactive': flag('interactive'),
            'data-selected': flag('selected'),
            // Semantic only in a grid, where `aria-selected` belongs. An absent `selected` sets
            // nothing, because a row announced as unselected in a grid with no selection tells
            // the reader nothing.
            'aria-selected': 'owner.grid && selected !== undefined ? selected : undefined',
          },
          on: {
            click: emit('click', { when: 'interactive' }),
            keydown: run('open($event)', 'owner.grid && interactive && listening.click'),
          },
        },
        [slot()],
      ),
    },
    {
      name: 'Header',
      public: true,
      purpose: 'a column header, a `<th>`, with the sort control when the column sorts',
      defaults: { sortable: 'false', numeric: 'false' },
      template: el(
        'th',
        {
          class: ['header'],
          attrs: {
            scope: lit('col'),
            'data-sortable': flag('sortable'),
            'data-numeric': flag('numeric'),
            'aria-sort':
              "sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : undefined",
          },
        },
        [
          cond(
            'sortable',
            [
              // A real button covering the whole header, so the keyboard reaches it the way the
              // pointer does.
              el(
                'button',
                {
                  part: 'sort',
                  class: ['sortButton'],
                  attrs: { type: lit('button') },
                  on: { click: emit('sort') },
                },
                [
                  slot(),
                  // Decorative: `aria-sort` carries the direction.
                  el(
                    'span',
                    {
                      class: ['sortIcon'],
                      attrs: { 'data-active': flag('sortDirection !== undefined') },
                    },
                    [
                      member('Icon', {
                        name: "sortDirection === 'asc' ? 'sort-asc' : sortDirection === 'desc' ? 'sort-desc' : 'sort'",
                        size: lit('sm'),
                      }),
                    ],
                  ),
                ],
              ),
            ],
            [slot()],
          ),
        ],
      ),
    },
    {
      name: 'Cell',
      public: true,
      purpose: 'a data cell, a `<td>`',
      defaults: { numeric: 'false' },
      template: el('td', { class: ['cell'], attrs: { 'data-numeric': flag('numeric') } }, [slot()]),
    },
  ],
  states: [
    { name: 'basic', props: { label: 'Tickets' }, slots: composed(rows()) },
    {
      name: 'sorted ascending',
      props: { label: 'Tickets' },
      slots: composed(rows(), { sortDirection: 'asc' }),
    },
    {
      name: 'sorted descending',
      props: { label: 'Tickets' },
      slots: composed(rows(), { sortDirection: 'desc' }),
    },
    {
      // A click selects a row, as the React fixture's `PickedRows`: each row holds whether it is
      // picked and adds itself on its click, so the contract's click shows.
      name: 'interactive rows, one selected',
      props: { label: 'Tickets' },
      holds: Object.fromEntries(
        TICKETS.map((ticket, at) => [`picked${at}`, ticket.id === 'T-1039']),
      ),
      slots: composed(rows(true, undefined, true)),
    },
    {
      // The visible caption. The announced-only caption is the default and draws nothing, so
      // an entry cannot show it.
      name: 'visible caption',
      props: { label: 'Tickets', caption: 'Tickets opened this week', captionVisible: true },
      slots: composed(rows()),
    },
    {
      name: 'sticky header, over a body long enough to scroll',
      props: { stickyHeader: true, label: 'Tickets' },
      slots: composed([...rows(), ...rows(), ...rows()]),
      expect: { 'data-sticky-header': '' },
    },
    {
      name: 'totals — a foot under the numeric column, top rule, figures aligned',
      props: { label: 'Tickets' },
      slots: composed(rows(), {
        after: [
          fx(
            'TableFoot',
            {},
            {
              default: [
                fx(
                  'TableRow',
                  {},
                  { default: [cell(['Total']), cell(), cell(), cell(['25'], true)] },
                ),
              ],
            },
          ),
        ],
      }),
    },
  ],
})
