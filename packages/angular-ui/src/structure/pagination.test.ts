import { Component, input, signal } from '@angular/core'

import { PAGER_ADDRESSES, pagerHoldLaw } from '@polymorph/conformance/pager-hold'

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
    [getPageHref]="addressed() ? pageHref : undefined"
    (pageChange)="asked()"
  />`,
})
class Held {
  readonly addressed = input(false)
  readonly page = signal(3)
  readonly disabled = signal(false)
  readonly pageHref = PAGER_ADDRESSES.page
  asked: () => void = () => {}
}

pagerHoldLaw({
  shell: 'Angular',
  member: 'Pagination',
  async mount({ addressed, asked }) {
    const { ref } = await mountComponent(Held, { addressed })
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
