import {
  cond,
  describeMember,
  each,
  el,
  emit,
  flag,
  fx,
  identity,
  js,
  lit,
  member,
  render,
  renders,
  run,
  slot,
  text,
  when,
  type Node,
} from '../dsl'

/* -------------------------------------------------------------------------- */
/* The anatomy's parts                                                         */
/* -------------------------------------------------------------------------- */

/** The selection checkbox's cell in a body row. */
const rowCheck = cond('selectable', [
  member(
    'TableCell',
    {},
    {
      slots: {
        default: [
          // The click stops in this wrapper, not on the cell, so selecting a row does not also
          // open it. It stops on the way up, after the checkbox has taken it.
          el('span', { class: ['selectCell'], on: { click: run('$event.stopPropagation()') } }, [
            member(
              'Checkbox',
              {
                'aria-label': 'getRowLabel?.(row) ?? messages.selectRow',
                checked: 'selection?.has(getRowId(row)) ?? false',
              },
              { on: { checkedChange: run('toggleRow(getRowId(row))') } },
            ),
          ]),
        ],
      },
    },
  ),
])

/** Whether the row is open, and the id its detail row carries while it is. */
const ROW_OPEN = 'canExpand(row) && open.has(getRowId(row))'
// The id is the row's place on the page, not the row's id: an `aria-controls` value is a
// list of ids split at spaces, and a row id may hold one.
const DETAIL_ID = '`${uid}-detail-${index}`'

/** The disclosure's cell in a body row. */
const rowDisclosure = cond('expandable', [
  member(
    'TableCell',
    {},
    {
      slots: {
        default: [
          // A row without a detail keeps its cell, empty, so the columns stay in line. The
          // wrapper is the same as the checkbox's: the click stops here, so opening a row's
          // detail does not also open the row.
          cond('canExpand(row)', [
            el('span', { class: ['expandCell'], on: { click: run('$event.stopPropagation()') } }, [
              member(
                'Button',
                {
                  variant: lit('ghost'),
                  tone: lit('neutral'),
                  size: lit('sm'),
                  iconOnly: 'true',
                  icon: `${ROW_OPEN} ? 'up' : 'down'`,
                  label: 'detailsLabel(getRowName?.(row))',
                  expanded: ROW_OPEN,
                  'aria-controls': `${ROW_OPEN} ? ${DETAIL_ID} : undefined`,
                },
                { on: { click: run('toggleExpanded(getRowId(row))') } },
              ),
            ]),
          ]),
        ],
      },
    },
  ),
])

/**
 * An open row's detail. It is a plain `<tr>`, not a TableRow, because a detail row is never
 * selected or interactive. `data-detail` tells the grid it is one cell across every column:
 * ArrowDown and ArrowUp reach the cell, and what it holds stays in the page's tab order
 * (Table's description).
 */
const rowDetail = cond(`expandable && ${ROW_OPEN}`, [
  el('tr', { part: 'detail row', attrs: { id: DETAIL_ID, 'data-detail': lit('') } }, [
    el('td', { class: ['detailCell'], attrs: { colspan: 'span' } }, [
      el('div', { class: ['detail'] }, [
        slot('rowDetail', { props: { row: 'row', close: '() => closeDetail(getRowId(row))' } }),
      ]),
    ]),
  ]),
])

/** A data cell: the column's own rendering, a node or text, else the row's value as text. */
const dataCell = each('columns', 'column', 'column.key', [
  member(
    'TableCell',
    { numeric: 'column.numeric' },
    {
      slots: {
        default: [
          cond(
            "typeof cellOf(column, row) === 'string'",
            [text('cellOf(column, row)')],
            [render('cellOf(column, row)')],
          ),
        ],
      },
    },
  ),
])

