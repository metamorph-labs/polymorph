import { createSignal } from 'solid-js'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { toastFocusLaw } from '@polymorph/conformance/toast-focus'
import { toastSwipeLaw } from '@polymorph/conformance/toast-swipe'
import { installTestTheme } from '@polymorph/engine/testing'
import { getToasts, removeToast, toast, TOAST_DEFAULT_DURATION_MS } from '@polymorph/solid'

import FormField from '../controls/FormField'
import Input from '../controls/Input'
import { mount } from '../mount'
import { Toast } from '../index'

/**
 * Toast in Solid: the viewport follows the foundation's store, a card times
 * out, dismisses and acts as React's do, F8 moves focus to the list, a
 * declared Toast shows while it is mounted with its content, and FormField's
 * toast presentation raises its message there.
 */

beforeAll(installTestTheme)

afterEach(() => {
  for (const record of getToasts()) removeToast(record.id)
})

const cards = () => [...document.querySelectorAll<HTMLElement>('[data-member="toast"]')]
const list = () => document.querySelector<HTMLElement>('[data-toast-part="list"]')

toastFocusLaw({
  shell: 'Solid',
  mount: () => mount(() => <Toast.Viewport />),
  raise: (options) => toast({ durationMs: Number.POSITIVE_INFINITY, ...options }),
  remove: (id) => removeToast(id),
  clear: () => getToasts().forEach((record) => removeToast(record.id)),
})

toastSwipeLaw({
  shell: 'Solid',
  mount: () => mount(() => <Toast.Viewport />),
  raise: (title) => void toast({ title, durationMs: Number.POSITIVE_INFINITY }),
  held: () => getToasts().length,
  clear: () => getToasts().forEach((record) => removeToast(record.id)),
})

describe('the viewport', () => {
  it('draws a raised toast, and removes it once its time is up and its exit has played', async () => {
    await mount(() => <Toast.Viewport />)
    toast.success('Ticket archived', { description: 'Moved to the archive.', durationMs: 60 })
    await vi.waitFor(() => expect(cards()).toHaveLength(1))
    const card = cards()[0] as HTMLElement
    expect(card.dataset['tone']).toBe('success')
    expect(card.textContent).toContain('Ticket archived')
    expect(card.textContent).toContain('Moved to the archive.')
    await vi.waitFor(() => expect(getToasts()).toHaveLength(0), { timeout: 3000 })
    await vi.waitFor(() => expect(cards()).toHaveLength(0))
  })

  it('dismisses from its close button, and runs an action before dismissing', async () => {
    const undo = vi.fn()
    await mount(() => <Toast.Viewport />)
    toast({ title: 'Pinned', durationMs: Number.POSITIVE_INFINITY })
    toast({ title: 'Archived', action: { label: 'Undo', onClick: undo }, durationMs: Infinity })
    await vi.waitFor(() => expect(cards()).toHaveLength(2))
    await userEvent.click(cards()[1]?.querySelector('button') as HTMLElement)
    expect(undo).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(getToasts().map((record) => record.title)).toEqual(['Pinned']), {
      timeout: 3000,
    })
    await userEvent.click(cards()[0]?.querySelector('button[aria-label="Dismiss"]') as HTMLElement)
    await vi.waitFor(() => expect(getToasts()).toHaveLength(0), { timeout: 3000 })
  })

  it('keeps a toast the reader cannot dismiss: no close button, no timeout', async () => {
    await mount(() => <Toast.Viewport />)
    toast({ title: 'Retry required', dismissible: false, durationMs: 30 })
    await vi.waitFor(() => expect(cards()).toHaveLength(1))
    expect(cards()[0]?.querySelector('button')).toBeNull()
    await new Promise((settle) => setTimeout(settle, 150))
    expect(getToasts()).toHaveLength(1)
  })

  it('moves focus to the list on F8', async () => {
    await mount(() => <Toast.Viewport />)
    await userEvent.keyboard('{F8}')
    expect(document.activeElement).toBe(list())
  })
})

