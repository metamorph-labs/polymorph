import { Component, signal } from '@angular/core'
import { getAllByRole, getByRole, queryByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { mountComponent } from '../mount'
import { DataTable } from './DataTable'
import { Table } from './Table'
import { TableBody } from './TableBody'
import { TableCell } from './TableCell'
import { TableRow } from './TableRow'

/**
 * A row's click in the Angular shell (`design/components/table.md`,
 * `design/components/data-table.md`). `Table.Row` is a part drawn on its own
 * `<tr>`, whose host hears no DOM event of an output's name, so it listens for
 * its own click through its member context; a host binding would be attached
 * after the host stops hearing `click`, and no click would reach the row. The
 * contract's `click activates on row` holds this in every shell; these hold
 * the rest of the rule: once per click, only when the row is interactive, and
 * never for a DataTable row's checkbox or its disclosure.
 *
 * Row expansion is held here too, as the React member's tests hold it
 * (`packages/react-ui/src/structure/data-table.test.tsx`): `rowDetail` is an
 * input that takes an `ng-template`, which reads the detail's `row` and
 * `close` by name.
 */

beforeAll(installTestTheme)

@Component({
  selector: 'test-rows',
  imports: [Table, TableBody, TableRow, TableCell],
  template: `<pm-table label="Tickets"
    ><tbody pmTableBody>
      <tr pmTableRow [interactive]="interactive()" (click)="clicks.set(clicks() + 1)">
        <td pmTableCell>T-1041</td>
      </tr>
    </tbody></pm-table
  >`,
})
class Rows {
  readonly interactive = signal(false)
  readonly clicks = signal(0)
}

interface Ticket {
  id: string
  subject: string
}

const TICKETS: Ticket[] = [
  { id: 'a', subject: 'Webhook retries' },
  { id: 'b', subject: 'SSO loop' },
]

@Component({
  selector: 'test-data-table',
  imports: [DataTable],
  template: `<pm-data-table
    label="Tickets"
    [columns]="columns"
    [data]="tickets"
    [getRowId]="idOf"
    [emptyState]="empty"
    [selection]="selection()"
    (selectionChange)="selection.set($event)"
    (rowClick)="opened($event)"
  />`,
})
class Tickets {
  readonly columns = [{ key: 'subject', header: 'Ticket' }]
  readonly tickets = TICKETS
  readonly idOf = (ticket: Ticket) => ticket.id
  readonly empty = { title: 'Nothing here', description: 'Try a wider filter.' }
  readonly selection = signal<ReadonlySet<string>>(new Set())
  readonly opened = vi.fn<(ticket: Ticket) => void>()
}

@Component({
  selector: 'test-expandable',
  imports: [DataTable],
  template: `<ng-template #detail let-row="row" let-close="close" let-whole
      ><p>Detail of {{ row.subject }}</p>
      @if (field()) {
        <input aria-label="Reply" />
      }
      @if (closable()) {
        <button type="button" (click)="close()">Done with {{ row.subject }}</button>
      }
      {{ seen(row, whole) }}</ng-template
    ><pm-data-table
      label="Tickets"
      [columns]="columns"
      [data]="tickets"
      [getRowId]="idOf"
      [getRowLabel]="labelOf"
      [getRowName]="nameOf"
      [isRowExpandable]="expandableRow()"
      [emptyState]="empty"
      [rowDetail]="detail"
      [expanded]="expanded()"
      [defaultExpanded]="firstOpen"
      [selection]="selection()"
      (expandedChange)="changed($event)"
      (rowClick)="opened($event)"
    />`,
})
class Expandable {
  readonly columns = [{ key: 'subject', header: 'Ticket' }]
  readonly tickets = TICKETS
  readonly idOf = (ticket: Ticket) => ticket.id
  readonly labelOf = (ticket: Ticket) => `Select ${ticket.subject}`
  readonly nameOf = (ticket: Ticket) => ticket.subject
  /** `undefined` leaves every row expandable. */
  readonly expandableRow = signal<((ticket: Ticket) => boolean) | undefined>(undefined)
  readonly empty = { title: 'Nothing here', description: 'Try a wider filter.' }
  /** `undefined` leaves the member holding its own open rows. */
  readonly expanded = signal<ReadonlySet<string> | undefined>(undefined)
  /** The rows open at first. A test sets it before the component is drawn. */
  static firstOpen: ReadonlySet<string> | undefined = undefined
  readonly firstOpen = Expandable.firstOpen
  readonly selection = signal<ReadonlySet<string> | undefined>(undefined)
  readonly changed = vi.fn<(next: ReadonlySet<string>) => void>()
  readonly opened = vi.fn<(ticket: Ticket) => void>()
  /** Whether the detail draws a button that closes it. */
  readonly closable = signal(false)
  /** Whether the detail draws a text field, before the button. */
  readonly field = signal(false)
  /** What the detail's template was handed: the named row, and the argument as a whole. */
  readonly handed: { row: Ticket; whole: { row: Ticket; close: () => void } }[] = []
  seen(row: Ticket, whole: { row: Ticket; close: () => void }): string {
    this.handed.push({ row, whole })
    return ''
  }
}

const disclosure = (host: HTMLElement, subject: string) =>
  getByRole(host, 'button', { name: `Details for ${subject}` })

const details = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('tr[data-detail]')]

