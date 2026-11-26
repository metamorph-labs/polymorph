import { Component, signal } from '@angular/core'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { areaChartReadingLaw, type AreaReadingLawProps } from '@polymorph/conformance/chart-reading'

import { mountComponent } from '../mount'
import { angularAdapter } from '../conformance/angular'
import { AreaChart } from './AreaChart'
import { states } from './area-chart.states'

/**
 * AreaChart in the Angular shell: its reading position and the keys that move it,
 * as `@polymorph/conformance/chart-reading` states them for every web shell,
 * and no part of any state of its states fixture drawn past the chart's inline
 * edges, at a wide and at a phone width and in both directions, as
 * `@polymorph/conformance/chart-box` states it.
 */
chartBoxLaw({
  shell: 'Angular',
  member: 'AreaChart',
  entries: states.entries,
  adapter: angularAdapter,
})

/**
 * The application around the chart: it holds the props the law passes and
 * binds `select` and `brushEnd` only when the law listens, as a caller's template would.
 */
@Component({
  selector: 'test-held-area-chart',
  imports: [AreaChart],
  template: `@if (law(); as law) {
    @if (law.onSelect) {
      <pm-area-chart
        [data]="law.data"
        [series]="law.series"
        [x]="law.x"
        [label]="law.label"
        [locale]="law.locale"
        (select)="law.onSelect?.($event)"
      />
    } @else if (law.onBrushEnd) {
      <pm-area-chart
        [data]="law.data"
        [series]="law.series"
        [x]="law.x"
        [label]="law.label"
        [locale]="law.locale"
        (brushEnd)="law.onBrushEnd?.($event)"
      />
    } @else {
      <pm-area-chart
        [data]="law.data"
        [series]="law.series"
        [x]="law.x"
        [label]="law.label"
        [locale]="law.locale"
      />
    }
  }`,
})
class Held {
  readonly law = signal<AreaReadingLawProps | undefined>(undefined)
}

/* The reading position and its keys, as every shell holds them (`@polymorph/conformance/chart-reading`). */
areaChartReadingLaw({
  shell: 'Angular',
  async mount(props) {
    const mounted = await mountComponent(Held)
    ;(mounted.ref.instance as Held).law.set(props)
    await new Promise<void>((settle) => requestAnimationFrame(() => settle()))
    return mounted
  },
})
