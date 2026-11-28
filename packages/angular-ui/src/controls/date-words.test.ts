import {
  datePickerWordsLaw,
  dateRangePickerWordsLaw,
  timeInputWordsLaw,
} from '@polymorph/conformance/date-words'

import { mountComponent } from '../mount'
import { DatePicker } from './DatePicker'
import { DateRangePicker } from './DateRangePicker'
import { TimeInput } from './TimeInput'

/**
 * What a segmented date or time field says that `Intl` cannot supply in the Angular
 * shell, by default and in a host's words from `messages`, as
 * `@polymorph/conformance/date-words` states it for every web shell.
 */
// A prop a law leaves out is an input the test does not set.
datePickerWordsLaw({
  shell: 'Angular',
  mount: (props) => mountComponent(DatePicker, { ...props }),
})

dateRangePickerWordsLaw({
  shell: 'Angular',
  mount: (props) => mountComponent(DateRangePicker, { ...props }),
})

timeInputWordsLaw({
  shell: 'Angular',
  mount: (props) => mountComponent(TimeInput, { ...props }),
})
