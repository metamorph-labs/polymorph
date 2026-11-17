import { progressRingLaw } from '@polymorph/conformance/progress-ring'

import { render } from '../mount'
import Progress from './Progress.svelte'

/**
 * Progress's bar and ring in the Svelte shell
 * (`design/components/progress.md`), as `@polymorph/conformance/progress-ring`
 * states them for every web shell.
 */
progressRingLaw({
  shell: 'Svelte',
  mount: (props) => render(Progress, props),
})
