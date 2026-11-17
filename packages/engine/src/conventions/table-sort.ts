import { agentPress } from './agent'

/**
 * What an agent reads from a plain Table's sortable headers, and how it asks
 * for a sort by one, for every renderer's Table (`design/components/table.md`,
 * Agent).
 *
 * A Table composes its headers as parts, and its caller holds the sort: a
 * header shows the direction the caller passes as `aria-sort`, and its sort
 * control calls the caller's `onSort`. So the Table's handle reads its own
 * document, and an agent presses a header's control once, as a person does;
 * the caller decides the order the press asks for. The state names and values
 * are DataTable's (`data-table.md`, Agent), so an agent reads both tables the
 * same way.
 */

/** One sortable header, as a `choices` state lists it. */
export interface TableSortColumn {
  readonly id: string
  readonly label: string
}

/** A direction as DataTable's `sort-direction` reads it, or `''` while no column is sorted. */
export type TableSortDirection = 'asc' | 'desc' | ''

/** The sorted column's id, or `null` for none, and its direction. */
export interface TableSortState {
  readonly key: string | null
  readonly direction: TableSortDirection
}

const DIRECTIONS: Readonly<Record<string, TableSortDirection>> = {
  ascending: 'asc',
  descending: 'desc',
}

/** The text a header shows, without what is hidden from assistive technology (its sort glyph). */
function shown(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? ''
  if (node.nodeType !== 1 || (node as Element).getAttribute('aria-hidden') === 'true') return ''
  let text = ''
  for (const child of Array.from(node.childNodes)) text += shown(child)
  return text
}

interface Found {
  readonly column: TableSortColumn
  readonly header: HTMLTableCellElement
}

/** The `<table>` a Table's root holds, or the root itself when it is one. */
function tableOf(root: Element | null | undefined): HTMLTableElement | null {
  if (!root) return null
  if (root.localName === 'table') return root as HTMLTableElement
  return root.querySelector('table')
}

/**
 * The table's own sortable headers, in document order, each with the id it is
 * chosen by. A header's markup carries no key, so its id is its label, and a
 * repeated label takes ` (2)`, ` (3)` after it. A table inside one of its
 * cells (a detail row's) has headers of its own, which are left out.
 */
function found(root: Element | null | undefined): Found[] {
  const table = tableOf(root)
  if (table === null) return []
  const out: Found[] = []
  const taken = new Map<string, number>()
  for (const header of Array.from(
    table.querySelectorAll<HTMLTableCellElement>('th[data-sortable]'),
  )) {
    if (header.closest('table') !== table) continue
    const label = shown(header).replace(/\s+/g, ' ').trim()
    const seen = (taken.get(label) ?? 0) + 1
    taken.set(label, seen)
    out.push({ header, column: { id: seen === 1 ? label : `${label} (${seen})`, label } })
  }
  return out
}

const directionOf = (header: Element): TableSortDirection =>
  DIRECTIONS[header.getAttribute('aria-sort') ?? ''] ?? ''

/** The sortable columns of a Table, in order: the choices its sort action takes. */
export function tableSortColumns(root: Element | null | undefined): TableSortColumn[] {
  return found(root).map(({ column }) => column)
}

/**
 * The column a Table is sorted by, as its headers show it: the first sortable
 * header whose `aria-sort` is `ascending` or `descending`, and that direction.
 * `{ key: null, direction: '' }` while none is.
 */
export function tableSort(root: Element | null | undefined): TableSortState {
  for (const { column, header } of found(root)) {
    const direction = directionOf(header)
    if (direction !== '') return { key: column.id, direction }
  }
  return { key: null, direction: '' }
}

/**
 * Presses a column's sort control once (`agentPress`), as a person's press
 * does, so the caller's `onSort` runs and the caller decides the order. The
 * header shows what the caller chose, which `tableSort` reads. Throws for an
 * id that names no sortable column.
 */
export function pressTableSort(root: Element | null | undefined, id: string): void {
  const match = found(root).find(({ column }) => column.id === id)
  if (match === undefined) throw new Error(`No sortable column has the id "${id}".`)
  agentPress(match.header.querySelector('button'))
}
