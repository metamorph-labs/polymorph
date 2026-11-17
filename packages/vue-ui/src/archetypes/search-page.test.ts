import { h, nextTick, reactive } from 'vue'

import { searchPageLaw, type SearchPageState } from '@polymorph/conformance/search-page'

import Input from '../controls/Input.vue'
import { mount } from '../mount'
import SearchPage from './SearchPage.vue'

/**
 * What a SearchPage does around its query, in the Vue shell
 * (`design/archetypes/search-page.md`, Behaviour and A11y), as
 * `@polymorph/conformance/search-page` states it for every web shell.
 */
searchPageLaw({
  shell: 'Vue',
  async mount({ onSubmit }) {
    const state = reactive<SearchPageState>({ empty: false, pending: false })
    await mount(() =>
      h(
        SearchPage,
        {
          title: 'Search',
          searchLabel: 'Workspace',
          emptyState: { title: 'No results' },
          empty: state.empty,
          pending: state.pending,
          ...(onSubmit === undefined ? {} : { onSubmit }),
        },
        {
          search: () => [h(Input, { 'aria-label': 'Query' })],
          default: () => [h('p', 'Results')],
        },
      ),
    )
    return {
      set(next) {
        Object.assign(state, next)
        return nextTick()
      },
    }
  },
})
