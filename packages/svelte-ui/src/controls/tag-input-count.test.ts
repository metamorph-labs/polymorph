import { tagInputCountLaw } from '@polymorph/conformance/tag-input-count'

import { render } from '../mount'
import TagInput from './TagInput.svelte'

/**
 * What a TagInput's count says in the Svelte shell (`design/components/tag-input.md`),
 * as `@polymorph/conformance/tag-input-count` states it for every web shell.
 */
tagInputCountLaw({
  shell: 'Svelte',
  mount: (props) => render(TagInput, props),
})
