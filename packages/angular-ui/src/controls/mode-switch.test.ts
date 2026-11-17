import { Component, signal } from '@angular/core'

import {
  modeSwitchLaw,
  type ModeSwitchLawMount,
  type ModeSwitchLawProps,
} from '@polymorph/conformance/mode-switch'

import { mountComponent } from '../mount'
import { ModeSwitch } from './ModeSwitch'

/**
 * What a ModeSwitch shows and what a choice does, in the Angular shell
 * (`design/components/mode-switch.md`, Behaviour), as
 * `@polymorph/conformance/mode-switch` states it for every web shell.
 */

/** The application around the switch: it holds the props the law sets and the handler it passes. */
@Component({
  selector: 'test-held-mode-switch',
  imports: [ModeSwitch],
  template: `@if (law(); as law) {
    <pm-mode-switch
      [label]="law.label"
      [messages]="law.messages"
      [value]="held().value"
      [disabled]="held().disabled"
      (change)="law.onChange($event)"
    />
  }`,
})
class Held {
  /** What the law mounts the switch with. The switch is drawn once it is set. */
  readonly law = signal<ModeSwitchLawMount | undefined>(undefined)
  readonly held = signal<ModeSwitchLawProps>({ value: undefined, disabled: false })
}

modeSwitchLaw({
  shell: 'Angular',
  async mount(options) {
    const { ref } = await mountComponent(Held)
    const host = ref.instance as Held
    host.held.set(options.props)
    host.law.set(options)
    // A frame for the zoneless application to draw the switch the law now holds.
    await new Promise((resolve) => requestAnimationFrame(resolve))
    return {
      set(next) {
        host.held.update((was) => ({ ...was, ...next }))
      },
    }
  },
})
