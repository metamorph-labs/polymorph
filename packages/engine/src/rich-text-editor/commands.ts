import {
  chainCommands,
  createParagraphNear,
  deleteSelection,
  joinBackward,
  joinForward,
  liftEmptyBlock,
  newlineInCode,
  selectNodeBackward,
  selectNodeForward,
  setBlockType,
  splitBlock,
  toggleMark,
  wrapIn,
} from 'prosemirror-commands'
import { redo as historyRedo, undo as historyUndo } from 'prosemirror-history'
import { undoInputRule } from 'prosemirror-inputrules'
import {
  Fragment,
  type Mark,
  type MarkType,
  type Node as PMNode,
  type Schema,
  Slice,
} from 'prosemirror-model'
import { liftListItem, sinkListItem, splitListItem, wrapInList } from 'prosemirror-schema-list'
import {
  type Command,
  type EditorState,
  NodeSelection,
  TextSelection,
  type Transaction,
} from 'prosemirror-state'
import { liftTarget } from 'prosemirror-transform'

import { richTextHref } from '../rich-text/index'
import { RICH_TEXT_MAX_DEPTH, type RichTextEntity, type RichTextFormat } from '../rich-text/types'
import { annotationsInside, setAnnotations, withInside } from './annotations'
import { MARK, NODE } from './schema'
import type { RichTextEditorEvent } from './types'

/**
 * The editor's commands: what a key, a toolbar control and the member's calls
 * do to the document.
 *
 * Each is a ProseMirror command, so the same function answers "does this
 * apply here" (no `dispatch`) for the state's `can` and performs the change
 * (with `dispatch`). A command that a reader would hear about marks its
 * transaction with the event it announces; the editor reads the mark after the
 * transaction and calls `onEvent`, so a key, an input rule and a member's call
 * announce the same way.
 */

/** The transaction metadata key for the event a change announces. */
export const EVENT_META = 'polymorphRichTextEvent'

/** A mark or block format whose `active` is read after the change. */
export type ToggleFormat = Exclude<RichTextFormat, 'link' | 'heading'>

/** What a transaction asks the editor to announce. A format's `active` is read from the state after it. */
export type PendingEvent = { type: 'toggle'; format: ToggleFormat } | RichTextEditorEvent

export function withEvent(command: Command, event: PendingEvent): Command {
  return (state, dispatch, view) =>
    command(state, dispatch && ((tr) => dispatch(tr.setMeta(EVENT_META, event))), view)
}

const MARK_FORMATS = new Set<RichTextFormat>(['bold', 'italic', 'strike', 'code'])

export const isMarkFormat = (
  format: RichTextFormat,
): format is 'bold' | 'italic' | 'strike' | 'code' => MARK_FORMATS.has(format)

/**
 * How many quotes and lists the document's deepest block sits in, counted as
 * the model counts them: a list item adds nothing to its list.
 */
export function nestingDepth(node: PMNode): number {
  let deepest = 0
  node.forEach((child) => {
    if (child.isTextblock || child.isAtom) return
    const own = child.type.name === NODE.listItem ? 0 : 1
    deepest = Math.max(deepest, own + nestingDepth(child))
  })
  return deepest
}

/** A command whose result may not nest deeper than the model keeps. */
function withinDepth(command: Command): Command {
  return (state, dispatch, view) => {
    const captured: Transaction[] = []
    if (!command(state, (tr) => captured.push(tr), view)) return false
    const tr = captured[0]
    if (!tr || nestingDepth(tr.doc) > RICH_TEXT_MAX_DEPTH) return false
    dispatch?.(tr)
    return true
  }
}

/** Every text in the selection has the mark, or the caret's marks hold it. */
export function markActive(state: EditorState, type: MarkType | undefined): boolean {
  if (!type) return false
  const { from, to, empty } = state.selection
  if (empty) return Boolean(type.isInSet(state.storedMarks ?? state.selection.$from.marks()))
  let found = false
  let missing = false
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return
    if (type.isInSet(node.marks)) found = true
    else missing = true
  })
  return found && !missing
}

