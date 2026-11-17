/**
 * @vitest-environment jsdom
 *
 * The Settings theme pickers while the studio's draft is applied.
 *
 * No file defines the draft pairing, so neither list contains it. Without handling, the value
 * would match no option and every choice would be blocked by `selectPalette`'s guard, giving a
 * control that responds but does nothing. A settings screen must not contain such a control. The
 * harness toolbar shows the same text, and this test checks the product screen against it. It
 * uses jsdom rather than the browser project because it tests a disabled attribute and an
 * option's text, not a popover.
 */

import { DATA_ATTRS } from '@polymorph/react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { DRAFT_SYSTEM } from '../draft-boot'
import { SettingsPage } from './SettingsPage'

beforeAll(() => {
  // jsdom 30 provides neither, and the vocabulary's phone-layout hooks call both.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

afterEach(() => {
  // Auto-cleanup needs a global `afterEach`, which this project does not enable. Without this
  // call, the second render would find the first render's controls.
  cleanup()
  document.documentElement.removeAttribute(DATA_ATTRS.system)
  document.documentElement.removeAttribute(DATA_ATTRS.palette)
})

/** The row's control, found by the row's label (`SettingsRow` connects the two). */
function picker(label: string): HTMLButtonElement {
  return screen.getByRole('combobox', { name: label }) as HTMLButtonElement
}

describe('the appearance pickers while a draft is applied', () => {
  it('show the applied draft and are disabled', () => {
    document.documentElement.setAttribute(DATA_ATTRS.system, DRAFT_SYSTEM)

    render(<SettingsPage />)

    expect(picker('System').disabled, 'a pick here would die on the guard').toBe(true)
    expect(picker('Palette').disabled).toBe(true)
    // The same text the toolbar shows for this state.
    expect(picker('System').textContent).toContain('draft (unsaved)')
  })

  it('are enabled again on a shipped pairing', () => {
    render(<SettingsPage />)

    expect(picker('System').disabled).toBe(false)
    expect(picker('Palette').disabled).toBe(false)
  })
})
