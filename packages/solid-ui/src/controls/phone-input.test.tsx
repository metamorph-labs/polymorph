import { userEvent } from 'vitest/browser'
import { describe, expect, it, vi } from 'vitest'
import { createSignal } from 'solid-js'

import { phoneInputLaw } from '@polymorph/conformance/phone-input'

import { mount } from '../mount'
import PhoneInput from './PhoneInput'

/**
 * What a PhoneInput reports, in the Solid shell (`design/components/phone-input.md`), as
 * `@polymorph/conformance/phone-input` states it for every web shell.
 */
phoneInputLaw({
  shell: 'Solid',
  async mount({ props, onChange }) {
    const [value, setValue] = createSignal(props.value)
    await mount(() => (
      <PhoneInput
        value={value()}
        defaultValue={props.defaultValue}
        defaultCountry={props.defaultCountry}
        countries={props.countries}
        name={props.name}
        locale={props.locale}
        aria-label={props['aria-label']}
        onChange={onChange}
      />
    ))
    return {
      set(next) {
        setValue(next)
      },
    }
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
    await mount(() => (
      <PhoneInput aria-label="Mobile" defaultCountry="GB" locale="en-GB" onChange={onChange} />
    ))
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
