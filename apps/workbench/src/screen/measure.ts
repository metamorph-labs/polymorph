/**
 * The layout faults of the page, measured in the page.
 *
 * A screenshot shows a fault to a reader who looks for it. A measurement names it. This module
 * measures four things the layout rules (`docs/layout.md`) say a screen never does:
 *
 *  - `sideways-scroll`: the page scrolls sideways, or a layout region pans.
 *  - `clipped-text`: text that does not fit the box that holds it. The box cuts it with no
 *    ellipsis, or the text is drawn outside the box.
 *  - `small-target`: a control whose hit area is under the touch-target floor, with another
 *    control inside the floor's reach.
 *  - `cut-off`: text or a control that a box hides, where nothing scrolls to it.
 *
 * Text a member shortens with an ellipsis is not a fault. The member does it by design, so it is
 * listed apart, as `truncated`.
 *
 * `sideways-scroll` and the page edges of `cut-off` are the phone lane's measurements
 * (`proof/run.mjs`, `fitsThePhone`), at any width. Only visible elements are measured. A closed
 * drawer is off the edge on purpose and hidden, and measuring it would report the intended
 * layout.
 *
 * The module imports nothing, so its test can load it into any page as one script
 * (`packages/mcp/src/measure.test.ts`).
 */

export type LayoutFaultKind = 'sideways-scroll' | 'clipped-text' | 'small-target' | 'cut-off'

export interface LayoutFault {
  kind: LayoutFaultKind
  /** The element as a reader would name it: its member or tag, and its label or text. */
  element: string
  /** What was measured, with the numbers. */
  message: string
}

export interface Measurement {
  faults: LayoutFault[]
  /** Text a member shortened with an ellipsis, each named as a fault's element is. */
  truncated: string[]
  /** The window, and the whole height of the page that scrolls inside it. */
  page: { width: number; height: number; scrollHeight: number }
}

/** Subpixel layout rounds differently at each device scale factor. */
const TOLERANCE = 1

/**
 * The touch-target floor: WCAG 2.2's target size (2.5.8), which every density's
 * `--pm-control-height-sm` is derived to meet (`docs/layout.md`, touch targets).
 */
const TARGET_FLOOR = 24

/** A few faults of a kind are enough to act on. A broken page can put a whole subtree over an edge. */
const PER_KIND = 6

const CONTROLS = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="slider"]',
  '[role="combobox"]',
].join(',')

const CLIPS = new Set(['hidden', 'clip'])
const PANS = new Set(['auto', 'scroll'])

function isVisible(node: Element): boolean {
  return node.checkVisibility({
    visibilityProperty: true,
    opacityProperty: true,
    contentVisibilityAuto: true,
  })
}

/** The text a node holds itself, outside any child element. */
function ownText(node: Element): string {
  let text = ''
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) text += child.textContent ?? ''
  }
  return text.replace(/\s+/g, ' ').trim()
}

const shorten = (text: string, limit = 60): string =>
  text.length <= limit ? text : `${text.slice(0, limit - 1)}…`

const px = (value: number): string => `${Math.round(value * 10) / 10}px`

/** The edges of a box a person can see into: its border box, less its borders. */
function clipBox(node: Element): { left: number; right: number; top: number; bottom: number } {
  const box = node.getBoundingClientRect()
  return {
    left: box.left + node.clientLeft,
    top: box.top + node.clientTop,
    right: box.left + node.clientLeft + node.clientWidth,
    bottom: box.top + node.clientTop + node.clientHeight,
  }
}

/** Whether a box shortens its text with an ellipsis, on either axis. */
function truncates(style: CSSStyleDeclaration): boolean {
  const clamp = style.getPropertyValue('-webkit-line-clamp')
  return style.textOverflow === 'ellipsis' || (clamp !== '' && clamp !== 'none')
}

/** A box one pixel wide or tall hides its content on purpose: the visually-hidden convention. */
function hidesOnPurpose(node: Element): boolean {
  const box = node.getBoundingClientRect()
  return box.width <= 1 || box.height <= 1
}

