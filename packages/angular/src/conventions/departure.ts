import { DestroyRef, inject, signal } from '@angular/core'

import { readMotionEnvironment, resolveBinding, type BindingName } from '@polymorph/engine/motion'

/**
 * A departure that runs before a member hands control back to the caller:
 * Alert's ✕ plays the `collapse` exit, and the caller hears `dismiss` once it
 * has run, so the application owns the removal. `start` sets `active`, waits
 * for the binding's runtime as the motion engine resolves it for the element,
 * and then calls `then`; it never calls it after the member is destroyed. Call
 * it in an injection context.
 */
export function useDeparture(
  element: () => HTMLElement | null,
  binding: BindingName,
): { readonly active: boolean; start(then: () => void): void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  inject(DestroyRef).onDestroy(() => clearTimeout(timer))
  const active = signal(false)
  return {
    get active() {
      return active()
    },
    start(then: () => void) {
      active.set(true)
      const resolved = resolveBinding(
        binding,
        readMotionEnvironment(element() ?? document.documentElement),
      )
      const runtime =
        resolved.kind === 'collapse' ? Math.max(resolved.sizeDurationMs, resolved.contentFadeMs) : 0
      clearTimeout(timer)
      if (runtime === 0) then()
      else timer = setTimeout(then, runtime)
    },
  }
}
