'use client'

/**
 * Focus entering and leaving a field made of several parts, and a form's
 * reset reaching it (`design/components/rich-text-input.md`), for every
 * framework's member.
 *
 * RichTextInput's field is its text, its toolbars, its footer, the link form
 * and the text style menu. The last two are drawn elsewhere in the document,
 * so the field is followed from the document, not from its own element: a
 * framework's portal sends no focus event through the field's element.
 */

/**
 * Whether a node is part of a field: inside its root, inside one of the
 * panels it draws elsewhere in the document, or inside a popup a control of
 * the field names with `aria-controls` (a menu's content).
 */
export function inField(
  root: Element,
  node: unknown,
  panels: readonly (Element | null | undefined)[] = [],
): boolean {
  if (!(node instanceof Node)) return false
  if (root.contains(node)) return true
  if (panels.some((panel) => panel?.contains(node) === true)) return true
  for (
    let at: Element | null = node instanceof Element ? node : node.parentElement;
    at !== null;
    at = at.parentElement
  ) {
    if (at.id === '') continue
    const id = at.id.replace(/["\\]/g, '\\$&')
    if (root.querySelector(`[aria-controls~="${id}"]`) !== null) return true
  }
  return false
}

export interface FieldFocusHooks {
  /** The panels the field draws elsewhere in the document, read at each focus move. */
  panels?: () => readonly (Element | null | undefined)[]
  /** Focus entered the field from outside it. */
  entered: () => void
  /** Focus left the field as a whole. */
  left: () => void
}

/**
 * Follows focus entering and leaving a field as a whole: a move between the
 * field's own parts is neither. Focus that leaves for no element is read once
 * the code running now has finished, so focus that comes straight back (the
 * editor ending an input method's composition) never left, and focus that
 * stays on the field while the window loses it has not left either. When
 * focus is already in the field as it starts following, `entered` runs at
 * once. Returns the function that stops following.
 */
export function followFieldFocus(root: HTMLElement, hooks: FieldFocusHooks): () => void {
  const owner = root.ownerDocument
  const within = (node: unknown) => inField(root, node, hooks.panels?.() ?? [])
  let inside = within(owner.activeElement)
  let moves = 0
  if (inside) hooks.entered()
  const focusin = (event: FocusEvent) => {
    moves += 1
    const now = within(event.target)
    if (now === inside) return
    inside = now
    if (now) hooks.entered()
    else hooks.left()
  }
  // A move to another element is decided by the `focusin` that follows it.
  const focusout = (event: FocusEvent) => {
    if (!inside || event.relatedTarget !== null) return
    moves += 1
    const move = moves
    queueMicrotask(() => {
      if (moves !== move || !inside || within(owner.activeElement)) return
      inside = false
      hooks.left()
    })
  }
  owner.addEventListener('focusin', focusin, true)
  owner.addEventListener('focusout', focusout, true)
  return () => {
    owner.removeEventListener('focusin', focusin, true)
    owner.removeEventListener('focusout', focusout, true)
  }
}

/**
 * Runs `reset` when a form the field is in is reset, as a native control is
 * put back to its first value. The form is read when it resets, so a field
 * moved into a form after it was drawn is reset too. Returns the function that
 * stops listening.
 */
export function followFormReset(root: HTMLElement, reset: () => void): () => void {
  const owner = root.ownerDocument
  const heard = (event: Event) => {
    const form = event.target
    if (form instanceof Element && form.tagName === 'FORM' && form.contains(root)) reset()
  }
  owner.addEventListener('reset', heard, true)
  return () => owner.removeEventListener('reset', heard, true)
}
