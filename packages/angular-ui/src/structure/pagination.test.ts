import { Component, signal } from '@angular/core'

import { pagerHoldLaw } from '@polymorph/conformance/pager-hold'

import { mountComponent } from '../mount'
import { Pagination } from './Pagination'

/**
 * A Pagination the app holds while one of its buttons has focus, in the
 * Angular shell (`design/components/pagination.md`, A11y), as
 * `@polymorph/conformance/pager-hold` states it for every web shell.
 */

@Component({
  selector: 'test-held-pagination',
  imports: [Pagination],
  template: `<pm-pagination
    label="Tickets"
    [page]="page()"
    [pageCount]="7"
    [disabled]="disabled()"
    (pageChange)="asked()"
  />`,
})
class Held {
  readonly page = signal(3)
  readonly disabled = signal(false)
  asked: () => void = () => {}
}

pagerHoldLaw({
  shell: 'Angular',
  member: 'Pagination',
  async mount({ asked }) {
    const { ref } = await mountComponent(Held)
    const held = ref.instance as Held
    held.asked = asked
    return {
      set(next) {
        if (next.page !== undefined) held.page.set(next.page)
        if (next.disabled !== undefined) held.disabled.set(next.disabled)
      },
    }
  },
})
