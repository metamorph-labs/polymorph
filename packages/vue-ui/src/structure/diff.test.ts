import { h } from 'vue'

import { diffLaw } from '@polymorph/conformance/diff'

import { mount } from '../mount'
import Diff from './Diff.vue'

/**
 * What a Diff says, and where focus is when a collapsed run opens, in the Vue
 * shell (`design/components/diff.md`, A11y), as `@polymorph/conformance/diff`
 * states it for every web shell.
 */
diffLaw({
  shell: 'Vue',
  mount: (props) => mount(() => h(Diff, props)),
})
