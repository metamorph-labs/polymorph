import { render } from '@testing-library/react'

import { tagInputCountLaw } from '@polymorph/conformance/tag-input-count'
import { TagInput } from './TagInput'

/**
 * What a TagInput's count says, by default and in a host's words from
 * `countLabel`, is the law every shell runs (`@polymorph/conformance/tag-input-count`).
 * The rest of the member is tested in `tag-input.test.tsx`.
 */
tagInputCountLaw({
  shell: 'React',
  async mount(props) {
    render(<TagInput {...props} />)
  },
})
