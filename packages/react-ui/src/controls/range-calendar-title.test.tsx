import { render } from '@testing-library/react'

import { rangeCalendarTitleLaw } from '@polymorph/conformance/range-calendar-title'
import { DateRangePicker } from './DateRangePicker'

/**
 * The title of DateRangePicker's range grid, and the calendar's name made
 * from it, as `@polymorph/conformance/range-calendar-title` states it for
 * every web shell. React Aria writes both, in the field's locale.
 */
rangeCalendarTitleLaw({
  shell: 'React',
  async mount(props) {
    render(<DateRangePicker {...props} />)
  },
})