export function markCommand(
  schema: Schema,
  format: 'bold' | 'italic' | 'strike' | 'code',
): Command {
  const type = schema.marks[format]
  if (!type) return () => false
  // Applied to all of a partly formatted selection, and removed only when all of it has it.
  return withEvent(toggleMark(type, null, { removeWhenPresent: false }), { type: 'toggle', format })
}

/** The nearest list around the selection's start, with its depth. */
export function listAround(state: EditorState): { node: PMNode; depth: number } | null {
  const $from = state.selection.$from
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name === NODE.bulletList || node.type.name === NODE.orderedList)
      return { node, depth: d }
  }
  return null
}

export function insideType(state: EditorState, name: string): boolean {
  const $from = state.selection.$from
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === name) return true
  return false
}

function listItemTypes(schema: Schema) {
  return schema.nodes[NODE.listItem]
}

export function listCommand(schema: Schema, format: 'bulletList' | 'orderedList'): Command {
  const type = schema.nodes[format]
  const item = listItemTypes(schema)
  if (!type || !item) return () => false
  const toggle: Command = (state, dispatch, view) => {
    const around = listAround(state)
    if (around && around.node.type === type) return liftListItem(item)(state, dispatch, view)
    if (around) {
      // The other kind of list: the list changes kind and keeps its items.
      if (dispatch) {
        const pos = state.selection.$from.before(around.depth)
        const attrs = type.name === NODE.orderedList ? { start: 1 } : null
        dispatch(state.tr.setNodeMarkup(pos, type, attrs))
      }
      return true
    }
    return wrapInList(type)(state, dispatch, view)
  }
  return withEvent(withinDepth(toggle), { type: 'toggle', format })
}

export function quoteCommand(schema: Schema): Command {
  const type = schema.nodes[NODE.blockquote]
  if (!type) return () => false
  const toggle: Command = (state, dispatch) => {
    const { $from, $to } = state.selection
    if (insideType(state, NODE.blockquote)) {
      const range = $from.blockRange($to, (node) => node.type === type)
      const target = range && liftTarget(range)
      if (!range || target === null || target === undefined) return false
      dispatch?.(state.tr.lift(range, target).scrollIntoView())
      return true
    }
    return wrapIn(type)(state, dispatch)
  }
  return withEvent(withinDepth(toggle), { type: 'toggle', format: 'blockquote' })
}

/** Entities and unknown inline nodes in the selected textblocks, as their text, so a block turned into code keeps their words. */
function inlineAtomsAsText(state: EditorState, tr: Transaction): void {
  const { from, to } = state.selection
  const atoms: { pos: number; node: PMNode }[] = []
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true
    node.forEach((child, offset) => {
      if (isUnit(child)) atoms.push({ pos: pos + 1 + offset, node: child })
    })
    return false
  })
  for (const { pos, node } of atoms.reverse()) {
    const text = node.type.spec.leafText?.(node) ?? ''
    if (text) tr.replaceWith(pos, pos + node.nodeSize, state.schema.text(text))
    else tr.delete(pos, pos + node.nodeSize)
  }
}

export function codeBlockCommand(schema: Schema): Command {
  const type = schema.nodes[NODE.codeBlock]
  const paragraph = schema.nodes[NODE.paragraph]!
  if (!type) return () => false
  const toggle: Command = (state, dispatch) => {
    if (state.selection.$from.parent.type === type) return setBlockType(paragraph)(state, dispatch)
    if (!setBlockType(type)(state)) return false
    if (dispatch) {
      const tr = state.tr
      inlineAtomsAsText(state, tr)
      tr.setBlockType(
        tr.mapping.map(state.selection.from),
        tr.mapping.map(state.selection.to),
        type,
      )
      dispatch(tr.scrollIntoView())
    }
    return true
  }
  return withEvent(toggle, { type: 'toggle', format: 'codeBlock' })
}

export function headingCommand(schema: Schema, level: 0 | 1 | 2 | 3): Command {
  const heading = schema.nodes[NODE.heading]
  const paragraph = schema.nodes[NODE.paragraph]!
  const command: Command =
    level === 0 ? setBlockType(paragraph) : heading ? setBlockType(heading, { level }) : () => false
  return withEvent(command, { type: 'heading', level })
}

