import { ratingLaw } from '@polymorph/conformance/rating'

import { mountComponent } from '../mount'
import { Rating } from './Rating'

/**
 * What a Rating is, what a press and a key do, and how it draws, in the
 * Angular shell (`design/components/rating.md`), as
 * `@polymorph/conformance/rating` states it for every web shell.
 */
ratingLaw({
  shell: 'Angular',
  async mount({ onChange, ...inputs }) {
    // A prop the law leaves out is an input the test does not set. The handler listens to the
    // `(change)` output, as an application's binding does.
    const { ref } = await mountComponent(Rating, { ...inputs })
    if (onChange !== undefined) (ref.instance as Rating).onChange.subscribe(onChange)
  },
})
