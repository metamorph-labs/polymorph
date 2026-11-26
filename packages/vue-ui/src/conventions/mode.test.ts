import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, effectScope, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'

import {
  DATA_ATTRS,
  hydrateTheme,
  setMode,
  STORAGE_KEYS,
  teardownTheme,
  useMode,
} from '@polymorph/vue'

import { mount } from '../mount'

/**
 * `useMode`: the document's colour mode preference and the mode it resolves to,
 * kept current for a Vue component.
 */

const root = document.documentElement

afterEach(() => {
  teardownTheme()
  root.removeAttribute(DATA_ATTRS.mode)
  localStorage.removeItem(STORAGE_KEYS.mode)
})

const Probe = defineComponent({
  setup() {
    const reading = useMode()
    return () =>
      h('output', {
        'data-preference': reading.value.preference,
        'data-applied': reading.value.mode,
      })
  },
})

const read = (within: ParentNode) => {
  const output = within.querySelector('output') as HTMLOutputElement
  return `${output.getAttribute('data-preference')}/${output.getAttribute('data-applied')}`
}

describe('useMode', () => {
  it('reads the document, and renders again after a setMode from any caller', async () => {
    setMode('light')
    const { host } = await mount(() => h(Probe))
    expect(read(host)).toBe('light/light')

    setMode('dark')
    await nextTick()
    expect(read(host)).toBe('dark/dark')
  })

  it('follows from the call in an effect scope, until the scope stops', () => {
    setMode('light')
    const scope = effectScope()
    const reading = scope.run(() => useMode())
    setMode('dark')
    expect(reading?.value.preference).toBe('dark')
    scope.stop()
    setMode('system')
    expect(reading?.value.preference).toBe('dark')
  })
})

describe('useMode on a server and while Vue hydrates', () => {
  it('hydrates the server’s system and light with no mismatch, then renders the stored choice', async () => {
    const html = await renderToString(createSSRApp(Probe))
    expect(html).toBe('<output data-preference="system" data-applied="light"></output>')
    // What the pre-paint script leaves for a reader who chose dark on an earlier visit.
    localStorage.setItem(STORAGE_KEYS.mode, 'dark')
    root.setAttribute(DATA_ATTRS.mode, 'dark')
    await hydratesToDark(html)
  })

  it('hydrates with no mismatch on a first visit whose system opens dark, then renders it', async () => {
    const html = await renderToString(createSSRApp(Probe))
    expect(html).toBe('<output data-preference="system" data-applied="light"></output>')
    // What a first visit leaves: the pre-paint script painted the system's dark default, and
    // hydration applied it without storing it.
    hydrateTheme('terminal', {
      systems: { terminal: 'petrol' },
      palettes: ['petrol'],
      modes: { terminal: 'dark' },
    })
    try {
      await hydratesToDark(html)
      expect(localStorage.getItem(STORAGE_KEYS.mode)).toBeNull()
    } finally {
      root.removeAttribute(DATA_ATTRS.system)
      root.removeAttribute(DATA_ATTRS.palette)
    }
  })
})

/** Hydrates the server's markup and waits for the document's dark reading, with no mismatch. */
async function hydratesToDark(html: string): Promise<void> {
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
    await vi.waitFor(() => expect(read(host)).toBe('dark/dark'))
    app.unmount()
  } finally {
    warn.mockRestore()
    error.mockRestore()
    host.remove()
  }
}
