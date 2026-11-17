import { Component, effect, type ElementRef, viewChild } from '@angular/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DATA_ATTRS, themeVersion, useThemeValues } from '@polymorph/angular'
import { installTestTheme } from '@polymorph/engine/testing'

import { mountComponent } from '../mount'

/**
 * `useThemeValues`: the engine's reading of the theme, kept current for an
 * Angular component that hands it to another library.
 */

const root = document.documentElement
const readings: string[] = []

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

@Component({
  selector: 'theme-probe',
  template: `<span></span>`,
})
class Probe {
  readonly theme = useThemeValues()

  constructor() {
    effect(() => readings.push(`${this.theme().mode} ${this.theme().color('bg.app')}`))
  }
}

@Component({
  selector: 'scoped-theme-probe',
  template: `<div data-tone="inverse"><span #inner></span></div>`,
})
class ScopedProbe {
  readonly inner = viewChild<ElementRef<HTMLElement>>('inner')
  readonly theme = useThemeValues(() => this.inner()?.nativeElement)

  constructor() {
    effect(() => {
      // Read once the view has its element, so the reading is the element's.
      this.inner()
      readings.push(this.theme().mode)
    })
  }
}

@Component({
  selector: 'template-theme-probe',
  template: `<div data-tone="inverse">
    <span #inner [attr.data-mode-read]="theme().mode"></span>
  </div>`,
})
class TemplateProbe {
  readonly inner = viewChild<ElementRef<HTMLElement>>('inner')
  readonly theme = useThemeValues(() => this.inner()?.nativeElement)
}

beforeEach(() => {
  installTestTheme()
  readings.length = 0
})

afterEach(() => {
  for (const attribute of Object.values(DATA_ATTRS)) root.removeAttribute(attribute)
})

describe('useThemeValues', () => {
  it('gives the document’s values, and a new reading when the mode changes', async () => {
    await mountComponent(Probe)
    expect(readings.at(-1)).toMatch(/^light #[0-9a-f]{6}$/)
    const before = readings.length

    root.setAttribute(DATA_ATTRS.mode, 'dark')
    await vi.waitFor(() => expect(readings.length).toBeGreaterThan(before))
    expect(readings.at(-1)).toMatch(/^dark #[0-9a-f]{6}$/)
  })

  it('reads from the element it is given, so a scope around it is seen', async () => {
    await mountComponent(ScopedProbe)
    await vi.waitFor(() => expect(readings.at(-1)).toBe('dark'))
  })

  it('gives a template the element’s values, and the new ones when the mode changes', async () => {
    const { host } = await mountComponent(TemplateProbe)
    const inner = host.querySelector('span') as HTMLElement
    expect(inner.getAttribute('data-mode-read')).toBe('dark')
    root.setAttribute(DATA_ATTRS.mode, 'dark')
    await vi.waitFor(() => expect(inner.getAttribute('data-mode-read')).toBe('light'))
  })

  it('keeps one reading through a member’s own tone', async () => {
    const { host } = await mountComponent(Probe)
    const taken = readings.length
    const text = document.createElement('p')
    text.setAttribute(DATA_ATTRS.tone, 'secondary')
    host.append(text)
    text.setAttribute(DATA_ATTRS.tone, 'danger')
    await settled()
    expect(readings).toHaveLength(taken)
  })

  it('releases the engine’s listener when its component is destroyed', async () => {
    const { unmount } = await mountComponent(Probe)
    expect(await engineFollows()).toBe(true)
    unmount()
    expect(await engineFollows()).toBe(false)
  })

  it('throws outside an injection context, and leaves no listener behind', async () => {
    expect(() => useThemeValues()).toThrow(/injection context/)
    expect(await engineFollows()).toBe(false)
  })
})
