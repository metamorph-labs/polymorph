import { describe, expect, it, vi } from 'vitest'

import { actOnToastNotice, dismissToastNotice, toastDetails, toastNotices } from './agent'
import { createToastStore } from './store'

/**
 * What an agent reads from a Toast viewport's notices, and how it answers one
 * (`design/components/toast.md`, Agent): the store's records, read the same in
 * every renderer, and answers that go through the store's own functions.
 */

describe('the notices', () => {
  it('are the records on screen, with what each says', () => {
    const { toast, get } = createToastStore<never>()
    const first = toast({ title: 'Ticket created', durationMs: Number.POSITIVE_INFINITY })
    const second = toast.danger('Could not delete', {
      description: 'The ticket is referenced by another.',
      action: { label: 'Retry', onClick: () => {} },
      dismissible: false,
    })
    const leaving = toast.success('Saved')
    toast.dismiss(leaving)
    expect(toastNotices(get())).toEqual([
      { id: first, label: 'Ticket created' },
      { id: second, label: 'Could not delete' },
    ])
    expect(toastDetails(get())).toEqual([
      { id: first, title: 'Ticket created', tone: 'neutral', dismissible: true },
      {
        id: second,
        title: 'Could not delete',
        description: 'The ticket is referenced by another.',
        tone: 'danger',
        action: 'Retry',
        dismissible: false,
      },
    ])
  })
})

describe('an answer', () => {
  it('dismisses a notice through the store, which tells its owner', () => {
    const { toast, get } = createToastStore<never>()
    const onDismiss = vi.fn()
    const id = toast({ title: 'Ticket assigned', onDismiss })
    dismissToastNotice(toast, get(), id)
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(toastNotices(get())).toEqual([])
  })

  it('runs a notice’s action, then dismisses it', () => {
    const { toast, get } = createToastStore<never>()
    const calls: string[] = []
    const id = toast.success('Ticket archived', {
      action: { label: 'Undo', onClick: () => calls.push('undo') },
      onDismiss: () => calls.push('dismissed'),
    })
    actOnToastNotice(toast, get(), id)
    expect(calls).toEqual(['undo', 'dismissed'])
    expect(toastNotices(get())).toEqual([])
  })

  it('refuses to dismiss a notice that cannot be, and to act on one with no action', () => {
    const { toast, get } = createToastStore<never>()
    const onDismiss = vi.fn()
    const held = toast.danger('Payment failed', { dismissible: false, onDismiss })
    const plain = toast({ title: 'Ticket created' })
    expect(() => dismissToastNotice(toast, get(), held)).toThrow('cannot be dismissed')
    expect(() => actOnToastNotice(toast, get(), plain)).toThrow('has no action')
    expect(() => dismissToastNotice(toast, get(), 'toast-missing')).toThrow(
      'No notice on screen has the id "toast-missing".',
    )
    expect(onDismiss).not.toHaveBeenCalled()
    expect(toastNotices(get()).map(({ id }) => id)).toEqual([held, plain])
  })
})
