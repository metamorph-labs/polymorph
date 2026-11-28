import { h } from 'vue'

import {
  datePickerWordsLaw,
  dateRangePickerWordsLaw,
  timeInputWordsLaw,
} from '@polymorph/conformance/date-words'

import { mount } from '../mount'
import DatePicker from './DatePicker.vue'
import DateRangePicker from './DateRangePicker.vue'
import TimeInput from './TimeInput.vue'

/**
 * What a segmented date or time field says that `Intl` cannot supply in the Vue
 * shell, by default and in a host's words from `messages`, as
 * `@polymorph/conformance/date-words` states it for every web shell.
 */
datePickerWordsLaw({
  shell: 'Vue',
  mount: (props) => mount(() => h(DatePicker, props)),
})

dateRangePickerWordsLaw({
  shell: 'Vue',
  mount: (props) => mount(() => h(DateRangePicker, props)),
})

timeInputWordsLaw({
  shell: 'Vue',
  mount: (props) => mount(() => h(TimeInput, props)),
})