/** The header row: the select-all checkbox, the expansion column's name, then one header per column. */
const head: Node = member(
  'TableHead',
  {},
  {
    slots: {
      default: [
        member(
          'TableRow',
          {},
          {
            slots: {
              default: [
                cond('selectable', [
                  member(
                    'TableHeader',
                    {},
                    {
                      slots: {
                        default: [
                          member(
                            'Checkbox',
                            {
                              'aria-label': 'messages.selectAll',
                              checked: 'headerChecked',
                              disabled: 'loading || ids.length === 0',
                            },
                            { on: { checkedChange: run('toggleAll()') } },
                          ),
                        ],
                      },
                    },
                  ),
                ]),
                cond('expandable', [
                  member(
                    'TableHeader',
                    {},
                    {
                      slots: {
                        default: [
                          // The column's name, announced and not drawn: a header cell with
                          // no content names nothing for a screen reader. `data-undrawn`
                          // tells the grid the cell shows nothing, so the grid's first tab
                          // stop is the next cell (Table's description).
                          el(
                            'span',
                            { class: ['expandLabel'], attrs: { 'data-undrawn': lit('') } },
                            [text('detailsLabel(undefined)')],
                          ),
                        ],
                      },
                    },
                  ),
                ]),
                each('columns', 'column', 'column.key', [
                  member(
                    'TableHeader',
                    {
                      numeric: 'column.numeric',
                      sortable: 'column.sortable',
                      sortDirection: 'sort?.key === column.key ? sort?.direction : undefined',
                    },
                    {
                      on: {
                        sort: emit('sortChange', {
                          args: ['sortTo(column)'],
                          when: 'column.sortable',
                        }),
                      },
                      slots: { default: [text('column.header')] },
                    },
                  ),
                ]),
              ],
            },
          },
        ),
      ],
    },
  },
)

/** The body: placeholder rows while loading, else one row per record. */
const body: Node = member(
  'TableBody',
  {},
  {
    slots: {
      default: [
        cond(
          'loading',
          [
            each('skeletons', 'index', '`skeleton-${index}`', [
              member(
                'TableRow',
                {},
                {
                  slots: {
                    default: [
                      cond('selectable', [
                        member(
                          'TableCell',
                          {},
                          {
                            slots: {
                              default: [member('Skeleton', { shape: lit('circle'), size: '4' })],
                            },
                          },
                        ),
                      ]),
                      cond('expandable', [
                        member(
                          'TableCell',
                          {},
                          {
                            slots: {
                              default: [member('Skeleton', { shape: lit('circle'), size: '4' })],
                            },
                          },
                        ),
                      ]),
                      each('columns', 'column', 'column.key', [
                        member(
                          'TableCell',
                          { numeric: 'column.numeric' },
                          { slots: { default: [member('Skeleton', { textStep: lit('sm') })] } },
                        ),
                      ]),
                    ],
                  },
                },
              ),
            ]),
          ],
          [
            each(
              'data',
              'row',
              'getRowId(row)',
              [
                member(
                  'TableRow',
                  // `selected` stays `undefined` without selection, so a grid with no selection
                  // announces no row as unselected.
                  { selected: 'selection?.has(getRowId(row))', interactive: 'listening.rowClick' },
                  {
                    on: { click: emit('rowClick', { args: ['row'], when: 'listening.rowClick' }) },
                    slots: { default: [rowCheck, rowDisclosure, dataCell] },
                  },
                ),
                rowDetail,
              ],
              'index',
            ),
          ],
        ),
      ],
    },
  },
)

/* -------------------------------------------------------------------------- */
/* The states fixture                                                          */
/* -------------------------------------------------------------------------- */

const noop = js('() => {}')

const TICKETS = [
  {
    id: 'T-2041',
    subject: 'Webhook retries stop after the first 5xx',
    requester: 'dana@northwind.example',
    status: 'open',
    minutes: 4,
    note: 'The endpoint answered 503 twice. No third attempt was queued.',
  },
  {
    id: 'T-2038',
    subject: 'SSO login loops back to the sign-in page',
    requester: 'm.okafor@lattice.example',
    status: 'open',
    minutes: 26,
    note: 'The identity provider returns a valid assertion. The session cookie is not set.',
  },
  {
    id: 'T-2035',
    subject: 'Export produces an empty CSV',
    requester: 'support@brightline.example',
    status: 'pending',
    minutes: 91,
    note: 'The export has a header row and no records for any date range.',
  },
]

const COLUMNS = [
  { key: 'subject', header: 'Ticket', sortable: true },
  { key: 'requester', header: 'Requester' },
  {
    key: 'status',
    header: 'Status',
    cell: renders(
      ['row: TicketRow'],
      fx(
        'Badge',
        { tone: js("row.status === 'solved' ? 'success' : 'info'") },
        { default: [js('row.status')] },
      ),
    ),
  },
  { key: 'minutes', header: 'Updated', numeric: true, sortable: true },
]

const EMPTY = {
  icon: 'search',
  title: 'No tickets match these filters',
  description: 'Every conversation is still here — the filters are hiding them.',
}

const base = {
  columns: COLUMNS,
  data: TICKETS,
  getRowId: js('(row: TicketRow) => row.id'),
  emptyState: EMPTY,
  label: 'Tickets',
}

