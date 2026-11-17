import type { Snippet } from 'svelte'
import { createSubscriber } from 'svelte/reactivity'

import {
  createToastStore,
  type ToastStoreOptions,
  type ToastStorePhase,
  type ToastStorePromiseSpec,
  type ToastStoreRecord,
} from '@polymorph/engine'

/**
 * The imperative side of Toast (`design/components/toast.md`) for Svelte, with
 * the React vocabulary's API: `toast(options)` raises a toast and returns its
 * id, `toast.success`, `toast.danger`, `toast.warning` and `toast.info` fill in
 * the tone, `toast.promise` shows an async outcome as one card, and
 * `toast.dismiss` closes one toast, or every toast without an id.
 *
 * A toast is raised where the outcome happens, such as a submit handler, which
 * renders nothing, so the store is module-level: one per page, shared by every
 * viewport. It is the engine's `createToastStore`, typed with Svelte's
 * snippets for a toast's `content`, so it evicts, updates in place and settles
 * a promise by the rules React's store follows.
 */

export type ToastOptions = ToastStoreOptions<Snippet>
export type ToastRecord = ToastStoreRecord<Snippet>
export type ToastPhase = ToastStorePhase<Snippet>
export type ToastPromiseSpec = ToastStorePromiseSpec<Snippet>

const store = createToastStore<Snippet>()

export const toast = store.toast

export const subscribeToasts = store.subscribe

/** The records, referentially stable between changes. */
export const getToasts = store.get

/** Step two of dismissal, called by a card once its closed state has been rendered. */
export const removeToast = store.remove

const follow = createSubscriber((update) => store.subscribe(update))

/**
 * The records, kept current (`current`), for a viewport: read inside a
 * component or an effect, it follows the store for as long as it is read.
 */
export function useToasts(): { readonly current: readonly ToastRecord[] } {
  return {
    get current() {
      follow()
      return store.get()
    },
  }
}
