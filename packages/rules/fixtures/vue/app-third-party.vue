<!--
  Rung 4, for another library's component. The file imports a binding from the
  library its boundary names, which is what makes the boundary host it. It may
  then import that library's stylesheet, and inside the boundary a plain
  element or the library's component takes `style` and a class. Colours come
  from the theme (the exception ladder, docs/rules.md).
-->
<script setup lang="ts">
import { latLng } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { LMap, LTileLayer } from '@vue-leaflet/vue-leaflet'

import { useThemeValues } from '@polymorph/vue'
import { ThirdParty } from '@polymorph/vue-ui'

const theme = useThemeValues()
const center = latLng(51.5, -0.1)
</script>

<template>
  <ThirdParty library="leaflet" reason="depot map: no member draws map tiles">
    <div class="depots" :style="{ height: '320px', borderColor: theme.color('border.subtle') }">
      <LMap style="height: 100%" :zoom="11" :center="center">
        <LTileLayer url="https://tiles.example/{z}/{x}/{y}.png" />
      </LMap>
    </div>
  </ThirdParty>
</template>
