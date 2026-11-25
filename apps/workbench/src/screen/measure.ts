/**
 * The layout faults of the page, measured in the page.
 *
 * A screenshot shows a fault to a reader who looks for it. A measurement names it. This module
 * measures six things the layout rules (`docs/layout.md`) and the focus convention
 * (`packages/recipes/src/conventions/focus.module.css`) say a screen never does:
 *
 *  - `sideways-scroll`: the page scrolls sideways, or a layout region pans.
 *  - `clipped-text`: text that does not fit the box that holds it. The box cuts it with no
 *    ellipsis, or the text is drawn outside the box.
 *  - `small-target`: a control whose hit area is under the touch-target floor, with another
 *    control inside the floor's reach.
 *  - `cut-off`: text or a control that a box hides, where nothing scrolls to it.
 *  - `no-gap`: a member that touches another member where nothing decided that it should, or
 *    whose border lies against the inside of a border around it.
 *  - `unseen-focus`: a control that shows no mark when it has keyboard focus, or a mark that is
 *    faint or cut.
 *
 * Text a member shortens with an ellipsis is not a fault. The member does it by design, so it is
 * listed apart, as `truncated`.
 *
 * `sideways-scroll` and the page edges of `cut-off` are the phone lane's measurements
 * (`proof/run.mjs`, `fitsThePhone`), at any width. Only visible elements are measured. A closed
 * drawer is off the edge on purpose and hidden, and measuring it would report the intended
 * layout.
 *
 * `unseen-focus` moves keyboard focus through every control, so it is measured last, and the
 * measure is asynchronous: a framework commits the state a focus causes, such as a menu row's
 * highlight, in a task after the focus. Focus, the scroll positions and the page's transitions are
 * put back afterwards. State a member keeps from a focus is not: a tab list that selects the tab
 * it focuses has selected it.
 *
 * The module imports nothing, so its test can load it into any page as one script
 * (`packages/mcp/src/measure.test.ts`).
 */

export type LayoutFaultKind =
  'sideways-scroll' | 'clipped-text' | 'small-target' | 'cut-off' | 'no-gap' | 'unseen-focus'

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

/**
 * The focus mark's floors: an outline at least 2px thick (WCAG 2.2's focus appearance, 2.4.13),
 * in a colour at least 3:1 against what it is drawn on (non-text contrast, 1.4.11). The contrast
 * law holds the focus colour to the same 3:1 on every background and wash (`FOCUS_MIN_RATIO`,
 * `packages/theme/src/pairings.ts`), so a fault here is a part drawn on a fill the law does not
 * cover, or a colour a part chose for itself.
 */
const FOCUS_WIDTH = 2
const FOCUS_CONTRAST = 3

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

/* -------------------------------------------------------------------------- */
/* Members that touch                                                         */
/* -------------------------------------------------------------------------- */

const SIDES = ['top', 'right', 'bottom', 'left'] as const
type Side = (typeof SIDES)[number]

/** Whether a box's border on one side is drawn: it has a width, a style and a colour. */
function bordered(style: CSSStyleDeclaration, side: Side): boolean {
  const kind = style.getPropertyValue(`border-${side}-style`)
  return (
    parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0 &&
    kind !== 'none' &&
    kind !== 'hidden' &&
    colour(style.getPropertyValue(`border-${side}-color`))[3] > 0
  )
}

/** Whether a box draws anything of its own: a border, a fill or a shadow. */
function paints(style: CSSStyleDeclaration): boolean {
  return (
    SIDES.some((side) => bordered(style, side)) ||
    colour(style.backgroundColor)[3] > 0 ||
    style.backgroundImage !== 'none' ||
    style.boxShadow !== 'none'
  )
}

const CORNERS = [
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
]

/**
 * Whether a member is a bar: square at every corner, and as long as the box it is in along one
 * axis. A bar runs edge to edge by design, and its own rule, where it has one, is what separates
 * it (`design/components/banner.md`: "no radius, because it runs edge to edge").
 */
