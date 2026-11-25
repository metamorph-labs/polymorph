import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import { toastFocusLaw } from '@polymorph/conformance/toast-focus'
import { toastSwipeLaw } from '@polymorph/conformance/toast-swipe'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { getToasts, removeToast, toast, TOAST_DEFAULT_DURATION_MS } from '@polymorph/vue'

import FormField from '../controls/FormField.vue'
import Input from '../controls/Input.vue'
import { mount } from '../mount'
import { Toast } from '../index'

/**
 * Toast in Vue: the viewport follows the foundation's store, a card times out,
 * dismisses and acts as React's do, F8 moves focus to the list, a declared
 * Toast shows while it is mounted with its content, and FormField's toast
 * presentation raises its message there.
 */

beforeAll(installTestTheme)

afterEach(() => {
  for (const record of getToasts()) removeToast(record.id)
})

const cards = () => [...document.querySelectorAll<HTMLElement>('[data-member="toast"]')]
const list = () => document.querySelector<HTMLElement>('[data-toast-part="list"]')

toastFocusLaw({
  shell: 'Vue',
  mount: () => mount(() => h(Toast.Viewport)),
  raise: (options) => toast({ durationMs: Number.POSITIVE_INFINITY, ...options }),
  remove: (id) => removeToast(id),
  clear: () => getToasts().forEach((record) => removeToast(record.id)),
})

toastSwipeLaw({
  shell: 'Vue',
  mount: () => mount(() => h(Toast.Viewport)),
  raise: (title) => void toast({ title, durationMs: Number.POSITIVE_INFINITY }),
  held: () => getToasts().length,
  clear: () => getToasts().forEach((record) => removeToast(record.id)),
})

describe('the viewport', () => {
  it('draws a raised toast, and removes it once its time is up and its exit has played', async () => {
    await mount(() => h(Toast.Viewport))
    toast.success('Ticket archived', { description: 'Moved to the archive.', durationMs: 60 })
    await vi.waitFor(() => expect(cards()).toHaveLength(1))
    const card = cards()[0] as HTMLElement
    expect(card.dataset.tone).toBe('success')
    expect(card.textContent).toContain('Ticket archived')
    expect(card.textContent).toContain('Moved to the archive.')
    await vi.waitFor(() => expect(getToasts()).toHaveLength(0), { timeout: 3000 })
    await vi.waitFor(() => expect(cards()).toHaveLength(0))
  })

  it('dismisses from its close button, and runs an action before dismissing', async () => {
    const undo = vi.fn()
    await mount(() => h(Toast.Viewport))
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

  it('moves the card with the finger while it is dragged', async () => {
    await mount(() => h(Toast.Viewport))
    toast({ title: 'Dragged', durationMs: Number.POSITIVE_INFINITY })
    await vi.waitFor(() => expect(cards()).toHaveLength(1))
    const card = cards()[0] as HTMLElement
    // After the enter, when the engine has left its last `translate` inline.
    await Promise.all(card.getAnimations().map((animation) => animation.finished))
    const rest = card.getBoundingClientRect().x

    const pointer = (type: string, clientX: number) =>
      card.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, clientX, clientY: 0 }))
    pointer('pointerdown', 0)
    pointer('pointermove', 40)
    await vi.waitFor(() => expect(card.dataset.swipe).toBe('move'))
    // The card is drawn where the finger is, not where the enter left it.
    await vi.waitFor(() => expect(Math.round(card.getBoundingClientRect().x - rest)).toBe(40))

    // Short of the threshold, it returns to rest and stays.
    pointer('pointerup', 40)
    await vi.waitFor(() => expect(card.dataset.swipe).toBe('cancel'))
    await vi.waitFor(() => expect(Math.round(card.getBoundingClientRect().x - rest)).toBe(0))
    expect(getToasts()).toHaveLength(1)
  })

  it('keeps a toast the reader cannot dismiss: no close button, no timeout', async () => {
    await mount(() => h(Toast.Viewport))
    toast({ title: 'Retry required', dismissible: false, durationMs: 30 })
    await vi.waitFor(() => expect(cards()).toHaveLength(1))
    expect(cards()[0]?.querySelector('button')).toBeNull()
    await new Promise((settle) => setTimeout(settle, 150))
    expect(getToasts()).toHaveLength(1)
  })

  it('moves focus to the list on F8', async () => {
    await mount(() => h(Toast.Viewport))
    await userEvent.keyboard('{F8}')
    expect(document.activeElement).toBe(list())
  })
})

