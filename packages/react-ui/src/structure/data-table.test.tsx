import { act, render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { createAgentBridge } from '@polymorph/engine/agent'
import { agentRegistrations, fixedWidthHost, installTestTheme } from '@polymorph/engine/testing'
import { Button } from '../controls/Button'
import { Input } from '../controls/Input'
import {
  DataTable,
  type DataTableColumn,
  type DataTableProps,
  type DataTableRowDetail,
} from './DataTable'
import { Table } from './Table'

/**
 * DataTable's row expansion (`design/components/data-table.md`): the disclosure,
 * the detail row, and the grid's keyboard into and out of a detail's one cell.
 * `assemblies.test.tsx` covers sorting, selection, loading and the empty state.
 *
 * A test that needs focus on a button focuses it and presses a key, because
 * WebKit does not focus a button on a click.
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
  { key: 'subject', header: 'Ticket' },
  { key: 'minutes', header: 'Updated', numeric: true },
]

const detailOf = ({ row }: DataTableRowDetail<Row>) => <p>Detail of {row.subject}</p>

function table(props: Partial<DataTableProps<Row>> = {}, container?: HTMLElement) {
  const element = (more: Partial<DataTableProps<Row>> = {}) => (
    <DataTable
      columns={COLUMNS}
      data={DATA}
      getRowId={(row) => row.id}
      getRowName={(row) => row.subject}
      label="Tickets"
      emptyState={{ title: 'Nothing here' }}
      rowDetail={detailOf}
      {...props}
      {...more}
    />
  )
  const view = render(element(), container ? { container } : undefined)
  return { ...view, again: (more: Partial<DataTableProps<Row>>) => view.rerender(element(more)) }
}

const disclosure = (subject: string) =>
  screen.getByRole('button', { name: `Details for ${subject}` })

const details = () => Array.from(document.querySelectorAll<HTMLElement>('tr[data-detail]'))

describe('DataTable row expansion', () => {
  it('has no expansion column until rowDetail is given', () => {
    table({ rowDetail: undefined })
    expect(screen.queryByRole('button', { name: /Details/ })).toBeNull()
    expect(screen.getByRole('grid').querySelectorAll('thead th')).toHaveLength(2)
  })

  it('opens and closes a row’s detail from its disclosure, holding the state itself', async () => {
    table()
    const first = disclosure('Webhook retries')
    expect(first.getAttribute('aria-expanded')).toBe('false')
    expect(first.hasAttribute('aria-controls')).toBe(false)
    expect(details()).toHaveLength(0)

    await userEvent.click(first)
    expect(first.getAttribute('aria-expanded')).toBe('true')
    const [detail] = details()
    expect(detail?.textContent).toBe('Detail of Webhook retries')
    // The detail row follows its own row, and the disclosure names it.
    expect(detail?.previousElementSibling).toBe(first.closest('tr'))
    expect(first.getAttribute('aria-controls')).toBe(detail?.id)

    await userEvent.click(first)
    expect(first.getAttribute('aria-expanded')).toBe('false')
    expect(details()).toHaveLength(0)
  })

  it('keeps any number of rows open', async () => {
    table()
    await userEvent.click(disclosure('Webhook retries'))
    await userEvent.click(disclosure('Empty CSV'))
    expect(details().map((row) => row.textContent)).toEqual([
      'Detail of Webhook retries',
      'Detail of Empty CSV',
    ])
    // Each open row names a detail row of its own.
    const ids = details().map((row) => row.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('calls onExpandedChange with the next set while it holds the state', async () => {
    const onExpandedChange = vi.fn()
    table({ onExpandedChange })

    await userEvent.click(disclosure('Webhook retries'))
    await userEvent.click(disclosure('SSO loop'))
    await userEvent.click(disclosure('Webhook retries'))
    const sets = onExpandedChange.mock.calls.map(([next]) => [...(next as ReadonlySet<string>)])
    expect(sets).toEqual([['a'], ['a', 'b'], ['b']])
  })

  it('draws the rows the caller says are open, and only asks for a change', async () => {
    const onExpandedChange = vi.fn()
    const { again } = table({ expanded: new Set(['a']), onExpandedChange })
    expect(details().map((row) => row.textContent)).toEqual(['Detail of Webhook retries'])

    await userEvent.click(disclosure('SSO loop'))
    const next = onExpandedChange.mock.calls[0]?.[0] as ReadonlySet<string>
    expect([...next]).toEqual(['a', 'b'])
    // Controlled: nothing opens until the caller passes the next set.
    expect(details()).toHaveLength(1)
    expect(disclosure('SSO loop').getAttribute('aria-expanded')).toBe('false')

    again({ expanded: next })
    expect(details()).toHaveLength(2)
    expect(disclosure('SSO loop').getAttribute('aria-expanded')).toBe('true')
  })

  it('starts with the rows defaultExpanded names open, and holds the set from there', async () => {
    const onExpandedChange = vi.fn()
    const { again } = table({ defaultExpanded: new Set(['b']), onExpandedChange })
    expect(details().map((row) => row.textContent)).toEqual(['Detail of SSO loop'])

    await userEvent.click(disclosure('Webhook retries'))
    expect(details()).toHaveLength(2)
    expect([...(onExpandedChange.mock.lastCall?.[0] as ReadonlySet<string>)]).toEqual(['b', 'a'])

    // It is the first value only: a later one changes nothing.
    again({ defaultExpanded: new Set(['c']) })
    expect(details()).toHaveLength(2)
  })

  it('keeps its own set current while the caller holds it, for a caller that stops', async () => {
    const { again } = table({ expanded: new Set(['a']) })
    await userEvent.click(disclosure('SSO loop'))
    // The caller keeps its set, so the row it was asked to open stays closed.
    expect(details().map((row) => row.textContent)).toEqual(['Detail of Webhook retries'])

    again({ expanded: undefined })
    // The table holds the set now, as its last change left it.
    expect(details().map((row) => row.textContent)).toEqual([
      'Detail of Webhook retries',
      'Detail of SSO loop',
    ])
  })

  it('keeps an open row of another page in the set', async () => {
    const onExpandedChange = vi.fn()
    table({ expanded: new Set(['z']), onExpandedChange })
    // No row on this page has the id, so nothing is open here.
    expect(details()).toHaveLength(0)

    await userEvent.click(disclosure('Webhook retries'))
    expect([...(onExpandedChange.mock.calls[0]?.[0] as ReadonlySet<string>)]).toEqual(['z', 'a'])
  })

  it('does not open the row when its disclosure is clicked', async () => {
    const onRowClick = vi.fn()
    table({ onRowClick })

    await userEvent.click(disclosure('Webhook retries'))
    expect(details()).toHaveLength(1)
    expect(onRowClick).not.toHaveBeenCalled()

    await userEvent.click(screen.getByText('SSO loop'))
    expect(onRowClick).toHaveBeenCalledWith(DATA[1])
  })

  it('does not open the row when its detail is clicked', async () => {
    const onRowClick = vi.fn()
    table({ onRowClick, expanded: new Set(['a']) })
    await userEvent.click(screen.getByText('Detail of Webhook retries'))
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('spans the detail across every column', () => {
    const { unmount } = table({ expanded: new Set(['a']) })
    const cell = () => details()[0]?.querySelector('td') as HTMLTableCellElement
    const headers = () => screen.getByRole('grid').querySelectorAll('thead th').length
    // The expansion column and the two data columns.
    expect(cell().colSpan).toBe(3)
    expect(cell().colSpan).toBe(headers())
    expect(details()[0]?.querySelectorAll('td')).toHaveLength(1)
    unmount()

    table({ expanded: new Set(['a']), selection: new Set(), onSelectionChange: vi.fn() })
    // The selection column as well.
    expect(cell().colSpan).toBe(4)
    expect(cell().colSpan).toBe(headers())
  })

  it('puts the expansion column after the selection column and before the data', () => {
    table({ selection: new Set(), onSelectionChange: vi.fn() })
    const row = disclosure('Webhook retries').closest('tr') as HTMLTableRowElement
    const cells = Array.from(row.cells)
    expect(cells[0]?.querySelector('[role="checkbox"]')).not.toBeNull()
    expect(cells[1]?.contains(disclosure('Webhook retries'))).toBe(true)
    expect(cells[2]?.textContent).toBe('Webhook retries')
  })

  it('names each disclosure and the column through messages.detailsLabel', () => {
    const { unmount } = table()
    // The default reads the row's name, and the column's header reads the bare word.
    expect(disclosure('SSO loop')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Details' })).toBeTruthy()
    unmount()

    const second = table({ getRowName: undefined })
    expect(screen.getAllByRole('button', { name: 'Details' })).toHaveLength(3)
    second.unmount()

    table({
      messages: {
        selected: (count) => `${count} ausgewählt`,
        selectAll: 'Alle auswählen',
        selectRow: 'Zeile auswählen',
        detailsLabel: (name) => (name === undefined ? 'Einzelheiten' : `Einzelheiten zu ${name}`),
      },
    })
    expect(screen.getByRole('button', { name: 'Einzelheiten zu SSO loop' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Einzelheiten' })).toBeTruthy()
  })

  it('names the checkbox from getRowLabel and the disclosure from getRowName', () => {
    const { unmount } = table({
      selection: new Set(),
      onSelectionChange: vi.fn(),
      getRowLabel: (row) => `Select ${row.subject}`,
    })
    // `getRowLabel` is the checkbox's whole name. The disclosure is named from the row's own.
    expect(screen.getByRole('checkbox', { name: 'Select SSO loop' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Details for SSO loop' })).toBeTruthy()
    unmount()

    table({
      selection: new Set(),
      onSelectionChange: vi.fn(),
      getRowLabel: (row) => `Select ${row.subject}`,
      getRowName: undefined,
    })
    // The disclosure never reads `getRowLabel`: "Details for Select SSO loop" names nothing.
    expect(screen.getAllByRole('button', { name: 'Details' })).toHaveLength(3)
  })

  it('gives a row isRowExpandable refuses an empty cell, and never a detail', () => {
    table({
      isRowExpandable: (row) => row.id !== 'b',
      expanded: new Set(['a', 'b']),
    })
    expect(screen.queryByRole('button', { name: 'Details for SSO loop' })).toBeNull()
    expect(disclosure('Webhook retries')).toBeTruthy()
    expect(disclosure('Empty CSV')).toBeTruthy()

    // The refused row keeps its cell in the expansion column, so the columns stay in line.
    const refused = screen.getByText('SSO loop').closest('tr') as HTMLTableRowElement
    expect(refused.cells).toHaveLength(3)
    expect(refused.cells[0]?.childElementCount).toBe(0)
    expect(refused.cells[0]?.textContent).toBe('')

    // `expanded` holds its id, and it still draws no detail.
    expect(details().map((row) => row.textContent)).toEqual(['Detail of Webhook retries'])
    expect(refused.nextElementSibling?.hasAttribute('data-detail')).toBe(false)
  })

  it('keeps the default name when messages come without detailsLabel', () => {
    table({
      messages: { selected: (count) => `${count} chosen`, selectAll: 'All', selectRow: 'Row' },
    })
    expect(disclosure('Webhook retries')).toBeTruthy()
  })

  it('draws a placeholder for the expansion column while loading, and no detail', () => {
    table({ loading: true, expanded: new Set(['a']) })
    const grid = screen.getByRole('grid')
    const headers = grid.querySelectorAll('thead th').length
    const rows = Array.from(grid.querySelectorAll<HTMLTableRowElement>('tbody tr'))
    expect(headers).toBe(3)
    expect(rows).toHaveLength(5)
    for (const row of rows) expect(row.cells).toHaveLength(headers)
    expect(details()).toHaveLength(0)
  })

  it('does not give the detail a selected row’s colours', () => {
    table({ expanded: new Set(['a']), selection: new Set(['a']), onSelectionChange: vi.fn() })
    const row = disclosure('Webhook retries').closest('tr') as HTMLTableRowElement
    const detail = details()[0]?.querySelector('td') as HTMLTableCellElement
    expect(row.getAttribute('aria-selected')).toBe('true')
    expect(details()[0]?.hasAttribute('aria-selected')).toBe(false)
    const selected = getComputedStyle(row.cells[2] as HTMLTableCellElement).backgroundColor
    expect(getComputedStyle(detail).backgroundColor).not.toBe(selected)
  })

  it('keeps a long detail out of a narrow table’s width', async () => {
    const host = fixedWidthHost(320)
    table(
      {
        rowDetail: () => (
          <p>
            The endpoint answered 503 twice and no third attempt was queued, so the delivery stopped
            after the second retry and the event was never received.
          </p>
        ),
      },
      host,
    )
    const grid = screen.getByRole('grid')
    const closed = grid.getBoundingClientRect().width

    await userEvent.click(disclosure('Webhook retries'))
    const detail = details()[0] as HTMLElement
    // Below `36rem` the table is as wide as its columns need. The detail wraps inside that
    // width instead of setting it.
    expect(grid.getBoundingClientRect().width).toBe(closed)
    expect(detail.getBoundingClientRect().width).toBeLessThanOrEqual(closed)
    host.remove()
  })
})

describe('DataTable row detail, in a table that pans', () => {
  /** Six columns, which a 375px container cannot show at once. */
  const SIX: DataTableColumn<Row>[] = [
    { key: 'subject', header: 'Ticket' },
    { key: 'requester', header: 'Requester', cell: () => 'dana@northwind.example' },
    { key: 'status', header: 'Status', cell: () => 'Waiting on the customer' },
    { key: 'assignee', header: 'Assignee', cell: () => 'M. Okafor' },
    { key: 'opened', header: 'Opened', cell: () => '12 November' },
    { key: 'minutes', header: 'Updated', numeric: true },
  ]

  const NOTE =
    'The endpoint answered 503 twice and no third attempt was queued, so the delivery stopped ' +
    'after the second retry and the event was never received.'

  it('keeps the detail and its text inside the visible table, at each end of the pan', async () => {
    const host = fixedWidthHost(375)
    table({ columns: SIX, expanded: new Set(['a']), rowDetail: () => <p>{NOTE}</p> }, host)
    const port = host.querySelector('[data-member="table"]') as HTMLElement
    // The table is wider than its wrapper, so the wrapper pans.
    await vi.waitFor(() => expect(port.hasAttribute('data-overflowing')).toBe(true))
    expect(port.scrollWidth).toBeGreaterThan(port.clientWidth)

    const box = details()[0]?.querySelector('td > div') as HTMLElement
    const text = screen.getByText(NOTE)
    const inside = () => {
      const visible = port.getBoundingClientRect()
      for (const node of [box, text]) {
        const rect = node.getBoundingClientRect()
        expect(rect.left).toBeGreaterThanOrEqual(visible.left)
        expect(rect.right).toBeLessThanOrEqual(visible.right)
      }
    }
    inside()

    // Panned to the far end, the detail is still the part of the table a reader sees.
    port.scrollLeft = port.scrollWidth
    await vi.waitFor(() => expect(port.scrollLeft).toBeGreaterThan(0))
    inside()
    host.remove()
  })
})

