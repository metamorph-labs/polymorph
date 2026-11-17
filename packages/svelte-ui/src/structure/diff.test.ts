import { diffLaw } from '@polymorph/conformance/diff'

import { render } from '../mount'
import Diff from './Diff.svelte'

/**
 * What a Diff says, and where focus is when a collapsed run opens, in the
 * Svelte shell (`design/components/diff.md`, A11y), as
 * `@polymorph/conformance/diff` states it for every web shell.
 */
diffLaw({
  shell: 'Svelte',
  mount: (props) => render(Diff, props),
})
