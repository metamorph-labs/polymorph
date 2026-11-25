import { describe, expect, it } from 'vitest'

import {
  createToastStore,
  TOAST_DEFAULT_DURATION_MS,
  TOAST_MAX_VISIBLE,
  toneLifetime,
} from './store'

/**
 * The toast store every foundation creates. The viewports' own tests check
 * what is drawn from it; these check the records.
 */

describe('createToastStore', () => {
  it('raises a toast with the defaults and tells its subscribers', () => {
    const store = createToastStore()
    let calls = 0
    store.subscribe(() => (calls += 1))
    const id = store.toast({ title: 'Saved' })
    expect(store.get()).toEqual([
      {
        id,
        title: 'Saved',
        tone: 'neutral',
        retained: false,
        durationMs: TOAST_DEFAULT_DURATION_MS,
        revision: 0,
        raised: 1,
      },
    ])
    expect(calls).toBe(1)
  })

  it('gives a toast its tone’s lifetime when the call does not say: danger and warning stay', () => {
    const store = createToastStore()
    store.toast.danger('Failed')
    store.toast.warning('Quota low')
    store.toast.success('Saved')
    store.toast({ title: 'Plain' })
    expect(store.get().map((record) => [record.title, record.retained, record.durationMs])).toEqual(
      [
        ['Failed', true, Infinity],
        ['Quota low', true, Infinity],
        ['Saved', false, TOAST_DEFAULT_DURATION_MS],
        ['Plain', false, TOAST_DEFAULT_DURATION_MS],
      ],
    )
    expect(toneLifetime('danger')).toEqual({ retained: true, durationMs: Infinity })
    expect(toneLifetime('neutral')).toEqual({
      retained: false,
      durationMs: TOAST_DEFAULT_DURATION_MS,
    })
  })

  it('pins a toast with an action until it is dismissed, and lets newer toasts evict it', () => {
    const store = createToastStore()
    const undo = { label: 'Undo', onClick: () => undefined }
    store.toast.success('Archived', { action: undo })
    store.toast.danger('Could not delete', { action: { label: 'Retry', onClick: () => undefined } })
    store.toast({ title: 'Brief', action: undo, durationMs: 3000 })
    expect(store.get().map((record) => [record.title, record.retained, record.durationMs])).toEqual(
      [
        ['Archived', false, Infinity],
        ['Could not delete', true, Infinity],
        ['Brief', undefined, 3000],
      ],
    )
    for (let index = 1; index <= TOAST_MAX_VISIBLE; index += 1) store.toast.success(`${index}`)
    expect(store.get().map((record) => record.title)).not.toContain('Archived')
  })

  it('keeps what a call says about its lifetime, whatever its tone', () => {
    const store = createToastStore()
    store.toast.danger('Brief', { durationMs: 8000 })
    store.toast.success('Kept', { retained: true })
    expect(store.get().map((record) => [record.title, record.retained, record.durationMs])).toEqual(
      [
        ['Brief', undefined, 8000],
        ['Kept', true, TOAST_DEFAULT_DURATION_MS],
      ],
    )
  })

  it('never evicts a danger or warning toast for newer ones', () => {
    const store = createToastStore()
    store.toast.danger('Failed')
    for (let index = 1; index <= TOAST_MAX_VISIBLE; index += 1) store.toast.success(`${index}`)
    expect(store.get().map((record) => record.title)).toEqual(['Failed', '2', '3', '4'])
  })

  it('updates a live toast in place, at its position, with the next revision', () => {
    const store = createToastStore()
    store.toast({ id: 'a', title: 'Exporting 0 of 3' })
    store.toast({ title: 'Other' })
    store.toast({ id: 'a', title: 'Export ready', tone: 'success' })
    expect(store.get().map((record) => [record.id, record.title, record.revision])).toEqual([
      ['a', 'Export ready', 1],
      [expect.any(String), 'Other', 0],
    ])
  })

  it('keeps a toast’s raise through an update, and renews it when the id is raised again', () => {
    const store = createToastStore()
    store.toast({ id: 'a', title: 'Check your input' })
    const raised = store.get()[0]?.raised
    store.toast({ id: 'a', title: 'Check your input' })
    expect(store.get()[0]?.raised).toBe(raised)
    store.remove('a')
    store.toast({ id: 'a', title: 'Check your input' })
    expect(store.get()[0]?.raised).not.toBe(raised)
  })

  it('evicts the oldest transient toast past the cap, and never a retained one', () => {
    const store = createToastStore()
    store.toast({ title: 'Kept', retained: true, durationMs: Infinity })
    for (let index = 1; index <= TOAST_MAX_VISIBLE; index += 1) store.toast({ title: `${index}` })
    expect(store.get().map((record) => record.title)).toEqual(['Kept', '2', '3', '4'])
  })

  it('dismisses in two steps: closing first, removed when the card asks', () => {
    const store = createToastStore()
    const id = store.toast.success('Archived')
    store.toast.dismiss(id)
    expect(store.get()[0]).toMatchObject({ id, tone: 'success', closing: true })
    store.remove(id)
    expect(store.get()).toEqual([])
  })

  it('tells the owner once when its toast is dismissed, and not when the owner removes it', () => {
    const store = createToastStore()
    const dismissed: string[] = []
    const note = (title: string) => () => dismissed.push(title)
    const closed = store.toast({ title: 'Closed', onDismiss: note('Closed') })
    const removed = store.toast({ title: 'Removed', onDismiss: note('Removed') })
    store.toast.dismiss(closed)
    store.toast.dismiss(closed)
    store.remove(closed)
    store.remove(removed)
    expect(dismissed).toEqual(['Closed'])

    store.toast({ id: 'a', title: 'Updated', onDismiss: note('first') })
    store.toast({ id: 'a', title: 'Updated', onDismiss: note('second') })
    store.toast({ title: 'Other', onDismiss: note('Other') })
    store.toast.dismiss()
    expect(dismissed).toEqual(['Closed', 'second', 'Other'])
  })

  it('tells the owner of a toast that a newer one evicted', () => {
    const store = createToastStore()
    const evicted: string[] = []
    for (let index = 1; index <= TOAST_MAX_VISIBLE + 1; index += 1)
      store.toast({ title: `${index}`, onDismiss: () => evicted.push(`${index}`) })
    expect(evicted).toEqual(['1'])
    expect(store.get().map((record) => record.title)).toEqual(['2', '3', '4', '5'])
  })

  it('settles a promise in place: pinned while loading, then the settled tone', async () => {
    const store = createToastStore()
    let settle: () => void = () => undefined
    const id = store.toast.promise(new Promise<void>((resolve) => (settle = resolve)), {
      loading: 'Archiving…',
      success: 'Archived',
      error: 'Could not archive',
    })
    expect(store.get()[0]).toMatchObject({ id, loading: true, durationMs: Infinity })
    settle()
    await Promise.resolve()
    await Promise.resolve()
    expect(store.get()).toEqual([
      expect.objectContaining({ id, title: 'Archived', tone: 'success', revision: 1 }),
    ])
    expect(store.get()[0]?.loading).toBeUndefined()
  })
})
