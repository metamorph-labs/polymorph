import { closeHistory } from 'prosemirror-history'
import {
  Fragment,
  Mark,
  type MarkType,
  type Node as PMNode,
  type Schema,
  Slice,
} from 'prosemirror-model'
import {
  type Command,
  type EditorState,
  Plugin,
  PluginKey,
  type Transaction,
} from 'prosemirror-state'
import {
  AddMarkStep,
  AddNodeMarkStep,
  AttrStep,
  DocAttrStep,
  RemoveMarkStep,
  RemoveNodeMarkStep,
  ReplaceAroundStep,
  ReplaceStep,
} from 'prosemirror-transform'
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
 * It moves with its text through every edit and excludes no mark, so
 * annotations overlap each other and every format. A text and an entity in a
 * block that allows the mark carry it; a code block's text cannot.
 *
 * Inside. A position is inside an annotation when the nearest text or entity
 * before it and the nearest after it, in reading order, both carry it
 * (`annotationsInside`). The search crosses block boundaries, so an annotation
 * that continues from the end of one paragraph into the next is around a
 * caret at the end of the first and at the start of the second. Everything
 * inserted at a position takes exactly the annotations it is inside: typed
 * text, pasted and dropped content, `insertText`, an entity and a link's text.
 * So text typed or pasted at an annotation's edge is outside it (the mark is
 * not inclusive), text inserted in its middle is inside it, and a copy never
 * brings an annotation from somewhere else; only text a drag moves inside the
 * field keeps its own as well (`paste.ts`). For a selection that is replaced,
 * it is the annotations carried on both sides of the selection.
 *
 * Typed text takes them as it is inserted (`handleTextInput`), not through
 * stored marks: ProseMirror ends an input method's composition when stored
 * marks are set during it. While an input method composes, ProseMirror's own
 * rule stands, which differs only at a block's edge and over a replaced
 * selection.
 *
 * Drawing. The mark's own element is a bare `span` that a stylesheet cannot
 * tell from any other: annotations are drawn with decorations, so the member
 * changes which are drawn and which is active without an edit. Each drawn
 * annotation of a text or an entity is its own `mark` element around it,
 * carrying the recipe's class and `data-annotation-id`, and `data-active` for
 * the active annotation. Where annotations overlap, the elements nest, the
 * innermost first: the one whose stretch in that block starts last, then the
 * one that ends first, then by id. `state.annotations` lists them in the same
 * order, so `closest('[data-annotation-id]')` from a pressed node finds the id
 * the state lists first.
 *
 * The drawing is kept as the document changes: the set is mapped through each
 * transaction, and only the text blocks a step touched are drawn again. A
 * change of selection draws nothing again, and a change of what is drawn
 * draws everything again.
 *
 * Positions (`RichTextRange`) are counted as the model counts them
 * (`rich-text/ranges.ts`): each leaf counts the code points of `unitText` of
 * the node it stands for, and the code points are counted on the joined text.
 */

export const annotationType = (schema: Schema): MarkType => schema.marks[MARK.annotation]!

/** Whether a node is one an annotation sits on: a text or an entity. */
const carries = (node: PMNode): boolean => node.isText || node.type.name === NODE.entity

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The ids of the annotations a node carries. */
function idsOn(node: PMNode, type: MarkType): Set<string> {
  const ids = new Set<string>()
  for (const mark of node.marks) if (mark.type === type) ids.add(mark.attrs.id as string)
  return ids
}

/* -------------------------------------------------------------------------- */
/* Positions                                                                   */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Inside an annotation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The nearest text or entity that can carry an annotation before `pos` (or,
 * with `forward`, after it): in the same text block, and otherwise in an
 * earlier (later) one. A text node that `pos` falls inside is the nearest on
 * both sides.
 */
function nearestCarrier(doc: PMNode, pos: number, type: MarkType, forward: boolean): PMNode | null {
  const $pos = doc.resolve(pos)
  let edge = pos
  if ($pos.parent.inlineContent) {
    const parent = $pos.parent
    if (parent.type.allowsMarkType(type)) {
      const inside = $pos.textOffset > 0
      if (forward) {
        for (let index = $pos.index(); index < parent.childCount; index += 1) {
          const child = parent.child(index)
          if (carries(child)) return child
        }
      } else {
        for (let index = inside ? $pos.index() : $pos.index() - 1; index >= 0; index -= 1) {
          const child = parent.child(index)
          if (carries(child)) return child
        }
      }
    }
    edge = forward ? $pos.end() : $pos.start()
  }
  let found: PMNode | null = null
  const visit = (node: PMNode, at: number, parent: PMNode | null): boolean => {
    if (forward && found) return false
    if (!node.isInline) return true
    const before = forward ? at >= edge : at + node.nodeSize <= edge
    if (before && carries(node) && parent?.type.allowsMarkType(type)) found = node
    return false
  }
  if (forward) doc.nodesBetween(edge, doc.content.size, visit)
  else doc.nodesBetween(0, edge, visit)
  return found
}

