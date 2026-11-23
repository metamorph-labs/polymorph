'use client'

/**
 * A press on the label of a field that a `<label for>` cannot name. FormField
 * names a `group` control by `aria-labelledby`, because `for` reaches only a
 * native control, so a press on the label would reach nothing. A member whose
 * group holds one text (RichTextInput's surface) makes the press focus it, as
 * a native label does, by listening on each element its `aria-labelledby`
 * names.
 *
 * The press is read as a native label reads one: on `click`, so nothing moves
 * while the pointer is down or dragging; not when the person selected the
 * label's own words by dragging over them; not for a press on a link or a
 * control inside the label; and not for a press whose default the page
 * prevented.
 */

/** What a press inside a label activates itself, so the label does not. */
const INTERACTIVE = 'a[href], button, input, select, textarea, [contenteditable="true"]'

/** Whether the document's selection holds some of `element`'s words. */
function selectsWords(element: Element): boolean {
  const selection = element.ownerDocument.getSelection()
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  return range.intersectsNode(element)
}

/**
 * Makes a press on each element `field`'s `aria-labelledby` names call
 * `focus`, while `enabled()` is true. The ids are read when it is called, so
 * a member calls it again when they change. Returns the function that stops
 * listening.
 */
export function focusOnLabelPress(
  field: HTMLElement | null | undefined,
  focus: () => void,
  enabled: () => boolean = () => true,
): () => void {
  if (field === null || field === undefined) return () => {}
  const owner = field.ownerDocument
  const ids = (field.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean)
  const labels = ids
    .map((id) => owner.getElementById(id))
    .filter((label): label is HTMLElement => label !== null && !label.contains(field))
  const press = (event: MouseEvent) => {
    const label = event.currentTarget
    const target = event.target
    if (event.defaultPrevented || event.button !== 0 || !enabled()) return
    if (!(label instanceof Element) || !(target instanceof Element)) return
    const inner = target.closest(INTERACTIVE)
    if (inner !== null && label.contains(inner)) return
    if (selectsWords(label)) return
    focus()
  }
  for (const label of labels) label.addEventListener('click', press)
  return () => {
    for (const label of labels) label.removeEventListener('click', press)
  }
}
