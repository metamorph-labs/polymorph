import { Component, input, signal } from '@angular/core'

import { PAGER_ADDRESSES, pagerHoldLaw, type CursorHold } from '@polymorph/conformance/pager-hold'

import { mountComponent } from '../mount'
import { CursorPagination } from './CursorPagination'

/**
 * A CursorPagination the app holds while one of its buttons has focus, in the
 * Angular shell (`design/components/cursor-pagination.md`, A11y), as
 * `@polymorph/conformance/pager-hold` states it for every web shell.
 */

/** What the two hosts share: the props the law sets, the addresses it gives and the handler it passes. */
class Host {
  readonly hold = signal<CursorHold>({ disabled: false, pending: false, hasNext: true })
  readonly addresses = PAGER_ADDRESSES
  asked: () => void = () => {}
}

@Component({
  selector: 'test-held-cursor-pagination',
  imports: [CursorPagination],
  template: `<pm-cursor-pagination
    label="Tickets"
    [hasPrevious]="true"
    [hasNext]="hold().hasNext"
    [pending]="hold().pending"
    [disabled]="hold().disabled"
    [previousHref]="addressed() ? addresses.previous : undefined"
    [nextHref]="addressed() ? addresses.next : undefined"
    (previous)="asked()"
    (next)="asked()"
  />`,
})
class Held extends Host {
  readonly addressed = input(false)
}

@Component({
  selector: 'test-held-load-more',
  imports: [CursorPagination],
  template: `<pm-cursor-pagination
    mode="append"
    label="Tickets"
    [hasPrevious]="false"
    [hasNext]="hold().hasNext"
    [pending]="hold().pending"
    [disabled]="hold().disabled"
    [nextHref]="addressed() ? addresses.next : undefined"
    (next)="asked()"
  />`,
})
class HeldLoadMore extends Host {
  readonly addressed = input(false)
}

pagerHoldLaw({
  shell: 'Angular',
  member: 'CursorPagination',
  async mount({ append, addressed, asked }) {
    const { ref } = await mountComponent(append ? HeldLoadMore : Held, { addressed })
    const host = ref.instance as Host
    host.asked = asked
    return {
      set(next) {
        host.hold.update((was) => ({ ...was, ...next }))
      },
    }
  },
})
