import { ratingLaw } from '@polymorph/conformance/rating'

import { mountElement } from '../mount'
import './Rating'

/**
 * A Rating's clear rule, the ends of its row, its arrows in a right-to-left
 * document, its posted value and its marks' drawing, as
 * `@polymorph/conformance/rating` states them for every shell. A rating the law
 * gives a value keeps it, as a controlled member does: the page cancels its
 * change event.
 */
ratingLaw({
  shell: 'Elements',
  mount: (props) => mountElement('poly-rating', props, { owns: ['value'] }),
})
