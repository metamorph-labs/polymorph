// The same screen, expressed lawfully: composition and content, no decisions.
import { Component, input, output } from '@angular/core'

import { Button, Icon, Stack, Table } from '@polymorph/angular-ui'

interface Ticket {
  id: string
  title: string
}

@Component({
  selector: 'app-inbox',
  imports: [Button, Icon, Stack, Table],
  template: `
    <pm-stack [gap]="4" [p]="5">
      <pm-button variant="solid" tone="accent" label="Archive" (click)="archive.emit()">
        <pm-icon name="archive" />
      </pm-button>
      <pm-table [rows]="tickets()" />
      @for (ticket of tickets(); track ticket.id) {
        <p>{{ ticket.title }}</p>
      }
    </pm-stack>
  `,
})
export class Inbox {
  readonly tickets = input.required<Ticket[]>()
  readonly archive = output()
}
