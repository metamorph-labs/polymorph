import { render } from '@testing-library/react'

import { statLaw } from '@polymorph/conformance/stat'
import { Stat } from './Stat'

/**
 * What a Stat's delta says, by default and in a host's words from
 * `deltaLabel`, is the law every shell runs (`@polymorph/conformance/stat`).
 * The Stat's drawing is tested in `settings.test.tsx`.
 */
statLaw({
  shell: 'React',
  async mount(props) {
    render(<Stat {...props} />)
  },
})
