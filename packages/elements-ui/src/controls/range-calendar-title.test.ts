import { rangeCalendarTitleLaw } from '@polymorph/conformance/range-calendar-title'

import { mountElement } from '../mount'
import './DateRangePicker'

/**
 * The title of DateRangePicker's range grid, and the calendar's name made
 * from it, as `@polymorph/conformance/range-calendar-title` states it for
 * every shell.
 */
rangeCalendarTitleLaw({
  shell: 'Elements',
  mount: (props) => mountElement('poly-date-range-picker', props),
})
