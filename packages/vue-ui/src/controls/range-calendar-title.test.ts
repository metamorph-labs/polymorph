import { h } from 'vue'

import { rangeCalendarTitleLaw } from '@polymorph/conformance/range-calendar-title'

import { mount } from '../mount'
import DateRangePicker from './DateRangePicker.vue'

/**
 * The title of DateRangePicker's range grid in the Vue shell, and the
 * calendar's name made from it, as
 * `@polymorph/conformance/range-calendar-title` states it for every web shell.
 */
rangeCalendarTitleLaw({
  shell: 'Vue',
  mount: (props) => mount(() => h(DateRangePicker, props)),
})
