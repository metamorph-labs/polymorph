import { Component, input } from '@angular/core'

import {
  multiSelectListLaw,
  type MultiSelectListLawProps,
} from '@polymorph/conformance/multi-select-list'

import { mountComponent } from '../mount'
import { FormField } from './FormField'
import { MultiSelect } from './MultiSelect'

/** A MultiSelect as the control of a FormField: the law's field and props as inputs. */
@Component({
  selector: 'test-multi-select-in-field',
  imports: [FormField, MultiSelect],
  template: `<pm-form-field [label]="label()" [required]="required()"
    ><pm-multi-select [options]="field().options" [defaultOpen]="field().defaultOpen"
  /></pm-form-field>`,
})
class InField {
  readonly label = input.required<string>()
  readonly required = input.required<boolean>()
  readonly field = input.required<MultiSelectListLawProps>()
}

/**
 * The name of MultiSelect's list in the Angular shell, which is the field's
 * own, as `@polymorph/conformance/multi-select-list` states it for every web
 * shell.
 */
multiSelectListLaw({
  shell: 'Angular',
  // A prop the law leaves out is an input the test does not set.
  mount: (props) => mountComponent(MultiSelect, { ...props }),
  mountInField: ({ label, required }, props) =>
    mountComponent(InField, { label, required, field: props }),
})
