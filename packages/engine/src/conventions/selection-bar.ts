'use client'

/**
 * Where a bar drawn at the person's selected text goes, and where a list drawn
 * at a token goes (`design/components/rich-text-input.md`, "The selection
 * bar" and "Entities"), for every framework's member. The member measures the
 * selection or the token with the editor and calls these to place its parts;
 * the recipes read the custom properties they write.
 *
 * Both parts are `position: fixed`, so a scrolling ancestor (a Dialog's body)
 * does not clip them, and both are kept inside the part of the window a person
 * sees: the visual viewport where the browser has one, which a virtual
 * keyboard or a pinch zoom makes smaller than the window, and the window
 * without its scroll bars where it has none. Each recipe names the distance
 * its part keeps from the edges and from the text in a custom property, which
 * the placement reads as the browser resolved it.
 */

/** A box in viewport coordinates, as `getBoundingClientRect` gives and the editor's `selectionRect()` returns. */
export interface ViewportBox {
  top: number
  bottom: number
  left: number
  right: number
}

/**
 * The part of the window a person sees, in the coordinates
 * `getBoundingClientRect` uses: the visual viewport's box where the browser
 * has one, else the window without its scroll bars.
 */
export function visibleViewport(view: Window): ViewportBox {
  const visual = view.visualViewport
  if (visual !== null && visual !== undefined && visual.width > 0 && visual.height > 0) {
    return {
      left: visual.offsetLeft,
      top: visual.offsetTop,
      right: visual.offsetLeft + visual.width,
      bottom: visual.offsetTop + visual.height,
    }
  }
  const root = view.document.documentElement
  return { left: 0, top: 0, right: root.clientWidth, bottom: root.clientHeight }
}

/** The overlap of two boxes, or null when they do not meet. */
function overlap(a: ViewportBox, b: ViewportBox): ViewportBox | null {
  const box = {
    top: Math.max(a.top, b.top),
    bottom: Math.min(a.bottom, b.bottom),
    left: Math.max(a.left, b.left),
    right: Math.min(a.right, b.right),
  }
  return box.top > box.bottom || box.left > box.right ? null : box
}

/**
 * The part of an element a person can see: its box, cut by every ancestor
 * that clips what overflows it (a scrolling region) and by the visible
 * viewport. The document's root and body are the viewport's, and an ancestor
 * fixed to the window is not clipped by the ones around it. Null when none of
 * it is in view.
 */
export function visibleBox(element: Element): ViewportBox | null {
  const owner = element.ownerDocument
  const view = owner.defaultView
  if (view === null) return null
  let box: ViewportBox | null = element.getBoundingClientRect()
  for (let at = element.parentElement; at !== null && box !== null; at = at.parentElement) {
    if (at === owner.documentElement || at === owner.body) break
    const style = view.getComputedStyle(at)
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible')
      box = overlap(box, at.getBoundingClientRect())
    if (style.position === 'fixed') break
  }
  return box === null ? null : overlap(box, visibleViewport(view))
}

/** A length a recipe names in a custom property, in pixels as the browser resolved it. */
function lengthOf(element: HTMLElement, property: string): number {
  const view = element.ownerDocument.defaultView
  if (view === null) return 0
  const text = view.getComputedStyle(element).getPropertyValue(property).trim()
  const amount = Number.parseFloat(text)
  if (!Number.isFinite(amount)) return 0
  if (text.endsWith('rem')) {
    const root = view.getComputedStyle(element.ownerDocument.documentElement).fontSize
    return amount * (Number.parseFloat(root) || 16)
  }
  return amount
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high))

const px = (element: HTMLElement, property: string) =>
  Number.parseFloat(element.style.getPropertyValue(property)) || 0

/**
 * Writes a fixed part's top-left corner. A transformed or contained ancestor
 * is the containing block of a fixed box, and moves it, so the offset between
 * where the part was put and where it is drawn is read back and taken off.
 */
function putCorner(element: HTMLElement, x: number, y: number, names: [string, string]): void {
  const box = element.getBoundingClientRect()
  const originX = box.left - px(element, names[0])
  const originY = box.top - px(element, names[1])
  element.style.setProperty(names[0], `${x - originX}px`)
  element.style.setProperty(names[1], `${y - originY}px`)
}

/** Where the bar's top-left corner goes, in viewport coordinates, and the side it is on. */
function placement(
  bar: HTMLElement,
  rect: ViewportBox,
  seen: ViewportBox,
  coarse: boolean,
): { x: number; y: number; side: 'top' | 'bottom' } {
  const edge = lengthOf(bar, '--pm-selection-bar-edge')
  const width = bar.offsetWidth
  const height = bar.offsetHeight
  const centre = (rect.left + rect.right) / 2
  const x = clamp(centre - width / 2, seen.left + edge, seen.right - edge - width)
  const above = rect.top - edge - height
  const below = rect.bottom + edge
  const fitsAbove = above >= seen.top + edge
  const fitsBelow = below + height <= seen.bottom - edge
  let side: 'top' | 'bottom'
  let y: number
  // Above the selection; on a coarse pointer below it, where the system's own callout is not.
  // The other side when the first has no room, and when neither has, the selection's visible
  // edge inside the window: its top, or its bottom on a coarse pointer.
  if (coarse ? fitsBelow : fitsAbove) {
    side = coarse ? 'bottom' : 'top'
    y = coarse ? below : above
  } else if (coarse ? fitsAbove : fitsBelow) {
    side = coarse ? 'top' : 'bottom'
    y = coarse ? above : below
  } else if (coarse) {
    side = 'bottom'
    y = Math.min(rect.bottom, seen.bottom) - edge - height
  } else {
    side = 'top'
    y = Math.max(rect.top, seen.top) + edge
  }
  return { x, y: clamp(y, seen.top + edge, seen.bottom - edge - height), side }
}

