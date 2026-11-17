import {
  getCurrentInstance,
  getCurrentScope,
  onMounted,
  onScopeDispose,
  shallowRef,
  type ShallowRef,
  type VNode,
} from 'vue'

import {
  createToastStore,
  type ToastStoreOptions,
  type ToastStorePhase,
  type ToastStorePromiseSpec,
  type ToastStoreRecord,
} from '@polymorph/engine'

/**
 * The imperative side of Toast (`design/components/toast.md`) for Vue, with
 * the React vocabulary's API: `toast(options)` raises a toast and returns its
 * id, `toast.success`, `toast.danger`, `toast.warning` and `toast.info` fill in
 * the tone, `toast.promise` shows an async outcome as one card, and
 * `toast.dismiss` closes one toast, or every toast without an id.
 *
 * A toast is raised where the outcome happens, such as a submit handler, which
 * renders nothing, so the store is module-level: one per page, shared by every
 * viewport. It is the engine's `createToastStore`, typed with Vue's nodes for
 * a toast's `content`, so it evicts, updates in place and settles a promise by
 * the rules React's store follows.
 */

export type ToastOptions = ToastStoreOptions<VNode>
export type ToastRecord = ToastStoreRecord<VNode>
export type ToastPhase = ToastStorePhase<VNode>
export type ToastPromiseSpec = ToastStorePromiseSpec<VNode>

const store = createToastStore<VNode>()

export const toast = store.toast

export const subscribeToasts = store.subscribe

/** The records, referentially stable between changes. */
export const getToasts = store.get

/** Step two of dismissal, called by a card once its closed state has been rendered. */
export const removeToast = store.remove

/**
 * The records as a ref that follows the store, for a viewport. In a component
 * it follows the store from mount, reading the records again then, because a
 * server render neither mounts a component nor ends its scope, so a
 * subscription made while the component is set up would outlive the render.
 * Called outside a component, in an effect scope, it follows the store at
 * once. It stops following when the scope ends.
 */
export function useToasts(): Readonly<ShallowRef<readonly ToastRecord[]>> {
  const records = shallowRef(store.get())
  let stop: (() => void) | undefined
  const follow = () => {
    records.value = store.get()
    stop = store.subscribe(() => {
      records.value = store.get()
    })
  }
  if (getCurrentInstance() === null) follow()
  else onMounted(follow)
  if (getCurrentScope() !== undefined) onScopeDispose(() => stop?.())
  return records
}
