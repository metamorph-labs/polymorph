import { highlightLaw } from '@polymorph/conformance/highlight'

import { mount } from '../mount'
import Highlight from './Highlight'

/**
 * What a Highlight marks and what a screen reader hears, in the Solid shell
 * (`design/components/highlight.md`), as `@polymorph/conformance/highlight`
 * states it for every web shell.
 */
highlightLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <Highlight {...props} />),
})
