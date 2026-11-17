import { onDestroy, tick, untrack } from 'svelte'

import { readMotionEnvironment, resolveBinding, type BindingName } from '@polymorph/engine/motion'

/**
 * A description's effect: `run` after the document has updated, once after
 * the member mounts unless `mount` is false, and again whenever the value
 * `watch` reads changes (`Object.is`). Only `watch` is tracked: what `run`
 * reads does not run it again, as Vue's `watch` has it.
 */
export function watchEffect(
  run: () => void,
  options: { watch?: () => unknown; mount?: boolean } = {},
): void {
  const { watch, mount = true } = options
  let ran = false
  let seen: unknown
  $effect(() => {
    const value = watch?.()
    untrack(() => {
      if (!ran) {
        ran = true
        seen = value
        if (mount) run()
        return
      }
      if (watch === undefined || Object.is(value, seen)) return
      seen = value
      run()
    })
  })
}

/**
 * Runs `fn` once Svelte has written its pending changes to the document
 * (`tick`), so `fn` reads the document as a change made before the call left
 * it. MultiSelect puts a controlled field's text back only once its caller's
 * value has rendered.
 */
export function afterRender(fn: () => void): void {
  void tick().then(fn)
}

/**
 * The elements a loop renders under one ref, in document order: a description's
 * ref inside an `each`. An element joins through the attachment
 * (`{@attach regions.attach}`) and leaves when it is removed.
 */
export interface RefList {
  readonly current: readonly HTMLElement[]
  attach(element: Element): () => void
}

const inDocumentOrder = (a: Node, b: Node) =>
  a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1

export function refList(): RefList {
  let elements = $state.raw<readonly HTMLElement[]>([])
  return {
    get current() {
      return elements
    },
    attach(element) {
      untrack(() => {
        elements = [...elements, element as HTMLElement].sort(inDocumentOrder)
      })
      return () =>
        untrack(() => {
          elements = elements.filter((other) => other !== element)
        })
    },
  }
}

/**
 * A departure that runs before a member hands control back to the caller:
 * Alert's ✕ plays the `collapse` exit, and the caller hears `dismiss` once it
 * has run, so the application owns the unmount. `start` sets `active`, waits
 * for the binding's runtime as the motion engine resolves it for the element,
 * and then calls `then`; it never calls it after the member is destroyed.
 */
export function useDeparture(
  element: () => HTMLElement | null,
  binding: BindingName,
): { readonly active: boolean; start(then: () => void): void } {
  let active = $state(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  onDestroy(() => clearTimeout(timer))
  return {
    get active() {
      return active
    },
    start(then) {
      active = true
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
