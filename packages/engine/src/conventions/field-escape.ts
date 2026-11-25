'use client'

import { composingKey } from './composition'

/**
 * Escape that belongs to a text field inside a dialog.
 *
 * A field that undoes something of its own on Escape (TagInput's uncommitted
 * text, InlineEdit's open edit, a suggestion list) must do that before the
 * dialog around it closes. A dialog's layer, Radix's as Zag's, hears Escape on
 * the document in the capture phase, before the field's own handler, and closes
 * unless the key's default is prevented. So the field prevents it on the
 * window, which the key reaches first, and its own handler then acts on the key
 * as before.
 *
 * A member holds Escape only while the key has something to undo, so the
 * dialog still closes on the Escape after that one.
 */

/**
 * Prevents the default of each Escape pressed inside `field` that no input
 * method is handling, from the window in the capture phase. With `claim`, only
 * an Escape for which it returns true is held; `claim` may act on the key
 * itself. Returns the function that stops holding.
 */
export function holdFieldEscape(field: HTMLElement, claim?: () => boolean): () => void {
  const view = field.ownerDocument.defaultView
  if (view === null) return () => {}
  const hold = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || composingKey(event)) return
    const target = event.target
    if (!(target instanceof view.Node) || !field.contains(target)) return
    if (claim === undefined || claim()) event.preventDefault()
  }
  view.addEventListener('keydown', hold, true)
  return () => view.removeEventListener('keydown', hold, true)
}
