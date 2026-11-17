import { flushSync } from 'svelte'
import { afterEach, describe, expect, it } from 'vitest'

import { DATA_ATTRS, setMode, STORAGE_KEYS, teardownTheme } from '@polymorph/svelte'

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
