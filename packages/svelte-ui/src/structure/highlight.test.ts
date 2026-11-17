import { highlightLaw } from '@polymorph/conformance/highlight'

import { render } from '../mount'
import Highlight from './Highlight.svelte'

/**
 * What a Highlight marks and what a screen reader hears, in the Svelte shell
 * (`design/components/highlight.md`), as `@polymorph/conformance/highlight`
 * states it for every web shell.
 */
highlightLaw({
  shell: 'Svelte',
  mount: (props) => render(Highlight, props),
})