/**
 * Whether a region that pans was built to. A member that pans says so: a Table marks itself
 * `data-overflowing`, a tab list has its role, and a scroll region a person can reach is named
 * or takes focus. A layout region that pans has none of these: its content is too wide for it.
 */
function pansOnPurpose(node: Element): boolean {
  return (
    node.hasAttribute('data-overflowing') ||
    node.hasAttribute('aria-label') ||
    node.hasAttribute('aria-labelledby') ||
    node.getAttribute('role') === 'tablist' ||
    node.tagName === 'PRE' ||
    (node as HTMLElement).tabIndex >= 0
  )
}

/**
 * What hides part of a node, where nothing scrolls to it.
 *
 * Each ancestor is asked about each axis. One that scrolls along an axis makes everything inside
 * it reachable along that axis, so the walk stops asking about it. One that clips along an axis
 * hides whatever lies outside its box. The document and its body clip only while an overlay
 * locks the page, which hides nothing for good, so they are not asked.
 *
 * Past the last ancestor is the page. Its left edge is never scrolled to. Its right and bottom
 * edges are reached only by content that makes the page scroll, which a fixed box does not. The
 * top edge is not measured: a skip link waits above it until it takes focus.
 */
function hiddenBy(
  node: Element,
  box: DOMRect,
): { by: Element | null; amount: number; side: string; truncating: boolean } | null {
  let checkX = true
  let checkY = true

  for (
    let parent = node.parentElement;
    parent !== null && parent !== document.body && parent !== document.documentElement;
    parent = parent.parentElement
  ) {
    if (!checkX && !checkY) return null
    const style = getComputedStyle(parent)
    const clip = clipBox(parent)

    if (checkX) {
      if (PANS.has(style.overflowX)) checkX = false
      else if (CLIPS.has(style.overflowX)) {
        const right = box.right - clip.right
        const left = clip.left - box.left
        if (Math.max(right, left) > TOLERANCE) {
          if (hidesOnPurpose(parent)) return null
          return {
            by: parent,
            amount: Math.max(right, left),
            side: right > left ? 'right' : 'left',
            truncating: truncates(style),
          }
        }
      }
    }

    if (checkY) {
      if (PANS.has(style.overflowY)) checkY = false
      else if (CLIPS.has(style.overflowY)) {
        const bottom = box.bottom - clip.bottom
        const top = clip.top - box.top
        if (Math.max(bottom, top) > TOLERANCE) {
          if (hidesOnPurpose(parent)) return null
          return {
            by: parent,
            amount: Math.max(bottom, top),
            side: bottom > top ? 'bottom' : 'top',
            truncating: truncates(style),
          }
        }
      }
    }
  }

  const doc = document.documentElement
  const scroller = document.scrollingElement ?? doc
  if (checkX) {
    const left = box.left + scroller.scrollLeft
    if (left < -TOLERANCE) return { by: null, amount: -left, side: 'left', truncating: false }
    const pageWidth = Math.max(doc.clientWidth, scroller.scrollWidth)
    const right = box.right + scroller.scrollLeft
    if (right > pageWidth + TOLERANCE) {
      return { by: null, amount: right - pageWidth, side: 'right', truncating: false }
    }
  }
  if (checkY) {
    const pageHeight = Math.max(doc.clientHeight, scroller.scrollHeight)
    const bottom = box.bottom + scroller.scrollTop
    if (bottom > pageHeight + TOLERANCE) {
      return { by: null, amount: bottom - pageHeight, side: 'bottom', truncating: false }
    }
  }
  return null
}

/** The box of the text a node holds itself, or `null` when it holds none. */
function textBox(node: Element): DOMRect | null {
  const range = document.createRange()
  let box: DOMRect | null = null
  for (const child of node.childNodes) {
    if (child.nodeType !== Node.TEXT_NODE || (child.textContent ?? '').trim() === '') continue
    range.selectNodeContents(child)
    const found = range.getBoundingClientRect()
    if (found.width === 0 && found.height === 0) continue
    if (box === null) box = found
    else {
      const left = Math.min(box.left, found.left)
      const top = Math.min(box.top, found.top)
      box = new DOMRect(
        left,
        top,
        Math.max(box.right, found.right) - left,
        Math.max(box.bottom, found.bottom) - top,
      )
    }
  }
  return box
}

