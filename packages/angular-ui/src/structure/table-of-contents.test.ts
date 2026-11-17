import { Component, signal } from '@angular/core'
import { expect, vi } from 'vitest'

import {
  tableOfContentsLaw,
  type TableOfContentsLawItem,
  type TableOfContentsLawMount,
} from '@polymorph/conformance/table-of-contents'

import { mountComponent } from '../mount'
import { TableOfContents } from './TableOfContents'

/**
 * Which section the list marks and what a click on a link does, in the
 * Angular shell (`design/components/table-of-contents.md`, Behaviour), as
 * `@polymorph/conformance/table-of-contents` states it for every web shell.
 */

/** The application around the list: it holds the items the law sets and the handler it passes. */
@Component({
  selector: 'test-held-table-of-contents',
  imports: [TableOfContents],
  template: `@if (law(); as law) {
    <pm-table-of-contents
      label="On this page"
      [items]="items()"
      (currentChange)="law.onCurrentChange($event)"
    />
  }`,
})
class Held {
  /** What the law mounts the list with. The list is drawn once it is set. */
  readonly law = signal<TableOfContentsLawMount | undefined>(undefined)
  readonly items = signal<TableOfContentsLawItem[]>([])
}

tableOfContentsLaw({
  shell: 'Angular',
  async mount(options) {
    const { ref, unmount } = await mountComponent(Held)
    const host = ref.instance as Held
    host.items.set(options.items)
    host.law.set(options)
    // The list is drawn once the application renders the signals it was handed.
    await vi.waitFor(() =>
      expect(document.querySelector('[data-member="table-of-contents"]')).not.toBeNull(),
    )
    return {
      set(next) {
        host.items.set(next)
      },
      unmount,
    }
  },
})