function isBar(style: CSSStyleDeclaration, box: DOMRect, room: Box): boolean {
  return (
    CORNERS.every((corner) => parseFloat(style.getPropertyValue(corner)) === 0) &&
    (box.width >= room.right - room.left - TOLERANCE ||
      box.height >= room.bottom - room.top - TOLERANCE)
  )
}

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

/** A box's border box less its borders and, when asked, its padding. */
function innerBox(node: Element, style: CSSStyleDeclaration, padding: boolean): Box {
  const box = node.getBoundingClientRect()
  const inset = (side: Side) =>
    parseFloat(style.getPropertyValue(`border-${side}-width`)) +
    (padding ? parseFloat(style.getPropertyValue(`padding-${side}`)) : 0)
  return {
    left: box.left + inset('left'),
    right: box.right - inset('right'),
    top: box.top + inset('top'),
    bottom: box.bottom - inset('bottom'),
  }
}

/** Whether a box is laid out with the others: shown, a block or an inline block, not positioned. */
function inFlow(node: Element, style: CSSStyleDeclaration): boolean {
  if (style.position === 'absolute' || style.position === 'fixed') return false
  if (style.display === 'inline' || style.display === 'contents' || style.display === 'none') {
    return false
  }
  const box = node.getBoundingClientRect()
  return box.width > TOLERANCE && box.height > TOLERANCE && isVisible(node)
}

/** Whether `other` lies against one side of `box` with no gap, facing it along that side. */
function abuts(box: DOMRect, other: DOMRect, side: Side): boolean {
  const across =
    side === 'top' || side === 'bottom'
      ? Math.min(box.right, other.right) - Math.max(box.left, other.left)
      : Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top)
  if (across <= TOLERANCE) return false
  const gap = {
    top: box.top - other.bottom,
    bottom: other.top - box.bottom,
    left: box.left - other.right,
    right: other.left - box.right,
  }[side]
  return Math.abs(gap) <= TOLERANCE
}

interface Touch {
  side: Side
  /** The box whose edge touches: the member, or a box around it that ends where it ends. */
  from: Element
  /** The member it touches, or the box whose border it touches from inside. */
  other: Element
  /** The box both members are in, when it touches a member. */
  container: Element | null
}

/**
 * What a member touches on one side, where nothing decided that it should.
 *
 * Space between members is a layout's decision: the gap of a Stack, an Inline or a Grid, or the
 * gap a member's or an archetype's own recipe gives its flex or grid container. A box that lays
 * its children out in flow, as Card does, has no gap, and members keep no outer margin, so two
 * members that meet in flow meet because nothing put space between them.
 *
 * The edge is followed outwards through the boxes it is also the edge of, which paint nothing on
 * that side: a field inside a FormField that ends where the field ends touches what follows the
 * FormField. The walk stops at a box that is positioned, because its member placed it, and at a
 * member that is measured itself. It ends at the first box whose edge is elsewhere. When that box
 * draws a border on this side, and the member draws its own border there and lies against the
 * inside of the box's, with no inset, that is the touch: two borders run together. A member with
 * no border on that side is not measured against the box's border, because members place their
 * own borderless buttons flush inside their frames (DatePicker's calendar button, the Search
 * button in SearchPage's field).
 *
 * A bar is never a touch: it runs edge to edge by design, as a Banner does.
 */
