import {
  createComputed,
  createEffect,
  createRoot,
  createSignal,
  Show,
  type Accessor,
  type JSX,
} from 'solid-js'
import { hydrate } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'
import {
  DATA_ATTRS,
  themeVersion,
  useDirection,
  useThemeValues,
  type ThemeValues,
} from '@polymorph/solid'

import { mount } from '../mount'

/**
 * `useThemeValues`: the engine's reading of the theme, kept current for a
 * Solid component that hands it to another library.
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
    function Probe() {
      const theme = useThemeValues()
      createEffect(() => readings.push(`${theme().mode} ${theme().color('bg.app')}`))
      return <span />
    }
    await mount(() => <Probe />)
    expect(readings.at(-1)).toMatch(/^light #[0-9a-f]{6}$/)
    const before = readings.length

    root.setAttribute(DATA_ATTRS.mode, 'dark')
    await vi.waitFor(() => expect(readings.length).toBeGreaterThan(before))
    expect(readings.at(-1)).toMatch(/^dark #[0-9a-f]{6}$/)
  })

  it('reads from the element it is given, so a scope around it is seen', async () => {
    const modes: string[] = []
    function Probe() {
      let element: HTMLSpanElement | undefined
      const theme = useThemeValues(() => element)
      createEffect(() => modes.push(theme().mode))
      return (
        <div {...{ [DATA_ATTRS.tone]: 'inverse' }}>
          <span ref={element} />
        </div>
      )
    }
    await mount(() => <Probe />)
    await vi.waitFor(() => expect(modes.at(-1)).toBe('dark'))
  })

  it('reads the document root’s values once the element it was given has left the document', async () => {
    const [shown, setShown] = createSignal(true)
    const readings: Accessor<ThemeValues>[] = []
    function Probe() {
      let element: HTMLSpanElement | undefined
      readings.push(useThemeValues(() => element))
      return (
        <Show when={shown()}>
          <div {...{ [DATA_ATTRS.tone]: 'inverse' }}>
            <span ref={element} />
          </div>
        </Show>
      )
    }
    await mount(() => <Probe />)
    const theme = readings[0] as Accessor<ThemeValues>
    await vi.waitFor(() => expect(theme().mode).toBe('dark'))

    // Solid removes the element and leaves the variable holding it.
    setShown(false)
    expect(theme().themed).toBe(true)
    expect(theme().mode).toBe('light')
  })

  it('keeps one reading through a member’s own tone', async () => {
    const modes: string[] = []
    function Probe() {
      const theme = useThemeValues()
      createEffect(() => modes.push(theme().mode))
      return <p {...{ [DATA_ATTRS.tone]: 'secondary' }} />
    }
    const { host } = await mount(() => <Probe />)
    const taken = modes.length
    host.querySelector('p')?.setAttribute(DATA_ATTRS.tone, 'danger')
    await settled()
    expect(modes).toHaveLength(taken)
  })

  it('releases the engine’s listener when its owner is disposed', async () => {
    function Probe() {
      useThemeValues()
      return <span />
    }
    const { unmount } = await mount(() => <Probe />)
    expect(await engineFollows()).toBe(true)
    unmount()
    expect(await engineFollows()).toBe(false)
  })
})

describe('useThemeValues under a root with no component', () => {
  it('follows the theme, and releases the engine’s listener when the root is disposed', async () => {
    let dispose = () => {}
    const theme = createRoot((end) => {
      dispose = end
      return useThemeValues()
    })
    try {
      expect(theme().mode).toBe('light')
      expect(await engineFollows()).toBe(true)
      root.setAttribute(DATA_ATTRS.mode, 'dark')
      await vi.waitFor(() => expect(theme().mode).toBe('dark'))
    } finally {
      dispose()
    }
    expect(await engineFollows()).toBe(false)
  })
})

describe('useThemeValues while Solid hydrates', () => {
  /** A component that records each reading's `themed`, from its first render on. */
  function recorder(seen: boolean[]) {
    return function Probe(): JSX.Element {
      const theme = useThemeValues()
      createComputed(() => seen.push(theme().themed))
      return null
    }
  }

  it('reads the server’s empty values while it hydrates, and the document’s once mounted', async () => {
    // What Solid's `HydrationScript` defines on a page a server rendered.
    const script = globalThis as { _$HY?: object }
    script._$HY = { events: [], completed: new WeakSet(), r: {} }
    const host = document.createElement('div')
    document.body.append(host)
    const seen: boolean[] = []
    const Probe = recorder(seen)
    let dispose = () => {}
    try {
      dispose = hydrate(() => <Probe />, host)
      expect(seen[0]).toBe(false)
      await vi.waitFor(() => expect(seen.at(-1)).toBe(true))
    } finally {
      dispose()
      delete script._$HY
      host.remove()
    }
  })

  it('reads the document on the first render of a component mounted in the browser', async () => {
    const seen: boolean[] = []
    const Probe = recorder(seen)
    await mount(() => <Probe />)
    expect(seen[0]).toBe(true)
  })
})

// The last test in the file. Nothing can release the listener a call under no owner takes, so
// the engine follows the theme from here on, and a test after this one could not see a release.
describe('useThemeValues under no owner', () => {
  it('follows the theme, and gets Solid’s warning, as the foundation’s other hooks do', async () => {
    const warned: string[] = []
    const warn = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warned.push(String(args[0]))
    })
    try {
      useDirection()
      const fromSibling = warned.splice(0)
      expect(fromSibling.join('\n')).toContain('will never be disposed')

      const theme = useThemeValues()
      expect(warned).toEqual(fromSibling)
      expect(theme().mode).toBe('light')
      root.setAttribute(DATA_ATTRS.mode, 'dark')
      await vi.waitFor(() => expect(theme().mode).toBe('dark'))
    } finally {
      warn.mockRestore()
    }
  })
})
