import { Component, signal } from '@angular/core'

import {
  selectValueLaw,
  SELECT_VALUE_LAW_OPTIONS,
  type SelectValueLawMount,
} from '@polymorph/conformance/select-value'

import { mountComponent } from '../mount'
import { Select } from './Select'

/**
 * The value the application holds, `null` for nothing chosen, in the Angular
 * shell (`design/components/select.md`), as `@polymorph/conformance/select-value`
 * states it for every web shell.
 */

/** The application around the field: it holds the value the law sets and the handler it passes. */
@Component({
  selector: 'test-held-select',
  imports: [Select],
  template: `@if (law(); as law) {
    <pm-select
      aria-label="Priority"
      [options]="options"
      [placeholder]="law.placeholder"
      [emptyOption]="law.emptyOption"
      [name]="law.name"
      [value]="held()"
      (change)="law.onChange($event)"
    />
  }`,
})
class Held {
  readonly options = SELECT_VALUE_LAW_OPTIONS
  /** What the law mounts the field with. The field is drawn once it is set. */
  readonly law = signal<SelectValueLawMount | undefined>(undefined)
  readonly held = signal<string | null>(null)
}

selectValueLaw({
  shell: 'Angular',
  async mount(options) {
    const { ref } = await mountComponent(Held)
    const host = ref.instance as Held
    host.held.set(options.value)
    host.law.set(options)
    return {
      set(next) {
        host.held.set(next)
      },
    }
  },
})
