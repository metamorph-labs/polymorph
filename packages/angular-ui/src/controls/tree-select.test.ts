import { Component, signal } from '@angular/core'

import {
  treeSelectLaw,
  type TreeSelectLawMount,
  type TreeSelectLawProps,
} from '@polymorph/conformance/tree-select'

import { mountComponent } from '../mount'
import { TreeSelect } from './TreeSelect'

/**
 * TreeSelect's popup, its choices, the empty choice, the hidden field and a
 * level that loads while it is open, and Tree's law on the tree in the popup,
 * in the Angular shell (`design/components/tree-select.md`), as
 * `@polymorph/conformance/tree-select` states them for every web shell.
 */

/** The application around the field: it holds the props the law sets and the handlers it passes. */
@Component({
  selector: 'test-held-tree-select',
  imports: [TreeSelect],
  template: `@if (law(); as law) {
    <pm-tree-select
      label="Units"
      aria-label="Move under"
      presentation="popover"
      [defaultExpanded]="law.defaultExpanded"
      [defaultValue]="law.defaultValue"
      [emptyOption]="law.emptyOption"
      [placeholder]="law.placeholder"
      [name]="law.name"
      [items]="held().items"
      [expanded]="held().expanded"
      [value]="held().value"
      [valueLabel]="held().valueLabel"
      [loading]="held().loading"
      [hasMore]="held().hasMore"
      (change)="law.onChange($event)"
      (expandedChange)="law.onExpandedChange($event)"
      (loadMore)="law.onLoadMore($event)"
    />
  }`,
})
class Held {
  /** What the law mounts the field with. The field is drawn once it is set. */
  readonly law = signal<TreeSelectLawMount | undefined>(undefined)
  readonly held = signal<TreeSelectLawProps>({
    items: [],
    expanded: undefined,
    value: undefined,
    valueLabel: undefined,
    loading: false,
    hasMore: false,
  })
}

treeSelectLaw({
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
