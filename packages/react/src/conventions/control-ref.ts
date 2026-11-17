'use client'

import { useCallback, useRef, type Ref, type RefCallback, type RefObject } from 'react'

/**
 * Shares one native control element between a member and the application.
 *
 * A member that draws a frame around a native control (`Input`) or measures
 * one (`Textarea`) keeps a ref to it for its own logic. The clear button writes
 * through the DOM so clearing uses the same change path as typing, and the
 * autosizer reads `scrollHeight`. An application binding needs the same
 * element, for example a collaboration layer restoring the caret after a remote
 * edit, or a form library reading `selectionStart`. Without this, the only ways
 * to reach it are a `querySelector` into the member's frame, which depends on
 * markup nobody guarantees, or a generic `ref` on a component whose root is not
 * the control.
 *
 * A member therefore takes a typed `controlRef` and merges it here with its
 * own. Both refs get the same node and both get `null` on unmount. If a
 * callback ref returns a cleanup, the cleanup is called, as React would do on
 * the element directly. The merged callback is stable while the external ref is
 * stable, so a controlled rerender detaches nothing and the caller's handle
 * keeps pointing at the element.
 *
 * It does not read the element for the caller. No selection is moved, saved or
 * restored here. The member hands over the node, the platform supplies
 * `selectionStart` and `setSelectionRange`, and the application decides what to
 * do with them.
 *
 * It returns a pair, like `useState`, so the member names its own handle. Name
 * it `somethingRef`. The React Compiler (the hooks lint) treats an identifier
 * as a ref only by that suffix. A handle with another name is treated as a
 * frozen hook result, which fails as soon as the member writes through it, as
 * an autosizer does.
 */

/** The member's own handle (read by its clear, focus and measure code) and the element's `ref`. */
export type ControlRef<T> = readonly [node: RefObject<T | null>, attach: RefCallback<T>]

/** Passes the node to the caller's ref of either shape. Returns a callback ref's cleanup. */
function deliver<T>(external: Ref<T> | undefined, instance: T | null): (() => void) | undefined {
  if (external === undefined || external === null) return undefined
  if (typeof external === 'function') {
    const cleanup = external(instance)
    return typeof cleanup === 'function' ? cleanup : undefined
  }
  external.current = instance
  return undefined
}

export function useControlRef<T>(external: Ref<T> | undefined): ControlRef<T> {
  const node = useRef<T | null>(null)
  // A callback ref may return a cleanup (React 19). On detach that cleanup is
  // called instead of passing `null`, which matches what React does.
  const release = useRef<(() => void) | undefined>(undefined)

  const attach = useCallback(
    (instance: T | null) => {
      node.current = instance
      if (instance === null) {
        const cleanup = release.current
        release.current = undefined
        if (cleanup) cleanup()
        else deliver(external, null)
        return
      }
      release.current = deliver(external, instance)
    },
    [external],
  )

  return [node, attach]
}
