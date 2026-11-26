import { Component, signal } from '@angular/core'

import {
  radarChartReadingLaw,
  type RadarReadingLawProps,
} from '@polymorph/conformance/chart-reading'

import { mountComponent } from '../mount'
import { RadarChart } from './RadarChart'

/**
 * RadarChart in the Angular shell: its reading position and the keys that
 * move it, as `@polymorph/conformance/chart-reading` states them for every web
 * shell.
 */

/**
 * The application around the chart: it holds the props the law passes and
 * binds `select` only when the law listens, as a caller's template would.
 */
@Component({
  selector: 'test-held-radar-chart',
  imports: [RadarChart],
  template: `@if (law(); as law) {
    @if (law.onSelect) {
      <pm-radar-chart
        [axes]="law.axes"
        [data]="law.data"
        [series]="law.series"
        [label]="law.label"
        [locale]="law.locale"
        (select)="law.onSelect?.($event)"
      />
    } @else {
      <pm-radar-chart
        [axes]="law.axes"
        [data]="law.data"
        [series]="law.series"
        [label]="law.label"
        [locale]="law.locale"
      />
    }
  }`,
})
class Held {
  readonly law = signal<RadarReadingLawProps | undefined>(undefined)
}

/* The reading position and its keys, as every shell holds them (`@polymorph/conformance/chart-reading`). */
radarChartReadingLaw({
  shell: 'Angular',
  async mount(props) {
    const mounted = await mountComponent(Held)
    ;(mounted.ref.instance as Held).law.set(props)
    await new Promise<void>((settle) => requestAnimationFrame(() => settle()))
    return mounted
  },
})
