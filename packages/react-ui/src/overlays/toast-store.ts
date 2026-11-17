import {
  createToastStore,
  TOAST_DEFAULT_DURATION_MS,
  TOAST_MAX_VISIBLE,
  TOAST_TONE_ICON,
  type ToastAction,
  type ToastFunction,
  type ToastStoreOptions,
  type ToastStorePhase,
  type ToastStorePromiseSpec,
  type ToastStoreRecord,
  type ToastTone,
} from '@polymorph/react'
import type { ReactNode } from 'react'

/**
 * The imperative side of Toast (`design/components/toast.md`) for React.
 *
 * A toast is raised where the outcome happens, such as a submit handler or a
 * mutation callback, and those places should not render a component. So the
 * API is a function and the store is module-level. `<Toaster />` mounts the
 * viewport once, and `toast()` works from anywhere without a hook, a context
 * or prop drilling.
 *
 * The store is the engine's (`createToastStore`), typed with React's nodes for
 * a toast's `content`, so every framework's toasts evict, update in place and
 * settle a promise by the same rules.
 */

export type { ToastAction, ToastTone }

export type ToastOptions = ToastStoreOptions<ReactNode>
export type ToastRecord = ToastStoreRecord<ReactNode>
export type ToastPhase = ToastStorePhase<ReactNode>
export type ToastPromiseSpec = ToastStorePromiseSpec<ReactNode>

export { TOAST_DEFAULT_DURATION_MS, TOAST_MAX_VISIBLE, TOAST_TONE_ICON }

const store = createToastStore<ReactNode>()

export const subscribeToasts = store.subscribe

/** Referentially stable between publishes, which is what `useSyncExternalStore` wants. */
export const getToasts = store.get

/** Step two of dismissal, called by the card once the closed state has been rendered. */
export const removeToast = store.remove

/**
 * `toast(options)` raises a toast and returns its id; `toast.success`,
 * `toast.danger`, `toast.warning` and `toast.info` fill in the tone,
 * `toast.promise` shows an async outcome as one card, and `toast.dismiss`
 * closes one toast, or every toast without an id.
 */
export const toast: ToastFunction<ReactNode> = store.toast