function touchOn(node: Element, side: Side, measured: ReadonlySet<Element>): Touch | null {
  const box = node.getBoundingClientRect()
  const own = getComputedStyle(node)
  // While a member has keyboard focus, the focus convention recolours its border, which is
  // transparent at rest on a ghost Button. That border is the mark's and not the member's edge.
  const edged = bordered(own, side) && !node.matches(':focus-visible, :has(:focus-visible)')
  let level = node
  for (;;) {
    const parent = level.parentElement
    if (parent === null || parent === document.body || parent === document.documentElement) {
      return null
    }
    const style = getComputedStyle(parent)
    if (style.display === 'contents') return null

    if (!/flex|grid/.test(style.display) && !isBar(own, box, innerBox(parent, style, true))) {
      for (const sibling of parent.children) {
        if (sibling === level || !sibling.hasAttribute('data-member')) continue
        if (!inFlow(sibling, getComputedStyle(sibling))) continue
        if (abuts(box, sibling.getBoundingClientRect(), side)) {
          return { side, from: level, other: sibling, container: parent }
        }
      }
    }

    const outer = parent.getBoundingClientRect()[side]
    if (!bordered(style, side) && Math.abs(outer - box[side]) <= TOLERANCE) {
      if (measured.has(parent)) return null
      if (style.position === 'absolute' || style.position === 'fixed') return null
      level = parent
      continue
    }

    const inside = innerBox(parent, style, false)
    if (
      bordered(style, side) &&
      edged &&
      Math.abs(inside[side] - box[side]) <= TOLERANCE &&
      !isBar(own, box, inside)
    ) {
      return { side, from: level, other: parent, container: null }
    }
    return null
  }
}

/**
 * The members that touch another member, or the inside of a border around them, with no gap.
 *
 * A member is measured when its root (`data-member`) is a control or paints a border, a fill or a
 * shadow. A member that paints nothing, such as a Table, a Stack or an Image's frame, has no edge
 * of its own to keep apart. A member's parts carry no `data-member`, so a field and its clear
 * button, the two halves of a SplitButton and the rows of a List, Menu, Tree or Table are one
 * member and never measured against each other.
 */
function touchingMembers(describe: (node: Element) => string): LayoutFault[] {
  const measured = new Set<Element>()
  for (const node of document.querySelectorAll('[data-member]')) {
    const style = getComputedStyle(node)
    if (!inFlow(node, style) || hidesOnPurpose(node)) continue
    if (node.matches(CONTROLS) || paints(style)) measured.add(node)
  }

  const faults: LayoutFault[] = []
  const pairs: [Element, Element][] = []
  for (const node of measured) {
    for (const side of SIDES) {
      const touch = touchOn(node, side, measured)
      if (touch === null) continue
      // Two measured members that touch are one fault, named from the first.
      if (pairs.some(([a, b]) => a === touch.other && b === touch.from)) break
      pairs.push([touch.from, touch.other])
      faults.push({
        kind: 'no-gap',
        element: describe(node),
        message:
          touch.container === null
            ? `Its ${side} border lies against the inside of the border of ` +
              `${describe(touch.other)}, with no inset.`
            : `Its ${side} edge touches ${describe(touch.other)}, with no gap. Both are in ` +
              `${describe(touch.container)}, which lays them out in flow and puts no space ` +
              'between them.',
      })
      break
    }
  }
  return faults
}

/* -------------------------------------------------------------------------- */
/* The focus mark                                                             */
/* -------------------------------------------------------------------------- */

/** A colour in sRGB: three channels from 0 to 255, and alpha from 0 to 1. */
type Rgba = [number, number, number, number]

const colours = new Map<string, Rgba>()
let pixel: CanvasRenderingContext2D | null = null

/**
 * A computed colour in sRGB. `rgb()` is read as written. Any other syntax the page computes
 * (`oklch()`, `color()`) is drawn into one pixel of a canvas and read back, which maps it into
 * sRGB as the screen does.
 */
