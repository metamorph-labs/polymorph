import { rangeCalendarTitleLaw } from '@polymorph/conformance/range-calendar-title'

import { render } from '../mount'
import DateRangePicker from './DateRangePicker.svelte'

/**
 * The title of DateRangePicker's range grid in the Svelte shell, and the
 * calendar's name made from it, as
 * `@polymorph/conformance/range-calendar-title` states it for every web shell.
 */
rangeCalendarTitleLaw({
  shell: 'Svelte',
  mount: (props) => render(DateRangePicker, props),
})
