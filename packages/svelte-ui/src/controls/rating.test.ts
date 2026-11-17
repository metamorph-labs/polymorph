import { ratingLaw } from '@polymorph/conformance/rating'

import { render } from '../mount'
import Rating from './Rating.svelte'

/**
 * What a Rating is, what a press and a key do, and how it draws, in the
 * Svelte shell (`design/components/rating.md`), as
 * `@polymorph/conformance/rating` states it for every web shell.
 */
ratingLaw({
  shell: 'Svelte',
  mount: (props) => render(Rating, props),
})
