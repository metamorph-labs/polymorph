import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSSRApp,
  defineComponent,
  effectScope,
  h,
  KeepAlive,
  nextTick,
  ref,
  render,
  watchEffect,
} from 'vue'
import { renderToString } from 'vue/server-renderer'

import { installTestTheme } from '@polymorph/engine/testing'
import {
  DATA_ATTRS,
  parseColor,
  readThemeValues,
  themeVersion,
  useDirection,
  useThemeValues,
} from '@polymorph/vue'

import { mount } from '../mount'

/**
 * `useThemeValues`: the engine's reading of the theme, kept current for a Vue
 * component that hands it to another library.
 */

const root = document.documentElement

/** Long enough for a mutation observer to have delivered what it saw. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 30))

/** Whether the engine holds a listener: its version grows on a change only while it does. */
async function engineFollows(): Promise<boolean> {
  const version = themeVersion()
  const next = root.getAttribute(DATA_ATTRS.density) === 'compact' ? 'comfortable' : 'compact'
  root.setAttribute(DATA_ATTRS.density, next)
  await settled()
  return themeVersion() !== version
}

beforeEach(() => {
  installTestTheme()
})

afterEach(() => {
  for (const attribute of Object.values(DATA_ATTRS)) root.removeAttribute(attribute)
})

