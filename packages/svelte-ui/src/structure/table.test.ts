import { getAllByRole, getByRole, queryByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { render } from '../mount'
import { live } from '../testing/live.svelte'
import TableTreeHarness, {
  type TableTreeCell,
  type TableTreeContent,
  type TableTreeProps,
  type TableTreeRow,
} from '../testing/TableTreeHarness.svelte'
import type { TableProps } from './Table.svelte'
import type { TableCellProps } from './TableCell.svelte'
import type { TableHeaderProps } from './TableHeader.svelte'
import type { TableRowProps } from './TableRow.svelte'

/**
 * Table in the Svelte shell (`design/components/table.md`): the grid model,
 * the scroll region that is a tab stop only while it scrolls, the caption, and
 * what `selected` means in a grid and in a table, as the React member's tests
 * hold them (`packages/react-ui/src/structure/table.test.tsx`). Table has no
 * contract fence, so these are the checks on its behaviour; the recipe is the
 * React member's, and the React tests hold its styles. Each table is composed
 * from data by `testing/TableTreeHarness.svelte`.
 */

beforeAll(installTestTheme)

const cell = (content: TableTreeContent, props: TableCellProps = {}): TableTreeCell => ({
  kind: 'cell',
  content,
  props,
})

const header = (content: TableTreeContent, props: TableHeaderProps = {}): TableTreeCell => ({
  kind: 'header',
  content,
  props,
})

const row = (props: TableRowProps, cells: TableTreeCell[]): TableTreeRow => ({ props, cells })

const checkbox = (name: string): TableTreeContent => ({ checkbox: name })

/** A table with a numeric, sortable column. */
const basic = (props: TableProps = {}): TableTreeProps => ({
  table: props,
  head: [row({}, [header('Ticket'), header('Replies', { numeric: true, sortable: true })])],
  body: [row({}, [cell('T-1041'), cell('4', { numeric: true })])],
})

/** Columns too wide for a 120px box, so the wrapper overflows. */
const overflowing = (props: TableProps = {}): TableTreeProps => ({
  width: '120px',
  table: props,
  body: [
    row({}, [
      cell('A subject long enough that it cannot possibly fit in the box'),
      cell('And a second column after it'),
    ]),
  ],
})

const wrapper = () => document.querySelector<HTMLElement>('[data-member="table"]') as HTMLElement

describe('semantics', () => {
  it('is a real table, with headers scoped to their column', async () => {
    const { host } = await render(TableTreeHarness, basic())
    expect(getByRole(host, 'table')).toBeTruthy()
    const headers = getAllByRole(host, 'columnheader')
    expect(headers).toHaveLength(2)
    for (const node of headers) expect(node.getAttribute('scope')).toBe('col')
  })

  it('puts aria-sort on the header cell only once the column is sorted', async () => {
    const direction = live<{ sortable: boolean; sortDirection: 'asc' | 'desc' | undefined }>({
      sortable: true,
      sortDirection: undefined,
    })
    const { host } = await render(TableTreeHarness, {
      head: [row({}, [header('Replies', direction)])],
    })
    const sorted = () => getByRole(host, 'columnheader')
    expect(sorted().hasAttribute('aria-sort')).toBe(false)
    direction.sortDirection = 'asc'
    await vi.waitFor(() => expect(sorted().getAttribute('aria-sort')).toBe('ascending'))
    direction.sortDirection = 'desc'
    await vi.waitFor(() => expect(sorted().getAttribute('aria-sort')).toBe('descending'))
  })

  it('sorts from a real button that covers the header', async () => {
    const onSort = vi.fn()
    const { host } = await render(TableTreeHarness, {
      head: [row({}, [header('Replies', { sortable: true, onSort })])],
    })
    getByRole(host, 'button', { name: /Replies/ }).focus()
    await userEvent.keyboard('{Enter}')
    expect(onSort).toHaveBeenCalledTimes(1)
  })
})

describe('the caption', () => {
  it('names the table as its first child, and renders nothing without one', async () => {
    const { host, unmount } = await render(TableTreeHarness, basic({ caption: 'Open tickets' }))
    expect(getByRole(host, 'table', { name: 'Open tickets' })).toBeTruthy()
    expect(host.querySelector('table')?.firstElementChild?.tagName).toBe('CAPTION')
    unmount()
    const bare = await render(TableTreeHarness, basic())
    expect(bare.host.querySelector('caption')).toBeNull()
  })

  it('names a grid too, which is how DataTable uses it', async () => {
    const { host } = await render(TableTreeHarness, basic({ grid: true, caption: 'Tickets' }))
    expect(getByRole(host, 'grid', { name: 'Tickets' })).toBeTruthy()
  })
})

describe('the scroll region', () => {
  it('is not a tab stop while everything fits', async () => {
    await render(TableTreeHarness, basic({ label: 'Tickets' }))
    await vi.waitFor(() => expect(wrapper().hasAttribute('tabindex')).toBe(false))
    expect(wrapper().hasAttribute('role')).toBe(false)
  })

  it('becomes a named, focusable region once it overflows', async () => {
    await render(TableTreeHarness, overflowing({ label: 'Tickets' }))
    await vi.waitFor(() => expect(wrapper().tabIndex).toBe(0))
    expect(wrapper().hasAttribute('data-overflowing')).toBe(true)
    expect(wrapper().getAttribute('role')).toBe('region')
    expect(wrapper().getAttribute('aria-label')).toBe('Tickets')
  })

  it('is focusable but not a landmark without a label', async () => {
    await render(TableTreeHarness, overflowing())
    await vi.waitFor(() => expect(wrapper().tabIndex).toBe(0))
    expect(wrapper().hasAttribute('role')).toBe(false)
  })

  it('is no tab stop in a grid, where moving to a column scrolls it into view', async () => {
    await render(TableTreeHarness, overflowing({ grid: true, label: 'Tickets' }))
    await vi.waitFor(() => expect(wrapper().hasAttribute('data-overflowing')).toBe(true))
    expect(wrapper().hasAttribute('tabindex')).toBe(false)
  })
})

/** The grid model, written in the description's scope (`packages/shells/src/members/table.ts`). */
describe('the grid model', () => {
  function grid(options: { selected?: boolean; onOpen?: () => void } = {}): TableTreeProps {
    return {
      table: { grid: true, label: 'Tickets' },
      head: [
        row({}, [
          header(checkbox('Select all')),
          header('Ticket'),
          header('Replies', { numeric: true, sortable: true }),
        ]),
      ],
      body: [
        row(
          {
            selected: options.selected,
            interactive: options.onOpen !== undefined,
            onClick: options.onOpen,
          },
          [cell(checkbox('Select T-1041')), cell('T-1041'), cell('4', { numeric: true })],
        ),
        row({ selected: options.selected === undefined ? undefined : false }, [
          cell(checkbox('Select T-1038')),
          cell('T-1038'),
          cell('9', { numeric: true }),
        ]),
      ],
    }
  }

  /** Every element in the table that Tab would stop on. */
  const tabStops = (root: HTMLElement) =>
    [...root.querySelectorAll<HTMLElement>('*')].filter((node) => node.tabIndex === 0)

  const box = (host: HTMLElement, name: string) => getByRole(host, 'checkbox', { name })

  it('is a grid, not a table, and writes no roles on its cells', async () => {
    const { host } = await render(TableTreeHarness, grid())
    expect(getByRole(host, 'grid')).toBeTruthy()
    expect(queryByRole(host, 'table')).toBeNull()
    const cells = getByRole(host, 'grid').querySelectorAll('td, th')
    expect(cells).toHaveLength(9)
    for (const node of cells) expect(node.hasAttribute('role')).toBe(false)
  })

  it('gives the whole table one tab stop, on the first cell’s own control', async () => {
    const { host } = await render(TableTreeHarness, grid())
    expect(tabStops(getByRole(host, 'grid'))).toEqual([box(host, 'Select all')])
  })

  it('moves between cells with the arrow keys', async () => {
    const { host } = await render(TableTreeHarness, grid())
    await userEvent.tab()
    expect(document.activeElement).toBe(box(host, 'Select all'))
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement?.textContent).toBe('Ticket')
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement?.textContent).toBe('T-1041')
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement?.textContent).toBe('T-1038')
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(box(host, 'Select T-1038'))
    expect(tabStops(getByRole(host, 'grid'))).toEqual([box(host, 'Select T-1038')])
  })

  it('stops at the edges', async () => {
    const { host } = await render(TableTreeHarness, grid())
    await userEvent.tab()
    await userEvent.keyboard('{ArrowUp}{ArrowLeft}')
    expect(document.activeElement).toBe(box(host, 'Select all'))
  })

  it('moves Home and End to the row ends, and with Control to the grid ends', async () => {
    const { host } = await render(TableTreeHarness, grid())
    await userEvent.tab()
    await userEvent.keyboard('{ArrowDown}{End}')
    expect(document.activeElement?.textContent).toBe('4')
    await userEvent.keyboard('{Home}')
    expect(document.activeElement).toBe(box(host, 'Select T-1041'))
    await userEvent.keyboard('{Control>}{End}{/Control}')
    expect(document.activeElement?.textContent).toBe('9')
    await userEvent.keyboard('{Control>}{Home}{/Control}')
    expect(document.activeElement).toBe(box(host, 'Select all'))
  })

  it('moves the stop to where the pointer clicked', async () => {
    const { host } = await render(TableTreeHarness, grid())
    await userEvent.click(getByRole(host, 'cell', { name: 'T-1038' }))
    expect(tabStops(getByRole(host, 'grid'))).toHaveLength(1)
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement?.textContent).toBe('9')
  })

  it('moves the stop between a cell’s control and the cell as the control is disabled', async () => {
    // A disabled control is no stop, so its cell takes the stop and gives it back once the
    // control is enabled. The table hears the attribute change, whatever code made it.
    const { host } = await render(TableTreeHarness, grid())
    const all = box(host, 'Select all') as HTMLInputElement
    const corner = all.closest('th') as HTMLElement
    all.disabled = true
    await vi.waitFor(() => expect(corner.getAttribute('tabindex')).toBe('0'))
    all.disabled = false
    await vi.waitFor(() => expect(corner.getAttribute('tabindex')).toBe('-1'))
    expect(all.getAttribute('tabindex')).toBe('0')
  })

  it('keeps one tab stop when the row holding it is removed', async () => {
    // Sorting, paging and loading replace rows. The stop is clamped again after the rows
    // change, or the table would be left with no tab stop at all.
    const rows = (ids: string[]) => ids.map((id) => ({ key: id, ...row({}, [cell(id)]) }))
    const tree = live<{ table: TableProps; body: TableTreeRow[] }>({
      table: { grid: true, label: 'Tickets' },
      body: rows(['T-1041', 'T-1038', 'T-1027']),
    })
    const { host } = await render(TableTreeHarness, tree)
    await userEvent.click(getByRole(host, 'cell', { name: 'T-1027' }))
    expect(tabStops(host)).toEqual([getByRole(host, 'cell', { name: 'T-1027' })])
    tree.body = rows(['T-1041'])
    await vi.waitFor(() =>
      expect(tabStops(host)).toEqual([getByRole(host, 'cell', { name: 'T-1041' })]),
    )
  })

  it('leaves a plain table’s keys to the reader', async () => {
    const { host } = await render(TableTreeHarness, basic())
    const table = host.querySelector('table') as HTMLElement
    expect(table.hasAttribute('role')).toBe(false)
    expect(table.querySelectorAll('td[tabindex], th[tabindex]')).toHaveLength(0)
  })
})