function colour(value: string): Rgba {
  const known = colours.get(value)
  if (known !== undefined) return known
  let found: Rgba = [0, 0, 0, 0]
  const rgb = /^rgba?\(([\d.]+),? ([\d.]+),? ([\d.]+)(?:,? \/? ?([\d.]+))?\)$/.exec(value)
  if (rgb !== null) {
    found = [
      Number(rgb[1]),
      Number(rgb[2]),
      Number(rgb[3]),
      rgb[4] === undefined ? 1 : Number(rgb[4]),
    ]
  } else if (value !== 'transparent') {
    if (pixel === null) {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      pixel = canvas.getContext('2d', { willReadFrequently: true })
    }
    if (pixel !== null) {
      pixel.clearRect(0, 0, 1, 1)
      // A value the canvas cannot read leaves the transparent fill in place.
      pixel.fillStyle = 'transparent'
      pixel.fillStyle = value
      pixel.fillRect(0, 0, 1, 1)
      const [r = 0, g = 0, b = 0, a = 0] = pixel.getImageData(0, 0, 1, 1).data
      found = [r, g, b, a / 255]
    }
  }
  colours.set(value, found)
  return found
}

/** `top` drawn over `under`, as the page composites it. */
function over(top: Rgba, under: Rgba): Rgba {
  const alpha = top[3] + under[3] * (1 - top[3])
  if (alpha === 0) return [0, 0, 0, 0]
  const mix = (index: 0 | 1 | 2) =>
    (top[index] * top[3] + under[index] * under[3] * (1 - top[3])) / alpha
  return [mix(0), mix(1), mix(2), alpha]
}

