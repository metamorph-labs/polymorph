import { h } from 'vue'

import { highlightLaw } from '@polymorph/conformance/highlight'

import { mount } from '../mount'
import Highlight from './Highlight.vue'

/**
 * What a Highlight marks and what a screen reader hears, in the Vue shell
 * (`design/components/highlight.md`), as `@polymorph/conformance/highlight`
 * states it for every web shell.
 */
highlightLaw({
  shell: 'Vue',
  mount: (props) => mount(() => h(Highlight, props)),
})
