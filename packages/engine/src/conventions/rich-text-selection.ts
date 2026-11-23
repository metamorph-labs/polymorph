import {
  RICH_TEXT_ATOM,
  RICH_TEXT_CODE,
  RICH_TEXT_END,
  RICH_TEXT_START,
} from '../rich-text/drawing'
import { richTextRangeText } from '../rich-text/ranges'
import { codePoints } from '../rich-text/text'
import type { RichTextRange } from '../rich-text/types'
import type { ViewportBox } from './selection-bar'

/**
 * A reader's selection in a RichTextContent, read from the document the member
 * drew (`design/components/rich-text-content.md`, The selection bar), and a
 * press on one of its highlights, for every framework's member.
 *
 * While the member maps selections, each drawn piece carries where it is in
 * the document's plain text (`richTextPositionAttrs`). A selection's ends are
 * read from the pieces they are in, in code points of that text, the units of
 * `annotateRichText`.
 */

type Side = 'start' | 'end'

/** A selection in the member's content. */
export interface RichTextSelectionFound {
  /** The selection in the document's plain text. */
  range: RichTextRange
  /** The selected text, an entity as its label (`richTextRangeText`). */
  text: string
  /** The range as a string, which tells one selection from another. */
  key: string
  /** The selection on the page, which places the bar while the selection is held. */
  dom: Range
}

const REGION = `[${RICH_TEXT_START}]`

const numberAt = (element: Element, name: string) => Number(element.getAttribute(name))

/** The text from the start of `element` to a point inside it. */
function textBefore(element: Element, node: Node, offset: number): string {
  const range = element.ownerDocument.createRange()
  range.setStart(element, 0)
  range.setEnd(node, offset)
  return range.toString()
}

/** The text from a point inside `element` to its end. */
function textAfter(element: Element, node: Node, offset: number): string {
  const range = element.ownerDocument.createRange()
  range.setStart(node, offset)
  range.setEnd(element, element.childNodes.length)
  return range.toString()
}

/** A collapsed range at a point, to compare other points with. */
function pointRange(node: Node, offset: number): Range {
  const range = (node.ownerDocument ?? (node as Document)).createRange()
  range.setStart(node, offset)
  return range
}

/**
 * A position for a point between the drawn pieces (in a list item, between
 * blocks, in a paragraph between its runs): the start of the next piece for a
 * selection's start, and the end of the one before for its end. The two are
 * the same position unless the point is beside text the member does not draw
 * (a heading of white space).
 */
function between(root: HTMLElement, node: Node, offset: number, side: Side): number {
  const point = pointRange(node, offset)
  const regions = Array.from(root.querySelectorAll(REGION))
  if (side === 'start') {
    const next = regions.find((element) => point.comparePoint(element, 0) >= 0)
    if (next !== undefined) return numberAt(next, RICH_TEXT_START)
    const last = regions.at(-1)
    return last === undefined ? 0 : numberAt(last, RICH_TEXT_END)
  }
  const previous = regions.findLast(
    (element) => point.comparePoint(element, element.childNodes.length) <= 0,
  )
  if (previous !== undefined) return numberAt(previous, RICH_TEXT_END)
  const first = regions[0]
  return first === undefined ? 0 : numberAt(first, RICH_TEXT_START)
}

/** The position of a point inside the member's content. */
function pointPosition(root: HTMLElement, node: Node, offset: number, side: Side): number {
  const from = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  const found = from?.closest(REGION)
  if (found === null || found === undefined || !root.contains(found)) {
    return between(root, node, offset, side)
  }
  const start = numberAt(found, RICH_TEXT_START)
  const end = numberAt(found, RICH_TEXT_END)
  const code = found.hasAttribute(RICH_TEXT_CODE) ? found.querySelector('pre code') : null
  if (code !== null && code.contains(node)) {
    return Math.min(end, start + codePoints(textBefore(code, node, offset)))
  }
  const before = textBefore(found, node, offset)
  if (found.hasAttribute(RICH_TEXT_ATOM)) {
    // A point at the very start or end of an atom is beside it; anywhere else covers it whole.
    if (before === '') return start
    if (textAfter(found, node, offset) === '') return end
    return side === 'start' ? start : end
  }
  return Math.min(end, start + codePoints(before))
}

/**
 * The position of a selection's end. A selection's end after the content (in
 * the selection bar, in the status region or after the member) counts as the
 * content's end when only white space lies between them, as a triple press on
 * the last paragraph selects up to the next block. Any other point outside the
 * content makes the selection not the member's. A start outside the member is
 * refused before anything is counted, so a member is not slowed by a
 * selection elsewhere on the page.
 */
