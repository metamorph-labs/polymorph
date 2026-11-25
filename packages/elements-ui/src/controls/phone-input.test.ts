import { userEvent } from 'vitest/browser'
import { describe, expect, it, vi } from 'vitest'

import { phoneInputLaw } from '@polymorph/conformance/phone-input'

import { mountElement } from '../mount'
import './PhoneInput'

/**
 * What a PhoneInput reports after typing, a commit, a country chosen and a paste,
 * as `@polymorph/conformance/phone-input` states it for every shell.
 * A value the law holds is the page's: the element's change event for it is
 * cancelled, as a page that owns a value cancels it.
 */
phoneInputLaw({
  shell: 'Elements',
  async mount({ props, onChange }) {
    const { set } = await mountElement(
      'poly-phone-input',
      { ...props, onChange },
      { owns: ['value'] },
    )
    return { set: (value) => set({ value }) }
  },
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

const number = () =>
  document.querySelector<HTMLInputElement>('[data-member="phone-input"] input[type="tel"]')

describe('PhoneInput and an input method', () => {
  it('commits nothing on an Enter an input method is handling', async () => {
    const onChange = vi.fn()
    await mountElement('poly-phone-input', {
      'aria-label': 'Mobile',
      defaultCountry: 'GB',
      locale: 'en-GB',
      onChange,
    })
    const field = number() as HTMLInputElement
    await userEvent.click(field)
    await userEvent.keyboard('7700900123')
    inputMethodKey(field, 'Enter', 'composing')
    inputMethodKey(field, 'Enter', 'processed')
    await sleep(30)
    expect(onChange).not.toHaveBeenCalled()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith('+447700900123'))
  })
})
