import { Component, signal } from '@angular/core'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { funnelChartLaw, type FunnelLawProps } from '@polymorph/conformance/funnel-chart'

import { mountComponent } from '../mount'
import { angularAdapter } from '../conformance/angular'
import { FunnelChart } from './FunnelChart'
import { states } from './funnel-chart.states'

/**
 * FunnelChart in the Angular shell (`design/components/funnel-chart.md`): the
 * bars, the words that fit, the keys, the pointer, the twin and the direction,
 * as `@polymorph/conformance/funnel-chart` states them for every web shell. The
 * drawing is the engine's `funnelChartModel`, which every renderer draws.
 */

/**
 * The application around the chart: it holds the props the law passes and
 * binds `select` only when the law listens, as a caller's template would.
 */
@Component({
  selector: 'test-held-funnel-chart',
  imports: [FunnelChart],
  template: `@if (law(); as law) {
    @if (law.onSelect) {
      <pm-funnel-chart
        [stages]="law.stages"
        [label]="law.label"
        [size]="law.size"
        (select)="law.onSelect?.($event)"
      />
    } @else {
      <pm-funnel-chart [stages]="law.stages" [label]="law.label" [size]="law.size" />
    }
  }`,
})
class Held {
  readonly law = signal<FunnelLawProps | undefined>(undefined)
}

funnelChartLaw({
  shell: 'Angular',
  async mount(props) {
    const mounted = await mountComponent(Held)
    ;(mounted.ref.instance as Held).law.set(props)
    await new Promise<void>((settle) => requestAnimationFrame(() => settle()))
    return mounted
  },
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({
  shell: 'Angular',
  member: 'FunnelChart',
  entries: states.entries,
  adapter: angularAdapter,
})
