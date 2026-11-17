import { Component, signal } from '@angular/core'

import {
  promptTriggersLaw,
  type PromptLawDialogMount,
  type PromptLawMount,
  type PromptLawProps,
} from '@polymorph/conformance/prompt-triggers'

import { mountComponent } from '../mount'
import { Dialog } from '../overlays/Dialog'
import { PromptInput, type PromptTrigger } from './PromptInput'

/**
 * PromptInput's mentions and commands in the Angular shell
 * (`design/components/prompt-input.md`), as
 * `@polymorph/conformance/prompt-triggers` states them for every web shell.
 */

/** The application around the composer: it holds the props the law sets and the handlers it passes. */
@Component({
  selector: 'test-held-prompt-input',
  imports: [PromptInput],
  template: `@if (law(); as law) {
    <pm-prompt-input
      label="Message"
      [defaultValue]="law.defaultValue"
      [messages]="law.messages"
      [triggers]="triggers()"
      [value]="held().value"
      (change)="law.onChange($event)"
      (submit)="law.onSubmit($event)"
    />
  }`,
})
class Held {
  /** What the law mounts the composer with. The composer is drawn once it is set. */
  readonly law = signal<PromptLawMount | undefined>(undefined)
  readonly held = signal<PromptLawProps>({ triggers: undefined, value: undefined })
  readonly triggers = () => this.held().triggers as PromptTrigger[] | undefined
}

/** The composer inside an open Dialog, which stays open until it reports `false`. */
@Component({
  selector: 'test-prompt-input-in-dialog',
  imports: [Dialog, PromptInput],
  template: `@if (law(); as law) {
    <pm-dialog title="Compose" [open]="open()" (openChange)="change(law, $event)">
      <pm-prompt-input label="Message" [triggers]="triggers(law)" />
    </pm-dialog>
  }`,
})
class InDialog {
  readonly law = signal<PromptLawDialogMount | undefined>(undefined)
  readonly open = signal(true)
  readonly triggers = (law: PromptLawDialogMount) => law.triggers as PromptTrigger[]
  change(law: PromptLawDialogMount, next: boolean) {
    law.onOpenChange(next)
    this.open.set(next)
  }
}

promptTriggersLaw({
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
  async mountInDialog(options) {
    const { ref } = await mountComponent(InDialog)
    ;(ref.instance as InDialog).law.set(options)
  },
})
