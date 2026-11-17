/**
 * Shares one native control element between a member and the application, as
 * `useControlRef` does in the React foundation.
 *
 * A member that draws a frame around a native control (`Input`) binds the
 * control for its own logic. An application binding needs the same element,
 * for a caret restore or a form library reading `selectionStart`, and a
 * member's root is not the control. So the member takes a `controlRef` prop:
 * a function the member calls with the element, or an object whose `current`
 * it sets, and with `null` when the element goes.
 */
export type ControlRef<T> = ((element: T) => void) | { current: T }

/** Hands the element `element` reads to the caller's ref, and `null` when it goes. */
export function useControlRef<T extends Element>(
  ref: () => ControlRef<T | null> | undefined,
  element: () => T | null,
): void {
  const hand = (target: ControlRef<T | null> | undefined, node: T | null) => {
    if (typeof target === 'function') target(node)
    else if (target !== undefined) target.current = node
  }
  $effect(() => {
    const target = ref()
    const node = element()
    hand(target, node)
    return () => hand(target, null)
  })
}
