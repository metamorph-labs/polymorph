import { Component, signal } from '@angular/core'

import { pagerHoldLaw, type CursorHold } from '@polymorph/conformance/pager-hold'

import { mountComponent } from '../mount'
import { CursorPagination } from './CursorPagination'

/**
 * A CursorPagination the app holds while one of its buttons has focus, in the
 * Angular shell (`design/components/cursor-pagination.md`, A11y), as
 * `@polymorph/conformance/pager-hold` states it for every web shell.
 */

/** What the two hosts share: the props the law sets, and the handler it passes. */
class Host {
  readonly hold = signal<CursorHold>({ disabled: false, pending: false, hasNext: true })
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
    (previous)="asked()"
    (next)="asked()"
  />`,
})
class Held extends Host {}

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
    (next)="asked()"
  />`,
})
class HeldLoadMore extends Host {}

pagerHoldLaw({
  shell: 'Angular',
  member: 'CursorPagination',
  async mount({ append, asked }) {
    const { ref } = await mountComponent(append ? HeldLoadMore : Held)
    const host = ref.instance as Host
    host.asked = asked
    return {
      set(next) {
        host.hold.update((was) => ({ ...was, ...next }))
      },
    }
  },
})