describe('DataTable with a sticky header', () => {
  const MANY: Row[] = Array.from({ length: 24 }, (_, index) => ({
    id: `r${index}`,
    subject: `Ticket ${index}`,
    minutes: index,
  }))

  const NOTE =
    'The endpoint answered 503 twice and no third attempt was queued, so the delivery stopped ' +
    'after the second retry and the event was never received.'

  /** A scroll port shorter than the table. The header sticks to its top. */
  function scrollPort() {
    const port = fixedWidthHost(720)
    port.style.blockSize = '240px'
    port.style.overflowY = 'auto'
    return port
  }

  interface Point {
    x: number
    y: number
  }

  const holds = (rect: DOMRect, { x, y }: Point) =>
    rect.left <= x && x <= rect.right && rect.top <= y && y <= rect.bottom

  /** The points read on a header cell: its middle, and the middle and both ends of what it holds. */
  function pointsOf(header: HTMLElement): Point[] {
    const cell = header.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(header)
    const held = range.getBoundingClientRect()
    const y = held.top + held.height / 2
    const ends = [
      { x: held.left + 1, y },
      { x: held.left + held.width / 2, y },
      { x: held.right - 1, y },
    ]
    // The expansion column's name is clipped to a pixel that is not laid out in
    // the cell, so only the points inside the cell are the cell's to draw.
    return [
      { x: cell.left + cell.width / 2, y: cell.top + cell.height / 2 },
      ...ends.filter((point) => holds(cell, point)),
    ]
  }

  /**
   * Scrolls the port through its whole range in small steps. At each step every
   * point of every header cell must be drawn by that cell: what is on top there
   * is the cell or something inside it. It returns how many of those readings
   * were made while one of `passing` was behind the point, so a test can tell
   * that something did pass under the header.
   */
  function sweep(port: HTMLElement, passing: () => HTMLElement[]) {
    const head = port.querySelector('thead') as HTMLElement
    const headers = Array.from(head.querySelectorAll<HTMLElement>('th'))
    const last = port.scrollHeight - port.clientHeight
    expect(last).toBeGreaterThan(0)
    let crossings = 0
    for (let top = 0; top <= last; top += 5) {
      port.scrollTop = top
      // The header does not leave the port with the rows above it.
      expect(head.getBoundingClientRect().top - port.getBoundingClientRect().top).toBeGreaterThan(
        -1,
      )
      const behind = passing().map((node) => node.getBoundingClientRect())
      for (const header of headers) {
        for (const point of pointsOf(header)) {
          if (behind.some((rect) => holds(rect, point))) crossings += 1
          const drawn = document.elementFromPoint(point.x, point.y)
          expect(
            header.contains(drawn),
            `at scroll ${top}, ${drawn?.tagName.toLowerCase()} is drawn over the header "${header.textContent}"`,
          ).toBe(true)
        }
      }
    }
    // Scrolled to the end, the header is stuck to the port's top edge.
    expect(
      Math.abs(head.getBoundingClientRect().top - port.getBoundingClientRect().top),
    ).toBeLessThan(1)
    return crossings
  }

  it('keeps an open row’s detail under the stuck header', () => {
    const port = scrollPort()
    table(
      { data: MANY, stickyHeader: true, expanded: new Set(['r3']), rowDetail: () => <p>{NOTE}</p> },
      port,
    )
    port.scrollIntoView()
    const detail = details()[0]?.querySelector('td > div') as HTMLElement

    // The detail's box did pass behind the header's cells, so the reading means something.
    expect(sweep(port, () => [detail])).toBeGreaterThan(0)
    port.remove()
  })

  it('keeps the rows’ checkboxes and disclosures under the stuck header', () => {
    const port = scrollPort()
    table(
      {
        data: MANY,
        stickyHeader: true,
        selection: new Set(['r5']),
        onSelectionChange: () => undefined,
      },
      port,
    )
    port.scrollIntoView()
    const body = port.querySelector('tbody') as HTMLElement
    const controls = Array.from(body.querySelectorAll<HTMLElement>('button'))
    expect(controls.length).toBe(MANY.length * 2)

    expect(sweep(port, () => controls)).toBeGreaterThan(0)
    port.remove()
  })
})

