import { closeHistory } from 'prosemirror-history'
import {
  Fragment,
  Mark,
  type MarkType,
  type Node as PMNode,
  type Schema,
  Slice,
} from 'prosemirror-model'
import { type Command, type EditorState, Plugin, type Transaction } from 'prosemirror-state'
import { Decoration, type DecorationAttrs, DecorationSet, type EditorView } from 'prosemirror-view'

import { unitText } from '../rich-text/ranges'
import { codePoints } from '../rich-text/text'
import type { RichTextRange } from '../rich-text/types'
import { MARK, NODE } from './schema'
import type { RichTextRect } from './types'

/**
 * Annotations in the editor: the anchors an application keeps for stretches
 * of the document, as `annotation` marks (`RichTextAnnotationMark`).
 *
 * The mark is in every schema, whatever the field allows: it is not a format.
 * It moves with its text through every edit, is not inclusive (text typed at
 * either edge is outside it), and excludes no mark, so annotations overlap
 * each other and every format. A text and an entity carry it; a code block's
 * text cannot.
 *
 * The mark's own element is a bare `span` that a stylesheet cannot tell from
 * any other: the editor draws annotations with decorations, so the member can
 * change which are drawn and which is active without an edit. Each drawn
 * annotation of a text or an entity is its own `mark` element around it,
 * carrying the recipe's class and `data-annotation-id`, and `data-active` for
 * the active annotation. Where annotations overlap, the elements nest, the
 * innermost first in the same order `state.annotations` lists them, so
 * `closest('[data-annotation-id]')` from a pressed node finds the same id the
 * state lists first.
 *
 * Positions (`RichTextRange`) are counted as the model counts them
 * (`rich-text/ranges.ts`): each leaf counts the code points of `unitText` of
 * the node it stands for, and the code points are counted on the joined text.
 */

export const annotationType = (schema: Schema): MarkType => schema.marks[MARK.annotation]!

/** Whether a node can carry an annotation: a text or an entity. */
const carries = (node: PMNode): boolean => node.isText || node.type.name === NODE.entity

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

const BREAK = { type: 'break' }

/** The text a leaf of the editor's document counts in a range: `unitText` of the node it is written as. */
function leafUnits(node: PMNode): string {
  switch (node.type.name) {
    case NODE.hardBreak:
      return unitText(BREAK)
    case NODE.entity:
      return unitText({ type: 'entity', label: node.attrs.label as string })
    case NODE.unknownInline:
    case NODE.unknownBlock:
      return unitText(node.attrs.json)
    default:
      return ''
  }
}

/** The selection as a range of the document's plain text. */
export function selectionRange(state: EditorState): RichTextRange {
  const { doc, selection } = state
  const before = doc.textBetween(0, selection.from, '', leafUnits)
  const start = codePoints(before)
  if (selection.empty) return { start, end: start }
  return {
    start,
    end: codePoints(before + doc.textBetween(selection.from, selection.to, '', leafUnits)),
  }
}

interface Extent {
  from: number
  to: number
}

/** Where each annotation starts and ends: its first and last text or entity. */
function extentsOf(doc: PMNode, type: MarkType): Map<string, Extent> {
  const extents = new Map<string, Extent>()
  doc.descendants((node, pos) => {
    if (!carries(node)) return true
    for (const mark of node.marks) {
      if (mark.type !== type) continue
      const id = mark.attrs.id as string
      const extent = extents.get(id)
      if (extent) extent.to = pos + node.nodeSize
      else extents.set(id, { from: pos, to: pos + node.nodeSize })
    }
    return false
  })
  return extents
}

/** The ids in nesting order: the one that starts last first, then the one that ends first, then by id. */
function nested(ids: Iterable<string>, extents: Map<string, Extent>): string[] {
  const none = { from: 0, to: 0 }
  return [...ids].sort((a, b) => {
    const x = extents.get(a) ?? none
    const y = extents.get(b) ?? none
    return y.from - x.from || x.to - y.to || byKey(a, b)
  })
}

/**
 * The annotations at the selection, drawn or not. At a caret, those the caret
 * is inside: on the text both before and after it, because an annotation is
 * not inclusive and text typed at its edge is outside it. For a range, every
 * annotation that covers any part of it.
 */