/** The one cell of the open detail row at `index`. */
const detailCell = (host: HTMLElement, index = 0) =>
  details(host)[index]?.querySelector(':scope > td') as HTMLElement

/** The grid's tab stops. A grid has one. */
const stops = (host: HTMLElement) => [
  ...getByRole(host, 'grid').querySelectorAll<HTMLElement>('[tabindex="0"]'),
]

const focused = () => document.activeElement?.textContent?.trim()

describe('Table.Row', () => {
  it('runs its click once per click, and only while it is interactive', async () => {
    const { host, ref } = await mountComponent(Rows)
    const rows = ref.instance as Rows
    await userEvent.click(getByRole(host, 'cell', { name: 'T-1041' }))
    expect(rows.clicks(), 'a row that is not interactive took the click').toBe(0)
    rows.interactive.set(true)
    await vi.waitFor(() => expect(host.querySelector('tr[data-interactive]')).not.toBeNull())
    await userEvent.click(getByRole(host, 'cell', { name: 'T-1041' }))
    expect(rows.clicks()).toBe(1)
  })
})

describe('DataTable', () => {
  it('opens the row a click lands on, with the row, and never from its checkbox', async () => {
    const { host, ref } = await mountComponent(Tickets)
    const tickets = ref.instance as Tickets
    await userEvent.click(getAllByRole(host, 'checkbox', { name: 'Select row' })[1] as HTMLElement)
    await vi.waitFor(() => expect([...tickets.selection()]).toEqual(['b']))
    expect(tickets.opened, 'a checkbox click opened its row').not.toHaveBeenCalled()
    await userEvent.click(getByRole(host, 'cell', { name: 'SSO loop' }))
    expect(tickets.opened).toHaveBeenCalledTimes(1)
    expect(tickets.opened).toHaveBeenCalledWith(TICKETS[1])
  })
})

