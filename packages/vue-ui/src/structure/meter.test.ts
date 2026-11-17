import { h } from 'vue'

import { meterLaw } from '@polymorph/conformance/meter'

import { mount } from '../mount'
import Meter from './Meter.vue'

/**
 * What a Meter says and draws in the Vue shell (`design/components/meter.md`),
 * as `@polymorph/conformance/meter` states it for every web shell.
 */
meterLaw({
  shell: 'Vue',
  mount: (props) => mount(() => h(Meter, props)),
})
