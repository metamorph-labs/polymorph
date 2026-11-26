import { toastFocusLaw } from '@polymorph/conformance/toast-focus'
import { toastSwipeLaw } from '@polymorph/conformance/toast-swipe'
import { toastTimerLaw } from '@polymorph/conformance/toast-timer'
import { getToasts, removeToast, toast } from '@polymorph/elements'

import { mountElement } from '../mount'
import './ToastViewport'

/**
 * Where focus goes as a toast leaves, which keys reach a toast, what the
 * notifications say and when their timers wait, as
 * `@polymorph/conformance/toast-focus` states them, and where a swiped toast is
 * drawn while a finger drags it and after the finger lets go, as
 * `@polymorph/conformance/toast-swipe` states it, for every generated shell,
 * with the toasts in `<poly-toast-viewport>` raised through the store the
 * foundation re-exports.
 */
toastFocusLaw({
  shell: 'Elements',
  mount: () => mountElement('poly-toast-viewport'),
  raise: (options) => toast({ durationMs: Number.POSITIVE_INFINITY, ...options }),
  dismiss: (id) => toast.dismiss(id),
  remove: (id) => removeToast(id),
  clear: () => getToasts().forEach((record) => removeToast(record.id)),
})

toastSwipeLaw({
  shell: 'Elements',
  mount: () => mountElement('poly-toast-viewport'),
  raise: (title) => void toast({ title, durationMs: Number.POSITIVE_INFINITY }),
  held: () => getToasts().length,
  clear: () => getToasts().forEach((record) => removeToast(record.id)),
})

toastTimerLaw({
  shell: 'Elements',
  mount: () => mountElement('poly-toast-viewport'),
  raise: (title, durationMs) => void toast({ title, durationMs }),
  clear: () => getToasts().forEach((record) => removeToast(record.id)),
})
