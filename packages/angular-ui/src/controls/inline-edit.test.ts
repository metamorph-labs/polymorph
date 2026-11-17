import { Component, signal } from '@angular/core'

import {
  inlineEditLaw,
  type InlineEditLawMount,
  type InlineEditLawProps,
} from '@polymorph/conformance/inline-edit'

import { mountComponent } from '../mount'
import { InlineEdit } from './InlineEdit'

/**
 * InlineEdit's opening, saving, cancelling, a save that waits and the row's
 * height, in the Angular shell (`design/components/inline-edit.md`), as
 * `@polymorph/conformance/inline-edit` states them for every web shell.
 */

/** The application around the member: it holds the props the law sets and the handlers it passes. */
@Component({
  selector: 'test-held-inline-edit',
  imports: [InlineEdit],
  template: `@if (law(); as law) {
    <pm-inline-edit
      label="Project name"
      [defaultEditing]="law.defaultEditing"
      [value]="held().value"
      [editing]="held().editing"
      [pending]="held().pending"
      [error]="held().error"
      [required]="held().required"
      [size]="held().size"
      (commit)="law.onCommit($event)"
      (editingChange)="law.onEditingChange($event)"
    />
  }`,
})
class Held {
  /** What the law mounts the member with. The member is drawn once it is set. */
  readonly law = signal<InlineEditLawMount | undefined>(undefined)
  readonly held = signal<InlineEditLawProps>({
    value: '',
    editing: undefined,
    pending: false,
    error: undefined,
    required: false,
    size: 'md',
  })
}

inlineEditLaw({
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
