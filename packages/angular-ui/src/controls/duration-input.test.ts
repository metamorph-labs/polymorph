import { Component, signal } from '@angular/core'

import {
  durationInputLaw,
  type DurationInputLawMount,
  type DurationInputLawProps,
} from '@polymorph/conformance/duration-input'

import { mountComponent } from '../mount'
import { DurationInput } from './DurationInput'

/**
 * What DurationInput reports and draws in the Angular shell
 * (`design/components/duration-input.md`), as `@polymorph/conformance/duration-input`
 * states it for every web shell.
 */

/** The application around the field: it holds the props the law sets and the handler it passes. */
@Component({
  selector: 'test-held-duration-input',
  imports: [DurationInput],
  template: `@if (law(); as law) {
    <pm-duration-input
      locale="en-US"
      aria-label="Inactivity lifetime"
      [value]="held().value"
      [defaultValue]="held().defaultValue"
      [units]="held().units"
      [min]="held().min"
      [max]="held().max"
      [readOnly]="held().readOnly"
      [name]="held().name"
      [messages]="held().messages"
      (change)="law.onChange($event)"
    />
  }`,
})
class Held {
  /** What the law mounts the field with. The field is drawn once it is set. */
  readonly law = signal<DurationInputLawMount | undefined>(undefined)
  readonly held = signal<DurationInputLawProps>({})
}

durationInputLaw({
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
