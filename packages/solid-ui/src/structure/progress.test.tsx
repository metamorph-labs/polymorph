import { progressRingLaw } from '@polymorph/conformance/progress-ring'

import { mount } from '../mount'
import Progress from './Progress'

/**
 * Progress's bar and ring in the Solid shell (`design/components/progress.md`),
 * as `@polymorph/conformance/progress-ring` states them for every web shell.
 */
progressRingLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <Progress {...props} />),
})