function boundary(
  root: HTMLElement,
  outside: (node: Node) => Element | null,
  node: Node,
  offset: number,
  side: Side,
): number | null {
  if (root.contains(node)) {
    const part = outside(node)
    if (part === null) return pointPosition(root, node, offset, side)
    if (side === 'start' || textBefore(part, node, offset).trim() !== '') return null
    return between(root, part, 0, 'end')
  }
  if (side === 'start') return null
  const after = root.childNodes.length
  if (pointRange(root, after).comparePoint(node, offset) <= 0) return null
  const range = root.ownerDocument.createRange()
  range.setStart(root, after)
  range.setEnd(node, offset)
  return range.toString().trim() === '' ? between(root, root, after, 'end') : null
}

/**
 * The reader's selection in a RichTextContent's content, in the plain text of
 * `doc`, the document it drew, or null when there is none there. `outside`
 * names the part of the member a point is in that is not its content (the
 * selection bar, the status region), or null.
 */
export function mapRichTextSelection(
  root: HTMLElement,
  outside: (node: Node) => Element | null,
  doc: unknown,
): RichTextSelectionFound | null {
  const selection = root.ownerDocument.getSelection()
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  const start = boundary(root, outside, range.startContainer, range.startOffset, 'start')
  if (start === null) return null
  const end = boundary(root, outside, range.endContainer, range.endOffset, 'end')
  if (end === null || end <= start) return null
  const mapped = { start, end }
  return {
    range: mapped,
    text: richTextRangeText(doc, mapped),
    key: `${start}:${end}`,
    dom: range.cloneRange(),
  }
}

/** The box around a selection's text on screen, the union of its lines, as the editor measures its own. */
export function richTextSelectionBox(range: Range): ViewportBox | null {
  const owner = range.startContainer.ownerDocument
  if (owner === null) return null
  const box = { top: Infinity, bottom: -Infinity, left: Infinity, right: -Infinity }
  const common = range.commonAncestorContainer
  const texts: Text[] = []
  if (common.nodeType === Node.TEXT_NODE) {
    texts.push(common as Text)
  } else {
    const walker = owner.createTreeWalker(common, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (range.intersectsNode(node)) texts.push(node as Text)
    }
  }
  const part = owner.createRange()
  for (const text of texts) {
    part.setStart(text, text === range.startContainer ? range.startOffset : 0)
    part.setEnd(text, text === range.endContainer ? range.endOffset : text.length)
    for (const rect of Array.from(part.getClientRects())) {
      if (rect.width === 0) continue
      box.top = Math.min(box.top, rect.top)
      box.bottom = Math.max(box.bottom, rect.bottom)
      box.left = Math.min(box.left, rect.left)
      box.right = Math.max(box.right, rect.right)
    }
  }
  if (box.top === Infinity) {
    const rect = range.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
  }
  return box
}

/** What takes a press of its own inside a highlight: a Link, or a control the app's entity drew. */
const CONTROLS =
  'a[href], button, input, select, textarea, summary, [tabindex], [role="button"], [role="link"]'

/** A highlight's tab stop. */
export const RICH_TEXT_STOP = 'mark[data-annotation-id][tabindex]'

/**
 * The annotation a press in a RichTextContent selects, or null: the innermost
 * highlight under the press, unless the press is in the selection bar, on a
 * Link or a control the app's entity drew inside the highlight, or ends a
 * selection drag (`detail` above 0 with words selected).
 */
export function richTextPressedAnnotation(
  root: Element,
  target: EventTarget | null,
  detail: number,
  bar: Element | null | undefined,
): string | null {
  const element = target instanceof Element ? target : null
  const mark = element?.closest('[data-annotation-id]')
  if (mark === null || mark === undefined || !root.contains(mark)) return null
  if (bar?.contains(mark) === true) return null
  // A Link, or a control the app's entity drew, takes its own press.
  const control = element?.closest(CONTROLS)
  if (control !== null && control !== undefined && control !== mark && mark.contains(control)) {
    return null
  }
  // A press that ends a selection drag selects text, and opens nothing.
  if (detail > 0 && root.ownerDocument.getSelection()?.isCollapsed === false) return null
  return mark.getAttribute('data-annotation-id')
}

/**
 * The annotation a key on a highlight's tab stop selects, or null: Enter as it
 * is pressed, and Space as it is released, as a button's do. A key the stop
 * takes has its default prevented.
 */
export function richTextKeyedAnnotation(event: KeyboardEvent, phase: 'down' | 'up'): string | null {
  if (event.isComposing) return null
  const target = event.target
  if (!(target instanceof Element) || !target.matches(RICH_TEXT_STOP)) return null
  const id = target.getAttribute('data-annotation-id')
  if (id === null) return null
  if (event.key === 'Enter' && phase === 'down') {
    event.preventDefault()
    return event.repeat ? null : id
  }
  if (event.key === ' ') {
    event.preventDefault()
    return phase === 'up' ? id : null
  }
  return null
}
