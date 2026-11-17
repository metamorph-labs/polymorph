import { Component, signal } from '@angular/core'

import { TOUR_LAW_TARGETS, tourLaw, type TourLawProps } from '@polymorph/conformance/tour'

import { Button } from '../controls/Button'
import { Inline } from '../layout/Inline'
import { mountComponent } from '../mount'
import { Tour } from './Tour'
import { TourTarget } from './TourTarget'

/**
 * Where focus goes, what a step says and reports, and where its panel is drawn,
 * in the Angular shell (`design/components/tour.md`), as
 * `@polymorph/conformance/tour` states them for every web shell.
 */

/** The law's page: a row of its targets, each around one Button, and one Tour. */
@Component({
  selector: 'test-tour-page',
  imports: [Button, Inline, Tour, TourTarget],
  template: `@if (law(); as law) {
    <pm-inline [gap]="3">
      @for (target of targets; track target.name) {
        <pm-tour-target [name]="target.name"><pm-button [label]="target.label" /></pm-tour-target>
      }
    </pm-inline>
    <pm-tour
      [steps]="law.steps"
      [defaultOpen]="law.defaultOpen"
      [defaultStep]="law.defaultStep"
      (end)="law.onEnd?.($event)"
      (stepChange)="law.onStepChange?.($event)"
    />
  }`,
})
class Page {
  readonly targets = TOUR_LAW_TARGETS
  /** What the law mounts the tour with. The page is drawn once it is set. */
  readonly law = signal<TourLawProps | undefined>(undefined)
}

tourLaw({
  shell: 'Angular',
  async mount(props) {
    const { ref } = await mountComponent(Page)
    ;(ref.instance as Page).law.set(props)
  },
})
