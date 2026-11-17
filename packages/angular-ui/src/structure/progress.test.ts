import { progressRingLaw } from '@polymorph/conformance/progress-ring'

import { mountComponent } from '../mount'
import { Progress } from './Progress'

/**
 * Progress's bar and ring in the Angular shell
 * (`design/components/progress.md`), as `@polymorph/conformance/progress-ring`
 * states them for every web shell.
 */
progressRingLaw({
  shell: 'Angular',
  // A prop the law leaves out is an input the test does not set.
  mount: (props) => mountComponent(Progress, { ...props }),
})