export function annotationsAt(state: EditorState): string[] {
  const type = annotationType(state.schema)
  const { selection, doc } = state
  const ids = new Set<string>()
  const take = (marks: readonly Mark[]) => {
    for (const mark of marks) if (mark.type === type) ids.add(mark.attrs.id as string)
  }
  if (selection.empty) {
    take(selection.$from.marks())
  } else {
    doc.nodesBetween(selection.from, selection.to, (node) => {
      if (!carries(node)) return true
      take(node.marks)
      return false
    })
  }
  return ids.size < 2 ? [...ids] : nested(ids, extentsOf(doc, type))
}

/** What the member asks to be drawn. A new object for each change, so the drawing is recomputed only then. */
export interface AnnotationDrawing {
  /** The ids drawn. `undefined` draws every one. */
  drawn: readonly string[] | undefined
  active: string | undefined
  /** The recipe's class for a drawn fragment. */
  className: string
}

function decorationsOf(doc: PMNode, drawing: AnnotationDrawing): DecorationSet {
  const type = annotationType(doc.type.schema)
  const drawn = drawing.drawn === undefined ? null : new Set(drawing.drawn)
  if (drawn !== null && drawn.size === 0) return DecorationSet.empty
  const extents = extentsOf(doc, type)
  if (extents.size === 0) return DecorationSet.empty
  const found: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!carries(node)) return true
    const ids = new Set<string>()
    for (const mark of node.marks) {
      const id = mark.attrs.id as string
      if (mark.type === type && (drawn === null || drawn.has(id))) ids.add(id)
    }
    // PM wraps the first decoration of a node innermost.
    for (const id of nested(ids, extents)) {
      const attrs: DecorationAttrs = { nodeName: 'mark', 'data-annotation-id': id }
      if (drawing.className) attrs.class = drawing.className
      if (id === drawing.active) attrs['data-active'] = ''
      found.push(Decoration.inline(pos, pos + node.nodeSize, attrs))
    }
    return false
  })
  return found.length > 0 ? DecorationSet.create(doc, found) : DecorationSet.empty
}

/**
 * The plugin that draws annotations. Its decorations follow the view's own
 * (the placeholder, a selected entity's `data-selected`), so an entity's own
 * element keeps `data-selected` and the annotation elements wrap it.
 */
export function annotationsPlugin(drawing: () => AnnotationDrawing): Plugin {
  let cache: { doc: PMNode; drawing: AnnotationDrawing; set: DecorationSet } | null = null
  return new Plugin({
    props: {
      decorations: (state) => {
        const now = drawing()
        if (cache === null || cache.doc !== state.doc || cache.drawing !== now) {
          cache = { doc: state.doc, drawing: now, set: decorationsOf(state.doc, now) }
        }
        return cache.set
      },
    },
  })
}

/**
 * Anchors `id` to every text and entity in the selection that lacks it. False
 * for a caret, and for a selection that holds nothing that can carry it. True
 * with no edit when all of it already carries it. One undo step.
 */
export function annotateCommand(id: string): Command {
  return (state, dispatch) => {
    const type = annotationType(state.schema)
    const { selection, doc } = state
    if (selection.empty || typeof id !== 'string' || id === '') return false
    const ranges: Extent[] = []
    let carried = false
    doc.nodesBetween(selection.from, selection.to, (node, pos, parent) => {
      if (!carries(node)) return true
      if (!parent?.type.allowsMarkType(type)) return false
      carried = true
      if (!node.marks.some((mark) => mark.type === type && mark.attrs.id === id)) {
        ranges.push({
          from: Math.max(pos, selection.from),
          to: Math.min(pos + node.nodeSize, selection.to),
        })
      }
      return false
    })
    if (!carried) return false
    if (dispatch && ranges.length > 0) {
      const tr = state.tr
      const mark = type.create({ id })
      for (const { from, to } of ranges) tr.addMark(from, to, mark)
      dispatch(closeHistory(tr))
    }
    return true
  }
}

/** Removes every mark of the annotation `id`. False when no text or entity carries it. One undo step. */
export function removeAnnotationCommand(id: string): Command {
  return (state, dispatch) => {
    const type = annotationType(state.schema)
    const marks: Mark[] = []
    let carried = false
    state.doc.descendants((node) => {
      for (const mark of node.marks) {
        if (mark.type !== type || mark.attrs.id !== id) continue
        if (carries(node)) carried = true
        if (!mark.isInSet(marks)) marks.push(mark)
      }
      return true
    })
    if (!carried) return false
    if (dispatch) {
      const tr = state.tr
      for (const mark of marks) tr.removeMark(0, state.doc.content.size, mark)
      dispatch(closeHistory(tr))
    }
    return true
  }
}

