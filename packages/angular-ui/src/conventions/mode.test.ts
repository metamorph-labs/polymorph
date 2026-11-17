import { Component } from '@angular/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DATA_ATTRS, setMode, STORAGE_KEYS, teardownTheme, useMode } from '@polymorph/angular'

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

  it('throws outside an injection context', () => {
    expect(() => useMode()).toThrow(/injection context/)
  })
})