/** The controls a person types into. Each sits in a frame that passes its presses to it. */
const TEXT_ENTRY = 'input, textarea, select, [role="combobox"]'

/**
 * Whether a point's topmost element activates the control: itself, its content, its label, or
 * the frame of a text field. A field's frame is the box around it inside its own member that
 * holds no other control (`Input` focuses its field from a press anywhere on the frame).
 */
function activates(hit: Element | null, control: Element): boolean {
  if (hit === null) return false
  if (hit === control || control.contains(hit)) return true
  // A label passes its clicks to the control it names or holds.
  const label = hit.closest('label')
  if (label !== null && (label.control === control || label.contains(control))) return true
  if (!control.matches(TEXT_ENTRY) || !hit.contains(control)) return false
  const member = control.closest('[data-member]')
  return member !== null && member.contains(hit) && hit.querySelectorAll(CONTROLS).length === 1
}

interface Target {
  node: Element
  box: DOMRect
  x: number
  y: number
  /** Whether the hit area reaches the floor across and down. */
  wide: boolean
  tall: boolean
}

/** Whether a point is inside a box. */
function holds(box: DOMRect, x: number, y: number): boolean {
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
}

/**
 * Whether a control is what a touch at a point lands on once the control over it is taken away.
 *
 * Two dots whose hit areas overlap are one over the other with nothing between them. A field in
 * a dialog under another dialog is not: under the upper dialog's field is the upper dialog's
 * panel, and the lower field is out of reach whatever the upper field's hit area is.
 */
function liesNextUnder(cover: Element, control: Element, x: number, y: number): boolean {
  const under = document.elementsFromPoint(x, y).find((element) => !cover.contains(element))
  return activates(under ?? null, control)
}

/**
 * A control's hit area, against the floor.
 *
 * A control's box is not its hit area. A checkbox is a 16px box whose pseudo-element or label row
 * takes the touches around it, so the page is asked what a touch would land on: the four points
 * half a floor from the control's centre must each activate it. A control outside the window is
 * scrolled into it to be asked, and every region is put back where it was.
 *
 * A touch on the control's own centre can land on something else. When that is another control's
 * hit area reaching past its own box, with this control next under it, this control has no hit
 * area of its own at its centre, and it is under the floor. When it is anything else (a scrim, a
 * sheet, a control drawn over this one, a control in a layer drawn over this one) the control is
 * covered, cannot be asked and is not measured.
 */
function targetOf(node: Element): Target | null {
  if (node.getBoundingClientRect().width === 0) return null
  const doc = document.documentElement
  const reach = TARGET_FLOOR / 2 - TOLERANCE
  const centre = () => {
    const box = node.getBoundingClientRect()
    return { box, x: box.left + box.width / 2, y: box.top + box.height / 2 }
  }
  const inWindow = ({ x, y }: { x: number; y: number }) =>
    x - reach >= 0 &&
    y - reach >= 0 &&
    x + reach <= doc.clientWidth &&
    y + reach <= doc.clientHeight

  const scrolled: [Element, number, number][] = []
  if (!inWindow(centre())) {
    for (let parent = node.parentElement; parent !== null; parent = parent.parentElement) {
      scrolled.push([parent, parent.scrollLeft, parent.scrollTop])
    }
    node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
  }

  const { x, y } = centre()
  let reaches: { wide: boolean; tall: boolean } | null = null
  if (inWindow({ x, y })) {
    const hit = document.elementFromPoint(x, y)
    if (activates(hit, node)) {
      reaches = {
        wide:
          activates(document.elementFromPoint(x - reach, y), node) &&
          activates(document.elementFromPoint(x + reach, y), node),
        tall:
          activates(document.elementFromPoint(x, y - reach), node) &&
          activates(document.elementFromPoint(x, y + reach), node),
      }
    } else {
      const other = hit?.closest(CONTROLS) ?? null
      const apart = other !== null && !other.contains(node) && !node.contains(other)
      if (
        apart &&
        !holds(other.getBoundingClientRect(), x, y) &&
        liesNextUnder(other, node, x, y)
      ) {
        reaches = { wide: false, tall: false }
      }
    }
  }

  for (const [parent, left, top] of scrolled) {
    parent.scrollLeft = left
    parent.scrollTop = top
  }
  if (reaches === null) return null

  // Positions are compared between controls, so each is read with the page as it was drawn.
  return { node, ...centre(), ...reaches }
}

