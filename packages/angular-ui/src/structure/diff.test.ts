import { diffLaw } from '@polymorph/conformance/diff'

import { mountComponent } from '../mount'
import { Diff } from './Diff'

/**
 * What a Diff says, and where focus is when a collapsed run opens, in the
 * Angular shell (`design/components/diff.md`, A11y), as
 * `@polymorph/conformance/diff` states it for every web shell.
 */
diffLaw({
  shell: 'Angular',
  // A prop the law leaves out is an input the test does not set.
  mount: (props) => mountComponent(Diff, { ...props }),
})
