import {
  datePickerWordsLaw,
  dateRangePickerWordsLaw,
  timeInputWordsLaw,
} from '@polymorph/conformance/date-words'

import { mount } from '../mount'
import DatePicker from './DatePicker'
import DateRangePicker from './DateRangePicker'
import TimeInput from './TimeInput'

/**
 * What a segmented date or time field says that `Intl` cannot supply in the Solid
 * shell, by default and in a host's words from `messages`, as
 * `@polymorph/conformance/date-words` states it for every web shell.
 */
datePickerWordsLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <DatePicker {...props} />),
})

dateRangePickerWordsLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <DateRangePicker {...props} />),
})

timeInputWordsLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <TimeInput {...props} />),
})