/** WCAG's contrast ratio between two opaque colours. */
function contrast(a: Rgba, b: Rgba): number {
  const luminance = ([r, g, b]: Rgba) => {
    const linear = (channel: number) => {
      const c = channel / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
  }
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

/** What the page is drawn on where no element paints: the browser's canvas, light or dark. */
function canvasColour(): Rgba {
  const scheme = getComputedStyle(document.documentElement).colorScheme
  const dark =
    scheme.includes('dark') &&
    (!scheme.includes('light') || matchMedia('(prefers-color-scheme: dark)').matches)
  return dark ? [18, 18, 18, 1] : [255, 255, 255, 1]
}

/**
 * The colour a box shows: its own fill over its ancestors', down to the first that is opaque. A
 * pseudo-element's fill is drawn over its element's. `null` when an image is painted on the way,
 * because the colour under the mark is then unknown.
 */
function backdrop(node: Element | null, pseudo: Carrier['pseudo'] = null): Rgba | null {
  const layers: Rgba[] = []
  /** Adds a box's fill, and says whether to go on: `false` after an opaque fill, `null` at an image. */
  const add = (style: CSSStyleDeclaration): boolean | null => {
    if (style.backgroundImage !== 'none') return null
    const fill = colour(style.backgroundColor)
    if (fill[3] > 0) layers.push(fill)
    return fill[3] < 1
  }
  let going: boolean | null =
    node !== null && pseudo !== null ? add(getComputedStyle(node, pseudo)) : true
  for (let element = node; going === true && element !== null; element = element.parentElement) {
    going = add(getComputedStyle(element))
  }
  if (going === null) return null
  return layers.reduceRight((under, layer) => over(layer, under), canvasColour())
}

/** Where a focus mark can be drawn: an element, or a pseudo-element of the control. */
interface Carrier {
  element: Element
  pseudo: '::before' | '::after' | null
}

/** The properties a focus mark changes at an element's edge. The outline's come first. */
const OUTLINE = ['outline-style', 'outline-width', 'outline-color', 'outline-offset']
const MARK = [
  ...OUTLINE,
  'box-shadow',
  'background-color',
  'background-image',
  ...SIDES.flatMap((side) => [
    `border-${side}-style`,
    `border-${side}-width`,
    `border-${side}-color`,
  ]),
]

const read = ({ element, pseudo }: Carrier): string[] => {
  const style = getComputedStyle(element, pseudo)
  return MARK.map((property) => style.getPropertyValue(property))
}

/** Whether a style draws an outline a person can see. */
function outlines(style: CSSStyleDeclaration): boolean {
  return (
    style.outlineStyle !== 'none' &&
    style.outlineStyle !== 'hidden' &&
    parseFloat(style.outlineWidth) > 0 &&
    colour(style.outlineColor)[3] > 0
  )
}

/** The controls a list moves focus between with the arrow keys, which leave the tab order. */
const ROVING = '[role="tab"], [role="radio"], [role="menuitem"], [role="option"]'

/** How many of a control's descendants and siblings are asked whether they carry its mark. */
const NEAR = 64

/**
 * Where a control's focus mark can be drawn: the control and its pseudo-elements, what it holds,
 * its siblings, and the boxes around it, nearest first. A field draws its mark on the frame
 * around its native input (`:has(> input:focus-visible)`), an interactive Card on itself
 * (`:has(:focus-visible)`), a tree item on its row, and OTPInput on the cell beside its invisible
 * input.
 */
function carriersOf(control: Element): Carrier[] {
  const carriers: Carrier[] = [
    { element: control, pseudo: null },
    { element: control, pseudo: '::before' },
    { element: control, pseudo: '::after' },
  ]
  const near = [
    ...[...control.querySelectorAll('*')].slice(0, NEAR),
    ...[...(control.parentElement?.children ?? [])]
      .filter((sibling) => sibling !== control)
      .slice(0, NEAR),
  ]
  for (const element of near) carriers.push({ element, pseudo: null })
  for (
    let parent = control.parentElement;
    parent !== null && parent !== document.body && parent !== document.documentElement;
    parent = parent.parentElement
  ) {
    carriers.push({ element: parent, pseudo: null })
  }
  return carriers
}

/** The region of a box that a person can bring into view on one axis, or `null` if it shows all. */
function shownRange(
  node: Element,
  style: CSSStyleDeclaration,
  axis: 'x' | 'y',
): [number, number] | null {
  const overflow = axis === 'x' ? style.overflowX : style.overflowY
  if (overflow === 'visible') return null
  const box = clipBox(node)
  const [start, end] = axis === 'x' ? [box.left, box.right] : [box.top, box.bottom]
  if (PANS.has(overflow)) {
    // A region that scrolls shows everything from its scroll origin to the end of its content.
    const offset = axis === 'x' ? node.scrollLeft : node.scrollTop
    const length = axis === 'x' ? node.scrollWidth : node.scrollHeight
    if (axis === 'x' && style.direction === 'rtl') return [end - offset - length, end - offset]
    return [start - offset, start - offset + length]
  }
  if (overflow === 'clip') {
    const margin = parseFloat(
      /(-?[\d.]+)px/.exec(style.getPropertyValue('overflow-clip-margin'))?.[1] ?? '0',
    )
    return [start - margin, end + margin]
  }
  return [start, end]
}

/**
 * How much of an outline a box cuts, and where. The outline is the carrier's border box grown by
 * its offset and width. Only the part outside the carrier's own box is asked about: a box that
 * hides the control itself is `cut-off`'s fault, not this one.
 */
function cutOutline(
  carrier: Element,
  grow: number,
): { by: Element | null; amount: number; side: Side } | null {
  if (grow <= TOLERANCE) return null
  const own = carrier.getBoundingClientRect()
  const outline = {
    left: own.left - grow,
    right: own.right + grow,
    top: own.top - grow,
    bottom: own.bottom + grow,
  }

  const cut = (range: [number, number], axis: 'x' | 'y') => {
    const [start, end] = range
    const [low, high]: [Side, Side] = axis === 'x' ? ['left', 'right'] : ['top', 'bottom']
    if (own[low] < start - TOLERANCE || own[high] > end + TOLERANCE) return null
    const before = start - outline[low]
    const after = outline[high] - end
    if (Math.max(before, after) <= TOLERANCE) return null
    return before > after ? { amount: before, side: low } : { amount: after, side: high }
  }

  for (
    let parent = carrier.parentElement;
    parent !== null && parent !== document.body && parent !== document.documentElement;
    parent = parent.parentElement
  ) {
    const style = getComputedStyle(parent)
    if (style.display === 'contents') continue
    for (const axis of ['x', 'y'] as const) {
      const range = shownRange(parent, style, axis)
      const found = range === null ? null : cut(range, axis)
      if (found !== null) return { by: parent, ...found }
    }
  }

  const scroller = document.scrollingElement ?? document.documentElement
  const page = {
    x: [-scroller.scrollLeft, scroller.scrollWidth - scroller.scrollLeft] as [number, number],
    y: [-scroller.scrollTop, scroller.scrollHeight - scroller.scrollTop] as [number, number],
  }
  for (const axis of ['x', 'y'] as const) {
    const found = cut(page[axis], axis)
    if (found !== null) return { by: null, ...found }
  }
  return null
}

/** Waits one task, so the page commits what a focus change queued: a framework's state update. */
function settle(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      resolve()
    }
    channel.port2.postMessage(null)
  })
}

