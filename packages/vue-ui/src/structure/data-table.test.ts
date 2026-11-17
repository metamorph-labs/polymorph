import { getAllByRole, getByRole, getByText, queryByRole, queryByText } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { h, reactive, shallowRef } from 'vue'

import { createAgentBridge } from '@polymorph/engine/agent'
import { agentRegistrations, installTestTheme } from '@polymorph/engine/testing'

import Button from '../controls/Button.vue'
import { mount } from '../mount'
import DataTable from './DataTable.vue'
import Pagination from './Pagination.vue'

/**
 * DataTable in the Vue shell (`design/components/data-table.md`): the grid it
 * turns on, the header checkbox's three states and what it adds to or removes
 * from a selection that spans pages, the sort it asks for, the bulk bar, and
 * loading against empty, as the React member's tests hold them
 * (`packages/react-ui/src/structure/assemblies.test.tsx`). Its contract fence
 * holds the keys and the announcement; these hold the rules the grammar
 * cannot state.
 */

beforeAll(installTestTheme)

interface Row {
  id: string
  subject: string
  minutes: number
}

const DATA: Row[] = [
  { id: 'a', subject: 'Webhook retries', minutes: 4 },
  { id: 'b', subject: 'SSO loop', minutes: 26 },
  { id: 'c', subject: 'Empty CSV', minutes: 91 },
]

const COLUMNS = [
  { key: 'subject', header: 'Ticket', sortable: true },
  { key: 'minutes', header: 'Updated', numeric: true, sortable: true },
]

/** `h()` cannot infer the component's `Row`, so a function reads its row through a cast. */
const BASE = {
  columns: COLUMNS,
  data: DATA,
  getRowId: (row: unknown) => (row as Row).id,
  label: 'Tickets',
  emptyState: { title: 'Nothing here', description: 'Try a wider filter.' },
}

const table = (props: Record<string, unknown> = {}) =>
  mount(() => h(DataTable, { ...BASE, ...props }))

const root = (host: HTMLElement) => host.firstElementChild as HTMLElement

const selectAll = (host: HTMLElement) => getByRole(host, 'checkbox', { name: 'Select all' })

/** The set the last `selectionChange` carried, sorted. */
const lastSelection = (spy: ReturnType<typeof vi.fn>) =>
  [...(spy.mock.lastCall?.[0] as ReadonlySet<string>)].sort()

describe('the grid', () => {
  it('is a grid, multiselectable only with selection', async () => {
    const selectable = await table({ selection: new Set(), onSelectionChange: vi.fn() })
    expect(getByRole(selectable.host, 'grid').getAttribute('aria-multiselectable')).toBe('true')
    selectable.unmount()
    const plain = await table()
    expect(getByRole(plain.host, 'grid').hasAttribute('aria-multiselectable')).toBe(false)
  })

  it('names the grid by its label, through the caption', async () => {
    const { host } = await table()
    expect(getByRole(host, 'grid', { name: 'Tickets' })).toBeTruthy()
  })

  it('exposes selection, and a row outside it, to screen readers', async () => {
    const { host } = await table({ selection: new Set(['a']), onSelectionChange: vi.fn() })
    const rows = getAllByRole(host, 'row').slice(1)
    expect(rows[0]?.getAttribute('aria-selected')).toBe('true')
    expect(rows[1]?.getAttribute('aria-selected')).toBe('false')
  })

  it('sets no aria-selected without selection', async () => {
    const { host } = await table()
    for (const row of getAllByRole(host, 'row'))
      expect(row.hasAttribute('aria-selected')).toBe(false)
  })

  it('gives the whole table one tab stop, not one per row', async () => {
    const { host } = await table({ selection: new Set(), onSelectionChange: vi.fn() })
    const stops = [...getByRole(host, 'grid').querySelectorAll<HTMLElement>('*')].filter(
      (node) => node.tabIndex === 0,
    )
    // Four checkboxes and two sort buttons would be six tab stops.
    expect(stops).toEqual([selectAll(host)])
  })
})

