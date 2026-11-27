import { render } from '@testing-library/react'
import { I18nProvider } from 'react-aria'

import { comboboxListLaw } from '@polymorph/conformance/combobox-list'
import { Combobox } from './Combobox'

/**
 * The name of a Combobox's list, by default and in a host's word from
 * `messages.list`, is the law every shell runs
 * (`@polymorph/conformance/combobox-list`). The default is React Aria's word,
 * which it says in its provider's locale, so the field mounts in `en-US`, and
 * React Aria labels the list by its chevron too where no reference names the
 * field. The rest of the member is tested in `combobox.test.tsx`.
 */
comboboxListLaw({
  shell: 'React',
  namedByChevron: true,
  async mount(props) {
    render(
      <I18nProvider locale="en-US">
        <Combobox {...props} />
      </I18nProvider>,
    )
  },
})
