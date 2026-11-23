import type { Mark, Node as PMNode } from 'prosemirror-model'
import { Plugin, TextSelection, type Transaction } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'

import { isUnit } from './commands'
import { MARK } from './schema'

/**
 * The marks the editor keeps in step with what it writes, after every
 * transaction.
 *
 * A unit carries no format. An entity and a node this version does not know
 * are each one unit, and a format means nothing on one: the model writes none
 * (`rich-text/read.ts`), and the reader draws an entity the same whatever
 * surrounds it. A command over a selection with a unit in it, a typed
 * shortcut, a link and a paste would each put the format on the unit too,
 * because the unit's parent allows it, and the field would then draw a bold
 * or linked entity that is saved plain. So every format is taken off a unit in
 * the same step that put it there. Annotations and marks this version does not
 * know stay on an entity, because the model keeps them. The toggles count only
 * text when they decide whether a selection has a format (`markCommand`), so a
 * selection with a unit in it turns a format off as it turns it on.
 *
 * The caret after a unit takes the formats the caret before it would take.
 * ProseMirror gives typed text the marks of the node before the caret, which
 * after a unit are none, so a word typed after a mention inside bold text
 * would otherwise be plain. While the caret stands directly after one or more
 * units, and nothing has been stored, the formats of the text before them are
 * stored for the next character, unless an input method is composing.
 *
 * Inline code and links are not inclusive: text typed right after one is
 * plain, so a reader who finishes a code span or a link and keeps typing
 * leaves it. ProseMirror reads that from the mark's `inclusive: false`.
 *
 * The same rule would cut short a code span the reader turned on with its key
 * at a caret: the first typed character takes the stored mark, and the next
 * one, typed after a non-inclusive mark, would be plain. So while the reader
 * types on from a caret whose stored marks hold a non-inclusive mark, the
 * marks of what was just typed stay stored. Moving the caret clears them, as
 * it clears any stored mark, and the key turns the mark off again.
 *
 * An annotation is not inclusive either, but no key turns it on: it is in the
 * stored marks only when the caret was already inside one, where typing keeps
 * it anyway. So it does not make the marks sticky.
 */

/** The format marks: what a unit never carries. */
const FORMATS: ReadonlySet<string> = new Set([
  MARK.link,
  MARK.bold,
  MARK.italic,
  MARK.strike,
  MARK.code,
])

const sticky = (mark: Mark): boolean =>
  mark.type.spec.inclusive === false && mark.type.name !== MARK.annotation

/** Takes every format off every unit in the document. Returns whether it changed anything. */
function unformatUnits(doc: PMNode, tr: Transaction): boolean {
  let changed = false
  doc.descendants((node, pos) => {
    if (!node.isInline) return true
    if (!isUnit(node)) return false
    for (const mark of node.marks) {
      if (!FORMATS.has(mark.type.name)) continue
      tr.removeNodeMark(pos, mark)
      changed = true
    }
    return false
  })
  return changed
}

/** The marks to store for a caret directly after one or more units, or null for none. */
function marksAfterUnits(doc: PMNode, selection: TextSelection): readonly Mark[] | null {
  const $cursor = selection.$cursor
  if (!$cursor || !isUnit($cursor.nodeBefore)) return null
  let pos = $cursor.pos
  let $pos = $cursor
  while (isUnit($pos.nodeBefore)) {
    pos -= $pos.nodeBefore.nodeSize
    $pos = doc.resolve(pos)
  }
  // Annotations are the annotations plugin's to give (`annotations.ts`).
  const marks = $pos.marks().filter((mark) => mark.type.name !== MARK.annotation)
  return marks.some((mark) => FORMATS.has(mark.type.name)) ? marks : null
}

export function stickyMarksPlugin(): Plugin {
  let view: EditorView | null = null
  return new Plugin({
    view: (mounted) => {
      view = mounted
      return {
        destroy: () => {
          view = null
        },
      }
    },
    appendTransaction: (transactions, oldState, newState) => {
      const changed = transactions.some((tr) => tr.docChanged)
      const tr = newState.tr
      let edited = false
      if (changed && unformatUnits(newState.doc, tr)) {
        edited = true
        // A step clears the stored marks, and a typed shortcut stores what follows it.
        if (newState.storedMarks) tr.setStoredMarks(newState.storedMarks)
      }
      const selection = newState.selection
      if (
        !newState.storedMarks &&
        !view?.composing &&
        selection instanceof TextSelection &&
        transactions.some((t) => t.selectionSet || t.docChanged)
      ) {
        const marks = marksAfterUnits(tr.doc, selection)
        if (marks) {
          tr.setStoredMarks(marks)
          edited = true
        }
      }
      const stored = oldState.storedMarks
      if (stored?.some(sticky) && !newState.storedMarks && changed) {
        const $cursor = selection instanceof TextSelection ? selection.$cursor : null
        const before = $cursor?.nodeBefore
        if ($cursor && before?.isText) {
          const kept = stored.filter((mark) => sticky(mark) && mark.isInSet(before.marks))
          if (kept.length > 0) {
            tr.setStoredMarks(before.marks)
            edited = true
          }
        }
      }
      return edited ? tr : null
    },
  })
}
