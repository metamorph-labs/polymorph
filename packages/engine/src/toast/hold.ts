'use client'

/**
 * When a viewport's timers wait (`design/components/toast.md`, Motion), for every framework's
 * viewport: while focus is in the notifications, while the pointer is over them, and while the
 * window is in the background, because a reader who is not looking at the page has not read
 * the toast. The timers run again when none of the three holds.
 *
 * The viewport calls `holdToastTimers` once with its region and a function that takes the
 * answer, and calls the function it returns as it unmounts.
 */

/**
 * Follows what holds a viewport's timers, and calls `hold` with `true` when one of them starts
 * to and with `false` when none does any more. It reads focus again whenever the region's
 * content changes, because a browser need not send a `focusout` when it drops focus from an
 * element that leaves the page, and a card that held focus leaves when its toast does.
 */
export function holdToastTimers(
  region: Element | null | undefined,
  hold: (held: boolean) => void,
): () => void {
  if (!region) return () => undefined
  const top = region.ownerDocument
  const view = top.defaultView
  let pointer = false
  let away = false
  let held = false

  const check = (): void => {
    const next = pointer || away || region.contains(top.activeElement)
    if (next === held) return
    held = next
    hold(next)
  }
  let live = true
  const focusOut = (event: Event): void => {
    const to = (event as FocusEvent).relatedTarget
    if (to instanceof Node && region.contains(to)) return
    // Focus is read again once it has landed: during `focusout` the document's active element
    // is the body. A browser also sends `focusout` from inside a framework's removal of the
    // focused card, where a framework may not take a change of its state.
    queueMicrotask(() => {
      if (live) check()
    })
  }
  const pointerMove = (): void => {
    pointer = true
    check()
  }
  const pointerLeave = (): void => {
    pointer = false
    check()
  }
  const blur = (): void => {
    away = true
    check()
  }
  const focus = (): void => {
    away = false
    check()
  }
  const observer = new MutationObserver(check)

  region.addEventListener('focusin', check)
  region.addEventListener('focusout', focusOut)
  region.addEventListener('pointermove', pointerMove)
  region.addEventListener('pointerleave', pointerLeave)
  view?.addEventListener('blur', blur)
  view?.addEventListener('focus', focus)
  observer.observe(region, { childList: true, subtree: true })
  check()
  return () => {
    live = false
    region.removeEventListener('focusin', check)
    region.removeEventListener('focusout', focusOut)
    region.removeEventListener('pointermove', pointerMove)
    region.removeEventListener('pointerleave', pointerLeave)
    view?.removeEventListener('blur', blur)
    view?.removeEventListener('focus', focus)
    observer.disconnect()
  }
}