/** `focusVisible` is in the HTML standard's `FocusOptions` and not yet in TypeScript's. */
type KeyboardFocus = FocusOptions & { focusVisible: boolean }

/** Moves focus as the keyboard does: `:focus-visible` matches whatever the last input was. */
function focusByKeyboard(node: Element): void {
  ;(node as HTMLElement).focus({ preventScroll: true, focusVisible: true } as KeyboardFocus)
}

/**
 * What is wrong with a control's focus mark, as the end of a sentence, or `null` when a person
 * can see it. `before` is each carrier as it was drawn without focus. It is `null` where a focus
 * trap gave focus back to the control as soon as it left, so the control was never drawn without
 * focus. Then nothing can be compared: an outline that is drawn is taken as the mark and
 * measured, and a control with none is not reported, because its mark may be a fill.
 */
function judgeMark(
  control: Element,
  carriers: Carrier[],
  before: string[][] | null,
  describe: (node: Element) => string,
): string | null {
  // For each carrier, the properties focus changed on it that a person sees. Whether a box is
  // seen is asked with focus in place, because focus can reveal one: ChatMessage shows its
  // actions while focus is inside the message. A box the person cannot see (an input at no
  // opacity under the cells it fills, a pseudo-element with no content) carries no mark, and a
  // change to an outline that is not drawn is not seen.
  const changes = carriers.map((carrier, at) => {
    const style = getComputedStyle(carrier.element, carrier.pseudo)
    const content = carrier.pseudo === null ? '' : style.content
    if (!isVisible(carrier.element) || content === 'none' || content === 'normal') return []
    const drawn = outlines(style)
    if (before === null) return drawn ? [...OUTLINE] : []
    const now = read(carrier)
    return MARK.filter(
      (property, position) =>
        now[position] !== before[at]?.[position] && (drawn || !OUTLINE.includes(property)),
    )
  })
  const index = changes.findIndex((changed) =>
    changed.some((property) => OUTLINE.includes(property)),
  )
  // A change that is not the outline found: a fill, a border, a shadow, another box's outline.
  const elsewhere = changes.some((changed, at) =>
    at === index ? changed.some((property) => !OUTLINE.includes(property)) : changed.length > 0,
  )

  const outlined = carriers[index]
  if (outlined === undefined) {
    return elsewhere || before === null
      ? null
      : 'it shows no mark: nothing on it or around it draws an outline or changes at its edge.'
  }

  const style = getComputedStyle(outlined.element, outlined.pseudo)
  // The browser's own ring is drawn in two colours, so it shows on any background.
  if (style.outlineStyle === 'auto') return null
  const width = parseFloat(style.outlineWidth)
  const offset = parseFloat(style.outlineOffset)
  const carrier = outlined.pseudo === null ? describe(outlined.element) : `its ${outlined.pseudo}`
  const on =
    outlined.element === control && outlined.pseudo === null
      ? 'its outline'
      : `the outline on ${carrier}`

  if (width < FOCUS_WIDTH - 0.01) {
    // Something else that changes at the edge, such as a fill, is the mark then.
    if (elsewhere) return null
    return `its only mark is ${on}, ${px(width)} wide, under the ${FOCUS_WIDTH}px floor.`
  }

  const wrong: string[] = []
  const line = colour(style.outlineColor)
  const grounds: [string, Rgba | null][] = []
  if (offset < 0) {
    grounds.push(['the fill inside its edge', backdrop(outlined.element, outlined.pseudo)])
  }
  if (offset + width > 0) {
    const behind = outlined.pseudo === null ? outlined.element.parentElement : outlined.element
    grounds.push(['the background around it', backdrop(behind)])
  }
  for (const [where, ground] of grounds) {
    if (ground === null) continue
    const ratio = contrast(over(line, ground), ground)
    if (ratio < FOCUS_CONTRAST) {
      // Rounded down, so a ratio just under the floor never reads as the floor.
      const shown = Math.floor(ratio * 10) / 10
      wrong.push(`faint: ${on} is ${shown}:1 against ${where}, under ${FOCUS_CONTRAST}:1`)
      break
    }
  }

  if (outlined.pseudo === null) {
    const cut = cutOutline(outlined.element, offset + width)
    if (cut !== null) {
      wrong.push(
        cut.by === null
          ? `cut: ${px(cut.amount)} of ${on} lies past the ${cut.side} edge of the page`
          : `cut: ${px(cut.amount)} of ${on} is hidden on the ${cut.side} by ${describe(cut.by)}, ` +
              'which cannot scroll to it',
      )
    }
  }

  return wrong.length === 0 ? null : `its mark is ${wrong.join(', and ')}.`
}

