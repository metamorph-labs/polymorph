'use client'

/**
 * Where a bar drawn at the person's selected text goes, and where a list drawn
 * at a token goes (`design/components/rich-text-input.md`, "The selection
 * bar" and "Entities"), for every framework's member. The member measures the
 * selection or the token with the editor and calls these to place its parts;
 * the recipes read the custom properties they write.
 */

/** A box in viewport coordinates, as `getBoundingClientRect` gives and the editor's `selectionRect()` returns. */
export interface ViewportBox {
  top: number
  bottom: number
  left: number
  right: number
}

/** Where the bar's top-left corner goes, in viewport coordinates. */
function placement(
  bar: HTMLElement,
  rect: ViewportBox,
): { x: number; y: number; side: 'top' | 'bottom' } | null {
  const owner = bar.ownerDocument
  const view = owner.defaultView
  if (view === null) return null
  const viewport = owner.documentElement.clientWidth
  const width = bar.offsetWidth
  const height = bar.offsetHeight
  // The edge margin is the one the bar's own maximum width leaves on each side.
  const widest = Number.parseFloat(view.getComputedStyle(bar).maxWidth)
  const margin = Number.isFinite(widest) ? Math.max(0, (viewport - widest) / 2) : 0
  const centre = (rect.left + rect.right) / 2
  const x = Math.max(margin, Math.min(centre - width / 2, viewport - margin - width))
  const coarse = view.matchMedia?.('(pointer: coarse)').matches ?? false
  const side = coarse || rect.top - margin < height + margin ? 'bottom' : 'top'
  const y = side === 'top' ? rect.top - margin - height : rect.bottom + margin
  return { x, y, side }
}

const px = (element: HTMLElement, property: string) =>
  Number.parseFloat(element.style.getPropertyValue(property)) || 0

/**
 * Places a selection bar (`selection-bar.module.css`, `position: fixed`) at a
 * selection's box: centred over it and above it, below it when there is less
 * room above or on a coarse pointer (where the system's own callout sits
 * above the selection), and inside the viewport's inline edges. It writes the
 * bar's top-left corner (`--pm-selection-bar-x`, `--pm-selection-bar-y`) and
 * `data-side`. A transformed or contained ancestor is the containing block of
 * a fixed box, and moves it, so the offset between where the bar was put and
 * where it is drawn is read back and taken off. Nothing is placed while there
 * is no bar or no selection.
 */
export function placeSelectionBar(
  bar: HTMLElement | null | undefined,
  rect: ViewportBox | null | undefined,
): void {
  if (bar === null || bar === undefined || rect === null || rect === undefined) return
  const at = placement(bar, rect)
  if (at === null) return
  const box = bar.getBoundingClientRect()
  const originX = box.left - px(bar, '--pm-selection-bar-x')
  const originY = box.top - px(bar, '--pm-selection-bar-y')
  bar.style.setProperty('--pm-selection-bar-x', `${at.x - originX}px`)
  bar.style.setProperty('--pm-selection-bar-y', `${at.y - originY}px`)
  bar.dataset['side'] = at.side
}

/**
 * Runs `place` as the selection moves under a drawn bar: when the page or any
 * region in it scrolls, when the window resizes, and when the bar's own size
 * changes. Returns the function that stops following.
 */
export function followSelectionBar(bar: HTMLElement, place: () => void): () => void {
  const view = bar.ownerDocument.defaultView
  if (view === null) return () => {}
  const follow = () => place()
  view.addEventListener('scroll', follow, true)
  view.addEventListener('resize', follow)
  const observer =
    typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(follow) : null
  observer?.observe(bar)
  return () => {
    view.removeEventListener('scroll', follow, true)
    view.removeEventListener('resize', follow)
    observer?.disconnect()
  }
}

/**
 * Places RichTextInput's suggestion list at the token the caret is in: its
 * inline start at the token's start, under the token's line, or above it when
 * there is less room below in the window, inside the field's root. It writes
 * the recipe's `--pm-rich-text-input-x`, `--pm-rich-text-input-above` and
 * `--pm-rich-text-input-below`, from the root's box, and `data-placement`.
 */
export function placeTokenList(
  panel: HTMLElement | null | undefined,
  root: HTMLElement | null | undefined,
  token: ViewportBox | null | undefined,
): void {
  const view = root?.ownerDocument.defaultView
  if (
    panel === null ||
    panel === undefined ||
    root === null ||
    root === undefined ||
    view === null ||
    view === undefined ||
    token === null ||
    token === undefined
  )
    return
  const box = root.getBoundingClientRect()
  const rtl = view.getComputedStyle(root).direction === 'rtl'
  const x = rtl ? box.right - token.right : token.left - box.left
  const below = view.innerHeight - token.bottom
  const side = below >= panel.offsetHeight || below >= token.top ? 'below' : 'above'
  panel.style.setProperty('--pm-rich-text-input-x', `${Math.max(0, x)}px`)
  panel.style.setProperty('--pm-rich-text-input-above', `${token.top - box.top}px`)
  panel.style.setProperty('--pm-rich-text-input-below', `${token.bottom - box.top}px`)
  panel.dataset['placement'] = side
}
