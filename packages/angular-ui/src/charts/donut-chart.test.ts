import { Component, signal } from '@angular/core'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import {
  donutChartReadingLaw,
  type DonutReadingLawProps,
} from '@polymorph/conformance/chart-reading'

import { mountComponent } from '../mount'
import { angularAdapter } from '../conformance/angular'
import { DonutChart } from './DonutChart'
import { states } from './donut-chart.states'

/**
 * DonutChart in the Angular shell: its reading position and the keys that move it,
 * as `@polymorph/conformance/chart-reading` states them for every web shell,
 * and no part of any state of its states fixture drawn past the chart's inline
 * edges, at a wide and at a phone width and in both directions, as
 * `@polymorph/conformance/chart-box` states it.
 */
chartBoxLaw({
  shell: 'Angular',
  member: 'DonutChart',
  entries: states.entries,
  adapter: angularAdapter,
})

/**
 * The application around the chart: it holds the props the law passes and
 * binds `select` only when the law listens, as a caller's template would.
 */
@Component({
  selector: 'test-held-donut-chart',
  imports: [DonutChart],
  template: `@if (law(); as law) {
    @if (law.onSelect) {
      <pm-donut-chart
        [segments]="law.segments"
        [label]="law.label"
        [locale]="law.locale"
        (select)="law.onSelect?.($event)"
      />
    } @else {
      <pm-donut-chart [segments]="law.segments" [label]="law.label" [locale]="law.locale" />
    }
  }`,
})
class Held {
  readonly law = signal<DonutReadingLawProps | undefined>(undefined)
}

/* The reading position and its keys, as every shell holds them (`@polymorph/conformance/chart-reading`). */
donutChartReadingLaw({
  shell: 'Angular',
  async mount(props) {
    const mounted = await mountComponent(Held)
    ;(mounted.ref.instance as Held).law.set(props)
    await new Promise<void>((settle) => requestAnimationFrame(() => settle()))
    return mounted
  },
})
