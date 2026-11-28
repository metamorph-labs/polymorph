import { render } from '@testing-library/react'

import {
  datePickerWordsLaw,
  dateRangePickerWordsLaw,
  timeInputWordsLaw,
} from '@polymorph/conformance/date-words'
import { DatePicker } from './DatePicker'
import { DateRangePicker } from './DateRangePicker'
import { TimeInput } from './TimeInput'

/**
 * What a segmented date or time field says that `Intl` cannot supply, by
 * default and in a host's words from `messages`, is the law every shell runs
 * (`@polymorph/conformance/date-words`). The defaults are React Aria's words,
 * which it says in the field's locale, `en-US` here. The rest of each member
 * is tested in `dates.test.tsx`, `date-range-picker.test.tsx` and
 * `time-input.test.tsx`.
 */
datePickerWordsLaw({
  shell: 'React',
  async mount(props) {
    render(<DatePicker {...props} />)
  },
})

dateRangePickerWordsLaw({
  shell: 'React',
  async mount(props) {
    render(<DateRangePicker {...props} />)
  },
})

timeInputWordsLaw({
  shell: 'React',
  async mount(props) {
    render(<TimeInput {...props} />)
  },
})
