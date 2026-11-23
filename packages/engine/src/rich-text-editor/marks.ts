import { Plugin, TextSelection } from 'prosemirror-state'

/**
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
 */
export function stickyMarksPlugin(): Plugin {
  return new Plugin({
    appendTransaction: (transactions, oldState, newState) => {
      const stored = oldState.storedMarks
      if (!stored || !stored.some((mark) => mark.type.spec.inclusive === false)) return null
      if (newState.storedMarks || !transactions.some((tr) => tr.docChanged)) return null
      const $cursor =
        newState.selection instanceof TextSelection ? newState.selection.$cursor : null
      const before = $cursor?.nodeBefore
      if (!$cursor || !before?.isText) return null
      const kept = stored.filter(
        (mark) => mark.type.spec.inclusive === false && mark.isInSet(before.marks),
      )
      if (kept.length === 0) return null
      return newState.tr.setStoredMarks(before.marks)
    },
  })
}