describe('DataTable row detail, closed from inside', () => {
  /** A detail with a button that closes it, as a detail's Save or Done does. */
  const closable = ({ row, close }: DataTableRowDetail<Row>) => (
    <>
      <p>Detail of {row.subject}</p>
      <Button
        variant="ghost"
        tone="neutral"
        size="sm"
        label={`Done with ${row.subject}`}
        onClick={close}
      />
    </>
  )

  const done = (subject: string) => screen.getByRole('button', { name: `Done with ${subject}` })

  const lastSet = (spy: ReturnType<typeof vi.fn>) => [
    ...(spy.mock.lastCall?.[0] as ReadonlySet<string>),
  ]

  it('hands rowDetail the row the caller put in data', () => {
    const handed: Row[] = []
    table({
      expanded: new Set(['b']),
      rowDetail: ({ row }) => {
        handed.push(row)
        return null
      },
    })
    expect(handed[0]).toBe(DATA[1])
  })

  it('closes the detail and returns focus to the row’s disclosure', async () => {
    const onExpandedChange = vi.fn()
    table({ rowDetail: closable, onExpandedChange })
    await userEvent.click(disclosure('Webhook retries'))
    await userEvent.click(disclosure('SSO loop'))

    done('SSO loop').focus()
    await userEvent.keyboard('{Enter}')
    expect(details().map((row) => row.querySelector('p')?.textContent)).toEqual([
      'Detail of Webhook retries',
    ])
    expect(lastSet(onExpandedChange)).toEqual(['a'])
    // Focus is on the disclosure of the row that closed, not on the page.
    expect(document.activeElement).toBe(disclosure('SSO loop'))
    expect(disclosure('SSO loop').getAttribute('aria-expanded')).toBe('false')
  })

  it('moves focus before a caller that holds the set removes the row', async () => {
    const onExpandedChange = vi.fn()
    const { again } = table({ rowDetail: closable, expanded: new Set(['a']), onExpandedChange })

    done('Webhook retries').focus()
    await userEvent.keyboard('{Enter}')
    expect(lastSet(onExpandedChange)).toEqual([])
    // The caller has not passed the next set yet, so the detail is still drawn.
    expect(details()).toHaveLength(1)
    expect(document.activeElement).toBe(disclosure('Webhook retries'))

    again({ rowDetail: closable, expanded: new Set(), onExpandedChange })
    expect(details()).toHaveLength(0)
    expect(document.activeElement).toBe(disclosure('Webhook retries'))
  })

  it('leaves focus where it is when it is outside the detail', async () => {
    const closes: (() => void)[] = []
    table({
      rowDetail: ({ row, close }) => {
        if (row.id === 'a') closes.push(close)
        return <p>Detail of {row.subject}</p>
      },
    })
    await userEvent.click(disclosure('Webhook retries'))
    const elsewhere = disclosure('Empty CSV')
    elsewhere.focus()

    act(() => closes.at(-1)?.())
    expect(details()).toHaveLength(0)
    expect(document.activeElement).toBe(elsewhere)
  })

  it('reads the open rows as they are when it is called, and does nothing for a closed row', async () => {
    const onExpandedChange = vi.fn()
    const closes: (() => void)[] = []
    table({
      onExpandedChange,
      rowDetail: ({ row, close }) => {
        if (row.id === 'a') closes.push(close)
        return <p>Detail of {row.subject}</p>
      },
    })
    await userEvent.click(disclosure('Webhook retries'))
    // The first `close` the detail was handed, kept across a later render, as a
    // handler that awaits keeps it.
    const first = closes[0] as () => void
    await userEvent.click(disclosure('SSO loop'))

    act(() => first())
    // The row opened since is still open.
    expect(details().map((row) => row.textContent)).toEqual(['Detail of SSO loop'])
    expect(lastSet(onExpandedChange)).toEqual(['b'])

    const calls = onExpandedChange.mock.calls.length
    act(() => first())
    expect(onExpandedChange).toHaveBeenCalledTimes(calls)
    expect(details()).toHaveLength(1)
  })
})

