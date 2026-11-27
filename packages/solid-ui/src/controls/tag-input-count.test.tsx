import { tagInputCountLaw } from '@polymorph/conformance/tag-input-count'

import { mount } from '../mount'
import TagInput from './TagInput'

/**
 * What a TagInput's count says in the Solid shell (`design/components/tag-input.md`),
 * as `@polymorph/conformance/tag-input-count` states it for every web shell.
 */
tagInputCountLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <TagInput {...props} />),
})
