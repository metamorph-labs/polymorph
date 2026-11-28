import { Component, input } from '@angular/core'

import { selectListLaw, type SelectListLawProps } from '@polymorph/conformance/select-list'

import { mountComponent } from '../mount'
import { FormField } from './FormField'
import { Select } from './Select'

/** A Select as the control of a FormField: the law's field and props as inputs. */
@Component({
  selector: 'test-select-in-field',
  imports: [FormField, Select],
  template: `<pm-form-field [label]="label()" [required]="required()"
    ><pm-select [options]="field().options" [defaultOpen]="field().defaultOpen"
  /></pm-form-field>`,
})
class InField {
  readonly label = input.required<string>()
  readonly required = input.required<boolean>()
  readonly field = input.required<SelectListLawProps>()
}

/**
 * The name of Select's list in the Angular shell, which is the field's own, as
 * `@polymorph/conformance/select-list` states it for every web shell.
 */
selectListLaw({
  shell: 'Angular',
  // A prop the law leaves out is an input the test does not set.
  mount: (props) => mountComponent(Select, { ...props }),
  mountInField: ({ label, required }, props) =>
    mountComponent(InField, { label, required, field: props }),
})