describe('selection semantics', () => {
  const one = (props: TableProps, rowProps: TableRowProps): TableTreeProps => ({
    table: props,
    body: [row(rowProps, [cell('T-1041')])],
  })

  it('sets aria-selected in a grid, and only the fill in a table', async () => {
    const { host, unmount } = await render(
      TableTreeHarness,
      one({ grid: true }, { selected: true }),
    )
    expect(host.querySelector('tr')?.getAttribute('aria-selected')).toBe('true')
    unmount()
    const plain = await render(TableTreeHarness, one({}, { selected: true }))
    expect(plain.host.querySelector('tr')?.hasAttribute('aria-selected')).toBe(false)
    expect(plain.host.querySelector('tr')?.hasAttribute('data-selected')).toBe(true)
  })

  it('marks a row outside a selection, and sets nothing where the grid has none', async () => {
    const { host, unmount } = await render(
      TableTreeHarness,
      one({ grid: true }, { selected: false }),
    )
    expect(host.querySelector('tr')?.getAttribute('aria-selected')).toBe('false')
    unmount()
    const none = await render(TableTreeHarness, one({ grid: true }, {}))
    expect(none.host.querySelector('tr')?.hasAttribute('aria-selected')).toBe(false)
  })

  it('declares that rows can be selected in bulk', async () => {
    const { host } = await render(TableTreeHarness, basic({ grid: true, multiselectable: true }))
    expect(getByRole(host, 'grid').getAttribute('aria-multiselectable')).toBe('true')
  })
})