/**
 * The annotations a position is inside, or for a selection that is replaced,
 * those carried on both sides of it: the marks that what is inserted there
 * takes. None in a block that cannot hold an annotation (a code block).
 */
export function annotationsInside(doc: PMNode, from: number, to = from): Mark[] {
  const type = annotationType(doc.type.schema)
  const parent = doc.resolve(from).parent
  if (!parent.inlineContent || !parent.type.allowsMarkType(type)) return []
  const after = nearestCarrier(doc, to, type, true)
  const marks = after ? after.marks.filter((mark) => mark.type === type) : []
  if (marks.length === 0) return []
  const before = nearestCarrier(doc, from, type, false)
  if (!before) return []
  const ids = idsOn(before, type)
  return marks.filter((mark) => ids.has(mark.attrs.id as string))
}

/** `marks` with their annotations replaced by `inside`: the marks inserted content takes. */
export function withInside(marks: readonly Mark[], inside: readonly Mark[]): readonly Mark[] {
  let set: readonly Mark[] = marks.filter((mark) => mark.type.name !== MARK.annotation)
  for (const mark of inside) set = mark.addToSet(set)
  return set
}

/**
 * Gives the inline content from `from` to `to` exactly the annotations
 * `inside`. Returns whether anything changed; no step is added when the
 * content already holds them.
 */
export function setAnnotations(
  tr: Transaction,
  from: number,
  to: number,
  inside: readonly Mark[],
): boolean {
  if (from >= to) return false
  const type = annotationType(tr.doc.type.schema)
  const wanted = new Set(inside.map((mark) => mark.attrs.id as string))
  let differs = false
  tr.doc.nodesBetween(from, to, (node, _pos, parent) => {
    if (differs || !node.isInline) return !differs
    if (!carries(node) || !parent?.type.allowsMarkType(type)) {
      differs = type.isInSet(node.marks) !== undefined
      return false
    }
    const ids = idsOn(node, type)
    differs = ids.size !== wanted.size || [...ids].some((id) => !wanted.has(id))
    return false
  })
  if (!differs) return false
  tr.removeMark(from, to, type)
  for (const mark of inside) tr.addMark(from, to, mark)
  return true
}

/**
 * Where a transaction inserted content, in its final document: the union of
 * what each step put in, or null when it inserted nothing.
 */
export function insertedRange(tr: Transaction): { from: number; to: number } | null {
  let from = Infinity
  let to = -Infinity
  tr.mapping.maps.forEach((map, index) => {
    const rest = tr.mapping.slice(index + 1)
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      if (newEnd <= newStart) return
      from = Math.min(from, rest.map(newStart, -1))
      to = Math.max(to, rest.map(newEnd, 1))
    })
  })
  return from < to ? { from, to } : null
}

/* -------------------------------------------------------------------------- */
/* Stretches and their nesting                                                 */
/* -------------------------------------------------------------------------- */

interface Run {
  from: number
  to: number
}

/**
 * Each annotation's stretches in one text block: consecutive texts and
 * entities that carry it. An inline that carries none (a hard break, a node
 * this version does not know) neither ends a stretch nor belongs to one.
 */
function runsIn(block: PMNode, start: number, type: MarkType): Map<string, Run[]> {
  const runs = new Map<string, Run[]>()
  if (!block.type.allowsMarkType(type)) return runs
  const open = new Map<string, Run>()
  block.forEach((child, offset) => {
    if (!carries(child)) return
    const from = start + offset
    const to = from + child.nodeSize
    const ids = idsOn(child, type)
    for (const id of open.keys()) if (!ids.has(id)) open.delete(id)
    for (const id of ids) {
      const run = open.get(id)
      if (run) {
        run.to = to
      } else {
        const created = { from, to }
        open.set(id, created)
        const list = runs.get(id)
        if (list) list.push(created)
        else runs.set(id, [created])
      }
    }
  })
  return runs
}

