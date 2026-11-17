import { createSignal } from 'solid-js'

import { searchPageLaw, type SearchPageState } from '@polymorph/conformance/search-page'

import Input from '../controls/Input'
import { mount } from '../mount'
import SearchPage from './SearchPage'

/**
 * What a SearchPage does around its query, in the Solid shell
 * (`design/archetypes/search-page.md`, Behaviour and A11y), as
 * `@polymorph/conformance/search-page` states it for every web shell.
 */
searchPageLaw({
  shell: 'Solid',
  async mount({ onSubmit }) {
    const [state, setState] = createSignal<SearchPageState>({ empty: false, pending: false })
    await mount(() => (
      <SearchPage
        title="Search"
        searchLabel="Workspace"
        emptyState={{ title: 'No results' }}
        empty={state().empty}
        pending={state().pending}
        onSubmit={onSubmit}
        search={<Input aria-label="Query" />}
      >
        <p>Results</p>
      </SearchPage>
    ))
    return {
      set(next) {
        setState((was) => ({ ...was, ...next }))
      },
    }
  },
})
