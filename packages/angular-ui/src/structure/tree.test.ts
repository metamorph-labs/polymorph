import { Component, signal } from '@angular/core'

import { treeLaw, type TreeLawMount, type TreeLawProps } from '@polymorph/conformance/tree'

import { mountComponent } from '../mount'
import { Tree } from './Tree'

/**
 * Tree's keys, its selection, who holds its open branches and where focus is
 * when a level arrives, in the Angular shell (`design/components/tree.md`), as
 * `@polymorph/conformance/tree` states them for every web shell.
 */

/** The application around the tree: it holds the props the law sets and the handlers it passes. */
@Component({
  selector: 'test-held-tree',
  imports: [Tree],
  template: `@if (law(); as law) {
    <pm-tree
      label="Units"
      [defaultExpanded]="law.defaultExpanded"
      [defaultValue]="law.defaultValue"
      [items]="held().items"
      [expanded]="held().expanded"
      [value]="held().value"
      [loading]="held().loading"
      [hasMore]="held().hasMore"
      (change)="law.onChange($event)"
      (expandedChange)="law.onExpandedChange($event)"
      (loadMore)="law.onLoadMore($event)"
    />
  }`,
})
class Held {
  /** What the law mounts the tree with. The tree is drawn once it is set. */
  readonly law = signal<TreeLawMount | undefined>(undefined)
  readonly held = signal<TreeLawProps>({
    items: [],
    expanded: undefined,
    value: undefined,
    loading: false,
    hasMore: false,
  })
}

treeLaw({
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
})
