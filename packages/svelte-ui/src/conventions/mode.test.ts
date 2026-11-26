import { flushSync } from 'svelte'
import { afterEach, describe, expect, it } from 'vitest'

import { DATA_ATTRS, hydrateTheme, setMode, STORAGE_KEYS, teardownTheme } from '@polymorph/svelte'

import { render } from '../mount'
import ModeHarness from '../testing/ModeHarness.svelte'

/**
 * `useMode`: the document's colour mode preference and the mode it resolves to,
 * kept current for a Svelte component.
 */

const root = document.documentElement

afterEach(() => {
  teardownTheme()
  root.removeAttribute(DATA_ATTRS.mode)
  localStorage.removeItem(STORAGE_KEYS.mode)
})

const read = (within: ParentNode) => {
  const output = within.querySelector('output') as HTMLOutputElement
  return `${output.getAttribute('data-preference')}/${output.getAttribute('data-applied')}`
}

describe('useMode', () => {
  it('reads the document, and draws again after a setMode from any caller', async () => {
    setMode('light')
    const { host } = await render(ModeHarness, {})
    expect(read(host)).toBe('light/light')

    setMode('dark')
    flushSync()
    expect(read(host)).toBe('dark/dark')

    setMode('system')
    flushSync()
    expect(read(host)).toMatch(/^system\/(light|dark)$/)
  })
})

describe('useMode on a first visit', () => {
  it('reads the default hydration applied on its first render, under a system that opens dark', async () => {
    hydrateTheme('terminal', {
      systems: { terminal: 'petrol' },
      palettes: ['petrol'],
      modes: { terminal: 'dark' },
    })
    try {
      const { host } = await render(ModeHarness, {})
      expect(read(host)).toBe('dark/dark')
      expect(localStorage.getItem(STORAGE_KEYS.mode)).toBeNull()
    } finally {
      root.removeAttribute(DATA_ATTRS.system)
      root.removeAttribute(DATA_ATTRS.palette)
    }
  })
})
