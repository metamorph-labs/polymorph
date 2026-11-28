import {
  datePickerWordsLaw,
  dateRangePickerWordsLaw,
  timeInputWordsLaw,
} from '@polymorph/conformance/date-words'

import { render } from '../mount'
import DatePicker from './DatePicker.svelte'
import DateRangePicker from './DateRangePicker.svelte'
import TimeInput from './TimeInput.svelte'

/**
 * What a segmented date or time field says that `Intl` cannot supply in the Svelte
 * shell, by default and in a host's words from `messages`, as
 * `@polymorph/conformance/date-words` states it for every web shell.
 */
datePickerWordsLaw({
  shell: 'Svelte',
  mount: (props) => render(DatePicker, props),
})

dateRangePickerWordsLaw({
  shell: 'Svelte',
  mount: (props) => render(DateRangePicker, props),
})

timeInputWordsLaw({
  shell: 'Svelte',
  mount: (props) => render(TimeInput, props),
})