const small = { size: 'sm' }

// An expandable table. `getRowName` returns the row's own name, which the disclosure's name
// is made from ("Details for …").
const expandable = {
  ...base,
  getRowName: js('(row: TicketRow) => row.subject'),
  rowDetail: renders(
    ['{ row }: { row: TicketRow }'],
    fx('Text', { size: 'sm' }, { default: [js('row.note')] }),
  ),
}

/**
 * DataTable (`design/components/data-table.md`): a Table with column
 * definitions, controlled sorting, row selection with bulk actions, loading
 * placeholders, a required empty state and a pagination slot. An assembly:
 * Table, Checkbox, Button, Skeleton, EmptyState and Inline draw everything, and
 * this member adds the wiring.
 *
 * The Table is a grid (`TableProps.grid`): one tab stop, the arrow keys between
 * cells, `aria-selected` on rows. DataTable owns every cell, which is the one
 * case where taking the arrow keys is worth it. Sorting and selection are
 * controlled, because a table that sorts itself sorts only the visible page.
 *
 * `rowDetail` lets a row show more under itself. An open row affects only
 * itself, so the member holds the set of open rows unless the caller passes
 * `expanded`.
 */
export default describeMember({
  member: 'DataTable',
  dir: 'structure',
  recipe: 'structure/data-table',
  generic: 'Row',
  // The fixture's rows, so its functions read a ticket's fields as the React fixture's do.
  fixtureTypes: {
    TicketRow:
      '{ id: string; subject: string; requester: string; status: string; minutes: number; note: string }',
  },
  fixtureGeneric: 'TicketRow',
  types: {
    DataTableColumn: `<Row> {
      key: string
      header: string
      /** Defaults to \`String(row[key])\`, the common case. */
      cell?: (row: Row) => VNode | string
      sortable?: boolean
      numeric?: boolean
    }`,
    DataTableSort: '{ key: string; direction: SortDirection }',
    DataTableRowDetail: `<Row> {
      row: Row
      /**
       * Closes this row's detail. When focus is inside the detail it moves to the row's
       * disclosure first, because a focused element that leaves the page leaves focus on
       * the page itself. It does nothing for a row that is not open.
       */
      close: () => void
    }`,
    // Every string the assembly announces, localized by passing every key the table uses or
    // none, so one grid never mixes two languages. The count is a function, because plural
    // rules belong to the application's catalog.
    DataTableMessages: `{
      /** The bulk bar's count. */
      selected: (count: number) => string
      selectAll: string
      /** The row checkbox's name when \`getRowLabel\` is not supplied. */
      selectRow: string
      /**
       * Names a row's disclosure, from what \`getRowName\` returns for the row, and names
       * the expansion column's header, called with \`undefined\`. Optional, so messages
       * written for a table without \`rowDetail\` still type-check.
       */
      detailsLabel?: (rowName: string | undefined) => string
    }`,
  },
  uses: ['EmptyStateProps', 'SortDirection'],
  defaults: {
    loading: 'false',
    messages:
      "() => ({ selected: (count: number) => `${count} selected`, selectAll: 'Select all', selectRow: 'Select row' })",
  },
  // The open rows while the caller passes no `expanded`: the rows `defaultExpanded` names
  // at first, else every row closed.
  state: { ownExpanded: 'defaultExpanded ?? new Set<string>()' },
  derived: {
    selectable: 'selection !== undefined',
    expandable: 'slots.rowDetail',
    open: 'expanded ?? ownExpanded',
    // Whether a row has a detail: every row, unless the caller's predicate refuses it.
    canExpand: '(row: Row): boolean => isRowExpandable?.(row) ?? true',
    detailsLabel:
      "messages.detailsLabel ?? ((rowName: string | undefined): string => (rowName === undefined ? 'Details' : `Details for ${rowName}`))",
    // A detail row spans every column, the selection and expansion columns included.
    span: 'columns.length + (selectable ? 1 : 0) + 1',
    ids: 'data.map((row) => getRowId(row))',
    // The bar counts the whole selection, which a bulk action acts on. The header checkbox
    // reflects only this page's rows, which its click affects.
    selectedCount: 'selection?.size ?? 0',
    selectedHere: 'ids.filter((id) => selection?.has(id)).length',
    allSelected: 'selectable && ids.length > 0 && selectedHere === ids.length',
    someSelected: 'selectedHere > 0 && !allSelected',
    headerChecked: "allSelected ? true : someSelected ? 'indeterminate' : false",
    bar: 'selectable && selectedCount > 0',
    // Empty and loading are different states: a loading table keeps its header and shows
    // placeholder rows, and an empty one gives way to the EmptyState.
    empty: '!loading && data.length === 0',
    // Five placeholder rows while loading.
    skeletons: 'Array.from({ length: 5 }, (_, index) => index)',
    // What a cell shows: the column's own rendering, else the row's value as text.
    cellOf:
      "(column: DataTableColumn<Row>, row: Row): VNode | string => { if (column.cell !== undefined) return column.cell(row); const value = (row as Record<string, unknown>)[column.key]; return value === undefined || value === null ? '' : String(value) }",
    // Sorting the sorted column again reverses it. A new column starts ascending, which
    // readers expect.
    sortTo:
      "(column: DataTableColumn<Row>): DataTableSort => ({ key: column.key, direction: sort?.key === column.key && sort?.direction === 'asc' ? 'desc' : 'asc' })",
    // The header adds this page's ids to the selection or removes them, never replacing the
    // set: the selection spans every page, and replacing it would drop the other pages' rows
    // the first time the header is used on a paginated table.
    toggleAll:
      "() => { if (selection === undefined) return; const next = new Set(selection); for (const id of ids) { if (allSelected) next.delete(id); else next.add(id) } emit('selectionChange', next) }",
    toggleRow:
      "(id: string) => { if (selection === undefined) return; const next = new Set(selection); if (next.has(id)) next.delete(id); else next.add(id); emit('selectionChange', next) }",
    // The member's own set follows every toggle, so it is current if the caller stops
    // passing `expanded`. The caller hears the next set in both cases.
    toggleExpanded:
      "(id: string) => { const next = new Set(open); if (next.has(id)) next.delete(id); else next.add(id); ownExpanded = next; emit('expandedChange', next) }",
    // What a detail closes itself with. Focus moves before the detail leaves: the disclosure
    // is the control that names the detail row, and it is found by that name.
    closeDetail:
      "(id: string) => { if (!open.has(id)) return; const element = root as HTMLElement | null; const detailId = CSS.escape(`${uid}-detail-${ids.indexOf(id)}`); if (element?.querySelector(`#${detailId}`)?.matches(':focus-within') === true) element.querySelector<HTMLElement>(`[aria-controls=\"${detailId}\"]`)?.focus(); const next = new Set(open); next.delete(id); ownExpanded = next; emit('expandedChange', next) }",
  },
  // The spec's `agent` fence. A column is a choice by its key, and one that is not sortable is
  // disabled; a sort asks as a header's press does, unless the column is sorted that way already.
  // The row Checkboxes and disclosures are members of their own, listed within the table beside
  // the application's cells and details, so the table withholds nothing.
  agent: {
    on: 'root',
    state: {
      'sort-key': 'sort?.key ?? null',
      'sort-direction': "sort?.direction ?? ''",
      columns:
        'columns.map((column) => ({ id: column.key, label: column.header, ...(column.sortable === true ? {} : { disabled: true }) }))',
      selection: '[...(selection ?? [])]',
      expanded: '[...open]',
      loading: 'loading',
    },
    actions: {
      'sort-ascending': {
        argument: 'id',
        run: "(sort?.key === value && sort?.direction === 'asc') || emit('sortChange', { key: value, direction: 'asc' })",
      },
      'sort-descending': {
        argument: 'id',
        run: "(sort?.key === value && sort?.direction === 'desc') || emit('sortChange', { key: value, direction: 'desc' })",
      },
    },
  },
  template: el(
    'div',
    {
      ref: 'root',
      class: ['table'],
      attrs: {
        'data-loading': flag('loading'),
        'data-empty': flag('empty'),
        'aria-busy': when('loading', 'true'),
        ...identity('DataTable'),
      },
    },
    [
      cond('bar', [
        el('div', { part: 'bulk bar', class: ['bulkBar'] }, [
          // Wraps, so in a narrow container the actions move under the count.
          member(
            'Inline',
            { gap: '4', align: lit('center'), justify: lit('between'), wrap: 'true' },
            {
              slots: {
                default: [
                  // One announcement per change, not per row: the count is the live region, so
                  // selecting five rows announces "5 selected" once.
                  el(
                    'span',
                    { part: 'count', class: ['bulkCount'], attrs: { 'aria-live': lit('polite') } },
                    [text('messages.selected(selectedCount)')],
                  ),
                  cond('slots.bulkActions', [
                    member(
                      'Inline',
                      { gap: '3', align: lit('center'), wrap: 'true' },
                      { slots: { default: [slot('bulkActions')] } },
                    ),
                  ]),
                ],
              },
            },
          ),
        ]),
      ]),
      cond(
        'empty',
        [
          member(
            'EmptyState',
            {
              icon: 'emptyState.icon',
              title: 'emptyState.title',
              description: 'emptyState.description',
            },
            {
              slots: {
                action: [render('emptyState.action')],
                secondaryAction: [render('emptyState.secondaryAction')],
              },
              slotWhen: {
                action: 'emptyState.action !== undefined',
                secondaryAction: 'emptyState.secondaryAction !== undefined',
              },
            },
          ),
        ],
        [
          // The caption reuses `label`, so the scroll region and the table cannot be named
          // differently. It is announced, not drawn, because the page title is above it.
          member(
            'Table',
            {
              label: 'label',
              caption: 'label',
              stickyHeader: 'stickyHeader',
              grid: 'true',
              multiselectable: 'selectable',
            },
            { slots: { default: [head, body] } },
          ),
        ],
      ),
      cond('slots.pagination', [
        el('div', { part: 'pagination row', class: ['pagination'] }, [
          // Wraps instead of overflowing, and the Pagination inside wraps its own page links.
          member(
            'Inline',
            { gap: '3', justify: lit('end'), wrap: 'true' },
            { slots: { default: [slot('pagination')] } },
          ),
        ]),
      ]),
    ],
  ),
  states: [
    { name: 'plain', props: base, expect: { 'data-loading': null, 'data-empty': null } },
    {
      name: 'sorted, ascending, on one column',
      props: { ...base, sort: { key: 'subject', direction: 'asc' } },
    },
    {
      name: 'sorted the other way',
      props: { ...base, sort: { key: 'minutes', direction: 'desc' } },
    },
    {
      name: 'selectable, with nothing selected yet',
      props: { ...base, selection: js('new Set<string>()'), onSelectionChange: noop },
    },
    {
      name: 'some selected — the header goes indeterminate and the bar arrives',
      props: {
        ...base,
        selection: js("new Set(['T-2041'])"),
        onSelectionChange: noop,
        getRowLabel: js('(row: TicketRow) => `Select ${row.subject}`'),
      },
      slots: {
        bulkActions: [
          fx('Button', {
            variant: 'ghost',
            tone: 'neutral',
            ...small,
            icon: 'archive',
            label: 'Archive',
          }),
          fx('Button', {
            variant: 'soft',
            tone: 'danger',
            ...small,
            icon: 'delete',
            label: 'Delete',
          }),
        ],
      },
    },
    {
      name: 'all selected',
      props: {
        ...base,
        selection: js(`new Set(${JSON.stringify(TICKETS.map((row) => row.id))})`),
        onSelectionChange: noop,
      },
      slots: {
        bulkActions: [
          fx('Button', { variant: 'ghost', tone: 'neutral', ...small, label: 'Archive' }),
        ],
      },
    },
    { name: 'expandable, with every row closed', props: expandable },
    {
      name: 'a row open — its detail spans every column',
      props: { ...expandable, expanded: js("new Set(['T-2041'])"), onExpandedChange: noop },
    },
    {
      name: 'a row that takes no detail — its cell in the expansion column is empty',
      props: {
        ...expandable,
        isRowExpandable: js("(row: TicketRow) => row.status !== 'pending'"),
      },
    },
    {
      name: 'selection with expansion — a selected row that is open',
      props: {
        ...expandable,
        getRowLabel: js('(row: TicketRow) => `Select ${row.subject}`'),
        selection: js("new Set(['T-2038'])"),
        onSelectionChange: noop,
        expanded: js("new Set(['T-2038'])"),
        onExpandedChange: noop,
      },
    },
    {
      name: 'loading — the chrome stays and the shape of the rows arrives',
      props: {
        ...base,
        loading: true,
        selection: js('new Set<string>()'),
        onSelectionChange: noop,
      },
      expect: { 'data-loading': '', 'aria-busy': 'true' },
    },
    {
      name: 'empty — the chrome gives way to a sentence',
      props: { ...base, data: [] },
      expect: { 'data-empty': '' },
    },
    {
      name: 'with a pagination row',
      props: base,
      slots: { pagination: [fx('Pagination', { page: 2, pageCount: 7, onPageChange: noop })] },
    },
  ],
})
