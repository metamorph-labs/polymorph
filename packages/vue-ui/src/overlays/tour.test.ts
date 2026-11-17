import { h } from 'vue'

import { TOUR_LAW_TARGETS, tourLaw } from '@polymorph/conformance/tour'

import Button from '../controls/Button.vue'
import Inline from '../layout/Inline.vue'
import { mount } from '../mount'
import Tour from './Tour.vue'
import TourTarget from './TourTarget.vue'

/**
 * Where focus goes, what a step says and reports, and where its panel is drawn,
 * in the Vue shell (`design/components/tour.md`), as
 * `@polymorph/conformance/tour` states them for every web shell.
 */
tourLaw({
  shell: 'Vue',
  mount: (props) =>
    mount(() =>
      h('div', [
        h(Inline, { gap: 3 }, () =>
          TOUR_LAW_TARGETS.map((target) =>
            h(TourTarget, { name: target.name }, () => h(Button, { label: target.label })),
          ),
        ),
        h(Tour, props),
      ]),
    ),
})
