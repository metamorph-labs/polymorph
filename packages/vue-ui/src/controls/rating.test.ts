import { h } from 'vue'

import { ratingLaw } from '@polymorph/conformance/rating'

import { mount } from '../mount'
import Rating from './Rating.vue'

/**
 * What a Rating is, what a press and a key do, and how it draws, in the Vue
 * shell (`design/components/rating.md`), as `@polymorph/conformance/rating`
 * states it for every web shell.
 */
ratingLaw({
  shell: 'Vue',
  mount: (props) => mount(() => h(Rating, props)),
})
