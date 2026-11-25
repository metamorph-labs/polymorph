import { toastFocusLaw } from '@polymorph/conformance/toast-focus'
import { toastSwipeLaw } from '@polymorph/conformance/toast-swipe'
import { getToasts, removeToast, toast } from '@polymorph/elements'

import { mountElement } from '../mount'
import './ToastViewport'

/**
 * Where a swiped toast is drawn while a finger drags it and after the finger
 * lets go, as `@polymorph/conformance/toast-swipe` states it for every generated
 * shell, with the toasts in `<poly-toast-viewport>` raised through the store the
 * foundation re-exports.
 */
toastFocusLaw({
  shell: 'Elements',
  mount: () => mountElement('poly-toast-viewport'),
  raise: (options) => void toast({ ...options, durationMs: Number.POSITIVE_INFINITY }),
  clear: () => getToasts().forEach((record) => removeToast(record.id)),
})

toastSwipeLaw({
  shell: 'Elements',
  mount: () => mountElement('poly-toast-viewport'),
  raise: (title) => void toast({ title, durationMs: Number.POSITIVE_INFINITY }),
  held: () => getToasts().length,
  clear: () => getToasts().forEach((record) => removeToast(record.id)),
})
