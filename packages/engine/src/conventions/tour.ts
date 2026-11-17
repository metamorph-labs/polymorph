'use client'

/**
 * What a Tour step points at, and where its panel goes
 * (`design/components/tour.md`). Every framework's Tour calls these, so a step
 * finds the same target and lands in the same place in each.
 *
 * A step names its target by the `name` of a `Tour.Target`. The target renders
 * an element that carries `data-tour-target` and adds no box of its own
 * (`display: contents`), so the layout around the wrapped content does not
 * change. An element with no box has no rectangle, so the target's rectangle is
 * the one around the boxes of its contents.
 */

/** The side of its target a step's panel opens on. The sides are physical, as Popover's are. */
export type TourSide = 'top' | 'right' | 'bottom' | 'left'

/** Where a step's panel is drawn: beside its target, or centred in the window. */
export type TourPlacement = TourSide | 'center'

/** A rectangle in the window's coordinates, as `getBoundingClientRect` reports one. */
export interface TourRect {
  x: number
  y: number
  width: number
  height: number
}

/** A width and a height. */
export interface TourSize {
  width: number
  height: number
}

/** The attribute a `Tour.Target` carries, with its name as the value. */
export const TOUR_TARGET_ATTRIBUTE = 'data-tour-target'

/** Whether a node is an element that has no box but whose children do. */
function boxless(element: Element): boolean {
  return getComputedStyle(element).display === 'contents'
}

/**
 * The rectangles of a node's boxes. An element with no box of its own
 * (`display: contents`) gives its children's, so a target that wraps another
 * wrapper is still measured. An element that is not rendered (`display: none`)
 * gives none.
 */
function boxesOf(node: Node, into: DOMRect[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    if ((node.textContent ?? '').trim() === '') return
    const range = node.ownerDocument?.createRange()
    if (range === undefined) return
    range.selectNodeContents(node)
    into.push(range.getBoundingClientRect())
    return
  }
  if (!(node instanceof Element)) return
  if (node.getClientRects().length > 0) {
    into.push(node.getBoundingClientRect())
    return
  }
  if (boxless(node)) node.childNodes.forEach((child) => boxesOf(child, into))
}

/**
 * The rectangle around a target's contents, or `null` when nothing in it is
 * drawn: the target is not rendered, its contents are hidden
 * (`display: none`), or it holds nothing.
 */
export function tourTargetRect(element: Element | null | undefined): TourRect | null {
  if (element === null || element === undefined) return null
  const boxes: DOMRect[] = []
  element.childNodes.forEach((child) => boxesOf(child, boxes))
  const drawn = boxes.filter((box) => box.width > 0 || box.height > 0)
  if (drawn.length === 0) return null
  const left = Math.min(...drawn.map((box) => box.left))
  const top = Math.min(...drawn.map((box) => box.top))
  const right = Math.max(...drawn.map((box) => box.right))
  const bottom = Math.max(...drawn.map((box) => box.bottom))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * The target a step names: the first `Tour.Target` in the document with that
 * name whose contents are drawn. `null` when the step names none, or when no
 * target of that name is drawn, which the step's rule then draws centred.
 */
export function tourTarget(
  name: string | undefined,
  root: ParentNode | null | undefined = typeof document === 'undefined' ? null : document,
): Element | null {
  if (name === undefined || root === null || root === undefined) return null
  for (const element of Array.from(root.querySelectorAll(`[${TOUR_TARGET_ATTRIBUTE}]`))) {
    if (element.getAttribute(TOUR_TARGET_ATTRIBUTE) !== name) continue
    if (tourTargetRect(element) !== null) return element
  }
  return null
}

/** The first element inside a target that has a box of its own. */
function firstDrawn(element: Element): Element | null {
  for (const child of Array.from(element.children)) {
    if (child.getClientRects().length > 0) return child
    if (boxless(child)) {
      const inner = firstDrawn(child)
      if (inner !== null) return inner
    }
  }
  return null
}

/**
 * Scrolls a target into view, by the least distance, at once. An element with
 * no box cannot be scrolled to, so the first drawn element inside it is. The
 * scroll is instant at every motion setting: it plays no motion, so it needs
 * no reduced-motion projection, and the panel is placed once the target is in
 * view.
 */
export function revealTourTarget(element: Element | null | undefined): void {
  if (element === null || element === undefined) return
  const drawn = firstDrawn(element)
  drawn?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
}

/** The window's size, without its scroll bars: the box a fixed panel is placed in. */
export function tourViewport(): TourSize {
  const root = document.documentElement
  return { width: root.clientWidth, height: root.clientHeight }
}

const OPPOSITE: Record<TourSide, TourSide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
}

/** The other two sides, in the order a step tries them. */
const ACROSS: Record<TourSide, readonly TourSide[]> = {
  top: ['right', 'left'],
  bottom: ['right', 'left'],
  left: ['bottom', 'top'],
  right: ['bottom', 'top'],
}

/** `value` moved into `[0, room]`, or `0` when there is no room. */
const clamp = (value: number, room: number): number => Math.max(0, Math.min(value, room))

/**
 * Where a step's panel goes: the top-left corner of its box and the placement
 * it was drawn at.
 *
 * `box` is the panel's box with its margin, which is both its distance from
 * the target and its distance from the window's edge, so this function needs
 * no length of its own. The panel opens on `side` when its box fits between the
 * target and the window's edge, else on the opposite side, else on either of
 * the other two. It is centred on the target along that side and moved back
 * inside the window. With no target, a target that leaves no room on any side
 * (one larger than the window), or one scrolled out of the window, the panel is
 * centred in the window, so it is always inside it.
 */
export function tourPlacement(
  target: TourRect | null,
  box: TourSize,
  viewport: TourSize,
  side: TourSide = 'bottom',
): { x: number; y: number; placement: TourPlacement } {
  const roomX = viewport.width - box.width
  const roomY = viewport.height - box.height
  const centred = {
    x: clamp(roomX / 2, roomX),
    y: clamp(roomY / 2, roomY),
    placement: 'center' as const,
  }
  if (target === null) return centred

  const right = target.x + target.width
  const bottom = target.y + target.height
  const shown =
    right >= 0 && bottom >= 0 && target.x <= viewport.width && target.y <= viewport.height
  if (!shown) return centred

  const middleX = target.x + target.width / 2 - box.width / 2
  const middleY = target.y + target.height / 2 - box.height / 2

  for (const candidate of [side, OPPOSITE[side], ...ACROSS[side]]) {
    switch (candidate) {
      case 'bottom':
        if (bottom + box.height <= viewport.height) {
          return { x: clamp(middleX, roomX), y: bottom, placement: 'bottom' }
        }
        break
      case 'top':
        if (target.y - box.height >= 0) {
          return { x: clamp(middleX, roomX), y: target.y - box.height, placement: 'top' }
        }
        break
      case 'right':
        if (right + box.width <= viewport.width) {
          return { x: right, y: clamp(middleY, roomY), placement: 'right' }
        }
        break
      case 'left':
        if (target.x - box.width >= 0) {
          return { x: target.x - box.width, y: clamp(middleY, roomY), placement: 'left' }
        }
        break
    }
  }
  return centred
}
