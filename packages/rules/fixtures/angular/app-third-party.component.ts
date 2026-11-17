// Rung 4, for another library's component. The module imports a binding from
// the library its template's boundary names, which is what makes the boundary
// host it. It may then import that library's stylesheet, and inside the
// boundary a plain element or the library's component takes `style` and a
// class. Colours come from the theme (the exception ladder, docs/rules.md).
import { Component } from '@angular/core'
import { LeafletModule } from '@bluehalo/ngx-leaflet'
import { latLng, tileLayer } from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { useThemeValues } from '@polymorph/angular'
import { ThirdParty } from '@polymorph/angular-ui'

@Component({
  selector: 'app-depots',
  imports: [ThirdParty, LeafletModule],
  template: `
    <pm-third-party library="leaflet" reason="depot map: no member draws map tiles">
      <div
        class="depots"
        style="height: 320px"
        [style.border-color]="theme().color('border.subtle')"
        leaflet
        [leafletOptions]="options"
      ></div>
    </pm-third-party>
  `,
})
export class Depots {
  protected readonly theme = useThemeValues()
  protected readonly options = {
    center: latLng(51.5, -0.1),
    zoom: 11,
    layers: [tileLayer('https://tiles.example/{z}/{x}/{y}.png')],
  }
}