describe('DataTable row expansion', () => {
  it('opens and closes a row from its disclosure, and never opens the row', async () => {
    const { host, ref } = await mountComponent(Expandable)
    const table = ref.instance as Expandable
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
    expect(table.opened, 'a disclosure click opened its row').not.toHaveBeenCalled()

    await userEvent.click(disclosure(host, 'SSO loop'))
    await vi.waitFor(() => expect(details(host)).toHaveLength(2))
    await userEvent.click(first)
    await vi.waitFor(() => expect(details(host)).toHaveLength(1))
    expect(table.changed.mock.calls.map(([next]) => [...next])).toEqual([['a'], ['a', 'b'], ['b']])
  })

  it('hands the template the caller’s row by name, and the whole detail as its argument', async () => {
    const { host, ref } = await mountComponent(Expandable)
    const table = ref.instance as Expandable
    table.expanded.set(new Set(['b']))
    await vi.waitFor(() => expect(details(host)).toHaveLength(1))
    const seen = table.handed.at(-1)
    expect(seen?.row).toBe(TICKETS[1])
    expect(seen?.whole.row).toBe(TICKETS[1])
    expect(typeof seen?.whole.close).toBe('function')
  })

  it('closes a detail from inside it, and returns focus to the row’s disclosure', async () => {
    const { host, ref } = await mountComponent(Expandable)
    const table = ref.instance as Expandable
    table.closable.set(true)
    await userEvent.click(disclosure(host, 'Webhook retries'))
    await userEvent.click(disclosure(host, 'SSO loop'))
    await vi.waitFor(() => expect(details(host)).toHaveLength(2))

    const done = getByRole(host, 'button', { name: 'Done with SSO loop' })
    done.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(details(host)).toHaveLength(1))
    expect([...(table.changed.mock.lastCall?.[0] as ReadonlySet<string>)]).toEqual(['a'])
    // Focus is on the disclosure of the row that closed, not on the page.
    expect(document.activeElement).toBe(disclosure(host, 'SSO loop'))
  })

  it('moves focus before a caller that holds the set removes the row', async () => {
    const { host, ref } = await mountComponent(Expandable)
    const table = ref.instance as Expandable
    table.closable.set(true)
    table.expanded.set(new Set(['a']))
    await vi.waitFor(() => expect(details(host)).toHaveLength(1))

    const done = getByRole(host, 'button', { name: 'Done with Webhook retries' })
    done.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(table.changed).toHaveBeenCalledTimes(1))
    expect([...(table.changed.mock.lastCall?.[0] as ReadonlySet<string>)]).toEqual([])
    // The caller has not passed the next set, so the detail is still drawn.
    expect(details(host)).toHaveLength(1)
    expect(document.activeElement).toBe(disclosure(host, 'Webhook retries'))
  })

  it('draws the rows the caller says are open, and only asks for a change', async () => {
    const { host, ref } = await mountComponent(Expandable)
    const table = ref.instance as Expandable
    table.expanded.set(new Set(['a']))
    await vi.waitFor(() => expect(details(host)).toHaveLength(1))

    await userEvent.click(disclosure(host, 'SSO loop'))
    await vi.waitFor(() => expect(table.changed).toHaveBeenCalledTimes(1))
    expect([...(table.changed.mock.lastCall?.[0] as ReadonlySet<string>)]).toEqual(['a', 'b'])
    expect(details(host)).toHaveLength(1)
  })

  it('starts with the rows defaultExpanded names open, and holds the set from there', async () => {
    Expandable.firstOpen = new Set(['b'])
    const { host, ref } = await mountComponent(Expandable)
    Expandable.firstOpen = undefined
    const table = ref.instance as Expandable
    await vi.waitFor(() =>
      expect(details(host).map((row) => row.textContent?.trim())).toEqual(['Detail of SSO loop']),
    )

    await userEvent.click(disclosure(host, 'Webhook retries'))
    await vi.waitFor(() => expect(details(host)).toHaveLength(2))
    expect([...(table.changed.mock.lastCall?.[0] as ReadonlySet<string>)]).toEqual(['b', 'a'])
  })

  it('keeps its own set current while the caller holds it, for a caller that stops', async () => {
    const { host, ref } = await mountComponent(Expandable)
    const table = ref.instance as Expandable
    table.expanded.set(new Set(['a']))
    await vi.waitFor(() => expect(details(host)).toHaveLength(1))
    await userEvent.click(disclosure(host, 'SSO loop'))
    await vi.waitFor(() => expect(table.changed).toHaveBeenCalledTimes(1))
    // The caller keeps its set, so the row it was asked to open stays closed.
    expect(details(host)).toHaveLength(1)

    table.expanded.set(undefined)
    // The table holds the set now, as its last change left it.
    await vi.waitFor(() => expect(details(host)).toHaveLength(2))
  })

  it('gives a row isRowExpandable refuses an empty cell, and never a detail', async () => {
    const { host, ref } = await mountComponent(Expandable)
    const table = ref.instance as Expandable
    table.expandableRow.set((ticket) => ticket.id !== 'b')
    table.expanded.set(new Set(['a', 'b']))
    await vi.waitFor(() => expect(details(host)).toHaveLength(1))
    expect(queryByRole(host, 'button', { name: 'Details for SSO loop' })).toBeNull()
    expect(disclosure(host, 'Webhook retries')).toBeTruthy()
    const refused = getByRole(host, 'cell', { name: 'SSO loop' }).closest(
      'tr',
    ) as HTMLTableRowElement
    expect(refused.cells).toHaveLength(2)
    expect(refused.cells[0]?.childElementCount).toBe(0)
    // `expanded` holds its id, and it still draws no detail.
    expect(details(host)[0]?.querySelector('p')?.textContent).toBe('Detail of Webhook retries')
  })

  it('spans the detail across every column, the selection column included', async () => {
    const { host, ref } = await mountComponent(Expandable)
    const table = ref.instance as Expandable
    table.expanded.set(new Set(['a']))
    table.selection.set(new Set())
    await vi.waitFor(() => expect(getAllByRole(host, 'checkbox').length).toBeGreaterThan(0))
    // `getRowLabel` is the checkbox's whole name. The disclosure is named from the row's own.
    expect(getByRole(host, 'checkbox', { name: 'Select SSO loop' })).toBeTruthy()
    expect(disclosure(host, 'SSO loop')).toBeTruthy()
    const cells = (details(host)[0] as HTMLElement).querySelectorAll('td')
    expect(cells).toHaveLength(1)
    expect(cells[0]?.colSpan).toBe(3)
    expect(getByRole(host, 'grid').querySelectorAll('thead th')).toHaveLength(3)
    expect(getByRole(host, 'columnheader', { name: 'Details' })).toBeTruthy()
  })

  it('reaches an open row’s detail with ArrowDown and ArrowUp, and keeps the column it left', async () => {
    const { host, ref } = await mountComponent(Expandable)
    const table = ref.instance as Expandable
    table.expanded.set(new Set(['a', 'b']))
    await vi.waitFor(() => expect(details(host)).toHaveLength(2))
    const first = disclosure(host, 'Webhook retries')
    first.focus()
    await vi.waitFor(() => expect(first.getAttribute('tabindex')).toBe('0'))

    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(focused()).toBe('Webhook retries'))
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
    await vi.waitFor(() => expect(focused()).toBe('SSO loop'))
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    // The last row's detail is one ArrowDown from its row, and the grid ends there.
    await vi.waitFor(() => expect(document.activeElement).toBe(detailCell(host, 1)))

    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    await vi.waitFor(() => expect(document.activeElement).toBe(detailCell(host)))
    await userEvent.keyboard('{ArrowUp}')
    await vi.waitFor(() => expect(focused()).toBe('Webhook retries'))
  })

  it('goes from the detail cell into its controls with Tab, and leaves them their keys', async () => {
    const { host, ref } = await mountComponent(Expandable)
    const table = ref.instance as Expandable
    table.closable.set(true)
    table.field.set(true)
    table.expanded.set(new Set(['a']))
    await vi.waitFor(() => expect(details(host)).toHaveLength(1))
    const first = disclosure(host, 'Webhook retries')
    first.focus()
    await vi.waitFor(() => expect(first.getAttribute('tabindex')).toBe('0'))
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(document.activeElement).toBe(detailCell(host)))

    await userEvent.tab()
    expect(document.activeElement).toBe(getByRole(host, 'textbox', { name: 'Reply' }))

    const done = getByRole(host, 'button', { name: 'Done with Webhook retries' })
    done.focus()
    await userEvent.keyboard('{ArrowDown}{ArrowRight}{Home}')
    // A key pressed in what the detail holds is that control's own, and the grid's stop stays.
    expect(document.activeElement).toBe(done)
    expect(stops(host)).toEqual([detailCell(host)])
  })

  it('starts on the first data column’s header, and reaches the expansion column’s with the arrow keys', async () => {
    const { host } = await mountComponent(Expandable)
    const ticket = getByRole(host, 'columnheader', { name: 'Ticket' })
    // The expansion column's header draws nothing, so it is not where Tab lands.
    await vi.waitFor(() => expect(stops(host)).toEqual([ticket]))

    ticket.focus()
    await userEvent.keyboard('{ArrowLeft}')
    const named = getByRole(host, 'columnheader', { name: 'Details' })
    await vi.waitFor(() => expect(document.activeElement).toBe(named))
    expect(stops(host)).toEqual([named])
  })

  it('starts on the header’s checkbox once the table has selection', async () => {
    const { host, ref } = await mountComponent(Expandable)
    const table = ref.instance as Expandable
    await vi.waitFor(() => expect(stops(host)).toHaveLength(1))
    table.selection.set(new Set())
    // The reader has not placed the stop, so it is where the grid now starts.
    await vi.waitFor(() =>
      expect(stops(host)).toEqual([getByRole(host, 'checkbox', { name: 'Select all' })]),
    )
  })
})

