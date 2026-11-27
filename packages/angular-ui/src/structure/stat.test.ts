import { statLaw } from '@polymorph/conformance/stat'

import { mountComponent } from '../mount'
import { Stat } from './Stat'

/**
 * What a Stat's delta says in the Angular shell (`design/components/stat.md`),
 * as `@polymorph/conformance/stat` states it for every web shell.
 */
statLaw({
  shell: 'Angular',
  // A prop the law leaves out is an input the test does not set.
  mount: (props) => mountComponent(Stat, { ...props }),
})
