import { tagInputCountLaw } from '@polymorph/conformance/tag-input-count'

import { render } from '../mount'
import TagInput from './TagInput.svelte'

/**
 * What a TagInput says of its count in the Svelte shell, in its description and
 * when a tag is removed (`design/components/tag-input.md`),
 * as `@polymorph/conformance/tag-input-count` states it for every web shell.
 */
tagInputCountLaw({
  shell: 'Svelte',
  mount: (props) => render(TagInput, props),
})