describe('DataTable row expansion, in the grid', () => {
  const stops = () =>
    Array.from(screen.getByRole('grid').querySelectorAll<HTMLElement>('[tabindex="0"]'))

  /** The one cell of the open detail row at `index`. */
  const detailCell = (index = 0) => details()[index]?.querySelector(':scope > td') as HTMLElement

  it('reaches an open row’s detail with ArrowDown, then the next row in the column it left', async () => {
    table({ expanded: new Set(['a']) })
    disclosure('Webhook retries').focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(document.activeElement?.textContent).toBe('4')

    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(detailCell())
    // The detail cell holds the grid's one stop, as a cell of text does.
    expect(stops()).toEqual([detailCell()])
    // The ring shows where focus is, as on any cell the keys reach.
    expect(getComputedStyle(detailCell()).outlineStyle).toBe('solid')

    await userEvent.keyboard('{ArrowDown}')
    // The third column of the next row, where the reader was before the detail.
    expect(document.activeElement?.textContent).toBe('26')
  })

  it('returns with ArrowUp, from the row below to the detail and from the detail to its row', async () => {
    table({ expanded: new Set(['a']) })
    disclosure('SSO loop').focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(document.activeElement?.textContent).toBe('26')

    await userEvent.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(detailCell())

    await userEvent.keyboard('{ArrowUp}')
    expect(document.activeElement?.textContent).toBe('4')
  })

  it('stays in a detail cell on ArrowLeft, ArrowRight, Home and End, and takes the keys', async () => {
    table({ expanded: new Set(['a']) })
    disclosure('Webhook retries').focus()
    await userEvent.keyboard('{ArrowRight}{ArrowDown}')
    const cell = detailCell()
    expect(document.activeElement).toBe(cell)

    // A key the grid takes does not also scroll the page.
    const taken: boolean[] = []
    const seen = (event: KeyboardEvent) => taken.push(event.defaultPrevented)
    document.addEventListener('keydown', seen)
    await userEvent.keyboard('{ArrowLeft}{ArrowRight}{Home}{End}')
    document.removeEventListener('keydown', seen)

    expect(taken).toEqual([true, true, true, true])
    expect(document.activeElement).toBe(cell)
    expect(stops()).toEqual([cell])

    await userEvent.keyboard('{ArrowDown}')
    // The column is still the one the reader came from.
    expect(document.activeElement?.textContent).toBe('SSO loop')
  })

  it('leaves a detail cell for the grid’s first and last cell with Ctrl+Home and Ctrl+End', async () => {
    table({ expanded: new Set(['a']) })
    disclosure('Webhook retries').focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(detailCell())

    await userEvent.keyboard('{Control>}{End}{/Control}')
    expect(document.activeElement?.textContent).toBe('91')

    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    expect(document.activeElement).toBe(detailCell())

    await userEvent.keyboard('{Control>}{Home}{/Control}')
    expect(document.activeElement).toBe(screen.getByRole('columnheader', { name: 'Details' }))
  })

  it('reaches the last row’s detail from its row, and stays there at the grid’s end', async () => {
    table({ expanded: new Set(['c']) })
    disclosure('Webhook retries').focus()

    await userEvent.keyboard('{Control>}{End}{/Control}')
    // The last cell of the last grid row. Its detail is one ArrowDown further.
    expect(document.activeElement?.textContent).toBe('91')

    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(detailCell())

    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(detailCell())
  })

  it('leaves the stop on the row when its detail closes under it', async () => {
    const view = table({ expanded: new Set(['a']) })
    disclosure('Webhook retries').focus()
    await userEvent.keyboard('{ArrowRight}{ArrowDown}')
    expect(stops()).toEqual([detailCell()])

    view.again({ expanded: new Set() })
    // The row the detail was under, in the column the reader came from.
    expect(stops().map((stop) => stop.textContent)).toEqual(['Webhook retries'])
  })

  it('starts on the first data column’s header in a table without selection', () => {
    table()
    // The expansion column's header draws nothing, so it is not where Tab lands.
    expect(stops()).toEqual([screen.getByRole('columnheader', { name: 'Ticket' })])
  })

  it('starts on the header’s checkbox in a table with selection', () => {
    table({ selection: new Set(), onSelectionChange: () => undefined })
    expect(stops()).toEqual([screen.getByRole('checkbox', { name: 'Select all' })])
  })

  it('reaches the expansion column’s header with the arrow keys, and keeps the stop there', async () => {
    const view = table()
    const first = screen.getByRole('columnheader', { name: 'Ticket' })
    first.focus()

    await userEvent.keyboard('{ArrowLeft}')
    const named = screen.getByRole('columnheader', { name: 'Details' })
    expect(document.activeElement).toBe(named)
    expect(stops()).toEqual([named])

    // A stop the reader placed stays where it is when the table draws again.
    view.again({ data: [...DATA] })
    expect(stops()).toEqual([named])
  })

  it('toggles a row from the keyboard, and keeps the stop on its disclosure', async () => {
    table()
    const first = disclosure('Webhook retries')
    first.focus()

    await userEvent.keyboard('{Enter}')
    expect(first.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(first)
    expect(stops()).toEqual([first])

    await userEvent.keyboard(' ')
    expect(first.getAttribute('aria-expanded')).toBe('false')
    expect(details()).toHaveLength(0)
  })

  it('makes the detail cell reachable, and writes no tabindex on what it holds', () => {
    table({
      expanded: new Set(['a']),
      rowDetail: ({ row }) => (
        <table>
          <tbody>
            <tr>
              <td>Inner cell of {row.subject}</td>
            </tr>
          </tbody>
        </table>
      ),
    })
    const cell = detailCell()
    expect(cell.getAttribute('tabindex')).toBe('-1')
    expect(cell.querySelectorAll('[tabindex]')).toHaveLength(0)
    // One stop in the grid, as without a detail.
    expect(stops()).toHaveLength(1)
  })

  it('goes from the detail cell into its controls with Tab', async () => {
    table({
      expanded: new Set(['a']),
      rowDetail: () => <Input aria-label="Reply" />,
    })
    disclosure('Webhook retries').focus()
    await userEvent.keyboard('{ArrowDown}')
    const cell = detailCell()
    expect(document.activeElement).toBe(cell)

    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Reply' }))
    // The field is a tab stop of the page. The grid's stop stays on the detail cell.
    expect(stops()).toEqual([cell])
  })

  it('reaches a field inside the detail with Tab from the row’s disclosure', async () => {
    table({
      expanded: new Set(['a']),
      rowDetail: () => <Input aria-label="Reply" />,
    })
    const first = disclosure('Webhook retries')
    first.focus()

    await userEvent.tab()
    const field = screen.getByRole('textbox', { name: 'Reply' })
    expect(document.activeElement).toBe(field)
    // The detail's field is a tab stop of the page. The grid's own stop stays where it was.
    expect(stops()).toEqual([first])
  })

  it('leaves the arrow keys to what the detail holds', async () => {
    table({
      expanded: new Set(['a']),
      rowDetail: () => <Button variant="ghost" tone="neutral" size="sm" label="Reply" />,
    })
    const first = disclosure('Webhook retries')
    first.focus()
    const reply = screen.getByRole('button', { name: 'Reply' })
    reply.focus()

    await userEvent.keyboard('{ArrowDown}{ArrowRight}{Home}')
    expect(document.activeElement).toBe(reply)
    // Focus inside the detail does not move the grid's stop either.
    expect(stops()).toEqual([first])
  })

  it('keeps the grid’s keys inside a table the detail holds', async () => {
    table({
      expanded: new Set(['a']),
      rowDetail: () => (
        <table>
          <tbody>
            <tr>
              <td>
                <Button variant="ghost" tone="neutral" size="sm" label="Inner" />
              </td>
              <td>Beside</td>
            </tr>
          </tbody>
        </table>
      ),
    })
    const first = disclosure('Webhook retries')
    first.focus()
    const inner = screen.getByRole('button', { name: 'Inner' })
    inner.focus()

    await userEvent.keyboard('{ArrowRight}{ArrowDown}')
    // The nearest cell is the inner table's, which is no cell of the grid.
    expect(document.activeElement).toBe(inner)
    expect(stops()).toEqual([first])
  })
})

/**
 * The Table a DataTable draws is the DataTable's part (`design/components/data-table.md` and
 * `table.md`, Agent): it registers nothing, so an agent sees one DataTable. A Table the
 * application puts in a row's detail is its own, and registers.
 */
describe('DataTable, for an agent', () => {
  it('is one member, and a table in a detail is the application’s', async () => {
    table({
      rowDetail: ({ row }) => (
        <Table label={`Replies to ${row.subject}`}>
          <Table.Head>
            <Table.Row>
              <Table.Header sortable>Sent</Table.Header>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            <Table.Row>
              <Table.Cell>Monday</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      ),
      defaultExpanded: new Set(['a']),
    })
    await vi.waitFor(() => expect(details()).toHaveLength(1))
    const tables = agentRegistrations().filter((entry) => entry.member === 'Table')
    expect(tables).toHaveLength(1)
    expect(details()[0]?.contains(tables[0]?.element ?? null)).toBe(true)
    const bridge = createAgentBridge()
    try {
      const members = bridge.snapshot().members
      const [data] = members.filter((member) => member.member === 'DataTable')
      const [inner] = members.filter((member) => member.member === 'Table')
      expect(inner).toMatchObject({
        within: data?.id,
        state: { columns: [{ id: 'Sent', label: 'Sent' }] },
      })
    } finally {
      bridge.dispose()
    }
  })
})

/**
 * A row that leaves while it holds focus (`design/components/data-table.md`, the grid model):
 * a browser hands focus to the page, and the grid takes it back to the same column of the row
 * that takes the removed row's place, or of the last row.
 */
describe('DataTable, when the focused row leaves', () => {
  it('keeps focus in the grid, on the same column of the next row', async () => {
    const view = table({ rowDetail: undefined })
    screen.getByRole('cell', { name: 'SSO loop' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('cell', { name: '26' })),
    )
    view.again({ data: DATA.filter((row) => row.id !== 'b') })
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('cell', { name: '91' })),
    )
  })

  it('goes to the row before when the last row leaves', async () => {
    const view = table({ rowDetail: undefined })
    screen.getByRole('cell', { name: 'Empty CSV' }).focus()
    view.again({ data: DATA.filter((row) => row.id !== 'c') })
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('cell', { name: 'SSO loop' })),
    )
  })

  it('leaves focus the reader moved out of the grid', async () => {
    const view = render(<Input aria-label="Filter" />)
    const rows = table({ rowDetail: undefined })
    screen.getByRole('cell', { name: 'SSO loop' }).focus()
    const filter = view.getByRole('textbox', { name: 'Filter' })
    filter.focus()
    rows.again({ data: DATA.filter((row) => row.id !== 'b') })
    await new Promise((settle) => setTimeout(settle, 50))
    expect(document.activeElement).toBe(filter)
  })
})
