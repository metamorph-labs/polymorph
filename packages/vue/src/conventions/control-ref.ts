import { shallowRef, type Ref, type ShallowRef } from 'vue'

/**
 * Shares one native control element between a member and the application, as
 * `useControlRef` does in the React foundation.
 *
 * A member that draws a frame around a native control (`Input`) keeps a ref to
 * it for its own logic. An application binding needs the same element, for a
 * caret restore or a form library reading `selectionStart`, and a member's root
 * is not the control. So the member takes a `controlRef` prop, a Vue `Ref`, and
 * binds the function this returns as the element's `ref`. Both refs get the
 * same node, and both get `null` on unmount.
 *
 * It returns a pair: the member's own handle, and the function ref the element
 * binds.
 */
export type ControlRef<T> = readonly [
  node: ShallowRef<T | null>,
  attach: (element: unknown) => void,
]

export function useControlRef<T extends Element>(
  external: () => Ref<T | null> | undefined,
): ControlRef<T> {
  const node = shallowRef(null) as ShallowRef<T | null>
  const attach = (element: unknown) => {
    const instance = (element ?? null) as T | null
    node.value = instance
    const target = external()
    if (target !== undefined) target.value = instance
  }
  return [node, attach]
}
