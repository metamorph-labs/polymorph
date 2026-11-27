import { tagInputCountLaw } from '@polymorph/conformance/tag-input-count'

import { mountElement } from '../mount'
import './TagInput'

/**
 * What a TagInput's count says, by default and in a host's words from
 * `countLabel`, as `@polymorph/conformance/tag-input-count` states it for every
 * shell. The element is made with the law's props, as a page's script makes one.
 */
tagInputCountLaw({
  shell: 'Elements',
  mount: (props) => mountElement('poly-tag-input', props),
})
