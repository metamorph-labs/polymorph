// Every declared rung, once each, in an Angular component's inline template, and
// one disable outside a zone. See ../README.md: this file is data.
import { Component } from '@angular/core'

import { Bespoke, Card, DensityScope, ToneScope } from '@polymorph/angular-ui'

@Component({
  selector: 'app-settings',
  imports: [Bespoke, Card, DensityScope, ToneScope],
  template: `
    <pm-density-scope value="compact">
      <pm-tone-scope value="inverse">
        <pm-card [patch]="{ radius: 'lg' }" title="Plan" />
      </pm-tone-scope>
    </pm-density-scope>
    <pm-bespoke reason="The what's-new panel draws its own confetti">
      <!-- eslint-disable-next-line polymorph/no-raw-styles -->
      <div style="padding: 4px"></div>
    </pm-bespoke>
    <!-- eslint-disable-next-line polymorph/no-raw-interactive -->
    <button>Skip</button>
  `,
})
export class Settings {}
