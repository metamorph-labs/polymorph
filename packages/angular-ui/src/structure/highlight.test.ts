import { highlightLaw } from '@polymorph/conformance/highlight'

import { mountComponent } from '../mount'
import { Highlight } from './Highlight'

/**
 * What a Highlight marks and what a screen reader hears, in the Angular shell
 * (`design/components/highlight.md`), as `@polymorph/conformance/highlight`
 * states it for every web shell.
 */
highlightLaw({
  shell: 'Angular',
  // A prop the law leaves out is an input the test does not set.
  mount: (props) => mountComponent(Highlight, { ...props }),
})
