'use client'

/**
 * When a viewport's timers wait (`design/components/toast.md`, Motion), for every framework's
 * viewport: while focus is in the notifications, while the pointer is over them, and while the
 * window is in the background, because a reader who is not looking at the page has not read
 * the toast. The timers run again when none of the three holds.
 *
 * The window is in the background while its page is hidden, such as a tab opened behind
 * another, and after it loses focus to another window or application. Focus that moves into a
 * frame on the page also takes focus from the window, and the reader is still on the page, so
 * after the window's `blur` the document is asked whether it has focus (`hasFocus`), which it
 * has while a frame inside it does.
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
  let blurred = false
  let held = false
  let live = true

  const check = (): void => {
    const away = blurred || top.visibilityState === 'hidden'
    const next = pointer || away || region.contains(top.activeElement)
    if (next === held) return
    held = next
    hold(next)
  }
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
    // Asked a task later, once focus has landed in a frame or left the page.
    setTimeout(() => {
      if (!live) return
      blurred = !top.hasFocus()
      check()
    }, 0)
  }
  const focus = (): void => {
    blurred = false
    check()
  }
  const observer = new MutationObserver(check)

  region.addEventListener('focusin', check)
  region.addEventListener('focusout', focusOut)
  region.addEventListener('pointermove', pointerMove)
  region.addEventListener('pointerleave', pointerLeave)
  view?.addEventListener('blur', blur)
  view?.addEventListener('focus', focus)
  top.addEventListener('visibilitychange', check)
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
    top.removeEventListener('visibilitychange', check)
    observer.disconnect()
  }
}

/**
 * A card's reading window, kept across the times its viewport holds the timers. A card makes
 * one as it mounts (`toastClock`) and asks it for the time left each time it starts its timer
 * (`toastTimeLeft`).
 */
export interface ToastClock {
  /** The record's revision the window belongs to. */
  revision: number
  /** The time the window had left when the timer last started. */
  left: number
  /** When the timer last started, by `Date.now()`. */
  started: number
  /** Whether that timer was to run, rather than wait out a hold. */
  running: boolean
}

/** A clock for a card that has started no timer yet. */
export function toastClock(): ToastClock {
  return { revision: -1, left: 0, started: 0, running: false }
}

/**
 * The time left of a card's reading window, for the timer the card starts now. A new revision
 * (an update in place) starts a whole window of `durationMs`, so updated content gets a full
 * reading. Otherwise the time that passed while the last timer ran is taken off, so a timer a
 * hold stopped resumes with the time that was left. `running` says whether the timer the card
 * starts now runs or waits out a hold.
 */
export function toastTimeLeft(
  clock: ToastClock,
  revision: number,
  durationMs: number,
  running: boolean,
): number {
  const now = Date.now()
  if (clock.revision !== revision) {
    clock.revision = revision
    clock.left = durationMs
  } else if (clock.running) {
    clock.left = Math.max(0, clock.left - (now - clock.started))
  }
  clock.running = running
  clock.started = now
  return clock.left
}
