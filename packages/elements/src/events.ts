/**
 * The event an element dispatches when its member throws, as it renders or
 * later: `detail` is the error. It does not bubble, and cancelling it keeps
 * the error out of the console. No member's callback dispatches it.
 */
export const ERROR_EVENT = 'poly-error'

/**
 * The events an element dispatches for its member's callbacks: `poly-` and
 * the callback's kebab name (`onOpenChange` is `poly-open-change`). `detail`
 * is the callback's first argument, `null` when it has none. Every event
 * bubbles and is composed; only the change event of a controlled prop is
 * cancelable, and cancelling it keeps the prop's value.
 *
 * A listener can hand the member a promise with `waitUntil`: what the member
 * gets back from the callback is every promise listeners handed it, settled
 * together, so a ConfirmDialog stays pending while the page saves.
 */
export class PolymorphEvent<Detail = unknown> extends CustomEvent<Detail> {
  #waits: Promise<unknown>[] = []
  #open = false

  /**
   * Hands the member a promise to wait on. Call it while the event is being
   * dispatched, from a listener.
   */
  waitUntil(promise: PromiseLike<unknown>): void {
    if (!this.#open) {
      throw new DOMException(
        'waitUntil is called from a listener while the event is dispatched',
        'InvalidStateError',
      )
    }
    this.#waits.push(Promise.resolve(promise))
  }

  /**
   * Dispatches the event on `target`, and returns what the member's callback
   * returns: the promises listeners handed `waitUntil`, settled together, or
   * `undefined` when none did.
   */
  dispatchOn(target: EventTarget): Promise<unknown[]> | undefined {
    this.#open = true
    try {
      target.dispatchEvent(this)
    } finally {
      this.#open = false
    }
    return this.#waits.length === 0 ? undefined : Promise.all(this.#waits)
  }
}