describe('opening a row', () => {
  it('opens on a click only when the row is interactive', async () => {
    const onClick = vi.fn()
    const interactive = live<{ interactive: boolean; onClick: () => void }>({
      interactive: false,
      onClick,
    })
    const { host } = await render(TableTreeHarness, {
      body: [row(interactive, [cell('T-1041')])],
    })
    await userEvent.click(getByRole(host, 'cell', { name: 'T-1041' }))
    expect(onClick, 'a row that is not interactive opened').not.toHaveBeenCalled()
    interactive.interactive = true
    await vi.waitFor(() => expect(host.querySelector('tr[data-interactive]')).not.toBeNull())
    await userEvent.click(getByRole(host, 'cell', { name: 'T-1041' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('opens on Enter from a cell, and leaves Enter to a control in a cell', async () => {
    const onOpen = vi.fn()
    const { host } = await render(TableTreeHarness, {
      table: { grid: true },
      body: [
        row({ interactive: true, onClick: onOpen }, [
          cell(checkbox('Select T-1041')),
          cell('T-1041'),
        ]),
      ],
    })
    await userEvent.tab()
    expect(document.activeElement).toBe(getByRole(host, 'checkbox', { name: 'Select T-1041' }))
    await userEvent.keyboard('{Enter}')
    expect(onOpen).not.toHaveBeenCalled()
    await userEvent.keyboard('{ArrowRight}{Enter}')
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
