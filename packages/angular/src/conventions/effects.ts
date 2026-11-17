import {
  afterEveryRender,
  afterNextRender,
  afterRenderEffect,
  computed,
  untracked,
} from '@angular/core'

/**
 * A description's effects: statements run after the document has updated.
 * Each is called in the member's injection context.
 */

/** Runs once, after the member's first render. */
export function mountEffect(run: () => void): void {
  afterNextRender(() => untracked(run))
}

/**
 * Runs after the member's first render unless `mount` is `false`, and again
 * after each render that follows a change of what `watch` returns, as Vue runs
 * a `watch` with `flush: 'post'`: not each time a value it was read from
 * changes, only when the result does.
 */
export function watchEffect(watch: () => unknown, run: () => void, mount: boolean): void {
  const value = computed(watch)
  let first = true
  afterRenderEffect(() => {
    value()
    untracked(() => {
      if (first) {
        first = false
        if (mount) run()
        return
      }
      run()
    })
  })
}

/**
 * `watchEffect` for a value read from what the caller put in a slot (its text,
 * its members), which no signal follows: the value is read after every render
 * and compared with the one before.
 */
export function watchMeasured(watch: () => unknown, run: () => void, mount: boolean): void {
  let first = true
  let before: unknown
  afterEveryRender(() => {
    const now = untracked(watch)
    if (first) {
      first = false
      before = now
      if (mount) untracked(run)
      return
    }
    if (Object.is(now, before)) return
    before = now
    untracked(run)
  })
}
