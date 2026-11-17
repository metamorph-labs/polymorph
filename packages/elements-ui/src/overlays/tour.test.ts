import { TOUR_LAW_TARGETS, tourLaw } from '@polymorph/conformance/tour'
import { create } from '@polymorph/elements'

import { mountNodes } from '../mount'
import '../controls/Button'
import '../layout/Inline'
import './Tour'
import './TourTarget'

/**
 * Where a Tour's focus goes, what each step says and reports and where its panel
 * is drawn, as `@polymorph/conformance/tour` states it for every shell: the
 * law's page of targets as `<poly-tour-target>` elements around Buttons, and one
 * `<poly-tour>` made with the law's props.
 */
tourLaw({
  shell: 'Elements',
  mount: (props) =>
    mountNodes(
      create('div', {}, [
        create(
          'poly-inline',
          { gap: 3 },
          TOUR_LAW_TARGETS.map((target) =>
            create('poly-tour-target', { name: target.name }, [
              create('poly-button', { label: target.label }),
            ]),
          ),
        ),
        create('poly-tour', props),
      ]),
    ),
})