/** The run of text carrying the mark of `type` that a position is in, or null when the position is not in one. */
export function markExtent(
  state: EditorState,
  pos: number,
  type: MarkType,
): { from: number; to: number; mark: Mark } | null {
  const $pos = state.doc.resolve(pos)
  // A caret just after a link is not in it, as typing there shows.
  const mark = type.isInSet($pos.marks())
  if (!mark) return null
  const parent = $pos.parent
  let offset = $pos.start()
  let runFrom = -1
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i)
    const childStart = offset
    offset += child.nodeSize
    if (!mark.isInSet(child.marks)) {
      runFrom = -1
      continue
    }
    if (runFrom < 0) runFrom = childStart
    if (runFrom <= pos && pos <= offset) {
      let runTo = offset
      for (let j = i + 1; j < parent.childCount && mark.isInSet(parent.child(j).marks); j++) {
        runTo += parent.child(j).nodeSize
      }
      return { from: runFrom, to: runTo, mark }
    }
  }
  return null
}

/** The target of the link the selection is in: every text in it carries the same link. */
export function linkAt(state: EditorState): string | null {
  const type = state.schema.marks[MARK.link]
  if (!type) return null
  const { from, to, empty, $from } = state.selection
  if (empty) {
    const mark = type.isInSet(state.storedMarks ?? $from.marks())
    return mark ? (mark.attrs.href as string) : null
  }
  let href: string | null | undefined
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText || href === null) return
    const mark = type.isInSet(node.marks)
    const value = mark ? (mark.attrs.href as string) : null
    if (href === undefined) href = value
    else if (href !== value) href = null
  })
  return href ?? null
}

/** Whether a link may be placed at the selection: links are allowed and the text there may carry one. */
export function linkApplies(state: EditorState): boolean {
  const type = state.schema.marks[MARK.link]
  if (!type) return false
  const { $from, from, to, empty } = state.selection
  if (state.selection instanceof NodeSelection) return false
  if (empty) return $from.parent.inlineContent && $from.parent.type.allowsMarkType(type)
  let applies = false
  state.doc.nodesBetween(from, to, (node) => {
    if (applies) return false
    if (node.inlineContent && node.type.allowsMarkType(type)) applies = true
    return true
  })
  return applies
}

/**
 * Links the selection, edits the link the caret is in, or with a caret
 * outside a link inserts the typed text linked to its target. `null` removes
 * the link at the selection.
 */
export function linkCommand(schema: Schema, href: string | null): Command {
  const type = schema.marks[MARK.link]
  if (!type) return () => false
  return (state, dispatch) => {
    const { from, to, empty } = state.selection
    if (href === null) {
      if (empty) {
        const extent = markExtent(state, from, type)
        if (!extent) return false
        dispatch?.(
          state.tr
            .removeMark(extent.from, extent.to, type)
            .setMeta(EVENT_META, { type: 'link', active: false }),
        )
        return true
      }
      if (!state.doc.rangeHasMark(from, to, type)) return false
      dispatch?.(
        state.tr.removeMark(from, to, type).setMeta(EVENT_META, { type: 'link', active: false }),
      )
      return true
    }
    const target = richTextHref(href, { typed: true })
    if (target === null || !linkApplies(state)) return false
    if (!dispatch) return true
    const mark = type.create({ href: target })
    const tr = state.tr
    if (!empty) {
      tr.removeMark(from, to, type).addMark(from, to, mark)
    } else {
      const extent = markExtent(state, from, type)
      if (extent) {
        tr.removeMark(extent.from, extent.to, type).addMark(extent.from, extent.to, mark)
      } else {
        const text = href.trim()
        const marks = mark.addToSet(
          withInside(
            state.storedMarks ?? state.selection.$from.marks(),
            annotationsInside(state.doc, from),
          ),
        )
        tr.insert(from, schema.text(text, marks))
        tr.setSelection(TextSelection.create(tr.doc, from + text.length))
        tr.removeStoredMark(type)
      }
    }
    dispatch(tr.scrollIntoView().setMeta(EVENT_META, { type: 'link', active: true }))
    return true
  }
}

