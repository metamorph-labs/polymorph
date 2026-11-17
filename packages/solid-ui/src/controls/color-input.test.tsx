import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import ColorInput from './ColorInput'

/**
 * ColorInput's picker in the Solid shell (`design/components/color-input.md`). The hidden range
 * inputs inside the plane's and the rails' thumbs are the tab stops and the sliders, so each thumb
 * is a picture: the description takes the machine's `tabIndex`, role and name off it. Zag's Solid
 * normalizer spells the machine's attribute `tabIndex` and the description writes `tabindex`, and
 * the thumb must keep neither.
 */

beforeAll(installTestTheme)

describe('ColorInput’s thumbs are pictures, not tab stops', () => {
  it('leaves every thumb without a tab index, a role or a name', async () => {
    await mount(() => (
      <ColorInput aria-label="Accent colour" pickerLabel="Choose accent colour" alpha defaultOpen />
    ))
    const thumbs = () =>
      document.querySelectorAll<HTMLElement>(
        '[data-scope="color-picker"][data-part="area-thumb"], [data-scope="color-picker"][data-part="channel-slider-thumb"]',
      )
    await vi.waitFor(() => expect(thumbs()).toHaveLength(3))
    for (const thumb of thumbs()) {
      const part = `${thumb.dataset['part']} ${thumb.dataset['channel'] ?? ''}`
      expect(thumb.hasAttribute('tabindex'), part).toBe(false)
      expect(thumb.hasAttribute('role'), part).toBe(false)
      expect(thumb.hasAttribute('aria-label'), part).toBe(false)
    }
    // The stops are the range inputs: the plane's saturation, the hue and the alpha.
    const stops = [...document.querySelectorAll<HTMLInputElement>('input[type="range"]')].filter(
      (input) => input.tabIndex >= 0,
    )
    expect(stops).toHaveLength(3)
  })
})