describe('useThemeValues', () => {
  it('gives the document’s values, and a new reading when the mode changes', async () => {
    const readings: string[] = []
    const Probe = defineComponent({
      setup() {
        const theme = useThemeValues()
        watchEffect(() => readings.push(`${theme.value.mode} ${theme.value.color('bg.app')}`))
        return () => h('span')
      },
    })
    await mount(() => h(Probe))
    expect(readings.at(-1)).toMatch(/^light #[0-9a-f]{6}$/)
    const before = readings.length

    root.setAttribute(DATA_ATTRS.mode, 'dark')
    await vi.waitFor(() => expect(readings.length).toBeGreaterThan(before))
    expect(readings.at(-1)).toMatch(/^dark #[0-9a-f]{6}$/)
  })

  it('reads from the element its ref holds, so a scope around it is seen', async () => {
    let inverse = ''
    let mode = ''
    const Probe = defineComponent({
      setup() {
        const element = ref<HTMLElement | null>(null)
        const theme = useThemeValues(element)
        watchEffect(() => {
          inverse = theme.value.color('bg.surface')
          mode = theme.value.mode
        })
        return () => h('div', { [DATA_ATTRS.tone]: 'inverse' }, [h('span', { ref: element })])
      },
    })
    await mount(() => h(Probe))
    await vi.waitFor(() => expect(mode).toBe('dark'))
    expect(inverse).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('keeps one reading through a member’s own tone', async () => {
    const readings: string[] = []
    const Probe = defineComponent({
      setup() {
        const theme = useThemeValues()
        watchEffect(() => readings.push(theme.value.mode))
        return () => h('p', { [DATA_ATTRS.tone]: 'secondary' })
      },
    })
    const { host } = await mount(() => h(Probe))
    const taken = readings.length
    host.querySelector('p')?.setAttribute(DATA_ATTRS.tone, 'danger')
    await settled()
    expect(readings).toHaveLength(taken)
  })

  it('releases the engine’s listener when its component unmounts', async () => {
    const Probe = defineComponent({
      setup() {
        useThemeValues()
        return () => h('span')
      },
    })
    const { unmount } = await mount(() => h(Probe))
    expect(await engineFollows()).toBe(true)
    unmount()
    // The component's effects end with it whatever the hook does. Only its release ends the listener.
    expect(await engineFollows()).toBe(false)
  })
})

describe('useThemeValues in a component that is drawn more than once', () => {
  /** A component that records `themed` at each render, so the first render of each mount is seen. */
  function recorder(seen: boolean[]) {
    return defineComponent({
      setup() {
        const theme = useThemeValues()
        return () => {
          seen.push(theme.value.themed)
          return h('span', { 'data-mode-read': theme.value.mode })
        }
      },
    })
  }

  it('reads the document on the first render when a condition draws it again', async () => {
    const seen: boolean[] = []
    const Recorder = recorder(seen)
    const shown = ref(true)
    await mount(() => (shown.value ? h(Recorder) : null))
    shown.value = false
    await nextTick()
    const before = seen.length
    shown.value = true
    await nextTick()
    expect(seen.length).toBeGreaterThan(before)
    expect(seen[before]).toBe(true)
  })

  it('reads the document on the first render when one vnode is mounted a second time', async () => {
    const seen: boolean[] = []
    const Recorder = recorder(seen)
    // A vnode that is kept and drawn again still holds the element of its first mount.
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
  })

  it('reads the document on the first render when `render` mounts one vnode twice', () => {
    const seen: boolean[] = []
    const vnode = h(recorder(seen))
    const host = document.createElement('div')
    document.body.append(host)
    try {
      render(vnode, host)
      render(null, host)
      const before = seen.length
      render(vnode, host)
      expect(seen.length).toBeGreaterThan(before)
      expect(seen[before]).toBe(true)
    } finally {
      render(null, host)
      host.remove()
    }
  })

  it('is set up once under KeepAlive, and is current when it is shown again', async () => {
    const seen: boolean[] = []
    const Recorder = recorder(seen)
    const shown = ref(true)
    const { host } = await mount(() =>
      h(KeepAlive, null, { default: () => (shown.value ? h(Recorder) : null) }),
    )
    shown.value = false
    await nextTick()
    root.setAttribute(DATA_ATTRS.mode, 'dark')
    await settled()
    shown.value = true
    await nextTick()
    const drawn = host.querySelector('[data-mode-read]')
    await vi.waitFor(() => expect(drawn?.getAttribute('data-mode-read')).toBe('dark'))
    expect(seen.every(Boolean)).toBe(true)
  })
})

describe('useThemeValues outside a component', () => {
  it('follows the theme in an effect scope, and releases the engine’s listener when the scope stops', async () => {
    const scope = effectScope()
    const theme = scope.run(() => useThemeValues())
    try {
      expect(theme?.value.mode).toBe('light')
      expect(await engineFollows()).toBe(true)
      root.setAttribute(DATA_ATTRS.mode, 'dark')
      await vi.waitFor(() => expect(theme?.value.mode).toBe('dark'))
    } finally {
      scope.stop()
    }
    expect(await engineFollows()).toBe(false)
  })

  it('gets Vue’s warning and one reading outside a component and a scope, as the foundation’s other hooks do', async () => {
    const warned: string[] = []
    const warn = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warned.push(String(args[0]))
    })
    try {
      useDirection()
      const fromSibling = warned.splice(0)
      expect(fromSibling.join('\n')).toContain('onMounted is called when there is no active')

      const theme = useThemeValues()
      expect(warned).toEqual(fromSibling)
      // Nothing mounts, so nothing follows the theme: the reading is the one taken at the call.
      expect(theme.value.mode).toBe('light')
      expect(await engineFollows()).toBe(false)
      root.setAttribute(DATA_ATTRS.mode, 'dark')
      await settled()
      expect(theme.value.mode).toBe('light')
    } finally {
      warn.mockRestore()
    }
  })
})

describe('useThemeValues on a server and while Vue hydrates', () => {
  /** A component that reads a value while it renders, as a `style` on what it hosts. */
  const Bordered = defineComponent({
    setup() {
      const theme = useThemeValues()
      return () =>
        h('div', {
          'data-probe': String(theme.value.themed),
          style: { height: '4px', borderColor: theme.value.color('border.subtle') },
        })
    },
  })

  it('hydrates the server’s empty values, and renders the document’s once mounted', async () => {
    // A server has no document. Here no pairing reaches the document while it renders, which reads the same.
    root.removeAttribute(DATA_ATTRS.system)
    const html = await renderToString(createSSRApp(Bordered))
    installTestTheme()
    // Vue's server renderer writes the property with the empty value it was given.
    expect(html).toBe('<div data-probe="false" style="height:4px;border-color:;"></div>')

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
      const element = host.querySelector('[data-probe]') as HTMLElement
      const app = createSSRApp(Bordered)
      app.mount(host)
      expect(mismatches).toEqual([])
      await vi.waitFor(() => expect(element.getAttribute('data-probe')).toBe('true'))
      expect(parseColor(element.style.borderColor)).toEqual(
        parseColor(readThemeValues().color('border.subtle')),
      )
      app.unmount()
    } finally {
      warn.mockRestore()
      error.mockRestore()
      host.remove()
    }
  })

  it('reads the document on the first render of a component mounted in the browser', async () => {
    const seen: boolean[] = []
    const Recorder = defineComponent({
      setup() {
        const theme = useThemeValues()
        return () => {
          seen.push(theme.value.themed)
          return h('span')
        }
      },
    })
    await mount(() => h(Recorder))
    expect(seen[0]).toBe(true)
  })
})