/**
 * Text inserted at the selection: a line break is a hard break outside a code
 * block. It takes the annotations the selection is inside, as typed text does.
 */
export function textCommand(text: string): Command {
  return (state, dispatch) => {
    const { $from, from, to } = state.selection
    if (!dispatch) return true
    const inside = annotationsInside(state.doc, from, to)
    if ($from.parent.type.spec.code || !text.includes('\n')) {
      const tr = state.tr.insertText(text)
      setAnnotations(tr, tr.mapping.map(from, -1), tr.mapping.map(to, 1), inside)
      dispatch(tr.scrollIntoView())
      return true
    }
    const marks = withInside(
      (state.storedMarks ?? $from.marks()).filter((m) => $from.parent.type.allowsMarkType(m.type)),
      inside,
    )
    const nodes: PMNode[] = []
    text
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .forEach((line, i) => {
        if (i > 0) nodes.push(state.schema.node(NODE.hardBreak))
        if (line) nodes.push(state.schema.text(line, marks))
      })
    dispatch(state.tr.replaceSelection(new Slice(Fragment.from(nodes), 0, 0)).scrollIntoView())
    return true
  }
}

/**
 * The entity and one space, in place of `range` or the selection. Both take
 * the annotations the replaced range is inside, as typed text would, so an
 * entity picked inside an annotated sentence leaves no gap in it; the space
 * also takes the start's formats, which an entity does not keep.
 */
export function entityCommand(
  schema: Schema,
  entity: Omit<RichTextEntity, 'type'>,
  range: { from: number; to: number } | null,
): Command {
  return (state, dispatch) => {
    if (!dispatch) return true
    const from = range ? range.from : state.selection.from
    const to = range ? range.to : state.selection.to
    const $from = state.doc.resolve(from)
    if (!$from.parent.inlineContent || $from.parent.type.spec.code) return false
    const inside = annotationsInside(state.doc, from, to)
    const marks = withInside(
      $from.marks().filter((m) => $from.parent.type.allowsMarkType(m.type)),
      inside,
    )
    const node = schema.node(
      NODE.entity,
      { kind: entity.kind, id: entity.id, label: entity.label },
      undefined,
      inside,
    )
    const tr = state.tr.replaceWith(from, to, [node, schema.text(' ', marks)])
    tr.setSelection(TextSelection.create(tr.doc, from + node.nodeSize + 1))
    dispatch(
      tr.scrollIntoView().setMeta(EVENT_META, {
        type: 'entity',
        entity: { type: 'entity', kind: entity.kind, id: entity.id, label: entity.label },
      }),
    )
    return true
  }
}

export const undoCommand: Command = withEvent(chainCommands(undoInputRule, historyUndo), {
  type: 'undo',
})
export const redoCommand: Command = withEvent(historyRedo, { type: 'redo' })

/** Enter on an empty last line of a code block: the line is removed and a paragraph follows the block. */
const exitCodeOnEmptyLine: Command = (state, dispatch) => {
  const { $from, empty } = state.selection
  if (!empty || !$from.parent.type.spec.code) return false
  if ($from.parentOffset !== $from.parent.content.size || !$from.parent.textContent.endsWith('\n'))
    return false
  const paragraph = state.schema.nodes[NODE.paragraph]!
  const index = $from.indexAfter(-1)
  if (!$from.node(-1).canReplaceWith(index, index, paragraph)) return false
  if (dispatch) {
    const tr = state.tr.delete($from.pos - 1, $from.pos)
    const pos = tr.mapping.map($from.after())
    tr.insert(pos, paragraph.create())
    tr.setSelection(TextSelection.create(tr.doc, pos + 1))
    dispatch(tr.scrollIntoView())
  }
  return true
}

/** Enter in an empty list item lifts it out of its list. */
function liftEmptyItem(schema: Schema): Command {
  const item = listItemTypes(schema)
  return (state, dispatch, view) => {
    const { $from, empty } = state.selection
    if (!item || !empty || $from.parent.content.size !== 0 || $from.depth < 2) return false
    if ($from.node(-1).type !== item) return false
    return liftListItem(item)(state, dispatch, view)
  }
}

