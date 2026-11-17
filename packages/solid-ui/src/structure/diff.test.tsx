import { diffLaw } from '@polymorph/conformance/diff'

import { mount } from '../mount'
import Diff from './Diff'

/**
 * What a Diff says, and where focus is when a collapsed run opens, in the
 * Solid shell (`design/components/diff.md`, A11y), as
 * `@polymorph/conformance/diff` states it for every web shell.
 */
diffLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <Diff {...props} />),
})