/** The distance from a point to a box, zero inside it. */
function distance(x: number, y: number, box: DOMRect): number {
  const dx = Math.max(box.left - x, 0, x - box.right)
  const dy = Math.max(box.top - y, 0, y - box.bottom)
  return Math.hypot(dx, dy)
}

/**
 * The controls under the touch-target floor, as WCAG 2.5.8 states it.
 *
 * A control whose hit area is under 24px either way is a fault only when another control lies
 * inside the 24px circle centred on it, because spacing is what keeps a small target from being
 * missed. A link set inside a sentence is exempt, as in the criterion: its height is its line's.
 */
function smallTargets(describe: (node: Element) => string): LayoutFault[] {
  const targets: Target[] = []
  for (const node of document.querySelectorAll(CONTROLS)) {
    if (!isVisible(node)) continue
    if (node.matches(':disabled, [aria-disabled="true"], [tabindex="-1"]')) continue
    if (node.tagName === 'A' && getComputedStyle(node).display === 'inline') continue
    const target = targetOf(node)
    if (target !== null) targets.push(target)
  }

  const faults: LayoutFault[] = []
  for (const small of targets) {
    if (small.wide && small.tall) continue
    const crowding = targets.find((other) => {
      if (other === small) return false
      if (other.node.contains(small.node) || small.node.contains(other.node)) return false
      const undersized = !(other.wide && other.tall)
      return (
        distance(small.x, small.y, other.box) < TARGET_FLOOR / 2 - TOLERANCE ||
        (undersized && Math.hypot(small.x - other.x, small.y - other.y) < TARGET_FLOOR - TOLERANCE)
      )
    })
    if (crowding === undefined) continue
    faults.push({
      kind: 'small-target',
      element: describe(small.node),
      message:
        `Its hit area is under the ${TARGET_FLOOR}px touch-target floor: its box is ` +
        `${px(small.box.width)} by ${px(small.box.height)}, and ${describe(crowding.node)} ` +
        `is inside the ${TARGET_FLOOR}px circle centred on it.`,
    })
  }
  return faults
}

/**
 * The page's layout faults and truncated text, at the window's current size.
 *
 * `memberNames` maps the slug a member writes into `data-member` to the member's name, so a
 * fault names the member a screen's author wrote.
 */
