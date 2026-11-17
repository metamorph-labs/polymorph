import { computed, signal, type DestroyRef } from '@angular/core'
import type { Bindable, BindableParams } from '@zag-js/core'
import { isFunction } from '@zag-js/utils'

/**
 * A machine's context value as Angular signals: the value the machine holds
 * when it is uncontrolled, or its prop when the prop is given, as
 * `@zag-js/vue`'s `bindable` holds it in refs. Reading `get()` inside a
 * template, a `computed` or an effect tracks it, so a view that reads a
 * machine's state updates when the state does.
 */
export interface AngularBindable {
  <T>(props: () => BindableParams<T>): Bindable<T>
  cleanup(fn: VoidFunction): void
  ref<T>(defaultValue: T): { get: () => T; set: (next: T) => void }
}

/** The `bindable` a machine's context is made with, releasing with the member's `DestroyRef`. */
export function createBindable(destroyRef: DestroyRef): AngularBindable {
  const bindable = (<T>(props: () => BindableParams<T>): Bindable<T> => {
    const initial = (props().value ?? props().defaultValue) as T
    const eq = props().isEqual ?? Object.is
    const own = signal<T>(initial)
    const controlled = computed(() => props().value !== undefined)
    const current = (): T => (controlled() ? (props().value as T) : own())
    return {
      initial,
      ref: { current: current() },
      get: current,
      set(value) {
        const prev = current()
        const next = (isFunction(value) ? (value as (prev: T) => T)(prev) : value) as T
        if (props().debug) console.log(`[bindable > ${props().debug}] setValue`, { next, prev })
        if (!controlled()) own.set(next)
        if (!eq(next, prev)) props().onChange?.(next, prev)
      },
      invoke(next, prev) {
        props().onChange?.(next, prev)
      },
      hash(value) {
        return props().hash?.(value) ?? String(value)
      },
    } as Bindable<T>
  }) as AngularBindable
  bindable.cleanup = (fn) => {
    destroyRef.onDestroy(fn)
  }
  bindable.ref = <T>(defaultValue: T) => {
    let value = defaultValue
    return {
      get: () => value,
      set: (next: T) => {
        value = next
      },
    }
  }
  return bindable
}
