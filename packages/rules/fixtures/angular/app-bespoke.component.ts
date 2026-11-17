// Rung 4. Inside a declared zone the vocabulary rules are suspended: the cost
// of the exception is that it is visible, bounded and inventoried, not that it
// is forbidden (the exception ladder, docs/rules.md).
import { Component } from '@angular/core'
import { animate } from 'motion'

import { Bespoke } from '@polymorph/angular-ui'

@Component({
  selector: 'app-promo',
  imports: [Bespoke],
  template: `
    <pm-bespoke reason="what's-new panel: one-off illustration for the launch">
      <div
        class="promo"
        style="padding: 24px; background: #4087de"
        [style.color]="'#ffffff'"
        (click)="play()"
      >
        <svg viewBox="0 0 120 40"></svg>
        <button>Read more</button>
        <span [class.shown]="true" animate.enter="promo-in">New</span>
      </div>
    </pm-bespoke>
  `,
})
export class Promo {
  play() {
    void animate('.promo', {})
  }
}
