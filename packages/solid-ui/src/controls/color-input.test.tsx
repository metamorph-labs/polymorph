import { userEvent } from 'vitest/browser'
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A key an input method is handling, dispatched on `target`: marked `isComposing`, or reported
 * with key code 229 after the composition has ended, as Safari sends the Enter that confirms it.
 */
function inputMethodKey(
  target: HTMLElement,
  key: string,
  how: 'composing' | 'processed',
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    isComposing: how === 'composing',
  })
  if (how === 'processed') Object.defineProperty(event, 'keyCode', { value: 229 })
  target.dispatchEvent(event)
  return event
}

describe('ColorInput and an input method', () => {
  it('commits nothing on an Enter an input method is handling', async () => {
    const onChange = vi.fn()
    await mount(() => <ColorInput pickerLabel="Choose accent colour" onChange={onChange} />)
    const field = document.querySelector<HTMLInputElement>(
      '[data-member="color-input"] input[type="text"]',
    ) as HTMLInputElement
    await userEvent.tripleClick(field)
    await userEvent.keyboard('0089EA')
    inputMethodKey(field, 'Enter', 'composing')
    inputMethodKey(field, 'Enter', 'processed')
    await sleep(30)
    expect(onChange).not.toHaveBeenCalled()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith('#0089ea'))
  })
})
