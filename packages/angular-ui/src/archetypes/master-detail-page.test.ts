import { Component, signal } from '@angular/core'

import {
  MASTER_DETAIL_ITEMS,
  masterDetailLaw,
  type MasterDetailLawMount,
  type MasterDetailLawProps,
} from '@polymorph/conformance/master-detail'

import { mountComponent } from '../mount'
import { MasterDetailPage } from './MasterDetailPage'

/**
 * MasterDetailPage's two arrangements and where its focus goes, in the
 * Angular shell (`design/archetypes/master-detail-page.md`), as
 * `@polymorph/conformance/master-detail` states them for every web shell.
 */

/** The application around the page: it holds the props the law sets and the handler it passes. */
@Component({
  selector: 'test-held-master-detail-page',
  imports: [MasterDetailPage],
  template: `@if (law(); as law) {
    <div [style.inline-size.px]="held().width" style="block-size: 480px">
      <pm-master-detail-page
        title="Support"
        listLabel="Tickets"
        [emptyState]="empty"
        backLabel="All tickets"
        (back)="law.onBack()"
      >
        <ng-container ngProjectAs="[slot=actions]"
          ><button type="button">New ticket</button></ng-container
        >
        <ng-container ngProjectAs="[slot=list]"
          ><ul>
            @for (name of items; track name) {
              <li>
                @if (held().buttons) {
                  <button
                    type="button"
                    [attr.aria-current]="held().current === name ? 'true' : null"
                  >
                    {{ name }}
                  </button>
                } @else {
                  {{ name }}
                }
              </li>
            }
          </ul></ng-container
        >
        <ng-container ngProjectAs="[slot=detail]">
          @if (held().detail) {
            <h2>Bravo</h2>
            <button type="button">Reply</button>
          }
        </ng-container>
      </pm-master-detail-page>
    </div>
  }`,
})
class Held {
  /** What the law mounts the page with. The page is drawn once it is set. */
  readonly law = signal<MasterDetailLawMount | undefined>(undefined)
  readonly held = signal<MasterDetailLawProps>({
    width: 0,
    detail: false,
    current: null,
    buttons: true,
  })
  readonly items = MASTER_DETAIL_ITEMS
  readonly empty = { title: 'No ticket selected' }
}

masterDetailLaw({
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
