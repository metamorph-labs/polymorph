import { DestroyRef, inject, signal, type Signal } from '@angular/core'

import {
  createToastStore,
  type ToastStoreOptions,
  type ToastStorePhase,
  type ToastStorePromiseSpec,
  type ToastStoreRecord,
} from '@polymorph/engine'

import type { Content } from './slots'

/**
 * The imperative side of Toast (`design/components/toast.md`) for Angular,
 * with the React vocabulary's API: `toast(options)` raises a toast and returns
 * its id, `toast.success`, `toast.danger`, `toast.warning` and `toast.info`
 * fill in the tone, `toast.promise` shows an async outcome as one card, and
 * `toast.dismiss` closes one toast, or every toast without an id.
 *
 * A toast is raised where the outcome happens, such as a submit handler, which
 * renders nothing, so the store is module-level: one per page, shared by every
 * viewport. It is the engine's `createToastStore`, typed with Angular's
 * templates for a toast's `content` (`Content`), so it evicts, updates in place and
 * settles a promise by the rules React's store follows.
 */

export type ToastOptions = ToastStoreOptions<Content>
export type ToastRecord = ToastStoreRecord<Content>
export type ToastPhase = ToastStorePhase<Content>
export type ToastPromiseSpec = ToastStorePromiseSpec<Content>

const store = createToastStore<Content>()

export const toast = store.toast

export const subscribeToasts = store.subscribe

/** The records, referentially stable between changes. */
export const getToasts = store.get

/** Step two of dismissal, called by a card once its closed state has been rendered. */
export const removeToast = store.remove

/**
 * The records as a signal that follows the store, for a viewport, until the
 * member is destroyed. Call it in an injection context.
 */
export function useToasts(): Signal<readonly ToastRecord[]> {
  const records = signal<readonly ToastRecord[]>(store.get())
  const stop = store.subscribe(() => records.set(store.get()))
  inject(DestroyRef).onDestroy(stop)
  return records.asReadonly()
}
