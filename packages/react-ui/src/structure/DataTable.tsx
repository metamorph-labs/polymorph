'use client'

import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react'

import { Button } from '../controls/Button'
import { Checkbox } from '../controls/Checkbox'
import { Inline } from '../layout/Inline'
import { memberAttr, useAgentMember } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/data-table.module.css'
import { EmptyState, type EmptyStateProps } from './EmptyState'
import { Skeleton } from './Skeleton'
import { Table, type SortDirection } from './Table'
import { TableStoodFor } from './table-parts'

/**
 * Table with sorting, selection, pagination, loading and empty states
 * (`design/components/data-table.md`).
 *
 * An assembly: Table, Checkbox, Button, Skeleton and EmptyState draw everything.
 * It adds wiring and two rules that hand-built tables miss. `emptyState` is
 * required, so the empty case is designed before production. Sorting and
 * selection are *controlled*, because a self-sorting table sorts only the
 * visible page, which is silently wrong once the data is paginated.
 *
 * `rowDetail` lets a row show more under itself. An open row affects only
 * itself, where a sort or a selection reaches past the visible page, so the
 * table holds the set of open rows unless the caller passes `expanded`.
 * `expanded`, `defaultExpanded` and `onExpandedChange` are the three props
 * Collapsible's `open` and AppShell's `collapsed` have.
 */

export interface DataTableColumn<Row> {
  key: string
  header: string
  /** Defaults to `String(row[key])`, the common case. */
  cell?: (row: Row) => ReactNode
  sortable?: boolean
  numeric?: boolean
}

export interface DataTableSort {
  key: string
  direction: SortDirection
}

/**
 * Every string the assembly announces, localized by passing them (WCAG 3.1.2).
 * Pass every key the table uses, so one grid never mixes two languages.
 */
export interface DataTableMessages {
  /** The bulk bar's count, a function because plural rules belong to the catalog. */
  selected: (count: number) => string
  selectAll: string
  /** The per-row checkbox's name when `getRowLabel` is not supplied. */
  selectRow: string
  /**
   * Names a row's disclosure, from what `getRowName` returns for the row, and
   * names the expansion column's header, called with `undefined`. Optional, so
   * messages written for a table without `rowDetail` still type-check. A
   * localized host that passes `rowDetail` passes it.
   */
  detailsLabel?: (rowName: string | undefined) => string
}

const DEFAULT_MESSAGES: DataTableMessages = {
  selected: (count) => `${count} selected`,
  selectAll: 'Select all',
  selectRow: 'Select row',
}

const DEFAULT_DETAILS_LABEL = (rowName: string | undefined): string =>
  rowName === undefined ? 'Details' : `Details for ${rowName}`

/** What `rowDetail` is called with. */
export interface DataTableRowDetail<Row> {
  row: Row
  /**
   * Closes this row's detail. When focus is inside the detail it moves to the
   * row's disclosure first, because a focused element that leaves the page
   * leaves focus on the page itself. It does nothing for a row that is not open.
   */
  close: () => void
}

/** The uncontrolled expansion's first value without `defaultExpanded`: every row closed. */
const NONE_EXPANDED: ReadonlySet<string> = new Set()

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[]
  data: Row[]
  getRowId: (row: Row) => string
  /** Controlled; the type allows exactly one sorted column. */
  sort?: DataTableSort
  onSortChange?: (sort: DataTableSort) => void
  /** Passing it turns selection on, even as an empty set. */
  selection?: ReadonlySet<string>
  onSelectionChange?: (next: ReadonlySet<string>) => void
  /**
   * The whole name of a row's checkbox ("Select Invoice 12"), so a screen reader
   * does not hear "Select row" on every row. Only the checkbox reads it.
   */
  getRowLabel?: (row: Row) => string
  /**
   * The row's own name ("Invoice 12"). `messages.detailsLabel` names the row's
   * disclosure from it ("Details for Invoice 12"). It is not `getRowLabel`,
   * which is a whole control's name: a disclosure named from it would read
   * "Details for Select Invoice 12".
   */
  getRowName?: (row: Row) => string
  /** Shown only while something is selected. */
  bulkActions?: ReactNode
  /**
   * Opens the row. Per the "row `interactive` handlers" rule in `data-table.md`,
   * a click on the checkbox selects and does *not* open.
   */
  onRowClick?: (row: Row) => void
  /**
   * Passing it turns expansion on: each row gets a disclosure, and an open row
   * draws what this returns in a full-width row under itself. It takes one
   * object, so every renderer hands the same named values, `row` and `close`.
   * A detail closes itself with `close`: a caller that only removes the id from
   * `expanded` while focus is inside the detail leaves focus on the page.
   */
  rowDetail?: (detail: DataTableRowDetail<Row>) => ReactNode
  /** The open rows by id. Controlled when given; without it the table holds the set. */
  expanded?: ReadonlySet<string>
  /**
   * The rows open at first, while the table holds the set. The set keeps the
   * id of a row that leaves `data`, so a row that comes back with its page is
   * still open.
   */
  defaultExpanded?: ReadonlySet<string>
  /**
   * Whether a row has a detail. A row it refuses has an empty cell in the
   * expansion column and never draws a detail row, whatever `expanded` holds.
   * A function that draws cannot report that it drew nothing, so the table
   * asks this before it draws the disclosure. Without it every row has one.
   */
  isRowExpandable?: (row: Row) => boolean
  /** Called with the next set of open rows, controlled or not. */
  onExpandedChange?: (next: ReadonlySet<string>) => void
  loading?: boolean
  /** Required, because a list without a designed empty state has a bug. */
  emptyState: EmptyStateProps
  /** A `Pagination` or a `CursorPagination`, rendered below the table. */
  pagination?: ReactNode
  stickyHeader?: boolean
  label: string
  /** Omit for the generic English defaults; localized hosts pass their own. */
  messages?: DataTableMessages
}

