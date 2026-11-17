import { ratingLaw } from '@polymorph/conformance/rating'

import { mount } from '../mount'
import Rating from './Rating'

/**
 * What a Rating is, what a press and a key do, and how it draws, in the
 * Solid shell (`design/components/rating.md`), as
 * `@polymorph/conformance/rating` states it for every web shell.
 */
ratingLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <Rating {...props} />),
})