/** The ids in nesting order: the stretch that starts last first, then the one that ends first, then by id. */
function nested(keys: Map<string, Run>): string[] {
  return [...keys.keys()].sort((a, b) => {
    const x = keys.get(a)!
    const y = keys.get(b)!
    return y.from - x.from || x.to - y.to || byKey(a, b)
  })
}

/**
 * The annotations at the selection, drawn or not, innermost first. At a caret,
 * those it is inside (`annotationsInside`), each ordered by its stretch at the
 * caret. For a range, every annotation a text or entity in it carries, each
 * ordered by its stretch at the first such text or entity.
 */
export function annotationsAt(state: EditorState): string[] {
  const type = annotationType(state.schema)
  const { selection, doc } = state
  const keys = new Map<string, Run>()
  if (selection.empty) {
    const inside = annotationsInside(doc, selection.from)
    if (inside.length < 2) return inside.map((mark) => mark.attrs.id as string)
    const $pos = selection.$from
    const runs = runsIn($pos.parent, $pos.start(), type)
    const pos = selection.from
    for (const mark of inside) {
      const id = mark.attrs.id as string
      const list = runs.get(id) ?? []
      keys.set(
        id,
        list.find((run) => run.from <= pos && pos <= run.to) ??
          list.find((run) => run.from >= pos) ??
          list.at(-1) ?? { from: pos, to: pos },
      )
    }
    return nested(keys)
  }
  doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (!node.isTextblock) return true
    const runs = runsIn(node, pos + 1, type)
    if (runs.size === 0) return false
    node.forEach((child, offset) => {
      const at = pos + 1 + offset
      if (!carries(child) || at + child.nodeSize <= selection.from || at >= selection.to) return
      for (const id of idsOn(child, type)) {
        if (keys.has(id)) continue
        const run = runs.get(id)?.find((r) => r.from <= at && at < r.to)
        if (run) keys.set(id, run)
      }
    })
    return false
  })
  return nested(keys)
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                     */
/* -------------------------------------------------------------------------- */

/** What the member asks to be drawn. A new object only when it changes, so the drawing is redone only then. */
export interface AnnotationDrawing {
  /** The ids drawn. `undefined` draws every one. */
  drawn: readonly string[] | undefined
  active: string | undefined
  /** The recipe's class for a drawn fragment. */
  className: string
}

/** The decorations of one text block whose content starts at `start`. */
function blockDecorations(
  block: PMNode,
  start: number,
  type: MarkType,
  drawing: AnnotationDrawing,
  drawn: ReadonlySet<string> | null,
): Decoration[] {
  const runs = runsIn(block, start, type)
  if (runs.size === 0) return []
  const found: Decoration[] = []
  block.forEach((child, offset) => {
    if (!carries(child)) return
    const from = start + offset
    const keys = new Map<string, Run>()
    for (const id of idsOn(child, type)) {
      if (drawn !== null && !drawn.has(id)) continue
      const run = runs.get(id)?.find((r) => r.from <= from && from < r.to)
      if (run) keys.set(id, run)
    }
    // ProseMirror wraps the first decoration of a node innermost.
    for (const id of nested(keys)) {
      const attrs: DecorationAttrs = { nodeName: 'mark', 'data-annotation-id': id }
      if (drawing.className) attrs.class = drawing.className
      if (id === drawing.active) attrs['data-active'] = ''
      found.push(Decoration.inline(from, from + child.nodeSize, attrs))
    }
  })
  return found
}

const drawnSet = (drawing: AnnotationDrawing): ReadonlySet<string> | null =>
  drawing.drawn === undefined ? null : new Set(drawing.drawn)

/** Every text block's decorations. */
function drawAll(doc: PMNode, drawing: AnnotationDrawing): DecorationSet {
  const drawn = drawnSet(drawing)
  if (drawn !== null && drawn.size === 0) return DecorationSet.empty
  const type = annotationType(doc.type.schema)
  const found: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    found.push(...blockDecorations(node, pos + 1, type, drawing, drawn))
    return false
  })
  return found.length > 0 ? DecorationSet.create(doc, found) : DecorationSet.empty
}

/**
 * The ranges of the final document each step of a transaction touched that
 * may change the drawing: what a step replaced or inserted, and where a step
 * added or removed an annotation. A step that changes only other marks or
 * attributes changes no stretch, because a stretch runs across texts whatever
 * their other marks.
 */