/**
 * Whether keyboard focus can reach a control: it is shown, enabled, not inert, and in the tab
 * order or in a list the arrow keys move through. A control a member takes out of the tab order
 * (MultiSelect's chevron, a file input behind its drop zone) is not reached.
 */
function reachable(node: Element): boolean {
  if (!(node instanceof HTMLElement || node instanceof SVGElement)) return false
  if (node.matches(':disabled') || node.closest('[inert]') !== null) return false
  if (node.hasAttribute('tabindex') && node.tabIndex < 0 && !node.matches(ROVING)) return false
  return node.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })
}

/** The fields a caret is drawn in while they have focus. */
const CARET = 'textarea, input:not([type]), input[type="text"], input[type="search"]'

/**
 * Whether a control is the only place focus can be: a text field that is the one control taking
 * focus inside a modal dialog. While the dialog is open focus is nowhere else, and the field's
 * caret shows it, so a mark tells a person nothing. Command's search field is one: its panel acts
 * as the field (`design/components/command.md`).
 */
function onlyFieldOfModal(control: Element): boolean {
  if (!control.matches(CARET)) return false
  const modal = control.closest('[role="dialog"][aria-modal="true"]')
  if (modal === null) return false
  return ![...modal.querySelectorAll(CONTROLS)].some(
    (other) =>
      other !== control &&
      reachable(other) &&
      ((other as HTMLElement).tabIndex >= 0 || other.hasAttribute('tabindex')),
  )
}

/**
 * The controls whose focus mark a keyboard user cannot see.
 *
 * Each control is given keyboard focus, and what it and the boxes around it draw is compared with
 * what they drew without it. The control is reported when nothing changes, when the only change is
 * an outline under 2px, when the outline is under 3:1 against what it is drawn on, or when a box
 * that cannot scroll to it cuts the part of the outline outside the control. A mark that is not an
 * outline, such as a menu row's fill, is a mark, and its colour is not measured.
 *
 * Inside the control's edge the outline is drawn on the fill of the box that carries it, or of the
 * nearest box around it that has a fill. Outside the edge it is drawn on what is around that box.
 * A translucent outline is composited over that before it is measured. Where an image is painted
 * on the way, the colour under the outline is unknown and it is not measured.
 *
 * The controls are visited from the end of the document, so the content of a popover, which is
 * portalled to the end, is measured before focus on the page behind it closes the popover. A
 * control that focus cannot reach, because a modal dialog keeps focus inside itself, is skipped,
 * and so is a text field that is the only control in a modal dialog (`onlyFieldOfModal`).
 * Transitions are switched off while the walk runs, so every value read is the one it ends at.
 */
