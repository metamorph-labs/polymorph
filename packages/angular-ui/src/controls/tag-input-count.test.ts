import { tagInputCountLaw } from '@polymorph/conformance/tag-input-count'

import { mountComponent } from '../mount'
import { TagInput } from './TagInput'

/**
 * What a TagInput says of its count in the Angular shell, in its description and
 * when a tag is removed (`design/components/tag-input.md`),
 * as `@polymorph/conformance/tag-input-count` states it for every web shell.
 */
tagInputCountLaw({
  shell: 'Angular',
  // A prop the law leaves out is an input the test does not set.
  mount: (props) => mountComponent(TagInput, { ...props }),
})