/**
 * Places a selection bar (`selection-bar.module.css`, `position: fixed`) at a
 * selection's box: centred over it and above it, below it when there is no
 * room above or on a coarse pointer (where the system's own callout sits
 * above the selection), on the other side when the first has no room, and at
 * the selection's visible edge when neither has, always inside the visible
 * viewport by the recipe's edge (`--pm-selection-bar-edge`). It writes the
 * bar's top-left corner (`--pm-selection-bar-x`, `--pm-selection-bar-y`), the
 * widest it may be (`--pm-selection-bar-room`, the visible width less the
 * edges, so a classic scroll bar is not counted) and `data-side`.
 *
 * With `within`, the bar is placed at the part of the selection that element
 * shows (the field's text, inside its own scrolling box), and it is hidden
 * (`data-outside`) while none of the selection is in view there, so it never
 * sits over the page outside the field. Nothing is placed while there is no
 * bar or no selection.
 */
export function placeSelectionBar(
  bar: HTMLElement | null | undefined,
  rect: ViewportBox | null | undefined,
  within?: Element | null,
): void {
  if (bar === null || bar === undefined || rect === null || rect === undefined) return
  const view = bar.ownerDocument.defaultView
  if (view === null) return
  const seen = visibleViewport(view)
  let at: ViewportBox = rect
  if (within !== null && within !== undefined) {
    const shown = visibleBox(within)
    const part = shown === null ? null : overlap(rect, shown)
    if (part === null) {
      bar.dataset['outside'] = ''
      return
    }
    at = part
  }
  delete bar.dataset['outside']
  const edge = lengthOf(bar, '--pm-selection-bar-edge')
  bar.style.setProperty(
    '--pm-selection-bar-room',
    `${Math.max(0, seen.right - seen.left - edge * 2)}px`,
  )
  const coarse = view.matchMedia?.('(pointer: coarse)').matches ?? false
  const { x, y, side } = placement(bar, at, seen, coarse)
  putCorner(bar, x, y, ['--pm-selection-bar-x', '--pm-selection-bar-y'])
  bar.dataset['side'] = side
}

/**
 * Runs `place` as the text moves under a part placed at it (a selection bar,
 * a suggestion list): when the page or any region in it scrolls, when the
 * window resizes, when the visual viewport moves or resizes (a pinch zoom, a
 * virtual keyboard), and when the part's own size changes. Returns the
 * function that stops following.
 */
export function followSelectionBar(bar: HTMLElement, place: () => void): () => void {
  const view = bar.ownerDocument.defaultView
  if (view === null) return () => {}
  const follow = () => place()
  const visual = view.visualViewport
  view.addEventListener('scroll', follow, true)
  view.addEventListener('resize', follow)
  visual?.addEventListener('scroll', follow)
  visual?.addEventListener('resize', follow)
  const observer =
    typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(follow) : null
  observer?.observe(bar)
  return () => {
    view.removeEventListener('scroll', follow, true)
    view.removeEventListener('resize', follow)
    visual?.removeEventListener('scroll', follow)
    visual?.removeEventListener('resize', follow)
    observer?.disconnect()
  }
}

/**
 * Places RichTextInput's suggestion list (`position: fixed`) at the token the
 * caret is in: its inline start at the token's start, kept inside the field
 * and inside the visible viewport; under the token's line, or above it when
 * there is less room below in the part of the window a person sees, by the
 * recipe's gap (`--pm-rich-text-input-gap`). The list is as wide as the recipe
 * makes it from the field's width (`--pm-rich-text-input-field`), which at
 * phone width is the field's own, and as tall as the room on its side allows
 * (`--pm-rich-text-input-room`). It writes the list's top-left corner
 * (`--pm-rich-text-input-x`, `--pm-rich-text-input-y`) and `data-placement`.
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
  const seen = visibleViewport(view)
  const field = root.getBoundingClientRect()
  const gap = lengthOf(panel, '--pm-rich-text-input-gap')
  panel.style.setProperty('--pm-rich-text-input-field', `${field.width}px`)
  const below = seen.bottom - token.bottom - gap * 2
  const above = token.top - seen.top - gap * 2
  // The list's own height decides the side, before the room on that side bounds it.
  panel.style.removeProperty('--pm-rich-text-input-room')
  const natural = panel.offsetHeight
  const side = below >= natural || below >= above ? 'below' : 'above'
  panel.style.setProperty(
    '--pm-rich-text-input-room',
    `${Math.max(0, side === 'below' ? below : above)}px`,
  )
  const width = panel.offsetWidth
  const height = panel.offsetHeight
  const rtl = view.getComputedStyle(root).direction === 'rtl'
  const start = rtl ? token.right - width : token.left
  const inField = clamp(start, field.left, field.right - width)
  const x = clamp(inField, seen.left, seen.right - width)
  const y = clamp(
    side === 'below' ? token.bottom + gap : token.top - gap - height,
    seen.top,
    seen.bottom - height,
  )
  putCorner(panel, x, y, ['--pm-rich-text-input-x', '--pm-rich-text-input-y'])
  panel.dataset['placement'] = side
}
