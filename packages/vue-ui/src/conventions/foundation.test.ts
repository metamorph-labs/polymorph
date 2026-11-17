import { page } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { computed, createSSRApp, defineComponent, h, nextTick, ref, type ShallowRef } from 'vue'
import { renderToString } from 'vue/server-renderer'

import { installTestTheme } from '@polymorph/engine/testing'
import {
  removeToast,
  slotNode,
  toast,
  useListening,
  useMediaQuery,
  useToasts,
  type ToastRecord,
} from '@polymorph/vue'

import { mount } from '../mount'

/**
 * The Vue foundation's conventions, where they differ from a plain reading of
 * Vue: what a member reads about its caller's listeners is reactive, a slot
 * drawn by another component keeps its elements across updates, and nothing
 * that reads the window or subscribes runs before a member mounts, so a
 * server render matches the first client render and holds nothing after it.
 */

beforeAll(installTestTheme)

describe('useListening', () => {
  it('reads a listener added or removed after the first render', async () => {
    const Probe = defineComponent({
      emits: ['select'],
      setup() {
        const listening = useListening()
        // Computed, as PromptInput's `attachable` and a chart's `selectable` are.
        const selectable = computed(() => listening.select === true)
        return () => h('span', { 'data-probe': '', 'data-selectable': String(selectable.value) })
      },
    })
    const listens = ref(false)
    await mount(() => h(Probe, listens.value ? { onSelect: () => undefined } : {}))
    const read = () => document.querySelector('[data-probe]')?.getAttribute('data-selectable')
    expect(read()).toBe('false')
    listens.value = true
    await nextTick()
    expect(read()).toBe('true')
    listens.value = false
    await nextTick()
    expect(read()).toBe('false')
  })
})

describe('slotNode', () => {
  it('keeps the elements a slot drew when the component drawing it updates', async () => {
    const count = ref(0)
    const Host = defineComponent({
      setup(_, { slots }) {
        return () => h('div', [h('span', String(count.value)), slotNode(slots.default)])
      },
    })
    await mount(() => h(Host, null, { default: () => h('input', { 'aria-label': 'Draft' }) }))
    const field = () => document.querySelector<HTMLInputElement>('input[aria-label="Draft"]')
    const first = field() as HTMLInputElement
    first.value = 'kept'
    count.value += 1
    await nextTick()
    expect(field()).toBe(first)
    expect(first.value).toBe('kept')
  })
})

describe('useMediaQuery', () => {
  const Probe = defineComponent({
    setup() {
      const phone = useMediaQuery('phone')
      return () => h('span', { 'data-phone': String(phone.value) })
    },
  })
  const read = () => document.querySelector('[data-phone]')?.getAttribute('data-phone')

  it('reads the query on the first render of a vnode that is mounted a second time', async () => {
    await page.viewport(375, 800)
    try {
      const seen: boolean[] = []
      const Recorder = defineComponent({
        setup() {
          const phone = useMediaQuery('phone')
          return () => {
            seen.push(phone.value)
            return h('span')
          }
        },
      })
      // A vnode that is kept still holds the element of its first mount. That is not a hydration.
      const kept = h(Recorder)
      const shown = ref(true)
      await mount(() => h('div', shown.value ? [kept] : []))
      shown.value = false
      await nextTick()
      const before = seen.length
      shown.value = true
      await nextTick()
      expect(seen.length).toBeGreaterThan(before)
      expect(seen[before]).toBe(true)
    } finally {
      await page.viewport(1280, 800)
    }
  })

  it('hydrates from the server’s `false`, and reads the query once mounted', async () => {
    // The server's markup, from a window the query does not match, as a server has none.
    const html = await renderToString(createSSRApp(Probe))
    expect(html).toContain('data-phone="false"')
    await page.viewport(375, 800)
    const mismatches: string[] = []
    const record = (...args: unknown[]) => {
      if (args.some((arg) => typeof arg === 'string' && arg.includes('Hydration')))
        mismatches.push(String(args[0]))
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(record)
    const error = vi.spyOn(console, 'error').mockImplementation(record)
    const host = document.createElement('div')
    try {
      host.innerHTML = html
      document.body.append(host)
      const app = createSSRApp(Probe)
      app.mount(host)
      expect(mismatches).toEqual([])
      await vi.waitFor(() => expect(read()).toBe('true'))
      app.unmount()
    } finally {
      warn.mockRestore()
      error.mockRestore()
      host.remove()
      await page.viewport(1280, 800)
    }
  })

  it('reads the query on the first render of a member mounted in the browser', async () => {
    await page.viewport(375, 800)
    try {
      const seen: boolean[] = []
      const Recorder = defineComponent({
        setup() {
          const phone = useMediaQuery('phone')
          return () => {
            seen.push(phone.value)
            return h('span')
          }
        },
      })
      await mount(() => h(Recorder))
      expect(seen[0]).toBe(true)
    } finally {
      await page.viewport(1280, 800)
    }
  })
})

describe('useToasts', () => {
  const follower = (into: { records?: Readonly<ShallowRef<readonly ToastRecord[]>> }) =>
    defineComponent({
      setup() {
        into.records = useToasts()
        return () => h('span')
      },
    })

  it('does not follow the store from a server render, which never ends', async () => {
    const into: { records?: Readonly<ShallowRef<readonly ToastRecord[]>> } = {}
    await renderToString(createSSRApp(follower(into)))
    const id = toast({ title: 'Raised after the render' })
    try {
      expect(into.records?.value.some((record) => record.id === id)).toBe(false)
    } finally {
      removeToast(id)
    }
  })

  it('follows the store once mounted', async () => {
    const into: { records?: Readonly<ShallowRef<readonly ToastRecord[]>> } = {}
    await mount(() => h(follower(into)))
    const id = toast({ title: 'Raised while mounted' })
    try {
      expect(into.records?.value.some((record) => record.id === id)).toBe(true)
    } finally {
      removeToast(id)
    }
  })
})