/** The fragment with no annotation mark on any inline in it. */
function stripFragment(fragment: Fragment, type: MarkType): Fragment {
  let changed = false
  const nodes: PMNode[] = []
  fragment.forEach((node) => {
    let next = node
    if (node.isInline) {
      if (type.isInSet(node.marks)) next = node.mark(type.removeFromSet(node.marks))
    } else if (node.content.size > 0) {
      const content = stripFragment(node.content, type)
      if (content !== node.content) next = node.copy(content)
    }
    if (next !== node) changed = true
    nodes.push(next)
  })
  return changed ? Fragment.fromArray(nodes) : fragment
}

/** A pasted or dropped slice with no annotation in it: an anchor is not content, and a copy would anchor one thread in two places. */
export function withoutAnnotations(slice: Slice, schema: Schema): Slice {
  const content = stripFragment(slice.content, annotationType(schema))
  return content === slice.content ? slice : new Slice(content, slice.openStart, slice.openEnd)
}

/**
 * Applies `next`'s marks to `tr`'s document, which holds the same nodes and
 * text: mark steps only, so no position moves and the selection stays where
 * it is. Where a node's marks differ, they are all removed and `next`'s added
 * in its order, so the two mark sets come out in the same order.
 */
export function copyMarks(tr: Transaction, next: PMNode): void {
  next.descendants((node, pos) => {
    if (!node.isInline) return true
    const end = pos + node.nodeSize
    tr.doc.nodesBetween(pos, end, (old, oldPos) => {
      if (!old.isInline) return true
      if (Mark.sameSet(old.marks, node.marks)) return false
      const from = Math.max(pos, oldPos)
      const to = Math.min(end, oldPos + old.nodeSize)
      tr.removeMark(from, to, null)
      for (const mark of node.marks) tr.addMark(from, to, mark)
      return false
    })
    return false
  })
}

/** The node with every mark removed from it and everything in it. */
function unmarked(node: PMNode): PMNode {
  if (node.isLeaf) return node.marks.length > 0 ? node.mark(Mark.none) : node
  const children: PMNode[] = []
  node.forEach((child) => children.push(unmarked(child)))
  return node.copy(Fragment.fromArray(children)).mark(Mark.none)
}

/** Whether two documents hold the same nodes and text, whatever their marks. */
export const sameButMarks = (a: PMNode, b: PMNode): boolean => unmarked(a).eq(unmarked(b))

/**
 * The box around the selection on screen, in viewport coordinates: the union
 * of the boxes of the selected text on every line. Null for a caret. A
 * selection with no text in it (empty blocks, a hard break) is boxed by the
 * caret positions at its two ends.
 */
export function selectionRect(view: EditorView): RichTextRect | null {
  const { from, to, empty } = view.state.selection
  if (empty) return null
  const owner = view.dom.ownerDocument
  const box = { top: Infinity, bottom: -Infinity, left: Infinity, right: -Infinity }
  const add = (rect: { top: number; bottom: number; left: number; right: number }) => {
    box.top = Math.min(box.top, rect.top)
    box.bottom = Math.max(box.bottom, rect.bottom)
    box.left = Math.min(box.left, rect.left)
    box.right = Math.max(box.right, rect.right)
  }
  try {
    const start = view.domAtPos(from)
    const end = view.domAtPos(to)
    const range = owner.createRange()
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)
    const root = range.commonAncestorContainer
    const texts: Text[] = []
    if (root.nodeType === root.TEXT_NODE) {
      texts.push(root as Text)
    } else {
      const walker = owner.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (range.intersectsNode(node)) texts.push(node as Text)
      }
    }
    const part = owner.createRange()
    for (const text of texts) {
      part.setStart(text, text === range.startContainer ? range.startOffset : 0)
      part.setEnd(text, text === range.endContainer ? range.endOffset : text.length)
      for (const rect of Array.from(part.getClientRects())) if (rect.width > 0) add(rect)
    }
    if (box.top === Infinity) {
      add(view.coordsAtPos(from, 1))
      add(view.coordsAtPos(to, -1))
    }
  } catch {
    // A view that is not laid out has no boxes.
    return { top: 0, bottom: 0, left: 0, right: 0 }
  }
  return box
}
