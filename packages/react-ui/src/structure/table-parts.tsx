'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

import {
  Icon,
  memberAttr,
  pressTableSort,
  tableSort,
  tableSortColumns,
  useAgentMember,
} from '@polymorph/react'
import { useGridKeyboard } from './grid-keyboard'
import styles from '@polymorph/recipes/structure/table.module.css'

/**
 * Table's root and its parts, which need a browser: the overflow measurement,
 * the grid's keyboard and the row and sort handlers. `Table.tsx` is the member:
 * it attaches the parts to the root in a module a server can evaluate.
 */

export type SortDirection = 'asc' | 'desc'

/**
 * Whether the surrounding table is a grid, which decides whether rows may carry
 * `aria-selected` and whether Enter opens a row. Context, not a Row prop, so two
 * rows in one table cannot disagree.
 */
const GridContext = createContext(false)

/**
 * Whether a member that draws this Table as one of its own parts stands for it
 * with an agent (DataTable, which registers its columns and its sort from its
 * own props), so the Table registers nothing. Only the Table directly inside
 * reads it; it is not passed to the tables in its cells.
 */
const StoodFor = createContext(false)

export function TableStoodFor({ children }: { children: ReactNode }) {
  return <StoodFor value>{children}</StoodFor>
}

export interface TableProps {
  stickyHeader?: boolean
  /**
   * The table is a **grid**: one tab stop, arrow keys between cells, and rows
   * that may carry `aria-selected`.
   *
   * Only for a component that owns every cell, in practice DataTable. A
   * hand-composed table is a document of prose and links, browsed with the
   * reader's own keys, and taking the arrow keys for a focus ring would only
   * cost them.
   */
  grid?: boolean
  /**
   * Rows can be selected in bulk. Only meaningful inside a grid, where it tells
   * a screen reader whether "selected" means one of many or the only one.
   */
  multiselectable?: boolean
  /** Names the scroll region for keyboard users, usually the page's title. */
  label?: string
  /**
   * Names the **table** with a real `<caption>`, its first child.
   *
   * `label` names the *scroll region*, which exists only while the columns
   * overflow, so a table that fits has no name. That is fine for a page's main
   * table, but a dashboard's chart twin tables would be announced as "table,
   * table, table".
   *
   * Announced but not drawn unless `captionVisible`, because most tables already
   * have their name on screen: a page title, or the chart they are the twin of.
   */
  caption?: string
  /**
   * Draws the caption above the table as well as announcing it, for a table
   * whose name is not already beside it. Not left to composition as Heading's
   * caption is, because a `Text` above the table would not be connected to it,
   * and `<caption>` is the element for a table's name.
   */
  captionVisible?: boolean
  children?: ReactNode
}