describe('a declared Toast', () => {
  it('shows while it is mounted, with its content, and is removed when it unmounts', async () => {
    const [shown, setShown] = createSignal(true)
    await mount(() => (
      <>
        {shown() ? (
          <Toast
            title="Export ready"
            durationMs={Number.POSITIVE_INFINITY}
            content={<p>Three files.</p>}
          />
        ) : null}
        <Toast.Viewport />
      </>
    ))
    await vi.waitFor(() => expect(cards()).toHaveLength(1))
    expect(cards()[0]?.textContent).toContain('Three files.')
    setShown(false)
    await vi.waitFor(() => expect(getToasts()).toHaveLength(0))
  })

  it('calls onDismiss when the reader closes it, and not when it unmounts', async () => {
    const [shown, setShown] = createSignal(true)
    const closed = vi.fn()
    const removed = vi.fn()
    await mount(() => (
      <>
        <Toast title="Saved" durationMs={Number.POSITIVE_INFINITY} onDismiss={closed} />
        {shown() ? (
          <Toast title="Syncing" durationMs={Number.POSITIVE_INFINITY} onDismiss={removed} />
        ) : null}
        <Toast.Viewport />
      </>
    ))
    await vi.waitFor(() => expect(cards()).toHaveLength(2))
    await userEvent.click(
      cards()
        .find((card) => card.textContent?.includes('Saved'))
        ?.querySelector('button[aria-label="Dismiss"]') as HTMLElement,
    )
    await vi.waitFor(() => expect(cards()).toHaveLength(1))
    expect(closed).toHaveBeenCalledTimes(1)
    setShown(false)
    await vi.waitFor(() => expect(getToasts()).toHaveLength(0))
    expect(removed).not.toHaveBeenCalled()
  })

  it('takes its tone’s lifetime, as React’s ToastNotice does, unless it sets one', async () => {
    await mount(() => (
      <>
        <Toast title="Failed" tone="danger" />
        <Toast title="Saved" tone="success" />
        <Toast title="Brief" tone="warning" durationMs={8000} />
        <Toast.Viewport />
      </>
    ))
    await vi.waitFor(() => expect(getToasts()).toHaveLength(3))
    const lifetime = (title: string) => {
      const record = getToasts().find((each) => each.title === title)
      return [record?.retained, record?.durationMs]
    }
    expect(lifetime('Failed')).toEqual([true, Infinity])
    expect(lifetime('Saved')).toEqual([false, TOAST_DEFAULT_DURATION_MS])
    expect(lifetime('Brief')).toEqual([undefined, 8000])
  })

  it('warns in development when no viewport is mounted to draw it', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const drawn = await mount(() => (
        <>
          <Toast title="Drawn" />
          <Toast.Viewport />
        </>
      ))
      await new Promise((settle) => setTimeout(settle, 50))
      expect(warned).not.toHaveBeenCalled()
      drawn.unmount()

      await mount(() => <Toast title="Orphaned" />)
      await vi.waitFor(() => expect(warned).toHaveBeenCalledTimes(1))
      expect(String(warned.mock.calls[0]?.[0])).toContain('Toast "Orphaned"')
    } finally {
      warned.mockRestore()
    }
  })
})

describe('FormField with its error as a toast', () => {
  it('raises its message in the viewport, draws none inline, and removes it once valid', async () => {
    const [error, setError] = createSignal<string | undefined>('A subject is required.')
    await mount(() => (
      <div>
        <FormField label="Subject" error={error()} errorPresentation="toast">
          <Input />
        </FormField>
        <Toast.Viewport />
      </div>
    ))
    await vi.waitFor(() => expect(cards()).toHaveLength(1))
    expect(cards()[0]?.dataset['tone']).toBe('danger')
    expect(cards()[0]?.textContent).toContain('Subject')
    expect(cards()[0]?.textContent).toContain('A subject is required.')
    const field = document.querySelector('[data-member="form-field"]') as HTMLElement
    expect(field.hasAttribute('data-invalid')).toBe(true)
    expect(field.querySelector('[role="alert"], p[id$="-error"]')).toBeNull()
    setError(undefined)
    await vi.waitFor(() => expect(getToasts()).toHaveLength(0))
  })
})
