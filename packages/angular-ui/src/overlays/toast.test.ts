import { Component, signal } from '@angular/core'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { toastFocusLaw } from '@polymorph/conformance/toast-focus'
import { toastSwipeLaw } from '@polymorph/conformance/toast-swipe'
import { toastTimerLaw } from '@polymorph/conformance/toast-timer'
import { installTestTheme } from '@polymorph/engine/testing'
import { getToasts, removeToast, toast, TOAST_DEFAULT_DURATION_MS } from '@polymorph/angular'

import { mountComponent } from '../mount'
import { Toast } from './Toast'
import { ToastViewport } from './ToastViewport'

/**
 * A declared Toast in the Angular shell (`design/components/toast.md`): it
 * emits `dismiss` when its toast leaves without it, as the store reports, and
 * not when it is removed from the template; it takes its tone's lifetime, as
 * React's ToastNotice does; and it warns in development when no viewport is
 * mounted to draw it.
 */

beforeAll(installTestTheme)

afterEach(() => {
  for (const record of getToasts()) removeToast(record.id)
  vi.restoreAllMocks()
})

const cards = () => [...document.querySelectorAll<HTMLElement>('[data-member="toast"]')]
const close = (title: string) =>
  cards()
    .find((card) => card.textContent?.includes(title))
    ?.querySelector<HTMLElement>('button[aria-label="Dismiss"]') as HTMLElement

/** Two declared toasts beside the viewport; the second shows while `shown` holds. */
@Component({
  selector: 'test-declared-toasts',
  imports: [Toast, ToastViewport],
  template: `<pm-toast title="Saved" [durationMs]="pinned" (dismiss)="closed()" />
    @if (shown()) {
      <pm-toast title="Syncing" [durationMs]="pinned" (dismiss)="removed()" />
    }
    <pm-toast-viewport />`,
})
class Declared {
  readonly pinned = Number.POSITIVE_INFINITY
  readonly shown = signal(true)
  readonly closed = vi.fn()
  readonly removed = vi.fn()
}

/** Three declared toasts of three tones beside the viewport; one sets its own duration. */
@Component({
  selector: 'test-toned-toasts',
  imports: [Toast, ToastViewport],
  template: `<pm-toast title="Failed" tone="danger" />
    <pm-toast title="Saved" tone="success" />
    <pm-toast title="Brief" tone="warning" [durationMs]="8000" />
    <pm-toast-viewport />`,
})
class Toned {}

/** A declared toast beside the viewport that draws it. */
@Component({
  selector: 'test-drawn-toast',
  imports: [Toast, ToastViewport],
  template: `<pm-toast title="Drawn" /> <pm-toast-viewport />`,
})
class Drawn {}

/** A declared toast with no viewport mounted anywhere. */
@Component({
  selector: 'test-orphaned-toast',
  imports: [Toast],
  template: `<pm-toast title="Orphaned" />`,
})
class Orphaned {}

toastFocusLaw({
  shell: 'Angular',
  mount: () => mountComponent(ToastViewport),
  raise: (options) => toast({ durationMs: Number.POSITIVE_INFINITY, ...options }),
  dismiss: (id) => toast.dismiss(id),
  remove: (id) => removeToast(id),
  clear: () => getToasts().forEach((record) => removeToast(record.id)),
})

toastSwipeLaw({
  shell: 'Angular',
  mount: () => mountComponent(ToastViewport),
  raise: (title) => void toast({ title, durationMs: Number.POSITIVE_INFINITY }),
  held: () => getToasts().length,
  clear: () => getToasts().forEach((record) => removeToast(record.id)),
})

toastTimerLaw({
  shell: 'Angular',
  mount: () => mountComponent(ToastViewport),
  raise: (title, durationMs) => void toast({ title, durationMs }),
  clear: () => getToasts().forEach((record) => removeToast(record.id)),
})

describe('a declared Toast', () => {
  it('emits dismiss when the reader closes it, and not when it is removed', async () => {
    const { ref } = await mountComponent(Declared)
    const declared = ref.instance as Declared
    await vi.waitFor(() => expect(cards()).toHaveLength(2))
    await userEvent.click(close('Saved'))
    await vi.waitFor(() => expect(cards()).toHaveLength(1))
    expect(declared.closed).toHaveBeenCalledTimes(1)
    declared.shown.set(false)
    await vi.waitFor(() => expect(getToasts()).toHaveLength(0))
    expect(declared.removed).not.toHaveBeenCalled()
  })

  it('takes its tone’s lifetime, as React’s ToastNotice does, unless it sets one', async () => {
    await mountComponent(Toned)
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
    const drawn = await mountComponent(Drawn)
    await new Promise((settle) => setTimeout(settle, 50))
    expect(warned).not.toHaveBeenCalled()
    drawn.unmount()

    await mountComponent(Orphaned)
    await vi.waitFor(() => expect(warned).toHaveBeenCalledTimes(1))
    expect(String(warned.mock.calls[0]?.[0])).toContain('Toast "Orphaned"')
  })
})
