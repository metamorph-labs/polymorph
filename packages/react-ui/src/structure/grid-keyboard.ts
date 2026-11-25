'use client'

import { useEffect, useRef, type RefObject } from 'react'

/**
 * The grid keyboard model: the roving-grid pattern a Table opts into
 * (`design/components/data-table.md`, "Keyboard — the grid model").
 *
 * Without it, a fifty-row table with a checkbox per row has fifty-one tab stops
 * before the pagination below. The grid gives **one** tab stop with arrow keys
 * inside, as a listbox does.
 *
 * No React state: the stop moves on every arrow press, and re-rendering every
 * row would stutter under a held key, so `tabIndex` is set on the DOM. The
 * coordinates live in a ref and are re-derived from wherever focus lands, so
 * clicks and keys stay consistent.
 *
 * Table sets `role="grid"`, and nothing here touches roles. In a grid table a
 * `<td>` is already a `gridcell` and a `<tr>` a `row`, and hand-written copies
 * drift.
 *
 * A detail row (`tr[data-detail]`, DataTable's `rowDetail`) has one cell across
 * every column, and the arrow keys reach it as they reach a cell of text:
 * ArrowDown from a cell of the row above it, ArrowUp from a cell of the row
 * below. A row's index counts the rows that are not a detail, and a detail is
 * found from the row it follows. The detail cell takes the stop itself. No
 * `tabindex` is written on what it holds, so its controls stay in the page's
 * tab order, and a key pressed in one of them is that control's own.
 *
 * Focus stays in the grid when the row that holds it leaves the document,
 * where a browser hands focus to the page: it goes to the same column of the
 * row that takes the removed row's place, or of the last row when the removed
 * row was the last. Tree does the same for its rows (`tree-keyboard.ts`).
 */

interface At {
  row: number
  column: number
  /**
   * The stop is on the detail cell under the row. `column` is then the column
   * the reader came from, which ArrowDown and ArrowUp return to.
   */
  detail: boolean
}

const WIDGETS = 'button, a[href], input, select, textarea'

/**
 * Text fields keep their arrow keys and Home for the caret. No member puts one
 * in a cell, but this keeps the grid working if one does.
 */
const TEXT_ENTRY = 'input:not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable]'

/**
 * What a member puts in a cell that only names its column: the name is
 * announced and not drawn (DataTable's expansion column).
 */
const UNDRAWN = '[data-undrawn]'

/**
 * The cell's control, if any. A cell holds at most one (a checkbox or a sort
 * button). Disabled controls are skipped, and so are Radix's hidden form
 * mirrors, which are `aria-hidden`.
 */
function widgetIn(cell: HTMLTableCellElement): HTMLElement | null {
  for (const node of Array.from(cell.querySelectorAll<HTMLElement>(WIDGETS))) {
    if (node.hasAttribute('disabled')) continue
    if (node.getAttribute('aria-hidden') === 'true') continue
    return node
  }
  return null
}

/**
 * Where the tab stop goes, per the APG. A cell's single widget takes it, so
 * reaching a checkbox and pressing Space is one action. A cell without one takes
 * it itself, so its text can still be read.
 */
function stopIn(cell: HTMLTableCellElement): HTMLElement {
  return widgetIn(cell) ?? cell
}

/** The grid's rows, in order: every row of the table that is not a detail row. */
function gridRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return Array.from(table.rows).filter((row) => !row.hasAttribute('data-detail'))
}

/** The detail cell under a grid row, or nothing. A detail row directly follows its row. */
function detailUnder(row: HTMLTableRowElement | undefined): HTMLTableCellElement | null {
  const next = row?.nextElementSibling
  if (!(next instanceof HTMLTableRowElement) || !next.hasAttribute('data-detail')) return null
  return next.cells[0] ?? null
}

/**
 * The grid's cell an event came from, or nothing. The nearest cell may belong
 * to a table inside a detail, so the search climbs to a cell of this table.
 * Inside a detail only the detail cell itself is the grid's: what it holds
 * keeps its own focus and its own keys.
 */
