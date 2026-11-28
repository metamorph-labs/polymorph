import { rangeCalendarTitleLaw } from '@polymorph/conformance/range-calendar-title'

import { mount } from '../mount'
import DateRangePicker from './DateRangePicker'

/**
 * The title of DateRangePicker's range grid in the Solid shell, and the
 * calendar's name made from it, as
 * `@polymorph/conformance/range-calendar-title` states it for every web shell.
 */
rangeCalendarTitleLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <DateRangePicker {...props} />),
})