/** Three tickets the test takes rows from, as the app's data changes. */
@Component({
  selector: 'test-data-table-rows',
  imports: [DataTable],
  template: `<pm-data-table
    label="Tickets"
    [columns]="columns"
    [data]="tickets()"
    [getRowId]="idOf"
    [emptyState]="empty"
  />`,
})
class Leaving {
  readonly columns = [
    { key: 'subject', header: 'Ticket' },
    { key: 'id', header: 'Id' },
  ]
  readonly tickets = signal<Ticket[]>([...TICKETS, { id: 'c', subject: 'Empty CSV' }])
  readonly idOf = (ticket: Ticket) => ticket.id
  readonly empty = { title: 'Nothing here', description: 'Try a wider filter.' }
}

/**
 * A row that leaves while it holds focus (`design/components/data-table.md`, the grid model):
 * a browser hands focus to the page, and the grid takes it back to the same column of the row
 * that takes the removed row's place, or of the last row.
 */
describe('DataTable, when the focused row leaves', () => {
  it('keeps focus in the grid, on the same column of the next row', async () => {
    const { host, ref } = await mountComponent(Leaving)
    const leaving = ref.instance as Leaving
    const cell = (name: string) => getByRole(host, 'cell', { name })
    cell('SSO loop').focus()
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(document.activeElement).toBe(cell('b')))
    leaving.tickets.update((tickets) => tickets.filter((ticket) => ticket.id !== 'b'))
    await vi.waitFor(() => expect(document.activeElement).toBe(cell('c')))
  })

  it('goes to the row before when the last row leaves', async () => {
    const { host, ref } = await mountComponent(Leaving)
    const leaving = ref.instance as Leaving
    const cell = (name: string) => getByRole(host, 'cell', { name })
    cell('Empty CSV').focus()
    leaving.tickets.update((tickets) => tickets.filter((ticket) => ticket.id !== 'c'))
    await vi.waitFor(() => expect(document.activeElement).toBe(cell('SSO loop')))
  })
})