export function enterCommand(schema: Schema): Command {
  const item = listItemTypes(schema)
  return chainCommands(
    exitCodeOnEmptyLine,
    newlineInCode,
    ...(item ? [splitListItem(item), liftEmptyItem(schema)] : []),
    createParagraphNear,
    liftEmptyBlock,
    splitBlock,
  )
}

/** Shift-Enter: a line break inside the block, which in a code block is a new line. */
export function hardBreakCommand(schema: Schema): Command {
  return chainCommands(newlineInCode, (state, dispatch) => {
    const { $from } = state.selection
    if (!$from.parent.inlineContent) return false
    dispatch?.(
      state.tr.replaceSelectionWith(schema.nodes[NODE.hardBreak]!.create()).scrollIntoView(),
    )
    return true
  })
}

/** Tab sinks the list item, and outside a list, or where it cannot sink, the key is the browser's. */
export function sinkCommand(schema: Schema): Command {
  const item = listItemTypes(schema)
  if (!item) return () => false
  return withinDepth(sinkListItem(item))
}

export function liftCommand(schema: Schema): Command {
  const item = listItemTypes(schema)
  if (!item) return () => false
  return liftListItem(item)
}

/** The inline atoms that read as one unit: an entity and an unknown inline node. */
export const isUnit = (node: PMNode | null | undefined): node is PMNode =>
  Boolean(node && node.isInline && node.isAtom && !node.isText && node.type.name !== NODE.hardBreak)

/** Backspace or Delete beside an entity removes the whole entity. */
export function deleteUnit(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const sel = state.selection
    if (sel instanceof NodeSelection && isUnit(sel.node)) {
      dispatch?.(state.tr.deleteSelection().scrollIntoView())
      return true
    }
    if (!(sel instanceof TextSelection) || !sel.empty) return false
    const $pos = sel.$from
    const node = direction < 0 ? $pos.nodeBefore : $pos.nodeAfter
    if (!isUnit(node)) return false
    const from = direction < 0 ? $pos.pos - node.nodeSize : $pos.pos
    dispatch?.(state.tr.delete(from, from + node.nodeSize).scrollIntoView())
    return true
  }
}

/** An arrow key beside an entity steps over the whole entity; one that is selected leaves it on that side. */
export function stepOverUnit(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const sel = state.selection
    if (sel instanceof NodeSelection && isUnit(sel.node)) {
      const pos = direction < 0 ? sel.from : sel.to
      dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, pos)).scrollIntoView())
      return true
    }
    if (!(sel instanceof TextSelection) || !sel.empty) return false
    const $pos = sel.$from
    const node = direction < 0 ? $pos.nodeBefore : $pos.nodeAfter
    if (!isUnit(node)) return false
    const pos = $pos.pos + direction * node.nodeSize
    dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, pos)).scrollIntoView())
    return true
  }
}

/** Backspace at the start of a list item lifts it; at the start of a heading or code block with nothing to join, it becomes a paragraph. */
export function backspaceCommand(schema: Schema): Command {
  const item = listItemTypes(schema)
  const paragraph = schema.nodes[NODE.paragraph]!
  const liftItemAtStart: Command = (state, dispatch, view) => {
    const { $from, empty } = state.selection
    if (!item || !empty || $from.parentOffset !== 0 || $from.depth < 2) return false
    if ($from.node(-1).type !== item || $from.index(-1) !== 0) return false
    return liftListItem(item)(state, dispatch, view)
  }
  const resetAtStart: Command = (state, dispatch) => {
    const { $from, empty } = state.selection
    if (
      !empty ||
      $from.parentOffset !== 0 ||
      $from.parent.type === paragraph ||
      !$from.parent.isTextblock
    )
      return false
    return setBlockType(paragraph)(state, dispatch)
  }
  return chainCommands(
    undoInputRule,
    deleteUnit(-1),
    deleteSelection,
    liftItemAtStart,
    joinBackward,
    selectNodeBackward,
    resetAtStart,
  )
}

export const deleteCommand: Command = chainCommands(
  deleteUnit(1),
  deleteSelection,
  joinForward,
  selectNodeForward,
)
