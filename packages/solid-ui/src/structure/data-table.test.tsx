import { getAllByRole, getByRole, getByText, queryByRole, queryByText } from '@testing-library/dom'
import { createSignal } from 'solid-js'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import Button from '../controls/Button'
import { mount } from '../mount'
import DataTable, { type DataTableColumn, type DataTableProps } from './DataTable'
import Pagination from './Pagination'

/**
 * DataTable in the Solid shell (`design/components/data-table.md`): the grid it
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

const COLUMNS: DataTableColumn<Row>[] = [
  { key: 'subject', header: 'Ticket', sortable: true },
  { key: 'minutes', header: 'Updated', numeric: true, sortable: true },
]

const BASE = {
  columns: COLUMNS,
  data: DATA,
  getRowId: (row: Row) => row.id,
  label: 'Tickets',
  emptyState: { title: 'Nothing here', description: 'Try a wider filter.' },
}

const table = (props: Partial<DataTableProps<Row>> = {}) =>
  mount(() => <DataTable {...BASE} {...props} />)

const root = (host: HTMLElement) => host.firstElementChild as HTMLElement

const selectAll = (host: HTMLElement) => getByRole(host, 'checkbox', { name: 'Select all' })

/** The set the last `onSelectionChange` carried, sorted. */
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
    const columns: DataTableColumn<Row>[] = [
      ...COLUMNS,
      {
        key: 'open',
        header: 'Open',
        cell: (row) => <Button size="sm" label={`Open ${row.subject}`} />,
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
      getRowLabel: (row) => `Select ${row.subject}`,
    })
    expect(getByRole(host, 'checkbox', { name: 'Select Webhook retries' })).toBeTruthy()
  })

  it('shows the bulk bar only while something is selected, and announces the count', async () => {
    const none = await table({ selection: new Set(), onSelectionChange: vi.fn() })
    expect(queryByText(none.host, /selected/)).toBeNull()
    none.unmount()
    const { host } = await mount(() => (
      <DataTable
        {...BASE}
        selection={new Set(['a', 'b'])}
        onSelectionChange={vi.fn()}
        bulkActions={<Button variant="ghost" tone="neutral" size="sm" label="Archive" />}
      />
    ))
    expect(getByText(host, '2 selected').getAttribute('aria-live')).toBe('polite')
    expect(getByRole(host, 'button', { name: 'Archive' })).toBeTruthy()
  })
})

