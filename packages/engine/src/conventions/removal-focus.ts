/**
 * Where focus goes once an item a person removed has left its list.
 *
 * FileUpload's rows and PromptInput's attachment chips each have a remove
 * control. The application owns the list and removes the item in its own
 * time, so the member remembers which control was pressed and waits for the
 * item to leave. Then focus moves to the remove control of the item that took
 * its place, else of the item before it, else to the control the member names
 * for an empty list (FileUpload's zone, PromptInput's field). Without this,
 * focus falls to the body when the focused control is removed, and a keyboard
 * user starts again from the top of the page.
 *
 * Focus moves only while it is still in the leaving item (an item that plays
 * its exit is still in the document) or has fallen to the body, so focus the
 * person has moved since the press stays where it is.
 */

/** A remove control a person pressed: its item's id and the item's place in the list. */
export interface PressedRemoval {
  id: string
  at: number
}

/**
 * Moves focus once the item `pressed` names has left `ids`, the list as it is
 * now drawn. `control(at)` is the remove control of the item now at `at`,
 * `empty` is where focus goes when no item is left, and `leaving` is the
 * removed item's element while it is still in the document. Returns the
 * removal still waited for: `pressed` while its item is listed, else `null`.
 */
export function focusAfterListRemoval(
  pressed: PressedRemoval | null,
  ids: readonly string[],
  control: (at: number) => HTMLElement | null | undefined,
  empty: HTMLElement | null | undefined,
  leaving?: Element | null,
): PressedRemoval | null {
  if (pressed === null || ids.includes(pressed.id)) return pressed
  if (typeof document === 'undefined') return null
  const page = empty?.ownerDocument ?? document
  const active = page.activeElement
  const lost = active === null || active === page.body || leaving?.contains(active) === true
  if (!lost) return null
  const at = Math.min(pressed.at, ids.length - 1)
  const target = at >= 0 ? control(at) : null
  ;(target ?? empty)?.focus()
  return null
}
