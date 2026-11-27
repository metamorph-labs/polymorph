import { h } from 'vue'

import { statLaw } from '@polymorph/conformance/stat'

import { mount } from '../mount'
import Stat from './Stat.vue'

/**
 * What a Stat's delta says in the Vue shell (`design/components/stat.md`), as
 * `@polymorph/conformance/stat` states it for every web shell.
 */
statLaw({
  shell: 'Vue',
  mount: (props) => mount(() => h(Stat, props)),
})
