import { Component, signal } from '@angular/core'

import { barLinesLaw } from '@polymorph/conformance/bar-lines'
import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { barChartReadingLaw, type BarReadingLawProps } from '@polymorph/conformance/chart-reading'
import { barChartMeasureLaw } from '@polymorph/conformance/chart-measure'

import { mountComponent } from '../mount'
import { angularAdapter } from '../conformance/angular'
import { BarChart } from './BarChart'
import { states } from './bar-chart.states'

/**
 * BarChart in the Angular shell (`design/components/bar-chart.md`): its reading
 * position and the keys that move it, as `@polymorph/conformance/chart-reading`
 * states them for every web shell; the lines it draws over its bars, as
 * `@polymorph/conformance/bar-lines` states them; and no part of any state of
 * its states fixture drawn past the chart's inline edges, as
 * `@polymorph/conformance/chart-box` states it.
 */
barLinesLaw({
  shell: 'Angular',
  // A prop the law leaves out is an input the test does not set.
  mount: async (props) => (await mountComponent(BarChart, { ...props })).host,
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({
  shell: 'Angular',
  member: 'BarChart',
  entries: states.entries,
  adapter: angularAdapter,
})

/**
 * The application around the chart: it holds the props the law passes and
 * binds `select` only when the law listens, as a caller's template would.
 */
@Component({
  selector: 'test-held-bar-chart',
  imports: [BarChart],
  template: `@if (law(); as law) {
    @if (law.onSelect) {
      <pm-bar-chart
        [data]="law.data"
        [series]="law.series"
        [x]="law.x"
        [label]="law.label"
        [locale]="law.locale"
        (select)="law.onSelect?.($event)"
      />
    } @else {
      <pm-bar-chart
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
  readonly law = signal<BarReadingLawProps | undefined>(undefined)
}

/* The reading position and its keys, as every shell holds them (`@polymorph/conformance/chart-reading`). */
barChartReadingLaw({
  shell: 'Angular',
  async mount(props) {
    const mounted = await mountComponent(Held)
    ;(mounted.ref.instance as Held).law.set(props)
    await new Promise<void>((settle) => requestAnimationFrame(() => settle()))
    return mounted
  },
})

/* The measure it names, said once in its summary (`@polymorph/conformance/chart-measure`). */
barChartMeasureLaw({
  shell: 'Angular',
  // A prop the law leaves out is an input the test does not set.
  mount: async (props) => (await mountComponent(BarChart, { ...props })).host,
})
