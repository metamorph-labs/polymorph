import { createSignal, getOwner, onCleanup, type Accessor, type JSX } from 'solid-js'

import {
  createToastStore,
  type ToastStoreOptions,
  type ToastStorePhase,
  type ToastStorePromiseSpec,
  type ToastStoreRecord,
} from '@polymorph/engine'

/**
 * The imperative side of Toast (`design/components/toast.md`) for Solid, with
 * the React vocabulary's API: `toast(options)` raises a toast and returns its
 * id, `toast.success`, `toast.danger`, `toast.warning` and `toast.info` fill in
 * the tone, `toast.promise` shows an async outcome as one card, and
 * `toast.dismiss` closes one toast, or every toast without an id.
 *
 * A toast is raised where the outcome happens, such as a submit handler, which
 * renders nothing, so the store is module-level: one per page, shared by every
 * viewport. It is the engine's `createToastStore`, typed with Solid's elements
 * for a toast's `content`, so it evicts, updates in place and settles a
 * promise by the rules React's store follows.
 */

export type ToastOptions = ToastStoreOptions<JSX.Element>
export type ToastRecord = ToastStoreRecord<JSX.Element>
export type ToastPhase = ToastStorePhase<JSX.Element>
export type ToastPromiseSpec = ToastStorePromiseSpec<JSX.Element>

const store = createToastStore<JSX.Element>()

export const toast = store.toast

export const subscribeToasts = store.subscribe

/** The records, referentially stable between changes. */
export const getToasts = store.get

/** Step two of dismissal, called by a card once its closed state has been rendered. */
export const removeToast = store.remove

/**
 * The records as an accessor that follows the store, for a viewport. Called
 * under an owner, it stops following when the owner is disposed.
 */
export function useToasts(): Accessor<readonly ToastRecord[]> {
  const [records, setRecords] = createSignal<readonly ToastRecord[]>(store.get())
  const stop = store.subscribe(() => setRecords(() => store.get()))
  if (getOwner() !== null) onCleanup(stop)
  return records
}
