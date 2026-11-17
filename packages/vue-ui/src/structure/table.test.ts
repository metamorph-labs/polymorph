import { getAllByRole, getByRole, queryByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { h, ref, type VNode } from 'vue'

import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import Table from './Table.vue'
import TableBody from './TableBody.vue'
import TableCell from './TableCell.vue'
import TableHead from './TableHead.vue'
import TableHeader from './TableHeader.vue'
import TableRow from './TableRow.vue'

/**
 * Table in the Vue shell (`design/components/table.md`): the grid model, the
 * scroll region that is a tab stop only while it scrolls, the caption, and
 * what `selected` means in a grid and in a table, as the React member's tests
 * hold them (`packages/react-ui/src/structure/table.test.tsx`). Table has no
 * contract fence, so these are the checks on its behaviour; the recipe is the
 * React member's, and the React tests hold its styles.
 */

beforeAll(installTestTheme)

const cell = (content: string | VNode, props: Record<string, unknown> = {}) =>
  h(TableCell, props, { default: () => [content] })

const header = (content: string | VNode, props: Record<string, unknown> = {}) =>
  h(TableHeader, props, { default: () => [content] })

const row = (props: Record<string, unknown>, cells: VNode[]) =>
  h(TableRow, props, { default: () => cells })

const checkbox = (name: string) => h('input', { type: 'checkbox', 'aria-label': name })

/** A table with a numeric, sortable column. */
const basic = (props: Record<string, unknown> = {}) =>
  h(Table, props, {
    default: () => [
      h(TableHead, null, {
        default: () => [
          row({}, [header('Ticket'), header('Replies', { numeric: true, sortable: true })]),
        ],
      }),
      h(TableBody, null, {
        default: () => [row({}, [cell('T-1041'), cell('4', { numeric: true })])],
      }),
    ],
  })

/** Columns too wide for a 120px box, so the wrapper overflows. */
const overflowing = (props: Record<string, unknown> = {}) =>
  h('div', { style: { inlineSize: '120px' } }, [
    h(Table, props, {
      default: () => [
        h(TableBody, null, {
          default: () => [
            row({}, [
              cell('A subject long enough that it cannot possibly fit in the box'),
              cell('And a second column after it'),
            ]),
          ],
        }),
      ],
    }),
  ])

const wrapper = () => document.querySelector<HTMLElement>('[data-member="table"]') as HTMLElement

describe('semantics', () => {
  it('is a real table, with headers scoped to their column', async () => {
    const { host } = await mount(() => basic())
    expect(getByRole(host, 'table')).toBeTruthy()
    const headers = getAllByRole(host, 'columnheader')
    expect(headers).toHaveLength(2)
    for (const node of headers) expect(node.getAttribute('scope')).toBe('col')
  })

  it('puts aria-sort on the header cell only once the column is sorted', async () => {
    const direction = ref<'asc' | 'desc' | undefined>(undefined)
    const { host } = await mount(() =>
      h(Table, null, {
        default: () => [
          h(TableHead, null, {
            default: () => [
              row({}, [header('Replies', { sortable: true, sortDirection: direction.value })]),
            ],
          }),
        ],
      }),
    )
    const sorted = () => getByRole(host, 'columnheader')
    expect(sorted().hasAttribute('aria-sort')).toBe(false)
    direction.value = 'asc'
    await vi.waitFor(() => expect(sorted().getAttribute('aria-sort')).toBe('ascending'))
    direction.value = 'desc'
    await vi.waitFor(() => expect(sorted().getAttribute('aria-sort')).toBe('descending'))
  })

  it('sorts from a real button that covers the header', async () => {
    const onSort = vi.fn()
    const { host } = await mount(() =>
      h(Table, null, {
        default: () => [
          h(TableHead, null, {
            default: () => [row({}, [header('Replies', { sortable: true, onSort })])],
          }),
        ],
      }),
    )
    getByRole(host, 'button', { name: /Replies/ }).focus()
    await userEvent.keyboard('{Enter}')
    expect(onSort).toHaveBeenCalledTimes(1)
  })
})

describe('the caption', () => {
  it('names the table as its first child, and renders nothing without one', async () => {
    const { host, unmount } = await mount(() => basic({ caption: 'Open tickets' }))
    expect(getByRole(host, 'table', { name: 'Open tickets' })).toBeTruthy()
    expect(host.querySelector('table')?.firstElementChild?.tagName).toBe('CAPTION')
    unmount()
    const bare = await mount(() => basic())
    expect(bare.host.querySelector('caption')).toBeNull()
  })

  it('names a grid too, which is how DataTable uses it', async () => {
    const { host } = await mount(() => basic({ grid: true, caption: 'Tickets' }))
    expect(getByRole(host, 'grid', { name: 'Tickets' })).toBeTruthy()
  })
})

describe('the scroll region', () => {
  it('is not a tab stop while everything fits', async () => {
    await mount(() => basic({ label: 'Tickets' }))
    await vi.waitFor(() => expect(wrapper().hasAttribute('tabindex')).toBe(false))
    expect(wrapper().hasAttribute('role')).toBe(false)
  })

  it('becomes a named, focusable region once it overflows', async () => {
    await mount(() => overflowing({ label: 'Tickets' }))
    await vi.waitFor(() => expect(wrapper().tabIndex).toBe(0))
    expect(wrapper().hasAttribute('data-overflowing')).toBe(true)
    expect(wrapper().getAttribute('role')).toBe('region')
    expect(wrapper().getAttribute('aria-label')).toBe('Tickets')
  })

  it('is focusable but not a landmark without a label', async () => {
    await mount(() => overflowing())
    await vi.waitFor(() => expect(wrapper().tabIndex).toBe(0))
    expect(wrapper().hasAttribute('role')).toBe(false)
  })

  it('is no tab stop in a grid, where moving to a column scrolls it into view', async () => {
    await mount(() => overflowing({ grid: true, label: 'Tickets' }))
    await vi.waitFor(() => expect(wrapper().hasAttribute('data-overflowing')).toBe(true))
    expect(wrapper().hasAttribute('tabindex')).toBe(false)
  })
})

/** The grid model, written in the description's scope (`packages/shells/src/members/table.ts`). */
describe('the grid model', () => {
  function grid(options: { selected?: boolean; onOpen?: () => void } = {}) {
    return h(
      Table,
      { grid: true, label: 'Tickets' },
      {
        default: () => [
          h(TableHead, null, {
            default: () => [
              row({}, [
                header(checkbox('Select all')),
                header('Ticket'),
                header('Replies', { numeric: true, sortable: true }),
              ]),
            ],
          }),
          h(TableBody, null, {
            default: () => [
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
          }),
        ],
      },
    )
  }

  /** Every element in the table that Tab would stop on. */
  const tabStops = (root: HTMLElement) =>
    [...root.querySelectorAll<HTMLElement>('*')].filter((node) => node.tabIndex === 0)

  const box = (host: HTMLElement, name: string) => getByRole(host, 'checkbox', { name })

  it('is a grid, not a table, and writes no roles on its cells', async () => {
    const { host } = await mount(() => grid())
    expect(getByRole(host, 'grid')).toBeTruthy()
    expect(queryByRole(host, 'table')).toBeNull()
    const cells = getByRole(host, 'grid').querySelectorAll('td, th')
    expect(cells).toHaveLength(9)
    for (const node of cells) expect(node.hasAttribute('role')).toBe(false)
  })

  it('gives the whole table one tab stop, on the first cell’s own control', async () => {
    const { host } = await mount(() => grid())
    expect(tabStops(getByRole(host, 'grid'))).toEqual([box(host, 'Select all')])
  })

  it('moves between cells with the arrow keys', async () => {
    const { host } = await mount(() => grid())
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
    const { host } = await mount(() => grid())
    await userEvent.tab()
    await userEvent.keyboard('{ArrowUp}{ArrowLeft}')
    expect(document.activeElement).toBe(box(host, 'Select all'))
  })

  it('moves Home and End to the row ends, and with Control to the grid ends', async () => {
    const { host } = await mount(() => grid())
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
    const { host } = await mount(() => grid())
    await userEvent.click(getByRole(host, 'cell', { name: 'T-1038' }))
    expect(tabStops(getByRole(host, 'grid'))).toHaveLength(1)
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement?.textContent).toBe('9')
  })

  it('moves the stop between a cell’s control and the cell as the control is disabled', async () => {
    // A disabled control is no stop, so its cell takes the stop and gives it back once the
    // control is enabled. The table hears the attribute change, whatever code made it.
    const { host } = await mount(() => grid())
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
    const ids = ref(['T-1041', 'T-1038', 'T-1027'])
    const { host } = await mount(() =>
      h(
        Table,
        { grid: true, label: 'Tickets' },
        {
          default: () => [
            h(TableBody, null, {
              default: () => ids.value.map((id) => h(TableRow, { key: id }, () => [cell(id)])),
            }),
          ],
        },
      ),
    )
    await userEvent.click(getByRole(host, 'cell', { name: 'T-1027' }))
    expect(tabStops(host)).toEqual([getByRole(host, 'cell', { name: 'T-1027' })])
    ids.value = ['T-1041']
    await vi.waitFor(() =>
      expect(tabStops(host)).toEqual([getByRole(host, 'cell', { name: 'T-1041' })]),
    )
  })

  it('leaves a plain table’s keys to the reader', async () => {
    const { host } = await mount(() => basic())
    const table = host.querySelector('table') as HTMLElement
    expect(table.hasAttribute('role')).toBe(false)
    expect(table.querySelectorAll('td[tabindex], th[tabindex]')).toHaveLength(0)
  })
})

describe('selection semantics', () => {
  const one = (props: Record<string, unknown>, rowProps: Record<string, unknown>) =>
    h(Table, props, {
      default: () => [h(TableBody, null, { default: () => [row(rowProps, [cell('T-1041')])] })],
    })

  it('sets aria-selected in a grid, and only the fill in a table', async () => {
    const { host, unmount } = await mount(() => one({ grid: true }, { selected: true }))
    expect(host.querySelector('tr')?.getAttribute('aria-selected')).toBe('true')
    unmount()
    const plain = await mount(() => one({}, { selected: true }))
    expect(plain.host.querySelector('tr')?.hasAttribute('aria-selected')).toBe(false)
    expect(plain.host.querySelector('tr')?.hasAttribute('data-selected')).toBe(true)
  })

  it('marks a row outside a selection, and sets nothing where the grid has none', async () => {
    const { host, unmount } = await mount(() => one({ grid: true }, { selected: false }))
    expect(host.querySelector('tr')?.getAttribute('aria-selected')).toBe('false')
    unmount()
    const none = await mount(() => one({ grid: true }, {}))
    expect(none.host.querySelector('tr')?.hasAttribute('aria-selected')).toBe(false)
  })

  it('declares that rows can be selected in bulk', async () => {
    const { host } = await mount(() => basic({ grid: true, multiselectable: true }))
    expect(getByRole(host, 'grid').getAttribute('aria-multiselectable')).toBe('true')
  })
})

describe('opening a row', () => {
  it('opens on a click only when the row is interactive', async () => {
    const onClick = vi.fn()
    const interactive = ref(false)
    const { host } = await mount(() =>
      h(Table, null, {
        default: () => [
          h(TableBody, null, {
            default: () => [row({ interactive: interactive.value, onClick }, [cell('T-1041')])],
          }),
        ],
      }),
    )
    await userEvent.click(getByRole(host, 'cell', { name: 'T-1041' }))
    expect(onClick, 'a row that is not interactive opened').not.toHaveBeenCalled()
    interactive.value = true
    await vi.waitFor(() => expect(host.querySelector('tr[data-interactive]')).not.toBeNull())
    await userEvent.click(getByRole(host, 'cell', { name: 'T-1041' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('opens on Enter from a cell, and leaves Enter to a control in a cell', async () => {
    const onOpen = vi.fn()
    const { host } = await mount(() =>
      h(
        Table,
        { grid: true },
        {
          default: () => [
            h(TableBody, null, {
              default: () => [
                row({ interactive: true, onClick: onOpen }, [
                  cell(checkbox('Select T-1041')),
                  cell('T-1041'),
                ]),
              ],
            }),
          ],
        },
      ),
    )
    await userEvent.tab()
    expect(document.activeElement).toBe(getByRole(host, 'checkbox', { name: 'Select T-1041' }))
    await userEvent.keyboard('{Enter}')
    expect(onOpen).not.toHaveBeenCalled()
    await userEvent.keyboard('{ArrowRight}{Enter}')
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})

/**
 * An agent reads the sortable headers and asks for a sort by one through the header's own
 * control, as the React member's tests hold it (`design/components/table.md`, Agent). The
 * application holds the sort, so each press reaches its `sort` handler, which decides the order.
 */
describe('an agent', () => {
  it('asks for a sort by a column with one press of its header', async () => {
    const sort = ref<{ key: string; direction: 'asc' | 'desc' } | null>(null)
    const pressed: string[] = []
    const sortable = (key: string) =>
      header(key, {
        sortable: true,
        sortDirection: sort.value?.key === key ? sort.value.direction : undefined,
        onSort: () => {
          pressed.push(key)
          sort.value =
            sort.value?.key === key && sort.value.direction === 'asc'
              ? { key, direction: 'desc' }
              : { key, direction: 'asc' }
        },
      })
    await mount(() =>
      h(
        Table,
        { label: 'Tickets' },
        {
          default: () => [
            h(TableHead, null, {
              default: () => [
                row({}, [header('Ticket'), sortable('Subject'), sortable('Replies')]),
              ],
            }),
            h(TableBody, null, {
              default: () => [row({}, [cell('T-1041'), cell('Login loop'), cell('4')])],
            }),
          ],
        },
      ),
    )
    const bridge = createAgentBridge()
    try {
      const [table] = bridge.snapshot().members
      expect(table).toMatchObject({
        member: 'Table',
        state: {
          'sort-key': null,
          'sort-direction': '',
          columns: [
            { id: 'Subject', label: 'Subject' },
            { id: 'Replies', label: 'Replies' },
          ],
        },
      })
      const { results } = await bridge.act([
        { id: table?.id, action: 'sort', value: 'Replies' },
        { id: table?.id, action: 'sort', value: 'Replies' },
      ])
      // The application starts a column ascending and reverses the sorted one.
      expect(results).toMatchObject([
        {
          ok: true,
          changed: {
            'sort-key': { from: null, to: 'Replies' },
            'sort-direction': { from: '', to: 'asc' },
          },
        },
        { ok: true, changed: { 'sort-direction': { from: 'asc', to: 'desc' } } },
      ])
      expect(pressed).toEqual(['Replies', 'Replies'])
    } finally {
      bridge.dispose()
    }
  })
})