async function unseenFocus(describe: (node: Element) => string): Promise<LayoutFault[]> {
  const controls = [...document.querySelectorAll(CONTROLS)].filter(reachable).reverse()
  if (controls.length === 0) return []

  const first = document.activeElement
  const firstVisible = first !== null && first.matches(':focus-visible')
  const scrolled: [Element, number, number][] = []
  for (const node of document.querySelectorAll('*')) {
    if (node.scrollLeft !== 0 || node.scrollTop !== 0)
      scrolled.push([node, node.scrollLeft, node.scrollTop])
  }
  const still = document.createElement('style')
  still.textContent = '*, *::before, *::after { transition: none !important; }'
  ;(document.head ?? document.documentElement).append(still)

  const blur = () => {
    const active = document.activeElement
    if (active instanceof HTMLElement || active instanceof SVGElement) active.blur()
  }

  const faults: LayoutFault[] = []
  try {
    for (const control of controls) {
      if (!control.isConnected) continue
      blur()
      await settle()
      if (!control.isConnected || !reachable(control)) continue
      if (onlyFieldOfModal(control)) continue
      const carriers = carriersOf(control)
      // A focus trap gives focus back to the control it left, so the control is not at rest.
      const held = document.activeElement === control && control.matches(':focus-visible')
      const before = held ? null : carriers.map(read)

      focusByKeyboard(control)
      if (document.activeElement !== control) continue
      await settle()
      if (document.activeElement !== control || !control.matches(':focus-visible')) continue

      const wrong = judgeMark(control, carriers, before, describe)
      if (wrong !== null) {
        faults.push({
          kind: 'unseen-focus',
          element: describe(control),
          message: `With keyboard focus, ${wrong}`,
        })
      }
    }
  } finally {
    blur()
    if (first instanceof HTMLElement && first !== document.body && first.isConnected) {
      first.focus({ preventScroll: true, focusVisible: firstVisible } as KeyboardFocus)
    }
    await settle()
    still.remove()
    for (const [node, left, top] of scrolled) {
      node.scrollLeft = left
      node.scrollTop = top
    }
    // Every other element was at its origin, and a member that scrolled on focus is put back.
    for (const node of document.querySelectorAll('*')) {
      if (scrolled.some(([kept]) => kept === node)) continue
      if (node.scrollLeft !== 0) node.scrollLeft = 0
      if (node.scrollTop !== 0) node.scrollTop = 0
    }
  }
  return faults
}

/**
 * The page's layout faults and truncated text, at the window's current size.
 *
 * `memberNames` maps the slug a member writes into `data-member` to the member's name, so a
 * fault names the member a screen's author wrote.
 *
 * Every fault but `unseen-focus` is read from the page as it is drawn. Then focus is moved
 * through the controls, which is why the measure resolves later.
 */
export async function measureLayout(
  memberNames: Readonly<Record<string, string>> = {},
): Promise<Measurement> {
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

  const targets = smallTargets(describe)
  const touching = touchingMembers(describe)
  const page = { width, height: doc.clientHeight, scrollHeight: scroller.scrollHeight }
  const focus = await unseenFocus(describe)

  return {
    faults: [
      ...capped(sideways),
      ...capped(clipped),
      ...capped(targets),
      ...capped(cutOff),
      ...capped(touching),
      ...capped(focus),
    ],
    truncated: [...truncated].slice(0, PER_KIND * 2),
    page,
  }
}
