import { tagInputCountLaw } from '@polymorph/conformance/tag-input-count'

import { mountComponent } from '../mount'
import { TagInput } from './TagInput'

/**
 * What a TagInput's count says in the Angular shell (`design/components/tag-input.md`),
 * as `@polymorph/conformance/tag-input-count` states it for every web shell.
 */
tagInputCountLaw({
  shell: 'Angular',
  // A prop the law leaves out is an input the test does not set.
  mount: (props) => mountComponent(TagInput, { ...props }),
})
