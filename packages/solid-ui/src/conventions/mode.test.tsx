import { createComputed, type JSX } from 'solid-js'
import { hydrate } from 'solid-js/web'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DATA_ATTRS,
  setMode,
  STORAGE_KEYS,
  teardownTheme,
  useMode,
  type ModeReading,
} from '@polymorph/solid'

import { mount } from '../mount'

/**
 * `useMode`: the document's colour mode preference and the mode it resolves to,
 * kept current for a Solid component.
 */

const root = document.documentElement

afterEach(() => {
  teardownTheme()
  root.removeAttribute(DATA_ATTRS.mode)
  localStorage.removeItem(STORAGE_KEYS.mode)
})

/** A component that records each reading, from its first render on. */
function recorder(seen: ModeReading[]) {
  return function Probe(): JSX.Element {
    const reading = useMode()
    createComputed(() => seen.push(reading()))
    return null
  }
}

describe('useMode', () => {
  it('reads the document at once, and again after a setMode from any caller', async () => {
    setMode('light')
    const seen: ModeReading[] = []
    const Probe = recorder(seen)
    await mount(() => <Probe />)
    expect(seen[0]).toEqual({ preference: 'light', mode: 'light' })

    setMode('dark')
    expect(seen.at(-1)).toEqual({ preference: 'dark', mode: 'dark' })
  })
})

describe('useMode while Solid hydrates', () => {
  it('reads system and light while it hydrates, and the stored choice once mounted', async () => {
    // What the pre-paint script leaves for a reader who chose dark on an earlier visit.
    localStorage.setItem(STORAGE_KEYS.mode, 'dark')
    root.setAttribute(DATA_ATTRS.mode, 'dark')
    // What Solid's `HydrationScript` defines on a page a server rendered.
    const script = globalThis as { _$HY?: object }
    script._$HY = { events: [], completed: new WeakSet(), r: {} }
    const host = document.createElement('div')
    document.body.append(host)
    const seen: ModeReading[] = []
    const Probe = recorder(seen)
    let dispose = () => {}
    try {
      dispose = hydrate(() => <Probe />, host)
      expect(seen[0]).toEqual({ preference: 'system', mode: 'light' })
      await vi.waitFor(() => expect(seen.at(-1)).toEqual({ preference: 'dark', mode: 'dark' }))
    } finally {
      dispose()
      delete script._$HY
      host.remove()
    }
  })
})
