/**
 * Where focus goes when a modal panel opens: the spec's order
 * (`design/components/dialog.md`), as a query over the parts the panel marks
 * with `data-dialog-part`. Every framework's modal surfaces share it, and
 * Drawer marks its parts the same way, because a drawer is a dialog.
 *
 * `primary` is the default and suits a panel opened to do something: the first
 * tabbable element in the body, else the rightmost footer action, else the
 * close button. `dismiss` is for a panel that asks whether you meant it: the
 * leftmost footer action, so a hasty Enter does not trigger the destructive
 * one. It touches the document only when called.
 */

/** Which footer control gets focus on open when the body has nothing tabbable. */
export type InitialFocus = 'primary' | 'dismiss'

/** The parts of a modal panel the policy reads, marked with `data-dialog-part`. */
export type ModalPart = 'body' | 'footer' | 'close'

const TABBABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
]

/** Scoped to one part. Prefixing the whole list at once would scope only its first term. */
function tabbableIn(panel: HTMLElement, part: ModalPart): HTMLElement[] {
  const selector = TABBABLE.map((term) => `[data-dialog-part='${part}'] ${term}`).join(', ')
  return Array.from(panel.querySelectorAll<HTMLElement>(selector))
}

export function modalFocusTarget(
  panel: HTMLElement | null | undefined,
  prefer: InitialFocus,
): HTMLElement | null {
  if (!panel) return null
  const [inBody] = tabbableIn(panel, 'body')
  if (inBody && prefer === 'primary') return inBody

  // The primary action is rightmost, and rightmost is last in the document.
  const actions = tabbableIn(panel, 'footer')
  const target = prefer === 'dismiss' ? actions[0] : actions[actions.length - 1]
  if (target) return target

  if (inBody) return inBody
  return panel.querySelector<HTMLElement>(`[data-dialog-part='close'] button`)
}
