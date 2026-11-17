import { For } from 'solid-js'

import { TOUR_LAW_TARGETS, tourLaw } from '@polymorph/conformance/tour'

import Button from '../controls/Button'
import Inline from '../layout/Inline'
import { mount } from '../mount'
import Tour from './Tour'
import TourTarget from './TourTarget'

/**
 * Where focus goes, what a step says and reports, and where its panel is drawn,
 * in the Solid shell (`design/components/tour.md`), as
 * `@polymorph/conformance/tour` states them for every web shell.
 */
tourLaw({
  shell: 'Solid',
  async mount(props) {
    await mount(() => (
      <div>
        <Inline gap={3}>
          <For each={TOUR_LAW_TARGETS}>
            {(target) => (
              <TourTarget name={target.name}>
                <Button label={target.label} />
              </TourTarget>
            )}
          </For>
        </Inline>
        <Tour {...props} />
      </div>
    ))
  },
})
