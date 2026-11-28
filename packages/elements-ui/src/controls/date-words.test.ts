import {
  datePickerWordsLaw,
  dateRangePickerWordsLaw,
  timeInputWordsLaw,
} from '@polymorph/conformance/date-words'

import { mountElement } from '../mount'
import './DatePicker'
import './DateRangePicker'
import './TimeInput'

/**
 * What a segmented date or time field says that `Intl` cannot supply, by
 * default and in a host's words from `messages`, as
 * `@polymorph/conformance/date-words` states it for every shell. Each element
 * is made with the law's props, as a page's script makes one.
 */
datePickerWordsLaw({
  shell: 'Elements',
  mount: (props) => mountElement('poly-date-picker', props),
})

dateRangePickerWordsLaw({
  shell: 'Elements',
  mount: (props) => mountElement('poly-date-range-picker', props),
})

timeInputWordsLaw({
  shell: 'Elements',
  mount: (props) => mountElement('poly-time-input', props),
})