const SKELETON_ROWS = 5

function defaultCell<Row>(row: Row, key: string): ReactNode {
  const value = (row as Record<string, unknown>)[key]
  return value === undefined || value === null ? '' : String(value)
}

/**
 * One row's detail: the caller's function, called with the row and its
 * `close`. A component, so `close` is handed on as a prop. `close` reads refs,
 * and React takes a function that does as a prop or a handler, not as the
 * argument of a call made while the table renders.
 */
function RowDetail<Row>({
  render,
  row,
  close,
}: DataTableRowDetail<Row> & { render: (detail: DataTableRowDetail<Row>) => ReactNode }) {
  return render({ row, close })
}

export function DataTable<Row>({
  columns,
  data,
  getRowId,
  sort,
  onSortChange,
  selection,
  onSelectionChange,
  getRowLabel,
  getRowName,
  bulkActions,
  onRowClick,
  rowDetail,
  expanded,
  defaultExpanded,
  onExpandedChange,
  isRowExpandable,
  loading = false,
  emptyState,
  pagination,
  stickyHeader,
  label,
  messages = DEFAULT_MESSAGES,
}: DataTableProps<Row>) {
  const selectable = selection !== undefined
  const expandable = rowDetail !== undefined
  const ids = data.map(getRowId)
  const [ownExpanded, setOwnExpanded] = useState(defaultExpanded ?? NONE_EXPANDED)
  const open = expanded ?? ownExpanded
  const detailsLabel = messages.detailsLabel ?? DEFAULT_DETAILS_LABEL
  // A detail row's id is its row's place on the page, not the row's id: an
  // `aria-controls` value is a list of ids split at spaces, and a row id may
  // hold one.
  const detailPrefix = useId()
  // A detail row spans every column, the selection and expansion columns included.
  const span = columns.length + (selectable ? 1 : 0) + 1
  // The bar counts the whole selection, which a bulk action acts on. The header
  // checkbox reflects only this page's rows, which its click affects.
  const selectedCount = selection?.size ?? 0
  const selectedHere = selectable ? ids.filter((id) => selection.has(id)).length : 0
  const allSelected = selectable && ids.length > 0 && selectedHere === ids.length
  const someSelected = selectedHere > 0 && !allSelected

  // Empty and loading are different states. A loading table keeps its header and
  // shows placeholder rows. An empty one is replaced by the EmptyState.
  const empty = !loading && data.length === 0

  /*
   * Add or remove the visible rows, never replace the set. `selection` spans all
   * pages and `data` is one page, so returning `new Set(ids)` would silently drop
   * page 1's selection on a page-2 select-all, breaking the case controlled
   * selection exists for.
   */
  const toggleAll = () => {
    if (!selectable) return
    const next = new Set(selection)
    for (const id of ids) {
      if (allSelected) next.delete(id)
      else next.add(id)
    }
    onSelectionChange?.(next)
  }

  const toggleRow = (id: string) => {
    if (!selectable) return
    const next = new Set(selection)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectionChange?.(next)
  }

  // The table's own set follows every change, whoever holds the set, so it is
  // current if the caller stops passing `expanded`. AppShell's `collapsed` does
  // the same.
  const changeExpanded = (next: ReadonlySet<string>) => {
    setOwnExpanded(next)
    onExpandedChange?.(next)
  }

  const toggleExpanded = (id: string) => {
    const next = new Set(open)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    changeExpanded(next)
  }

  // `close` is handed to the detail's content, which may call it after a later
  // render: a Save that awaits, then closes. It reads the open rows and the
  // page's ids as they are when it is called, not as they were when the detail
  // was drawn.
  const root = useRef<HTMLDivElement>(null)
  const latest = useRef({ open, ids, changeExpanded })
  useEffect(() => {
    latest.current = { open, ids, changeExpanded }
  })

  const closeDetail = (id: string) => {
    const now = latest.current
    if (!now.open.has(id)) return
    // Focus moves before the detail leaves. The disclosure is the control that
    // names the detail row, and it is found by that name.
    const detailId = CSS.escape(`${detailPrefix}-detail-${now.ids.indexOf(id)}`)
    if (root.current?.querySelector(`#${detailId}`)?.matches(':focus-within') === true) {
      root.current.querySelector<HTMLElement>(`[aria-controls="${detailId}"]`)?.focus()
    }
    const next = new Set(now.open)
    next.delete(id)
    now.changeExpanded(next)
  }

  /** Sorts by a column as its header's press does, unless it is sorted that way already. */
  const sortBy = (key: string, direction: SortDirection) => {
    if (sort?.key === key && sort.direction === direction) return
    onSortChange?.({ key, direction })
  }

  // The spec's `agent` fence. A column is a choice by its key, and one that is not sortable is
  // disabled. The row Checkboxes and disclosures are members of their own, listed within the
  // table beside the application's cells and details, so the table withholds nothing.
  useAgentMember({
    member: 'DataTable',
    element: () => root.current,
    state: () => ({
      'sort-key': sort?.key ?? null,
      'sort-direction': sort?.direction ?? '',
      columns: columns.map((column) => ({
        id: column.key,
        label: column.header,
        ...(column.sortable === true ? {} : { disabled: true }),
      })),
      selection: [...(selection ?? [])],
      expanded: [...open],
      loading,
    }),
    actions: {
      'sort-ascending': { argument: 'id', run: (key) => sortBy(key, 'asc') },
      'sort-descending': { argument: 'id', run: (key) => sortBy(key, 'desc') },
    },
  })

  return (
    <div
      ref={root}
      className={styles.table}
      data-loading={loading ? '' : undefined}
      data-empty={empty ? '' : undefined}
      aria-busy={loading ? true : undefined}
      {...memberAttr('DataTable')}
    >
      {selectable && selectedCount > 0 ? (
        <div className={styles.bulkBar}>
          {/* Wraps, so in a narrow container the actions move under the count
              instead of overflowing. The row's gap applies on both axes. */}
          <Inline gap={4} align="center" justify="between" wrap>
            {/* One announcement per change, not per row. The count is the live
                region, so selecting five rows announces "5 selected" once. */}
            <span className={styles.bulkCount} aria-live="polite">
              {messages.selected(selectedCount)}
            </span>
            {bulkActions === undefined ? null : (
              <Inline gap={3} align="center" wrap>
                {bulkActions}
              </Inline>
            )}
          </Inline>
        </div>
      ) : null}

      {empty ? (
        <EmptyState {...emptyState} />
      ) : (
        // A grid: one tab stop, arrow keys between cells, `aria-selected` on
        // rows. DataTable owns every cell, the only case where taking the arrow
        // keys is worth it (see `TableProps.grid`).
        //
        // `caption` reuses `label` ("usually the page's title"). A separate prop
        // would only let the scroll region and the table be named differently.
        // Announced, not drawn, because the page title is already above it.
        //
        // The Table is this member's part: DataTable registers its columns and its sort from its
        // own props, so the Table it draws registers nothing.
        <TableStoodFor>
          <Table
            label={label}
            caption={label}
            stickyHeader={stickyHeader}
            grid
            multiselectable={selectable}
          >
            <Table.Head>
              <Table.Row>
                {selectable ? (
                  <Table.Header>
                    <Checkbox
                      aria-label={messages.selectAll}
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={toggleAll}
                      disabled={loading || ids.length === 0}
                    />
                  </Table.Header>
                ) : null}

                {expandable ? (
                  <Table.Header>
                    {/* The column's name, announced and not drawn: a header cell
                      with no content names nothing for a screen reader.
                      `data-undrawn` tells the grid the cell shows nothing, so
                      the grid's first tab stop is the next cell
                      (`grid-keyboard.ts`). */}
                    <span className={styles.expandLabel} data-undrawn="">
                      {detailsLabel(undefined)}
                    </span>
                  </Table.Header>
                ) : null}

                {columns.map((column) => (
                  <Table.Header
                    key={column.key}
                    numeric={column.numeric}
                    sortable={column.sortable}
                    sortDirection={sort?.key === column.key ? sort.direction : undefined}
                    onSort={
                      column.sortable
                        ? () =>
                            onSortChange?.({
                              key: column.key,
                              // Sorting the sorted column again reverses it. A new
                              // column starts ascending, which readers expect.
                              direction:
                                sort?.key === column.key && sort.direction === 'asc'
                                  ? 'desc'
                                  : 'asc',
                            })
                        : undefined
                    }
                  >
                    {column.header}
                  </Table.Header>
                ))}
              </Table.Row>
            </Table.Head>

            <Table.Body>
              {loading
                ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
                    <Table.Row key={`skeleton-${index}`}>
                      {selectable ? (
                        <Table.Cell>
                          <Skeleton shape="circle" size={4} />
                        </Table.Cell>
                      ) : null}
                      {expandable ? (
                        <Table.Cell>
                          <Skeleton shape="circle" size={4} />
                        </Table.Cell>
                      ) : null}
                      {columns.map((column) => (
                        <Table.Cell key={column.key} numeric={column.numeric}>
                          <Skeleton textStep="sm" />
                        </Table.Cell>
                      ))}
                    </Table.Row>
                  ))
                : data.map((row, index) => {
                    const id = getRowId(row)
                    const canExpand = expandable && (isRowExpandable?.(row) ?? true)
                    const rowOpen = canExpand && open.has(id)
                    const detailId = `${detailPrefix}-detail-${index}`
                    const cells = (
                      <Table.Row
                        key={id}
                        selected={selection?.has(id)}
                        interactive={onRowClick !== undefined}
                        onClick={onRowClick === undefined ? undefined : () => onRowClick(row)}
                      >
                        {selectable ? (
                          <Table.Cell>
                            {/* The click stops in this wrapper, not on the cell
                              (`CellProps` is closed and stays closed), so
                              selecting a row does not also open it. It stops
                              on the way up, after the checkbox has taken it:
                              stopped on the way down, it would never reach
                              the checkbox at all. */}
                            <span
                              className={styles.selectCell}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Checkbox
                                aria-label={getRowLabel?.(row) ?? messages.selectRow}
                                checked={selection.has(id)}
                                onCheckedChange={() => toggleRow(id)}
                              />
                            </span>
                          </Table.Cell>
                        ) : null}
                        {expandable ? (
                          <Table.Cell>
                            {/* A row without a detail keeps its cell, empty, so
                              the columns stay in line. The wrapper is the same
                              as the checkbox's: the click stops here, so opening
                              a row's detail does not also open the row. */}
                            {canExpand ? (
                              <span
                                className={styles.expandCell}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <Button
                                  variant="ghost"
                                  tone="neutral"
                                  size="sm"
                                  iconOnly
                                  icon={rowOpen ? 'up' : 'down'}
                                  label={detailsLabel(getRowName?.(row))}
                                  expanded={rowOpen}
                                  aria-controls={rowOpen ? detailId : undefined}
                                  onClick={() => toggleExpanded(id)}
                                />
                              </span>
                            ) : null}
                          </Table.Cell>
                        ) : null}
                        {columns.map((column) => (
                          <Table.Cell key={column.key} numeric={column.numeric}>
                            {column.cell ? column.cell(row) : defaultCell(row, column.key)}
                          </Table.Cell>
                        ))}
                      </Table.Row>
                    )
                    if (rowDetail === undefined) return cells
                    return (
                      <Fragment key={id}>
                        {cells}
                        {rowOpen ? (
                          // Not a `Table.Row`: a detail row is never selected or
                          // interactive. `data-detail` tells the grid it is one
                          // cell across every column: ArrowDown and ArrowUp reach
                          // the cell, and what it holds stays in the page's tab
                          // order (`grid-keyboard.ts`).
                          <tr id={detailId} data-detail="">
                            <td className={styles.detailCell} colSpan={span}>
                              <div className={styles.detail}>
                                <RowDetail
                                  render={rowDetail}
                                  row={row}
                                  close={() => closeDetail(id)}
                                />
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })}
            </Table.Body>
          </Table>
        </TableStoodFor>
      )}

      {pagination === undefined ? null : (
        <div className={styles.pagination}>
          {/* The pager row also wraps instead of overflowing, and the Pagination
              inside it wraps its own page links. */}
          <Inline gap={3} justify="end" wrap>
            {pagination}
          </Inline>
        </div>
      )}
    </div>
  )
}