describe('cells and sorting', () => {
  it('renders a cell from the row when the column has no renderer', async () => {
    const { host } = await table()
    expect(getByRole(host, 'cell', { name: 'Webhook retries' })).toBeTruthy()
    expect(getByRole(host, 'cell', { name: '4' })).toBeTruthy()
  })

  it('renders a column’s own node', async () => {
    const columns = [
      ...COLUMNS,
      {
        key: 'open',
        header: 'Open',
        cell: (row: unknown) => h(Button, { size: 'sm', label: `Open ${(row as Row).subject}` }),
      },
    ]
    const { host } = await table({ columns })
    expect(getByRole(host, 'button', { name: 'Open SSO loop' })).toBeTruthy()
  })

  it('starts a new sort ascending and reverses the sorted column', async () => {
    const onSortChange = vi.fn()
    const { host } = await table({ sort: { key: 'subject', direction: 'asc' }, onSortChange })
    await userEvent.click(getByRole(host, 'button', { name: /Ticket/ }))
    expect(onSortChange).toHaveBeenLastCalledWith({ key: 'subject', direction: 'desc' })
    await userEvent.click(getByRole(host, 'button', { name: /Updated/ }))
    expect(onSortChange).toHaveBeenLastCalledWith({ key: 'minutes', direction: 'asc' })
  })
})

describe('selection', () => {
  it('has no selection column until selection is switched on, even by an empty set', async () => {
    const plain = await table()
    expect(queryByRole(plain.host, 'checkbox')).toBeNull()
    plain.unmount()
    const empty = await table({ selection: new Set(), onSelectionChange: vi.fn() })
    expect(selectAll(empty.host)).toBeTruthy()
  })

  it('runs the header checkbox through its three states', async () => {
    const none = await table({ selection: new Set(), onSelectionChange: vi.fn() })
    expect(selectAll(none.host).dataset['state']).toBe('unchecked')
    none.unmount()
    const some = await table({ selection: new Set(['a']), onSelectionChange: vi.fn() })
    expect(selectAll(some.host).dataset['state']).toBe('indeterminate')
    some.unmount()
    const all = await table({ selection: new Set(['a', 'b', 'c']), onSelectionChange: vi.fn() })
    expect(selectAll(all.host).dataset['state']).toBe('checked')
  })

  it('selects every row on the page from the header', async () => {
    const onSelectionChange = vi.fn()
    const { host } = await table({ selection: new Set(), onSelectionChange })
    await userEvent.click(selectAll(host))
    expect(lastSelection(onSelectionChange)).toEqual(['a', 'b', 'c'])
  })

  it('adds this page’s ids and removes only them, keeping an off-page id', async () => {
    const onSelectionChange = vi.fn()
    const first = await table({ selection: new Set(['z']), onSelectionChange })
    await userEvent.click(selectAll(first.host))
    const selected = onSelectionChange.mock.lastCall?.[0] as ReadonlySet<string>
    expect([...selected].sort()).toEqual(['a', 'b', 'c', 'z'])
    first.unmount()

    const second = await table({ selection: selected, onSelectionChange })
    await userEvent.click(selectAll(second.host))
    expect(lastSelection(onSelectionChange)).toEqual(['z'])
  })

  it('leaves the header unchecked for rows on other pages, and counts them in the bar', async () => {
    const { host } = await table({ selection: new Set(['z']), onSelectionChange: vi.fn() })
    expect(selectAll(host).dataset['state']).toBe('unchecked')
    expect(getByText(host, '1 selected')).toBeTruthy()
  })

  it('toggles one row, and its checkbox never opens the row', async () => {
    const onSelectionChange = vi.fn()
    const onRowClick = vi.fn()
    const { host } = await table({ selection: new Set(['a']), onSelectionChange, onRowClick })
    await userEvent.click(getAllByRole(host, 'checkbox', { name: 'Select row' })[1] as HTMLElement)
    expect(lastSelection(onSelectionChange)).toEqual(['a', 'b'])
    expect(onRowClick).not.toHaveBeenCalled()
    await userEvent.click(getByRole(host, 'cell', { name: 'SSO loop' }))
    expect(onRowClick).toHaveBeenCalledWith(DATA[1])
  })

  it('names each row checkbox through getRowLabel', async () => {
    const { host } = await table({
      selection: new Set(),
      onSelectionChange: vi.fn(),
      getRowLabel: (row: unknown) => `Select ${(row as Row).subject}`,
    })
    expect(getByRole(host, 'checkbox', { name: 'Select Webhook retries' })).toBeTruthy()
  })

  it('shows the bulk bar only while something is selected, and announces the count', async () => {
    const none = await table({ selection: new Set(), onSelectionChange: vi.fn() })
    expect(queryByText(none.host, /selected/)).toBeNull()
    none.unmount()
    const { host } = await mount(() =>
      h(
        DataTable,
        { ...BASE, selection: new Set(['a', 'b']), onSelectionChange: vi.fn() },
        {
          bulkActions: () => [
            h(Button, { variant: 'ghost', tone: 'neutral', size: 'sm', label: 'Archive' }),
          ],
        },
      ),
    )
    expect(getByText(host, '2 selected').getAttribute('aria-live')).toBe('polite')
    expect(getByRole(host, 'button', { name: 'Archive' })).toBeTruthy()
  })
})