export function TableRoot({
  stickyHeader = false,
  grid = false,
  multiselectable = false,
  label,
  caption,
  captionVisible = false,
  children,
}: TableProps) {
  const wrapper = useRef<HTMLDivElement>(null)
  const table = useRef<HTMLTableElement>(null)
  const [overflowing, setOverflowing] = useState(false)

  useGridKeyboard(table, grid)

  // The spec's `agent` fence. The headers are the caller's parts and the caller holds the sort,
  // so the handle reads the table's own sortable headers and their `aria-sort`, and a sort
  // presses a header's control once, so the caller's `onSort` runs and the caller decides the
  // order, as for a person's press. A table with no sortable header lists no column.
  const stoodFor = useContext(StoodFor)
  useAgentMember(
    {
      member: 'Table',
      element: () => wrapper.current,
      state: () => {
        const sort = tableSort(table.current)
        return {
          'sort-key': sort.key,
          'sort-direction': sort.direction,
          columns: tableSortColumns(table.current),
        }
      },
      actions: {
        sort: { argument: 'id', run: (key) => pressTableSort(table.current, key) },
      },
    },
    { unless: stoodFor },
  )

  /**
   * Focusable only while it overflows, because a tab stop with nothing to
   * scroll is worse than none.
   */
  useEffect(() => {
    const node = wrapper.current
    if (!node || typeof ResizeObserver === 'undefined') return

    const measure = () => setOverflowing(node.scrollWidth > node.clientWidth)
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(node)
    const inner = node.firstElementChild
    if (inner) observer.observe(inner)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={wrapper}
      className={styles.wrapper}
      data-sticky-header={stickyHeader ? '' : undefined}
      data-overflowing={overflowing ? '' : undefined}
      // A tab stop once it scrolls, so a keyboard can reach off-edge columns,
      // except in a grid, where arrowing to a column already scrolls it into
      // view. The landmark exists only with a name, because an unnamed `region`
      // is announced but cannot be identified.
      tabIndex={overflowing && !grid ? 0 : undefined}
      role={overflowing && label !== undefined ? 'region' : undefined}
      aria-label={overflowing ? label : undefined}
      {...memberAttr('Table')}
    >
      <table
        ref={table}
        className={styles.table}
        role={grid ? 'grid' : undefined}
        aria-multiselectable={grid && multiselectable ? true : undefined}
      >
        {/*
         * Always the first child, because a `<caption>` only counts there. A
         * prop rather than a `Table.Caption` part, because a composition API
         * cannot enforce order, and browsers disagree about a caption placed
         * after the head.
         */}
        {caption === undefined ? null : (
          <caption className={captionVisible ? styles.caption : styles.captionHidden}>
            {caption}
          </caption>
        )}
        <GridContext.Provider value={grid}>
          <StoodFor value={false}>{children}</StoodFor>
        </GridContext.Provider>
      </table>
    </div>
  )
}

export function Head({ children }: { children?: ReactNode }) {
  return <thead className={styles.head}>{children}</thead>
}

export function Body({ children }: { children?: ReactNode }) {
  return <tbody>{children}</tbody>
}

/**
 * Totals for `numeric` columns: a real `<tfoot>` with no props, like Head and
 * Body. Its ordinary `Table.Cell`s are styled like headers with the rule on
 * *top*, and the last body row drops its border so the lines do not double.
 */
export function Foot({ children }: { children?: ReactNode }) {
  return <tfoot className={styles.foot}>{children}</tfoot>
}

export interface RowProps {
  /** Adds hover and a pointer cursor; the row's own primary cell still holds the link. */
  interactive?: boolean
  /**
   * Visual only in a table and semantic in a grid, because `aria-selected`
   * belongs to a `grid`.
   *
   * `undefined` is a third value. Rows that never set `aria-selected` mean the
   * grid has no selection, and `aria-selected="false"` means this row is
   * outside an existing selection. Defaulting to `false` would announce every
   * plain table row as unselected, which tells the reader nothing.
   */
  selected?: boolean
  onClick?: () => void
  children?: ReactNode
}

export function Row({ interactive = false, selected, onClick, children }: RowProps) {
  const grid = useContext(GridContext)

  return (
    <tr
      className={styles.row}
      data-interactive={interactive ? '' : undefined}
      data-selected={selected ? '' : undefined}
      aria-selected={grid && selected !== undefined ? selected : undefined}
      onClick={interactive ? onClick : undefined}
      // A grid row that opens on click also opens on Enter, or the keyboard could
      // reach its cells and do nothing. Only from the cell itself: a control in a
      // cell handles its own Enter, so a checkbox does not navigate.
      onKeyDown={
        grid && interactive && onClick !== undefined
          ? (event) => {
              if (event.key !== 'Enter') return
              if (!(event.target as HTMLElement).matches('th, td')) return
              event.preventDefault()
              onClick()
            }
          : undefined
      }
    >
      {children}
    </tr>
  )
}

export interface HeaderProps {
  sortable?: boolean
  /** Controlled by the caller: Table shows the sort control, and DataTable sorts. */
  sortDirection?: SortDirection
  onSort?: () => void
  numeric?: boolean
  children?: ReactNode
}

const SORT_ICON = { asc: 'sort-asc', desc: 'sort-desc' } as const
const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const

export function Header({
  sortable = false,
  sortDirection,
  onSort,
  numeric = false,
  children,
}: HeaderProps) {
  return (
    <th
      className={styles.header}
      scope="col"
      data-sortable={sortable ? '' : undefined}
      data-numeric={numeric ? '' : undefined}
      aria-sort={sortDirection ? ARIA_SORT[sortDirection] : undefined}
    >
      {sortable ? (
        // A real button covering the whole header, so the hit area is the cell
        // and the keyboard reaches it the same way the pointer does.
        <button type="button" className={styles.sortButton} onClick={onSort}>
          {children}
          <span className={styles.sortIcon} data-active={sortDirection ? '' : undefined}>
            <Icon name={sortDirection ? SORT_ICON[sortDirection] : 'sort'} size="sm" />
          </span>
        </button>
      ) : (
        children
      )}
    </th>
  )
}

export interface CellProps {
  numeric?: boolean
  children?: ReactNode
}

export function Cell({ numeric = false, children }: CellProps) {
  return (
    <td className={styles.cell} data-numeric={numeric ? '' : undefined}>
      {children}
    </td>
  )
}