function gridCellOf(
  table: HTMLTableElement,
  target: HTMLElement | null,
): HTMLTableCellElement | null {
  let cell = target?.closest<HTMLTableCellElement>('th, td') ?? null
  while (cell !== null && cell.closest('table') !== table) {
    cell = cell.parentElement?.closest<HTMLTableCellElement>('th, td') ?? null
  }
  if (cell === null || cell.parentElement === null) return null
  if (cell.parentElement.hasAttribute('data-detail') && cell !== target) return null
  return cell
}

/**
 * A cell's coordinates among the grid's rows. A detail cell has its row's, and
 * keeps the column the stop was in.
 */
function coordinates(table: HTMLTableElement, cell: HTMLTableCellElement, column: number): At {
  const row = cell.parentElement as HTMLTableRowElement
  const rows = gridRows(table)
  if (row.hasAttribute('data-detail')) {
    const owner = row.previousElementSibling as HTMLTableRowElement
    return { row: rows.indexOf(owner), column, detail: true }
  }
  return { row: rows.indexOf(row), column: cell.cellIndex, detail: false }
}

/**
 * Coordinates that name a cell that exists, or nothing if the table has none.
 * A detail that closed leaves the stop on its row, in the column it came from.
 */
function clamp(table: HTMLTableElement, at: At): At | null {
  const rows = gridRows(table)
  const row = Math.min(Math.max(at.row, 0), rows.length - 1)
  const cells = rows[row]?.cells
  if (cells === undefined || cells.length === 0) return null
  return {
    row,
    column: Math.min(Math.max(at.column, 0), cells.length - 1),
    detail: at.detail && row === at.row && detailUnder(rows[row]) !== null,
  }
}

/**
 * Where the stop is before the reader has placed it: the first cell of the
 * first row that draws something. A cell that only names its column is passed,
 * because a tab stop on a cell that shows nothing gives a sighted reader no
 * place. The arrow keys still reach that cell.
 */
function start(table: HTMLTableElement): At {
  const cells = Array.from(gridRows(table)[0]?.cells ?? [])
  const column = cells.findIndex((cell) => cell.querySelector(UNDRAWN) === null)
  return { row: 0, column: Math.max(column, 0), detail: false }
}

/** The element that holds the stop at these coordinates. */
function stopAt(table: HTMLTableElement, at: At): HTMLElement | null {
  const row = gridRows(table)[at.row]
  if (at.detail) return detailUnder(row)
  const cell = row?.cells[at.column]
  return cell === undefined ? null : stopIn(cell)
}

/**
 * Compares the attribute, not the property: `td.tabIndex` reads `-1` on a cell
 * without `tabindex`, so a property check would write nothing and the cell
 * would stay unfocusable. Arrow keys set `0` first and would still work, but a
 * click would not, and the grid would lose the pointer's position.
 */
function setTabIndex(node: HTMLElement, value: number) {
  if (node.getAttribute('tabindex') !== String(value)) node.tabIndex = value
}

/** Exactly one 0 in the whole grid; everything else reachable but not tabbable. */
function applyRoving(table: HTMLTableElement, at: At) {
  for (const [index, row] of gridRows(table).entries()) {
    for (const cell of Array.from(row.cells)) {
      const stop = stopIn(cell)
      const wanted = !at.detail && index === at.row && cell.cellIndex === at.column ? 0 : -1
      // When the widget holds the stop, the cell must not also hold one.
      // Otherwise Tab stops twice in the same place.
      if (stop !== cell) setTabIndex(cell, -1)
      setTabIndex(stop, wanted)
    }
    // The detail cell takes the stop itself, whatever it holds.
    const detail = detailUnder(row)
    if (detail !== null) setTabIndex(detail, at.detail && index === at.row ? 0 : -1)
  }
}