describe('the caller’s own rows', () => {
  it('hands a callback and a function prop the very object the caller passed', async () => {
    const onRowClick = vi.fn()
    const labelled: Row[] = []
    const drawn: Row[] = []
    const columns: DataTableColumn<Row>[] = [
      ...COLUMNS,
      {
        key: 'open',
        header: 'Open',
        cell: (row) => {
          drawn.push(row)
          return row.id
        },
      },
    ]
    const { host } = await table({
      columns,
      onRowClick,
      selection: new Set(),
      onSelectionChange: vi.fn(),
      getRowLabel: (row) => {
        labelled.push(row)
        return `Select ${row.subject}`
      },
    })
    await userEvent.click(getByRole(host, 'cell', { name: 'SSO loop' }))
    const clicked = onRowClick.mock.lastCall?.[0] as Row
    expect(clicked).toBe(DATA[1])
    expect(DATA.indexOf(clicked)).toBe(1)
    expect(structuredClone(clicked)).toEqual(DATA[1])
    expect(labelled.length).toBeGreaterThan(0)
    expect(labelled.every((row) => DATA.includes(row))).toBe(true)
    expect(drawn.length).toBeGreaterThan(0)
    expect(drawn.every((row) => DATA.includes(row))).toBe(true)
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
    const { host } = await mount(() => {
      // The action is an element, so it is created inside the mounted view, where Solid owns it.
      const emptyState = {
        title: 'Nothing here',
        secondaryAction: <Button variant="ghost" label="Clear filters" onClick={onClear} />,
      }
      return <DataTable {...BASE} data={[]} emptyState={emptyState} />
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

  const expandable = (props: Partial<DataTableProps<Row>> = {}) =>
    table({
      getRowName: (row) => row.subject,
      rowDetail: ({ row }) => <p>Detail of {row.subject}</p>,
      ...props,
    })

  /** A detail with a button that closes it, as a detail's Save or Done does. */
  const closable: DataTableProps<Row>['rowDetail'] = ({ row, close }) => (
    <>
      <p>Detail of {row.subject}</p>
      <button type="button" onClick={close}>
        Done with {row.subject}
      </button>
    </>
  )

  it('hands the detail the row the caller put in data', async () => {
    const handed: Row[] = []
    await expandable({
      expanded: new Set(['b']),
      rowDetail: ({ row }) => {
        handed.push(row)
        return <p>Detail</p>
      },
    })
    expect(handed[0]).toBe(DATA[1])
  })

  it('closes a detail from inside it, and returns focus to the row’s disclosure', async () => {
    const onExpandedChange = vi.fn()
    const { host } = await expandable({ rowDetail: closable, onExpandedChange })
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
    const { host } = await expandable({
      rowDetail: closable,
      expanded: new Set(['a']),
      onExpandedChange,
    })
    const done = getByRole(host, 'button', { name: 'Done with Webhook retries' })
    done.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(onExpandedChange).toHaveBeenCalledTimes(1))
    expect([...(onExpandedChange.mock.lastCall?.[0] as ReadonlySet<string>)]).toEqual([])
    // The caller has not passed the next set, so the detail is still drawn.
    expect(details(host)).toHaveLength(1)
    expect(document.activeElement).toBe(disclosure(host, 'Webhook retries'))
  })

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

  it('starts with the rows defaultExpanded names open, and holds the set from there', async () => {
    const onExpandedChange = vi.fn()
    const { host } = await expandable({ defaultExpanded: new Set(['b']), onExpandedChange })
    expect(details(host).map((row) => row.textContent?.trim())).toEqual(['Detail of SSO loop'])

    await userEvent.click(disclosure(host, 'Webhook retries'))
    await vi.waitFor(() => expect(details(host)).toHaveLength(2))
    expect([...(onExpandedChange.mock.lastCall?.[0] as ReadonlySet<string>)]).toEqual(['b', 'a'])
  })

  it('keeps its own set current while the caller holds it, for a caller that stops', async () => {
    const onExpandedChange = vi.fn()
    // The caller's state: the set it holds, until it stops holding one.
    const [expanded, setExpanded] = createSignal<ReadonlySet<string> | undefined>(new Set(['a']))
    const { host } = await mount(() => (
      <DataTable
        {...BASE}
        getRowName={(row) => row.subject}
        rowDetail={({ row }) => <p>Detail of {row.subject}</p>}
        expanded={expanded()}
        onExpandedChange={onExpandedChange}
      />
    ))
    await userEvent.click(disclosure(host, 'SSO loop'))
    await vi.waitFor(() => expect(onExpandedChange).toHaveBeenCalledTimes(1))
    // The caller keeps its set, so the row it was asked to open stays closed.
    expect(details(host)).toHaveLength(1)

    setExpanded(undefined)
    // The table holds the set now, as its last change left it.
    await vi.waitFor(() =>
      expect(details(host).map((row) => row.textContent?.trim())).toEqual([
        'Detail of Webhook retries',
        'Detail of SSO loop',
      ]),
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
      getRowLabel: (row: Row) => `Select ${row.subject}`,
    })
    // `getRowLabel` is the checkbox's whole name. The disclosure is named from the row's own.
    expect(getByRole(host, 'checkbox', { name: 'Select SSO loop' })).toBeTruthy()
    expect(getByRole(host, 'button', { name: 'Details for SSO loop' })).toBeTruthy()
  })

  it('gives a row isRowExpandable refuses an empty cell, and never a detail', async () => {
    const { host } = await expandable({
      isRowExpandable: (row: Row) => row.id !== 'b',
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
    const { host } = await expandable({
      expanded: new Set(['a']),
      rowDetail: () => (
        <>
          <input aria-label="Reply" />
          <button type="button">Send</button>
        </>
      ),
    })
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
    const { host } = await mount(() => (
      <div style={{ 'inline-size': width }}>
        <DataTable
          {...BASE}
          selection={new Set(['a', 'b'])}
          onSelectionChange={vi.fn()}
          bulkActions={
            <>
              <Button size="sm" variant="ghost" tone="neutral" label="Assign" />
              <Button size="sm" variant="soft" tone="danger" label="Close" />
            </>
          }
          pagination={<Pagination page={4} pageCount={9} onPageChange={vi.fn()} />}
        />
      </div>
    ))
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
 * A row that leaves while it holds focus (`design/components/data-table.md`, the grid model):
 * a browser hands focus to the page, and the grid takes it back to the same column of the row
 * that takes the removed row's place, or of the last row.
 */
describe('the grid, when the focused row leaves', () => {
  async function rows() {
    const [data, setData] = createSignal(DATA)
    const mounted = await mount(() => <DataTable {...BASE} data={data()} />)
    const cell = (name: string) => getByRole(mounted.host, 'cell', { name })
    return { ...mounted, cell, setData }
  }

  it('keeps focus in the grid, on the same column of the next row', async () => {
    const { cell, setData } = await rows()
    cell('SSO loop').focus()
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(document.activeElement).toBe(cell('26')))
    setData(DATA.filter((row) => row.id !== 'b'))
    await vi.waitFor(() => expect(document.activeElement).toBe(cell('91')))
  })

  it('goes to the row before when the last row leaves', async () => {
    const { cell, setData } = await rows()
    cell('Empty CSV').focus()
    setData(DATA.filter((row) => row.id !== 'c'))
    await vi.waitFor(() => expect(document.activeElement).toBe(cell('SSO loop')))
  })
})