export function measureLayout(memberNames: Readonly<Record<string, string>> = {}): Measurement {
  const doc = document.documentElement
  const scroller = document.scrollingElement ?? doc
  const width = doc.clientWidth

  /** A node as a reader would name it: `Button "Create key"`, `span "Seats" in SettingsRow`. */
  const describe = (node: Element): string => {
    const tag = node.tagName.toLowerCase()
    const label =
      node.getAttribute('aria-label') ??
      (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
        ? node.labels?.[0]?.textContent || node.placeholder || node.name
        : null) ??
      node.textContent ??
      ''
    const text = shorten(label.replace(/\s+/g, ' ').trim())
    const quoted = text === '' ? '' : ` "${text}"`

    const owner = node.closest('[data-member]')
    const slug = owner?.getAttribute('data-member') ?? ''
    const member = memberNames[slug] ?? slug
    if (owner === node) return `${member}${quoted}`
    return member === '' ? `${tag}${quoted}` : `${tag}${quoted} in ${member}`
  }

  const sideways: LayoutFault[] = []
  const clipped: LayoutFault[] = []
  const cutOff: LayoutFault[] = []
  const truncated = new Set<string>()
  /** Elements already reported, so a fault names the outermost box and not each thing in it. */
  const reported: Element[] = []
  const inside = (node: Element) => reported.some((outer) => outer.contains(node))

  if (scroller.scrollWidth > width + TOLERANCE) {
    sideways.push({
      kind: 'sideways-scroll',
      element: 'the page',
      message: `The page scrolls sideways: ${px(scroller.scrollWidth)} of content in a ${px(width)} window.`,
    })
  }

  for (const node of document.querySelectorAll('body *')) {
    if (!isVisible(node)) continue
    const style = getComputedStyle(node)

    if (
      PANS.has(style.overflowX) &&
      node.scrollWidth > node.clientWidth + TOLERANCE &&
      !pansOnPurpose(node)
    ) {
      sideways.push({
        kind: 'sideways-scroll',
        element: describe(node),
        message:
          `It pans sideways: ${px(node.scrollWidth)} of content in ${px(node.clientWidth)}. ` +
          'Its content is too wide for it.',
      })
    }

    const text = ownText(node)
    const carries = text !== '' || node.matches(CONTROLS)
    if (!carries || inside(node)) continue

    const box = node.getBoundingClientRect()
    if (box.width === 0 && box.height === 0) continue

    if (text !== '' && style.display !== 'inline' && !hidesOnPurpose(node)) {
      // Text cut by its own box.
      const cutX = CLIPS.has(style.overflowX) && node.scrollWidth > node.clientWidth + TOLERANCE
      const cutY = CLIPS.has(style.overflowY) && node.scrollHeight > node.clientHeight + TOLERANCE
      if (cutX || cutY) {
        if (truncates(style)) {
          truncated.add(describe(node))
        } else {
          reported.push(node)
          clipped.push({
            kind: 'clipped-text',
            element: describe(node),
            message: cutX
              ? `Its box cuts the text: ${px(node.clientWidth)} shows of ${px(node.scrollWidth)}, with no ellipsis.`
              : `Its box cuts the text: ${px(node.clientHeight)} shows of ${px(node.scrollHeight)} of height.`,
          })
        }
        continue
      }

      // Text drawn outside a box that neither clips it nor scrolls to it.
      const drawn = style.overflowX === 'visible' ? textBox(node) : null
      if (drawn !== null) {
        const over = Math.max(drawn.right - box.right, box.left - drawn.left)
        if (over > TOLERANCE * 2) {
          reported.push(node)
          clipped.push({
            kind: 'clipped-text',
            element: describe(node),
            message:
              `The text is ${px(drawn.width)} wide in a ${px(box.width)} box, so ${px(over)} of ` +
              'it is drawn outside the box.',
          })
          continue
        }
      }
    }

    // Text or a control hidden by a box above it.
    const hidden = hiddenBy(node, box)
    if (hidden === null) continue
    if (hidden.truncating) {
      truncated.add(describe(node))
      continue
    }
    reported.push(node)
    cutOff.push({
      kind: 'cut-off',
      element: describe(node),
      message:
        hidden.by === null
          ? `${px(hidden.amount)} of it lies past the ${hidden.side} edge of the page, where nothing scrolls.`
          : `${px(hidden.amount)} of it is hidden on the ${hidden.side} by ${describe(hidden.by)}, which does not scroll.`,
    })
  }

  const capped = (faults: LayoutFault[]): LayoutFault[] => {
    const [first] = faults
    if (first === undefined || faults.length <= PER_KIND) return faults
    const more = faults.length - PER_KIND
    return [
      ...faults.slice(0, PER_KIND),
      {
        kind: first.kind,
        element: `${more} more`,
        message: `${more} more elements have this fault.`,
      },
    ]
  }

  return {
    faults: [
      ...capped(sideways),
      ...capped(clipped),
      ...capped(smallTargets(describe)),
      ...capped(cutOff),
    ],
    truncated: [...truncated].slice(0, PER_KIND * 2),
    page: { width, height: doc.clientHeight, scrollHeight: scroller.scrollHeight },
  }
}