export function useGridKeyboard(ref: RefObject<HTMLTableElement | null>, enabled: boolean) {
  // Nothing until focus or a key places the stop. Until then it is where the
  // grid starts, worked out again after each commit.
  const at = useRef<At | null>(null)
  // Whether focus is in the grid, so a commit that removes the focused row
  // knows that the focus the page holds fell from the grid.
  const held = useRef(false)

  // After every commit: sorting, paging and loading replace rows, and a stop on a
  // removed node would leave no tab stop. Re-clamping also handles a shorter last
  // page. Focus that was in a removed row goes to the stop that takes its place.
  useEffect(() => {
    const table = ref.current
    if (table === null || !enabled) return
    const next = clamp(table, at.current ?? start(table))
    if (next === null) return
    if (at.current !== null) at.current = next
    applyRoving(table, next)
    const fell = document.activeElement === null || document.activeElement === document.body
    if (held.current && fell) stopAt(table, next)?.focus()
  })

  useEffect(() => {
    const table = ref.current
    if (table === null || !enabled) return

    // Focus is the single source of truth for the current cell. A click and an
    // arrow key end in the same state, so only focus needs handling.
    const onFocusIn = (event: FocusEvent) => {
      held.current = true
      const cell = gridCellOf(table, event.target as HTMLElement | null)
      if (cell === null) return
      const column = (at.current ?? start(table)).column
      const next = clamp(table, coordinates(table, cell, column))
      if (next === null) return
      at.current = next
      applyRoving(table, next)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target === null || target.closest(TEXT_ENTRY) !== null) return

      // A key pressed in what a detail holds is that content's own: it has no
      // cell here, so the arrows keep what they do in the content.
      const cell = gridCellOf(table, target)
      if (cell === null) return

      const rows = gridRows(table)
      const here = coordinates(table, cell, (at.current ?? start(table)).column)
      // Arrow keys are physical, not logical, so which arrow moves to the next
      // cell depends on the writing direction.
      const forward = getComputedStyle(table).direction === 'rtl' ? -1 : 1
      const far = event.ctrlKey || event.metaKey
      const last = Number.MAX_SAFE_INTEGER

      // `null` stays where it is: the key is the grid's, and it has nowhere to go.
      let next: At | null
      if (here.detail) {
        // One cell across every column: its row has no other cell, so the keys
        // that move along a row stay. Up and down leave it, and so do the two
        // keys that name a cell of the grid.
        switch (event.key) {
          case 'ArrowDown':
            next = here.row + 1 < rows.length ? { ...here, row: here.row + 1, detail: false } : null
            break
          case 'ArrowUp':
            next = { ...here, detail: false }
            break
          case 'ArrowRight':
          case 'ArrowLeft':
            next = null
            break
          case 'Home':
            next = far ? { row: 0, column: 0, detail: false } : null
            break
          case 'End':
            next = far ? { row: last, column: last, detail: false } : null
            break
          default:
            return
        }
      } else {
        switch (event.key) {
          case 'ArrowRight':
            next = { ...here, column: here.column + forward }
            break
          case 'ArrowLeft':
            next = { ...here, column: here.column - forward }
            break
          case 'ArrowDown':
            // An open row's detail comes before the next row.
            next =
              detailUnder(rows[here.row]) !== null
                ? { ...here, detail: true }
                : { ...here, row: here.row + 1 }
            break
          case 'ArrowUp':
            next =
              detailUnder(rows[here.row - 1]) !== null
                ? { ...here, row: here.row - 1, detail: true }
                : { ...here, row: here.row - 1 }
            break
          case 'Home':
            next = far ? { row: 0, column: 0, detail: false } : { ...here, column: 0 }
            break
          case 'End':
            next = far ? { row: last, column: last, detail: false } : { ...here, column: last }
            break
          default:
            return
        }
      }

      // The grid handles its arrow keys even at the edges. Holding ArrowDown on
      // the last row stays on the last row instead of scrolling the page.
      event.preventDefault()

      const to = next === null ? null : clamp(table, next)
      if (to === null) return
      at.current = to
      applyRoving(table, to)
      stopAt(table, to)?.focus()
    }

    // A browser may report focus leaving a cell as the cell leaves the
    // document. That cell is gone a moment later, and the grid still holds
    // focus for it. A cell that is still drawn lost focus to something else.
    const onFocusOut = (event: FocusEvent) => {
      const left = event.target as Node
      queueMicrotask(() => {
        if (left.isConnected && !table.contains(document.activeElement)) held.current = false
      })
    }

    table.addEventListener('focusin', onFocusIn)
    table.addEventListener('focusout', onFocusOut)
    table.addEventListener('keydown', onKeyDown)
    return () => {
      table.removeEventListener('focusin', onFocusIn)
      table.removeEventListener('focusout', onFocusOut)
      table.removeEventListener('keydown', onKeyDown)
    }
  }, [ref, enabled])
}
