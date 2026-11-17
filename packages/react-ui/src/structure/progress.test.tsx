import { render } from '@testing-library/react'

import { progressRingLaw } from '@polymorph/conformance/progress-ring'

import { Progress } from './Progress'

/**
 * Progress's bar and ring in the React shell (`design/components/progress.md`),
 * as `@polymorph/conformance/progress-ring` states them for every web shell.
 * The bar's own claims are in `primitives.test.tsx`.
 */
progressRingLaw({
  shell: 'React',
  async mount(props) {
    render(<Progress {...props} />)
  },
})
