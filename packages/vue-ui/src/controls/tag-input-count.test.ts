import { h } from 'vue'

import { tagInputCountLaw } from '@polymorph/conformance/tag-input-count'

import { mount } from '../mount'
import TagInput from './TagInput.vue'

/**
 * What a TagInput's count says in the Vue shell (`design/components/tag-input.md`),
 * as `@polymorph/conformance/tag-input-count` states it for every web shell.
 */
tagInputCountLaw({
  shell: 'Vue',
  mount: (props) => mount(() => h(TagInput, props)),
})
