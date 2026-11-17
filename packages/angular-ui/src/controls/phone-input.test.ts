import { Component, signal } from '@angular/core'

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
