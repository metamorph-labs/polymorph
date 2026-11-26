import { Component } from '@angular/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DATA_ATTRS,
  hydrateTheme,
  setMode,
  STORAGE_KEYS,
  teardownTheme,
  useMode,
} from '@polymorph/angular'

import { mountComponent } from '../mount'

/**
 * `useMode`: the document's colour mode preference and the mode it resolves to,
 * kept current for an Angular component.
 */

const root = document.documentElement

@Component({
  selector: 'mode-probe',
  template: `<output
    [attr.data-preference]="reading().preference"
    [attr.data-applied]="reading().mode"
  ></output>`,
})
class Probe {
  readonly reading = useMode()
}

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
    const { host } = await mountComponent(Probe)
    expect(read(host)).toBe('light/light')

    setMode('dark')
    await vi.waitFor(() => expect(read(host)).toBe('dark/dark'))
  })

  it('reads the default hydration applied on its first render, under a system that opens dark', async () => {
    hydrateTheme('terminal', {
      systems: { terminal: 'petrol' },
      palettes: ['petrol'],
      modes: { terminal: 'dark' },
    })
    try {
      const { host } = await mountComponent(Probe)
      expect(read(host)).toBe('dark/dark')
      expect(localStorage.getItem(STORAGE_KEYS.mode)).toBeNull()
    } finally {
      root.removeAttribute(DATA_ATTRS.system)
      root.removeAttribute(DATA_ATTRS.palette)
    }
  })

  it('throws outside an injection context', () => {
    expect(() => useMode()).toThrow(/injection context/)
  })
})
