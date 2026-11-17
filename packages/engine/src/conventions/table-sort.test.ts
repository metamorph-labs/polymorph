import { afterEach, describe, expect, it, vi } from 'vitest'

import { pressTableSort, tableSort, tableSortColumns } from './table-sort'

/**
 * What an agent reads from a plain Table's sortable headers, and how it asks
 * for a sort by one (`design/components/table.md`, Agent): the same ids in
 * every renderer, and one press on the header's control, as a person's.
 */

afterEach(() => {
  document.body.replaceChildren()
})

type Direction = 'asc' | 'desc' | undefined

/**
 * A Table's markup, as every renderer draws it, with the sort an application
 * holds: a press on a column sorts it ascending, a press on the column sorted
 * ascending reverses it, and each press calls `onSort` with the column. With
 * `ignores`, the application calls `onSort` and changes nothing.
 */
function table(
  columns: readonly { label: string; sortable?: boolean; sorted?: Direction }[],
  {
    onSort = () => {},
    ignores = false,
  }: { onSort?: (label: string | undefined) => void; ignores?: boolean } = {},
) {
  const root = document.createElement('div')
  root.setAttribute('data-member', 'table')
  const element = document.createElement('table')
  const head = element.createTHead().insertRow()
  const headers = columns.map(({ label, sortable = false, sorted }) => {
    const th = document.createElement('th')
    if (sortable) {
      th.setAttribute('data-sortable', '')
      const button = document.createElement('button')
      button.type = 'button'
      button.append(label)
      const glyph = document.createElement('span')
      glyph.setAttribute('aria-hidden', 'true')
      glyph.textContent = '↕'
      button.append(glyph)
      th.append(button)
    } else th.append(label)
    if (sorted !== undefined)
      th.setAttribute('aria-sort', sorted === 'asc' ? 'ascending' : 'descending')
    head.append(th)
    return th
  })
  headers.forEach((th, index) => {
    th.querySelector('button')?.addEventListener('click', () => {
      onSort(columns[index]?.label)
      if (ignores) return
      const next = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending'
      for (const other of headers) other.removeAttribute('aria-sort')
      th.setAttribute('aria-sort', next)
    })
  })
  root.append(element)
  document.body.append(root)
  return root
}

describe('the columns', () => {
  it('are the sortable headers, each chosen by its label', () => {
    const root = table([
      { label: 'Ticket' },
      { label: 'Subject', sortable: true },
      { label: 'Replies', sortable: true, sorted: 'desc' },
    ])
    expect(tableSortColumns(root)).toEqual([
      { id: 'Subject', label: 'Subject' },
      { id: 'Replies', label: 'Replies' },
    ])
    expect(tableSort(root)).toEqual({ key: 'Replies', direction: 'desc' })
  })

  it('take a count after a repeated label, and leave out a nested table’s headers', () => {
    const root = table([
      { label: 'Due', sortable: true },
      { label: 'Due', sortable: true },
    ])
    const cell = (root.querySelector('table') as HTMLTableElement)
      .createTBody()
      .insertRow()
      .insertCell()
    const nested = document.createElement('table')
    const th = document.createElement('th')
    th.setAttribute('data-sortable', '')
    th.setAttribute('aria-sort', 'ascending')
    th.textContent = 'Inner'
    nested.createTHead().insertRow().append(th)
    cell.append(nested)
    expect(tableSortColumns(root).map(({ id }) => id)).toEqual(['Due', 'Due (2)'])
    expect(tableSort(root)).toEqual({ key: null, direction: '' })
  })

  it('are none for a table with no sortable header, or no table', () => {
    expect(tableSortColumns(table([{ label: 'Ticket' }]))).toEqual([])
    expect(tableSortColumns(null)).toEqual([])
    expect(tableSort(undefined)).toEqual({ key: null, direction: '' })
  })
})

describe('a press', () => {
  it('presses the column’s control once, and the application decides the order', () => {
    const onSort = vi.fn()
    const root = table(
      [
        { label: 'Subject', sortable: true },
        { label: 'Replies', sortable: true },
      ],
      { onSort },
    )
    pressTableSort(root, 'Replies')
    expect(onSort.mock.calls).toEqual([['Replies']])
    expect(tableSort(root)).toEqual({ key: 'Replies', direction: 'asc' })
    pressTableSort(root, 'Replies')
    expect(tableSort(root)).toEqual({ key: 'Replies', direction: 'desc' })
    pressTableSort(root, 'Subject')
    expect(tableSort(root)).toEqual({ key: 'Subject', direction: 'asc' })
    expect(onSort).toHaveBeenCalledTimes(3)
  })

  it('changes nothing for an application that does not answer it, and does not fail', () => {
    const onSort = vi.fn()
    const root = table([{ label: 'Replies', sortable: true }], { onSort, ignores: true })
    expect(() => pressTableSort(root, 'Replies')).not.toThrow()
    expect(onSort).toHaveBeenCalledTimes(1)
    expect(tableSort(root)).toEqual({ key: null, direction: '' })
  })

  it('throws for an id that names no sortable column', () => {
    const root = table([{ label: 'Ticket' }, { label: 'Replies', sortable: true }])
    expect(() => pressTableSort(root, 'Ticket')).toThrow('No sortable column has the id "Ticket".')
  })
})
