'use client'

import {
  useEffect,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from 'react'

/**
 * The tree keyboard model: the tree view pattern of the ARIA Authoring
 * Practices, as `design/components/tree.md` states it (Keyboard).
 *
 * The tree has one tab stop, and the arrow keys, Home and End move it between
 * the rows that are drawn. A row is an item or a "load more" row. A closed
 * branch draws no rows under it, so every row in the document is one a reader
 * sees.
 *
 * No React state: the stop moves on every arrow press, and rendering every
 * row again would stutter under a held key, so `tabindex` is set on the DOM, as
 * Table's grid sets it (`grid-keyboard.ts`). What a row is comes from the
 * document too: `aria-expanded` says a branch and whether it is open,
 * `aria-disabled` says an item takes no key and no press, `data-tree-item`
 * holds the item's id, and `data-tree-part` names a row's parts. So the React
 * member and the description the other frameworks are generated from hold the
 * same model, and a handler needs no item passed to it.
 *
 * A disabled item takes no focus: the keys pass over it, as they pass over a
 * disabled tab or menu item.
 */

/** A row: an item, or the row that asks for more of a level. */
const ROW = '[role="treeitem"]'

/** A row the keys reach. */
const ENABLED = `${ROW}:not([aria-disabled="true"])`

const MORE = '[data-tree-part="more"]'

/** What the member does when a key or a press asks for it. */
export interface TreeActions {
  /** Opens a closed branch, or closes an open one. */
  toggle: (id: string) => void
  select: (id: string) => void
  /** Asks for more of a level: a branch's, by its id, or the top level's, with `null`. */
  more: (parent: string | null) => void
}

/** A level the reader asked for more of, and the items it held then. */
interface Asked {
  parent: string | null
  count: number
}

interface Model {
  /** Whether focus has placed the stop. Until then it is the selected item, else the first row. */
  placed: boolean
  /** Whether focus is in the tree, or was when the row that had it left the document. */
  held: boolean
  asked: Asked | null
  /** The model is moving focus itself, so the move is not the reader's. */
  moving: boolean
}

/** The rows the keys move among, in the order they are drawn. */
function rowsOf(tree: HTMLElement): HTMLElement[] {
  return Array.from(tree.querySelectorAll<HTMLElement>(ENABLED))
}

/** The id of the branch a row sits under, or `null` at the top level. */
function parentOf(row: Element): string | null {
  return row.parentElement?.closest(ROW)?.getAttribute('data-tree-item') ?? null
}

/** The list that holds a level's rows: the tree for the top level, else the branch's group. */
function levelOf(tree: HTMLElement, parent: string | null): Element | null {
  if (parent === null) return tree
  const branch = Array.from(tree.querySelectorAll(ROW)).find(
    (row) => row.getAttribute('data-tree-item') === parent,
  )
  return branch?.querySelector(':scope > [role="group"]') ?? null
}

/** A level's items, without the row that asks for more. */
function itemsIn(level: Element): HTMLElement[] {
  return Array.from(level.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.matches(ROW) && !child.matches(MORE),
  )
}

/**
 * Where the stop is: where focus placed it, while that row is drawn. Else the
 * selected item, else the first row, as the pattern asks of a tree that has
 * not had focus.
 */
function stopOf(tree: HTMLElement, model: Model): HTMLElement | null {
  const rows = rowsOf(tree)
  const placed = model.placed ? rows.find((row) => row.getAttribute('tabindex') === '0') : undefined
  return (
    placed ?? rows.find((row) => row.getAttribute('aria-selected') === 'true') ?? rows[0] ?? null
  )
}

/**
 * Exactly one `tabindex="0"` in the tree. Every other row takes focus from a
 * press or a key and is no tab stop, and a disabled item takes none. The
 * attribute is compared before it is written, so a row already in place is
 * left alone.
 */
function rove(tree: HTMLElement, stop: HTMLElement | null) {
  for (const row of Array.from(tree.querySelectorAll<HTMLElement>(ROW))) {
    if (row !== stop && row.getAttribute('aria-disabled') === 'true') {
      row.removeAttribute('tabindex')
      continue
    }
    const wanted = row === stop ? '0' : '-1'
    if (row.getAttribute('tabindex') !== wanted) row.setAttribute('tabindex', wanted)
  }
}

/**
 * Runs after every commit, because a level that arrives, a branch that closes
 * and a selection that changes all replace rows.
 *
 * It keeps one tab stop. It also keeps focus in the tree when the row that had
 * it leaves the document, where a browser would hand focus to the page: focus
 * goes to the first new row when the reader asked for more of a level and the
 * rows have arrived, and to the stop otherwise.
 */
function settle(tree: HTMLElement, model: Model) {
  const lost = model.held && !tree.contains(document.activeElement)
  let to: HTMLElement | null = null

  if (model.asked !== null) {
    const level = levelOf(tree, model.asked.parent)
    const items = level === null ? [] : itemsIn(level)
    if (level === null) model.asked = null
    else if (items.length > model.asked.count) {
      // The reader is still where the request left them: a move of their own
      // forgets the request.
      if (model.held) {
        to =
          items.slice(model.asked.count).find((row) => row.matches(ENABLED)) ?? stopOf(tree, model)
      }
      model.asked = null
    }
  }
  if (to === null && lost) to = stopOf(tree, model)

  if (to === null) {
    rove(tree, stopOf(tree, model))
    return
  }
  rove(tree, to)
  model.moving = true
  to.focus()
  model.moving = false
}

export function useTreeKeyboard(ref: RefObject<HTMLUListElement | null>, actions: TreeActions) {
  const model = useRef<Model>({ placed: false, held: false, asked: null, moving: false })

  useEffect(() => {
    if (ref.current !== null) settle(ref.current, model.current)
  })

  /** Asks for more of the level a "load more" row closes, unless the level is loading. */
  const ask = (row: HTMLElement) => {
    if (row.getAttribute('aria-busy') === 'true' || row.parentElement === null) return
    const parent = parentOf(row)
    model.current.asked = { parent, count: itemsIn(row.parentElement).length }
    actions.more(parent)
  }

  return {
    // Focus says where the stop is, so a press and a key end in the same state.
    onFocus(event: FocusEvent<HTMLUListElement>) {
      const tree = ref.current
      const row = event.target.closest<HTMLElement>(ROW)
      if (tree === null || row === null) return
      const now = model.current
      now.held = true
      now.placed = true
      const asking = now.asked !== null && row.matches(MORE) && parentOf(row) === now.asked.parent
      if (!now.moving && !asking) now.asked = null
      rove(tree, row)
    },

    // A browser may report a blur for a row as it leaves the document. That row
    // is gone a moment later, and the tree still holds focus for it. A row that
    // is still drawn lost focus to something else.
    onBlur(event: FocusEvent<HTMLUListElement>) {
      const tree = ref.current
      const row = event.target
      queueMicrotask(() => {
        if (tree === null || !row.isConnected) return
        if (!tree.contains(document.activeElement)) model.current.held = false
      })
    },

    onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
      const tree = ref.current
      const here = (event.target as HTMLElement).closest<HTMLElement>(ROW)
      // A key with Alt, Control or Meta is the browser's or the application's.
      if (tree === null || here === null || event.altKey || event.ctrlKey || event.metaKey) return

      const rows = rowsOf(tree)
      const at = rows.indexOf(here)
      // The arrows are physical, so which one points into a branch follows the
      // writing direction.
      const rtl = getComputedStyle(tree).direction === 'rtl'
      const inward = rtl ? 'ArrowLeft' : 'ArrowRight'
      const outward = rtl ? 'ArrowRight' : 'ArrowLeft'
      const id = here.matches(ENABLED) ? here.getAttribute('data-tree-item') : null
      const expanded = here.getAttribute('aria-expanded')

      let to: HTMLElement | null | undefined = null
      switch (event.key) {
        case 'ArrowDown':
          to = rows[at + 1]
          break
        case 'ArrowUp':
          to = at > 0 ? rows[at - 1] : null
          break
        case 'Home':
          to = rows[0]
          break
        case 'End':
          to = rows[rows.length - 1]
          break
        case inward:
          // Opens a closed branch. On an open one it moves to the first row under it.
          if (id !== null && expanded === 'false') actions.toggle(id)
          else if (expanded === 'true') {
            to = here.querySelector<HTMLElement>(`:scope > [role="group"] > ${ENABLED}`)
          }
          break
        case outward:
          // Closes an open branch. Otherwise it moves to the branch the row sits under.
          if (id !== null && expanded === 'true') actions.toggle(id)
          else to = here.parentElement?.closest<HTMLElement>(ENABLED)
          break
        case 'Enter':
        case ' ':
          if (here.matches(MORE)) ask(here)
          else if (id !== null) actions.select(id)
          break
        default:
          return
      }

      // The tree takes its keys even at an edge. Holding ArrowDown on the last
      // row stays there instead of scrolling the page.
      event.preventDefault()
      if (to === null || to === undefined) return
      rove(tree, to)
      to.focus()
    },

    // A press on the chevron opens or closes and selects nothing. A press on the
    // rest of a row selects and opens nothing.
    onClick(event: MouseEvent<HTMLUListElement>) {
      const target = event.target as Element
      const row = target.closest('[data-tree-part="row"]')?.parentElement ?? null
      if (row === null || !row.matches(ENABLED)) return
      const id = row.getAttribute('data-tree-item')
      if (row.matches(MORE)) ask(row)
      else if (id === null) return
      else if (target.closest('[data-tree-part="toggle"]') !== null) actions.toggle(id)
      else actions.select(id)
    },
  }
}
