import { h } from 'vue'

import { progressRingLaw } from '@polymorph/conformance/progress-ring'

import { mount } from '../mount'
import Progress from './Progress.vue'

/**
 * Progress's bar and ring in the Vue shell (`design/components/progress.md`),
 * as `@polymorph/conformance/progress-ring` states them for every web shell.
 */
progressRingLaw({
  shell: 'Vue',
  mount: (props) => mount(() => h(Progress, props)),
})
