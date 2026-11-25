import { Component, signal } from '@angular/core'
import { userEvent } from 'vitest/browser'
import { describe, expect, it, vi } from 'vitest'

import { phoneInputLaw, type PhoneInputLawMount } from '@polymorph/conformance/phone-input'

import { mountComponent } from '../mount'
import { PhoneInput } from './PhoneInput'

/**
 * What a PhoneInput reports, in the Angular shell (`design/components/phone-input.md`), as
 * `@polymorph/conformance/phone-input` states it for every web shell.
 */

/** The application around the field: it holds the value the law sets and the handler it passes. */
@Component({
  selector: 'test-held-phone-input',
  imports: [PhoneInput],
  template: `@if (law(); as law) {
    <pm-phone-input
      [aria-label]="law.props['aria-label']"
      [locale]="law.props.locale"
      [value]="value()"
      [defaultValue]="law.props.defaultValue"
      [defaultCountry]="law.props.defaultCountry"
      [countries]="law.props.countries"
      [name]="law.props.name"
      (change)="law.onChange($event)"
    />
  }`,
})
class Held {
  /** What the law mounts the field with. The field is drawn once it is set. */
  readonly law = signal<PhoneInputLawMount | undefined>(undefined)
  readonly value = signal<string | undefined>(undefined)
}

phoneInputLaw({
  shell: 'Angular',
  async mount(options) {
    const { ref } = await mountComponent(Held)
    const host = ref.instance as Held
    host.value.set(options.props.value)
    host.law.set(options)
    return {
      set(next) {
        host.value.set(next)
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

/** What the field below reports to the test that mounted it. */
const heard = { change: vi.fn() }

/** A field that reports its commits. */
@Component({
  selector: 'test-reporting-phone-input',
  imports: [PhoneInput],
  template: `<pm-phone-input
    aria-label="Mobile"
    defaultCountry="GB"
    locale="en-GB"
    (change)="heard.change($event)"
  />`,
})
class Reporting {
  readonly heard = heard
}

const number = () =>
  document.querySelector<HTMLInputElement>('[data-member="phone-input"] input[type="tel"]')

describe('PhoneInput and an input method', () => {
  it('commits nothing on an Enter an input method is handling', async () => {
    heard.change = vi.fn()
    const onChange = heard.change
    await mountComponent(Reporting)
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
