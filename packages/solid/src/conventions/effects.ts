import { createEffect, getOwner, on, onCleanup, type Accessor } from 'solid-js'

/**
 * An effect a description runs when a value it watches changes: once when the
 * member mounts, unless `mount` is `false`, and again in a microtask after
 * `watch` changes, as Vue runs a `watch` with `flush: 'post'`. Changes made in
 * one task run the effect once, in the microtask after the first of them.
 *
 * The microtask matters where a change opens content. A presence renders its
 * content a microtask after the change (`@polymorph/solid/motion`), so an
 * effect that runs then finds it: Select moves focus into a list that has
 * rendered. It also lets the code that made the change finish first: a key
 * handler that opens MultiSelect's list and highlights a row has highlighted it
 * before the effect asks whether anything is highlighted. An effect never runs
 * after its member is disposed.
 */
export function watchEffect(watch: Accessor<unknown>, run: () => void, mount: boolean): void {
  let first = true
  let live = true
  if (getOwner() !== null) {
    onCleanup(() => {
      live = false
    })
  }
  let pending = false
  createEffect(
    on(watch, () => {
      if (first) {
        first = false
        if (mount) run()
        return
      }
      if (pending) return
      pending = true
      queueMicrotask(() => {
        pending = false
        if (live) run()
      })
    }),
  )
}

/**
 * Runs `fn` once Solid has written the changes made before the call to the
 * document: in a microtask, because Solid writes the document as a signal
 * changes, within the task that changed it, and a presence renders its
 * content a microtask after its change. MultiSelect puts a controlled field's
 * text back only once its caller's value has rendered.
 */
export function afterRender(fn: () => void): void {
  queueMicrotask(fn)
}