function touchedRanges(tr: Transaction, type: MarkType): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = []
  tr.steps.forEach((step, index) => {
    const rest = tr.mapping.slice(index + 1)
    const add = (from: number, to: number) =>
      ranges.push({ from: rest.map(from, -1), to: rest.map(to, 1) })
    if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
      if (step.mark.type === type) add(step.from, step.to)
    } else if (step instanceof AddNodeMarkStep || step instanceof RemoveNodeMarkStep) {
      if (step.mark.type === type) add(step.pos, step.pos + 1)
    } else if (step instanceof AttrStep || step instanceof DocAttrStep) {
      // An attribute draws no annotation.
    } else if (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) {
      step.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => add(newStart, newEnd))
    } else {
      add(0, tr.docs[index + 1]?.content.size ?? tr.doc.content.size)
    }
  })
  return ranges
}

/** The set with the text blocks around `ranges` drawn again. */
function redraw(
  set: DecorationSet,
  doc: PMNode,
  ranges: readonly { from: number; to: number }[],
  drawing: AnnotationDrawing,
): DecorationSet {
  const drawn = drawnSet(drawing)
  const type = annotationType(doc.type.schema)
  const blocks = new Map<number, PMNode>()
  const size = doc.content.size
  for (const range of ranges) {
    // One position wider on each side, so a block that a change only touches at its edge is drawn again.
    const from = Math.max(0, Math.min(range.from, range.to) - 1)
    const to = Math.min(size, Math.max(range.from, range.to) + 1)
    doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return true
      blocks.set(pos, node)
      return false
    })
  }
  if (blocks.size === 0) return set
  const stale: Decoration[] = []
  const fresh: Decoration[] = []
  for (const [pos, block] of blocks) {
    const start = pos + 1
    stale.push(...set.find(start, start + block.content.size))
    if (drawn === null || drawn.size > 0)
      fresh.push(...blockDecorations(block, start, type, drawing, drawn))
  }
  return set.remove(stale).add(doc, fresh)
}

interface Drawn {
  drawing: AnnotationDrawing
  set: DecorationSet
}

/**
 * The plugin that draws annotations and gives typed text its annotations. Its
 * decorations follow the view's own (the placeholder, a selected entity's
 * `data-selected`), so an entity's own element keeps `data-selected` and the
 * annotation elements wrap it.
 */
export function annotationsPlugin(drawing: () => AnnotationDrawing): Plugin<Drawn> {
  const key = new PluginKey<Drawn>('polymorphRichTextAnnotations')
  /** The drawing for a document after `update` changed what is drawn, which no transaction carries. */
  let redrawn: (Drawn & { doc: PMNode }) | null = null
  const drawFor = (doc: PMNode, now: AnnotationDrawing) => {
    if (redrawn?.doc !== doc || redrawn.drawing !== now)
      redrawn = { doc, drawing: now, set: drawAll(doc, now) }
    return redrawn
  }
  return new Plugin<Drawn>({
    key,
    state: {
      init: (_, state) => {
        const now = drawing()
        return { drawing: now, set: drawAll(state.doc, now) }
      },
      apply: (tr, value, old, state) => {
        const now = drawing()
        const base = value.drawing === now ? value : drawFor(old.doc, now)
        if (!tr.docChanged) return base === value ? value : { drawing: now, set: base.set }
        const type = annotationType(state.schema)
        const mapped = base.set.map(tr.mapping, state.doc)
        return { drawing: now, set: redraw(mapped, state.doc, touchedRanges(tr, type), now) }
      },
    },
    props: {
      decorations: (state) => {
        const value = key.getState(state)
        if (!value) return null
        const now = drawing()
        return value.drawing === now ? value.set : drawFor(state.doc, now).set
      },
      // Typed text takes the annotations it is inside, at a block's edge too,
      // where ProseMirror's own rule for a mark that is not inclusive leaves it
      // outside. While an input method composes, ProseMirror's own text stands:
      // changing it would end the composition.
      handleTextInput: (view, from, to, _text, deflt) => {
        if (view.composing) return false
        const inside = annotationsInside(view.state.doc, from, to)
        const tr = deflt()
        setAnnotations(tr, tr.mapping.map(from, -1), tr.mapping.map(to, 1), inside)
        view.dispatch(tr)
        return true
      },
    },
  })
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                    */
/* -------------------------------------------------------------------------- */

interface Range {
  from: number
  to: number
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
    const ranges: Range[] = []
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

/* -------------------------------------------------------------------------- */
/* Paste, and a value set from outside                                         */
/* -------------------------------------------------------------------------- */

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

/** A pasted or dropped slice with no annotation of its own: an anchor is not content, and a copy would anchor one thread in two places. */
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

/* -------------------------------------------------------------------------- */
/* Where the selection is on screen                                            */
/* -------------------------------------------------------------------------- */

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