describe('loading and empty', () => {
  it('keeps the table while loading, with placeholder rows', async () => {
    const { host } = await table({ data: [], loading: true })
    expect(root(host).dataset['loading']).toBe('')
    expect(root(host).getAttribute('aria-busy')).toBe('true')
    expect(getByRole(host, 'grid')).toBeTruthy()
    expect(getAllByRole(host, 'row')).toHaveLength(6)
    expect(queryByText(host, 'Nothing here')).toBeNull()
  })

  it('replaces the table with the empty state when there is no data', async () => {
    const onClear = vi.fn()
    const { host } = await table({
      data: [],
      emptyState: {
        title: 'Nothing here',
        secondaryAction: h(Button, { variant: 'ghost', label: 'Clear filters', onClick: onClear }),
      },
    })
    expect(root(host).dataset['empty']).toBe('')
    expect(getByText(host, 'Nothing here')).toBeTruthy()
    expect(queryByRole(host, 'grid')).toBeNull()
    await userEvent.click(getByRole(host, 'button', { name: 'Clear filters' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})

/**
 * Row expansion, as the React member's tests hold it
 * (`packages/react-ui/src/structure/data-table.test.tsx`): the disclosure, the
 * detail row, and the grid's keys into and out of a detail's one cell. A test
 * that needs focus on a button focuses it, because WebKit does not on a click.
 */
describe('row expansion', () => {
  const disclosure = (host: HTMLElement, subject: string) =>
    getByRole(host, 'button', { name: `Details for ${subject}` })

  const details = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('tr[data-detail]')]

  const expandable = (props: Record<string, unknown> = {}) =>
    mount(() =>
      h(
        DataTable,
        { ...BASE, getRowName: (row: unknown) => (row as Row).subject, ...props },
        { rowDetail: ({ row }: { row: Row }) => [h('p', `Detail of ${row.subject}`)] },
      ),
    )

  /** A detail with a button that closes it, as a detail's Save or Done does. */
  const closable = (props: Record<string, unknown> = {}) =>
    mount(() =>
      h(
        DataTable,
        { ...BASE, getRowName: (row: unknown) => (row as Row).subject, ...props },
        {
          rowDetail: ({ row, close }: { row: Row; close: () => void }) => [
            h('p', `Detail of ${row.subject}`),
            h('button', { type: 'button', onClick: close }, `Done with ${row.subject}`),
          ],
        },
      ),
    )

  it('opens and closes a row from its disclosure, and reports each next set', async () => {
    const onExpandedChange = vi.fn()
    const { host } = await expandable({ onExpandedChange })
    const first = disclosure(host, 'Webhook retries')
    expect(first.getAttribute('aria-expanded')).toBe('false')
    expect(details(host)).toHaveLength(0)

    await userEvent.click(first)
    await vi.waitFor(() => expect(details(host)).toHaveLength(1))
    const detail = details(host)[0] as HTMLElement
    expect(detail.textContent?.trim()).toBe('Detail of Webhook retries')
    expect(detail.previousElementSibling).toBe(first.closest('tr'))
    expect(first.getAttribute('aria-expanded')).toBe('true')
    expect(first.getAttribute('aria-controls')).toBe(detail.id)

    await userEvent.click(disclosure(host, 'SSO loop'))
    await vi.waitFor(() => expect(details(host)).toHaveLength(2))
    await userEvent.click(first)
    await vi.waitFor(() => expect(details(host)).toHaveLength(1))
    expect(first.hasAttribute('aria-controls')).toBe(false)
    expect(onExpandedChange.mock.calls.map(([next]) => [...(next as ReadonlySet<string>)])).toEqual(
      [['a'], ['a', 'b'], ['b']],
    )
  })

  it('draws the rows the caller says are open, and only asks for a change', async () => {
    const onExpandedChange = vi.fn()
    const { host } = await expandable({ expanded: new Set(['a', 'z']), onExpandedChange })
    expect(details(host)).toHaveLength(1)

    await userEvent.click(disclosure(host, 'SSO loop'))
    await vi.waitFor(() => expect(onExpandedChange).toHaveBeenCalledTimes(1))
    // An open row of another page stays in the set.
    expect([...(onExpandedChange.mock.lastCall?.[0] as ReadonlySet<string>)]).toEqual([
      'a',
      'z',
      'b',
    ])
    expect(details(host)).toHaveLength(1)
    expect(disclosure(host, 'SSO loop').getAttribute('aria-expanded')).toBe('false')
  })

  it('starts with the rows defaultExpanded names open, and holds the set from there', async () => {
    const onExpandedChange = vi.fn()
    const { host } = await expandable({ defaultExpanded: new Set(['b']), onExpandedChange })
    expect(details(host).map((row) => row.textContent?.trim())).toEqual(['Detail of SSO loop'])

    await userEvent.click(disclosure(host, 'Webhook retries'))
    await vi.waitFor(() => expect(details(host)).toHaveLength(2))
    expect([...(onExpandedChange.mock.lastCall?.[0] as ReadonlySet<string>)]).toEqual(['b', 'a'])
  })

  it('keeps its own set current while the caller holds it, for a caller that stops', async () => {
    const expanded = shallowRef<ReadonlySet<string> | undefined>(new Set(['a']))
    const { host } = await mount(() =>
      h(
        DataTable,
        {
          ...BASE,
          getRowName: (row: unknown) => (row as Row).subject,
          expanded: expanded.value,
        },
        { rowDetail: ({ row }: { row: Row }) => [h('p', `Detail of ${row.subject}`)] },
      ),
    )
    await userEvent.click(disclosure(host, 'SSO loop'))
    // The caller keeps its set, so the row it was asked to open stays closed.
    expect(details(host)).toHaveLength(1)

    expanded.value = undefined
    // The table holds the set now, as its last change left it.
    await vi.waitFor(() =>
      expect(details(host).map((row) => row.textContent?.trim())).toEqual([
        'Detail of Webhook retries',
        'Detail of SSO loop',
      ]),
    )
  })

  it('never opens the row from its disclosure', async () => {
    const onRowClick = vi.fn()
    const { host } = await expandable({ onRowClick })
    await userEvent.click(disclosure(host, 'Webhook retries'))
    await vi.waitFor(() => expect(details(host)).toHaveLength(1))
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('spans the detail across every column, the selection column included', async () => {
    const { host } = await expandable({
      expanded: new Set(['a']),
      selection: new Set(),
      onSelectionChange: vi.fn(),
    })
    const cells = (details(host)[0] as HTMLElement).querySelectorAll('td')
    expect(cells).toHaveLength(1)
    expect(cells[0]?.colSpan).toBe(4)
    expect(getByRole(host, 'grid').querySelectorAll('thead th')).toHaveLength(4)
  })

  it('names the checkbox from getRowLabel and never the disclosure', async () => {
    const { host } = await expandable({
      selection: new Set(),
      onSelectionChange: vi.fn(),
      getRowLabel: (row: unknown) => `Select ${(row as Row).subject}`,
    })
    // `getRowLabel` is the checkbox's whole name. The disclosure is named from the row's own.
    expect(getByRole(host, 'checkbox', { name: 'Select SSO loop' })).toBeTruthy()
    expect(getByRole(host, 'button', { name: 'Details for SSO loop' })).toBeTruthy()
  })

  it('gives a row isRowExpandable refuses an empty cell, and never a detail', async () => {
    const { host } = await expandable({
      isRowExpandable: (row: unknown) => (row as Row).id !== 'b',
      expanded: new Set(['a', 'b']),
    })
    expect(queryByRole(host, 'button', { name: 'Details for SSO loop' })).toBeNull()
    expect(disclosure(host, 'Webhook retries')).toBeTruthy()
    const refused = getByText(host, 'SSO loop').closest('tr') as HTMLTableRowElement
    expect(refused.cells).toHaveLength(3)
    expect(refused.cells[0]?.childElementCount).toBe(0)
    // `expanded` holds its id, and it still draws no detail.
    expect(details(host).map((row) => row.textContent?.trim())).toEqual([
      'Detail of Webhook retries',
    ])
  })

  it('names the column, and a disclosure without a row name, by the bare word', async () => {
    const { host } = await expandable({ getRowName: undefined })
    expect(getAllByRole(host, 'button', { name: 'Details' })).toHaveLength(3)
    expect(getByRole(host, 'columnheader', { name: 'Details' })).toBeTruthy()
  })

  it('names them through messages.detailsLabel', async () => {
    const { host } = await expandable({
      messages: {
        selected: (count: number) => `${count} ausgewählt`,
        selectAll: 'Alle auswählen',
        selectRow: 'Zeile auswählen',
        detailsLabel: (name: string | undefined) =>
          name === undefined ? 'Einzelheiten' : `Einzelheiten zu ${name}`,
      },
    })
    expect(getByRole(host, 'button', { name: 'Einzelheiten zu SSO loop' })).toBeTruthy()
    expect(getByRole(host, 'columnheader', { name: 'Einzelheiten' })).toBeTruthy()
  })

  it('hands the detail the caller’s own reactive row, so a write in the detail changes the data', async () => {
    const rows = reactive([{ id: 'a', subject: 'Webhook retries', minutes: 4, note: 'first' }])
    const handed: unknown[] = []
    const { host } = await mount(() =>
      h(
        DataTable,
        { ...BASE, data: rows, expanded: new Set(['a']) },
        {
          rowDetail: ({ row }: { row: (typeof rows)[number] }) => {
            handed.push(row)
            return [
              h('p', row.note),
              h('button', { type: 'button', onClick: () => (row.note = 'changed') }, 'Change'),
            ]
          },
        },
      ),
    )
    // The row is the caller's, not a copy of its fields.
    expect(handed[0]).toBe(rows[0])

    await userEvent.click(getByRole(host, 'button', { name: 'Change' }))
    expect(rows[0]?.note).toBe('changed')
    await vi.waitFor(() => expect(queryByText(host, 'changed')).not.toBeNull())
  })

  it('hands the detail a plain row as it is, whatever its fields are named', async () => {
    // `class`, `style` and `key` mean something to Vue on a node. They are data here.
    const plain = {
      id: 'a',
      subject: 'Webhook retries',
      minutes: 4,
      class: ['urgent', 'billing'],
      style: 'color: red',
      key: 'k-1',
    }
    const handed: unknown[] = []
    await mount(() =>
      h(
        DataTable,
        { ...BASE, data: [plain], expanded: new Set(['a']) },
        {
          rowDetail: (props: { row: typeof plain }) => {
            handed.push(props.row, Object.keys(props).sort())
            return [h('p', 'detail')]
          },
        },
      ),
    )
    expect(handed[0]).toBe(plain)
    expect(handed[1]).toEqual(['close', 'row'])
    expect(plain.class).toEqual(['urgent', 'billing'])
    expect(plain.style).toBe('color: red')
    expect(plain.key).toBe('k-1')
  })

  it('closes a detail from inside it, and returns focus to the row’s disclosure', async () => {
    const onExpandedChange = vi.fn()
    const { host } = await closable({ onExpandedChange })
    await userEvent.click(disclosure(host, 'Webhook retries'))
    await userEvent.click(disclosure(host, 'SSO loop'))
    await vi.waitFor(() => expect(details(host)).toHaveLength(2))

    const done = getByRole(host, 'button', { name: 'Done with SSO loop' })
    done.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(details(host)).toHaveLength(1))
    expect([...(onExpandedChange.mock.lastCall?.[0] as ReadonlySet<string>)]).toEqual(['a'])
    // Focus is on the disclosure of the row that closed, not on the page.
    expect(document.activeElement).toBe(disclosure(host, 'SSO loop'))
  })

  it('moves focus before a caller that holds the set removes the row', async () => {
    const onExpandedChange = vi.fn()
    const { host } = await closable({ expanded: new Set(['a']), onExpandedChange })
    const done = getByRole(host, 'button', { name: 'Done with Webhook retries' })
    done.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(onExpandedChange).toHaveBeenCalledTimes(1))
    expect([...(onExpandedChange.mock.lastCall?.[0] as ReadonlySet<string>)]).toEqual([])
    // The caller has not passed the next set, so the detail is still drawn.
    expect(details(host)).toHaveLength(1)
    expect(document.activeElement).toBe(disclosure(host, 'Webhook retries'))
  })

  it('draws a placeholder for the expansion column while loading', async () => {
    const { host } = await expandable({ loading: true })
    const rows = [...getByRole(host, 'grid').querySelectorAll<HTMLTableRowElement>('tbody tr')]
    expect(rows).toHaveLength(5)
    for (const row of rows) expect(row.cells).toHaveLength(3)
  })

  /** The one cell of the open detail row at `index`. */
  const detailCell = (host: HTMLElement, index = 0) =>
    details(host)[index]?.querySelector(':scope > td') as HTMLElement

  const stops = (host: HTMLElement) => [
    ...getByRole(host, 'grid').querySelectorAll<HTMLElement>('[tabindex="0"]'),
  ]

  const focused = () => document.activeElement?.textContent?.trim()

  it('reaches an open row’s detail with ArrowDown and ArrowUp, and keeps the column it left', async () => {
    const { host } = await expandable({ expanded: new Set(['a', 'c']) })
    const first = disclosure(host, 'Webhook retries')
    first.focus()
    await vi.waitFor(() => expect(first.getAttribute('tabindex')).toBe('0'))

    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    await vi.waitFor(() => expect(focused()).toBe('4'))
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(document.activeElement).toBe(detailCell(host)))
    // The detail cell holds the grid's one stop, and nothing it holds has a tabindex.
    expect(stops(host)).toEqual([detailCell(host)])
    for (const detail of details(host))
      expect(detail.querySelectorAll(':scope > td [tabindex]')).toHaveLength(0)

    // A cell across every column has no other cell in its row.
    await userEvent.keyboard('{ArrowLeft}{ArrowRight}{Home}{End}')
    expect(document.activeElement).toBe(detailCell(host))

    await userEvent.keyboard('{ArrowDown}')
    // The next row, in the column the reader was in before the detail.
    await vi.waitFor(() => expect(focused()).toBe('26'))
    await userEvent.keyboard('{ArrowUp}')
    await vi.waitFor(() => expect(document.activeElement).toBe(detailCell(host)))
    await userEvent.keyboard('{ArrowUp}')
    await vi.waitFor(() => expect(focused()).toBe('4'))

    await userEvent.keyboard('{Control>}{End}{/Control}')
    // The last cell of the last grid row. Its detail is one ArrowDown further, and the grid ends there.
    await vi.waitFor(() => expect(focused()).toBe('91'))
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    await vi.waitFor(() => expect(document.activeElement).toBe(detailCell(host, 1)))
  })

  it('goes from the detail cell into its controls with Tab, and leaves them their keys', async () => {
    const { host } = await mount(() =>
      h(
        DataTable,
        {
          ...BASE,
          getRowName: (row: unknown) => (row as Row).subject,
          expanded: new Set(['a']),
        },
        {
          rowDetail: () => [
            h('input', { 'aria-label': 'Reply' }),
            h('button', { type: 'button' }, 'Send'),
          ],
        },
      ),
    )
    const first = disclosure(host, 'Webhook retries')
    first.focus()
    await vi.waitFor(() => expect(first.getAttribute('tabindex')).toBe('0'))
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(document.activeElement).toBe(detailCell(host)))

    await userEvent.tab()
    expect(document.activeElement).toBe(getByRole(host, 'textbox', { name: 'Reply' }))

    const send = getByRole(host, 'button', { name: 'Send' })
    send.focus()
    await userEvent.keyboard('{ArrowDown}{ArrowRight}{Home}')
    // A key pressed in what the detail holds is that control's own, and the grid's stop stays.
    expect(document.activeElement).toBe(send)
    expect(stops(host)).toEqual([detailCell(host)])
  })

  it('starts on the first data column’s header, and reaches the expansion column’s with the arrow keys', async () => {
    const { host } = await expandable()
    const sort = getByRole(host, 'button', { name: /Ticket/ })
    // The expansion column's header draws nothing, so it is not where Tab lands.
    await vi.waitFor(() => expect(stops(host)).toEqual([sort]))

    sort.focus()
    await userEvent.keyboard('{ArrowLeft}')
    const named = getByRole(host, 'columnheader', { name: 'Details' })
    await vi.waitFor(() => expect(document.activeElement).toBe(named))
    expect(stops(host)).toEqual([named])
  })

  it('starts on the header’s checkbox in a table with selection', async () => {
    const { host } = await expandable({ selection: new Set(), onSelectionChange: vi.fn() })
    await vi.waitFor(() => expect(stops(host)).toEqual([selectAll(host)]))
  })
})

/** The bulk bar follows the toolbar rule in its container (`docs/layout.md`). */
describe('the toolbar rows in their container', () => {
  const inBox = async (width: string) => {
    const { host } = await mount(() =>
      h('div', { style: { inlineSize: width } }, [
        h(
          DataTable,
          { ...BASE, selection: new Set(['a', 'b']), onSelectionChange: vi.fn() },
          {
            bulkActions: () => [
              h(Button, { size: 'sm', variant: 'ghost', tone: 'neutral', label: 'Assign' }),
              h(Button, { size: 'sm', variant: 'soft', tone: 'danger', label: 'Close' }),
            ],
            pagination: () => [h(Pagination, { page: 4, pageCount: 9, onPageChange: vi.fn() })],
          },
        ),
      ]),
    )
    const row = getByText(host, '2 selected').parentElement as HTMLElement
    return { host, clusters: [...row.children] as HTMLElement[] }
  }

  /** How many lines the clusters sit on, by their centres, as the React test counts them. */
  const lines = (nodes: HTMLElement[]) =>
    new Set(
      nodes.map((node) => {
        const box = node.getBoundingClientRect()
        return Math.round(box.top + box.height / 2)
      }),
    ).size

  it('gives the count and the actions a line each below 36rem', async () => {
    const { clusters } = await inBox('400px')
    expect(clusters).toHaveLength(2)
    expect(lines(clusters)).toBe(2)
  })

  it('keeps them on one line in a wide container, and the assembly inside it', async () => {
    const { host, clusters } = await inBox('900px')
    expect(lines(clusters)).toBe(1)
    const assembly = host.querySelector<HTMLElement>('[data-member="data-table"]') as HTMLElement
    expect(assembly.scrollWidth).toBeLessThanOrEqual(assembly.clientWidth + 1)
  })
})

/**
 * The Table a DataTable draws is the DataTable's part (`design/components/table.md`, Agent): it
 * registers nothing, so an agent sees one DataTable, whose sort comes from its own props.
 */
describe('for an agent', () => {
  it('is one member, not a DataTable and a Table', async () => {
    await table({ sort: { key: 'subject', direction: 'asc' }, onSortChange: vi.fn() })
    expect(agentRegistrations().map((entry) => entry.member)).not.toContain('Table')
    const bridge = createAgentBridge()
    try {
      const members = bridge.snapshot().members
      expect(members.map((member) => member.member)).toEqual(['DataTable'])
      expect(members[0]?.state).toMatchObject({ 'sort-key': 'subject', 'sort-direction': 'asc' })
    } finally {
      bridge.dispose()
    }
  })
})