describe('a declared Toast', () => {
  it('shows while it is mounted, with its content, and is removed when it unmounts', async () => {
    const shown = ref(true)
    const App = defineComponent({
      setup: () => () => [
        shown.value
          ? h(
              Toast,
              { title: 'Export ready', durationMs: Number.POSITIVE_INFINITY },
              { content: () => [h('p', 'Three files.')] },
            )
          : null,
        h(Toast.Viewport),
      ],
    })
    await mount(() => h(App))
    await vi.waitFor(() => expect(cards()).toHaveLength(1))
    expect(cards()[0]?.textContent).toContain('Three files.')
    // The content is said with the toast.
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-live="polite"]')?.textContent?.trim()).toBe(
        'Notification Export ready Three files.',
      ),
    )
    shown.value = false
    await vi.waitFor(() => expect(getToasts()).toHaveLength(0))
  })

  it('emits dismiss when the reader closes it, and not when it unmounts', async () => {
    const shown = ref(true)
    const closed = vi.fn()
    const removed = vi.fn()
    const App = defineComponent({
      setup: () => () => [
        h(Toast, { title: 'Saved', durationMs: Number.POSITIVE_INFINITY, onDismiss: closed }),
        shown.value
          ? h(Toast, { title: 'Syncing', durationMs: Number.POSITIVE_INFINITY, onDismiss: removed })
          : null,
        h(Toast.Viewport),
      ],
    })
    await mount(() => h(App))
    await vi.waitFor(() => expect(cards()).toHaveLength(2))
    await userEvent.click(
      cards()
        .find((card) => card.textContent?.includes('Saved'))
        ?.querySelector('button[aria-label="Dismiss"]') as HTMLElement,
    )
    await vi.waitFor(() => expect(cards()).toHaveLength(1))
    expect(closed).toHaveBeenCalledTimes(1)
    shown.value = false
    await vi.waitFor(() => expect(getToasts()).toHaveLength(0))
    expect(removed).not.toHaveBeenCalled()
  })

  it('takes its tone’s lifetime, as React’s ToastNotice does, unless it sets one', async () => {
    await mount(() =>
      h('div', [
        h(Toast, { title: 'Failed', tone: 'danger' }),
        h(Toast, { title: 'Saved', tone: 'success' }),
        h(Toast, { title: 'Brief', tone: 'warning', durationMs: 8000 }),
        h(Toast.Viewport),
      ]),
    )
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
      const drawn = await mount(() => h('div', [h(Toast, { title: 'Drawn' }), h(Toast.Viewport)]))
      await new Promise((settle) => setTimeout(settle, 50))
      expect(warned).not.toHaveBeenCalled()
      drawn.unmount()

      await mount(() => h(Toast, { title: 'Orphaned' }))
      await vi.waitFor(() => expect(warned).toHaveBeenCalledTimes(1))
      expect(String(warned.mock.calls[0]?.[0])).toContain('Toast "Orphaned"')
    } finally {
      warned.mockRestore()
    }
  })
})

describe('FormField with its error as a toast', () => {
  it('raises its message in the viewport, draws none inline, and removes it once valid', async () => {
    const error = ref<string | undefined>('A subject is required.')
    await mount(() =>
      h('div', [
        h(
          FormField,
          { label: 'Subject', error: error.value, errorPresentation: 'toast' },
          { default: () => [h(Input)] },
        ),
        h(Toast.Viewport),
      ]),
    )
    await vi.waitFor(() => expect(cards()).toHaveLength(1))
    expect(cards()[0]?.dataset.tone).toBe('danger')
    expect(cards()[0]?.textContent).toContain('Subject')
    expect(cards()[0]?.textContent).toContain('A subject is required.')
    const field = document.querySelector('[data-member="form-field"]') as HTMLElement
    expect(field.hasAttribute('data-invalid')).toBe(true)
    expect(field.querySelector('[role="alert"], p[id$="-error"]')).toBeNull()
    error.value = undefined
    await vi.waitFor(() => expect(getToasts()).toHaveLength(0))
  })
})

/**
 * An agent reads the notices on screen and answers them through the store, as the React
 * viewport's tests hold it (`design/components/toast.md`, Agent). The viewport is one Toast, and
 * the cards' own Buttons are not listed beside it.
 */
describe('an agent', () => {
  it('reads the notices, and dismisses one and acts on another through the store', async () => {
    const calls: string[] = []
    await mount(() => h(Toast.Viewport))
    const archived = toast.success('Ticket archived', {
      action: { label: 'Undo', onClick: () => calls.push('undo') },
      durationMs: Number.POSITIVE_INFINITY,
      onDismiss: () => calls.push('archived left'),
    })
    const assigned = toast({
      title: 'Ticket assigned',
      description: 'Sent to the triage queue.',
      durationMs: Number.POSITIVE_INFINITY,
      onDismiss: () => calls.push('assigned left'),
    })
    await vi.waitFor(() => expect(cards()).toHaveLength(2))
    const bridge = createAgentBridge()
    try {
      const members = bridge.snapshot().members
      expect(members.map((member) => member.member)).toEqual(['Toast'])
      expect(members[0]).toMatchObject({
        name: 'Notifications (F8)',
        state: {
          notices: [
            { id: archived, label: 'Ticket archived' },
            { id: assigned, label: 'Ticket assigned' },
          ],
          details: [
            {
              id: archived,
              title: 'Ticket archived',
              tone: 'success',
              action: 'Undo',
              dismissible: true,
            },
            {
              id: assigned,
              title: 'Ticket assigned',
              description: 'Sent to the triage queue.',
              tone: 'neutral',
              dismissible: true,
            },
          ],
        },
      })
      const { results } = await bridge.act([
        { id: members[0]?.id, action: 'act', value: archived },
        { id: members[0]?.id, action: 'dismiss', value: assigned },
      ])
      expect(results).toMatchObject([{ ok: true }, { ok: true }])
      expect(calls).toEqual(['undo', 'archived left', 'assigned left'])
    } finally {
      bridge.dispose()
    }
  })
})
