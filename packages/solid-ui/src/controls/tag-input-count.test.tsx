import { tagInputCountLaw } from '@polymorph/conformance/tag-input-count'

import { mount } from '../mount'
import TagInput from './TagInput'

/**
 * What a TagInput says of its count in the Solid shell, in its description and
 * when a tag is removed (`design/components/tag-input.md`),
 * as `@polymorph/conformance/tag-input-count` states it for every web shell.
 */
tagInputCountLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <TagInput {...props} />),
})
