// Every ESLint red rule, violated once, in an Angular component. See ../README.md: this file is data.
import { Component } from '@angular/core'
import { trigger, transition, style, animate } from '@angular/animations'
import { scaleLinear } from 'd3-scale'
import { LucideAngularModule, Trash2 } from 'lucide-angular'

import { Button, Hero, PageHeader } from '@polymorph/angular-ui'

const BRAND = '#4087de'
const TOPBAR = 'var(--pm-shell-topbar-height)'

@Component({
  selector: 'app-inbox',
  imports: [Button, Hero, PageHeader, LucideAngularModule],
  animations: [trigger('fade', [transition(':enter', [style({ opacity: 0 }), animate('200ms')])])],
  styleUrl: './inbox.component.css',
  template: `
    <div style="padding: 24px">
      <!-- Two openers, so two h1s: the pair rule, broken the way a screen breaks it. -->
      <pm-hero title="Inbox" lede="Everything waiting on you" />
      <pm-page-header title="Inbox" />
      <pm-button class="mt-4" label="Send" />
      <button (click)="archive()">Archive</button>
      <div (click)="open()">Open</div>
      <input value="" />
      <svg viewBox="0 0 16 16"></svg>
      <lucide-icon [img]="trash" />
      <p @fade>{{ scale }}</p>
      <span>{{ topbar }}</span>
    </div>
  `,
})
export class Inbox {
  protected readonly brand = BRAND
  protected readonly topbar = TOPBAR
  protected readonly trash = Trash2
  protected readonly scale = String(scaleLinear)
  archive() {}
  open() {}
}
