import { Component, signal } from '@angular/core'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { treemapLaw, type TreemapLawProps } from '@polymorph/conformance/treemap'

import { mountComponent } from '../mount'
import { angularAdapter } from '../conformance/angular'
import { Treemap } from './Treemap'
import { states } from './treemap.states'

/**
 * Treemap in the Angular shell (`design/components/treemap.md`): the tiles, the
 * labels that fit, the keys, the pointer, the twin and the direction, as
 * `@polymorph/conformance/treemap` states them for every web shell. The drawing
 * is the engine's `treemapModel`, which every renderer draws.
 */

/**
 * The application around the chart: it holds the props the law passes and
 * binds `select` only when the law listens, as a caller's template would.
 */
@Component({
  selector: 'test-held-treemap',
  imports: [Treemap],
  template: `@if (law(); as law) {
    @if (law.onSelect) {
      <pm-treemap
        [items]="law.items"
        [label]="law.label"
        [size]="law.size"
        (select)="law.onSelect?.($event)"
      />
    } @else {
      <pm-treemap [items]="law.items" [label]="law.label" [size]="law.size" />
    }
  }`,
})
class Held {
  readonly law = signal<TreemapLawProps | undefined>(undefined)
}

treemapLaw({
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
  member: 'Treemap',
  entries: states.entries,
  adapter: angularAdapter,
})
