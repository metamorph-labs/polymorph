<!--
  Rung 4, for another library's component. The file imports a binding from the
  library its boundary names, which is what makes the boundary host it. It may
  then import that library's stylesheet, and inside the boundary a plain
  element or the library's component takes `style` and a class. Colours come
  from the theme (the exception ladder, docs/rules.md).
-->
<script lang="ts">
  import { latLng } from 'leaflet'
  import 'leaflet/dist/leaflet.css'
  import { Map, TileLayer } from 'sveaflet'

  import { useThemeValues } from '@polymorph/svelte'
  import { ThirdParty } from '@polymorph/svelte-ui'

  const theme = useThemeValues()
</script>

<ThirdParty library="leaflet" reason="depot map: no member draws map tiles">
  <div class="depots" style="height: 320px" style:border-color={theme.current.color('border.subtle')}>
    <Map style="height: 100%" options={{ center: latLng(51.5, -0.1), zoom: 11 }}>
      <TileLayer url="https://tiles.example/{z}/{x}/{y}.png" />
    </Map>
  </div>
</ThirdParty>
