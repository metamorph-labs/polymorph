import { Component, signal } from '@angular/core'

import { countdownLaw, type CountdownLawProps } from '@polymorph/conformance/countdown'

import { mountComponent } from '../mount'
import { Countdown } from './Countdown'

/**
 * What a Countdown draws, when it changes and what it reports, in the Angular
 * shell (`design/components/countdown.md`), as
 * `@polymorph/conformance/countdown` states it for every web shell.
 */

/**
 * The application around the countdown: it binds the `end` output in its
 * template, so an end reported while the countdown first renders reaches the
 * law's handler.
 */
@Component({
  selector: 'test-held-countdown',
  imports: [Countdown],
  template: `@if (law(); as law) {
    <pm-countdown
      [until]="law.until"
      [label]="law.label"
      [locale]="law.locale"
      [announce]="law.announce"
      (end)="law.onEnd?.()"
    />
  }`,
})
class Held {
  /** What the law mounts the countdown with. The countdown is drawn once it is set. */
  readonly law = signal<CountdownLawProps | undefined>(undefined)
}

countdownLaw({
  shell: 'Angular',
  async mount(props) {
    const { ref } = await mountComponent(Held)
    ;(ref.instance as Held).law.set(props)
  },
})
