import { Component, signal } from '@angular/core'

import {
  monthInputLaw,
  type MonthInputLawMount,
  type MonthInputLawProps,
} from '@polymorph/conformance/month-input'

import { mountComponent } from '../mount'
import { MonthInput } from './MonthInput'

/**
 * What a MonthInput reports and how its segments take keys, in the Angular
 * shell (`design/components/month-input.md`), as
 * `@polymorph/conformance/month-input` states them for every web shell.
 */

/** The application around the field: it holds the value the law sets and the handler it passes. */
@Component({
  selector: 'test-held-month-input',
  imports: [MonthInput],
  template: `@if (law(); as law) {
    <pm-month-input
      aria-label="Expires"
      [defaultValue]="law.defaultValue"
      [min]="law.min"
      [max]="law.max"
      [locale]="law.locale"
      [readOnly]="law.readOnly"
      [name]="law.name"
      [value]="held().value"
      (change)="law.onChange($event)"
    />
  }`,
})
class Held {
  /** What the law mounts the field with. The field is drawn once it is set. */
  readonly law = signal<MonthInputLawMount | undefined>(undefined)
  readonly held = signal<MonthInputLawProps>({ value: undefined })
}

monthInputLaw({
  shell: 'Angular',
  async mount(options) {
    const { ref } = await mountComponent(Held)
    const host = ref.instance as Held
    host.held.set(options.props)
    host.law.set(options)
    return {
      set(next) {
        host.held.update((was) => ({ ...was, ...next }))
      },
    }
  },
})
