import { statLaw } from '@polymorph/conformance/stat'

import { mount } from '../mount'
import Stat from './Stat'

/**
 * What a Stat's delta says in the Solid shell (`design/components/stat.md`),
 * as `@polymorph/conformance/stat` states it for every web shell.
 */
statLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <Stat {...props} />),
})
