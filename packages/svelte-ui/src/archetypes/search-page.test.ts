import { tick } from 'svelte'

import { searchPageLaw } from '@polymorph/conformance/search-page'

import { render } from '../mount'
import SearchPageHarness from '../testing/SearchPageHarness.svelte'
import { live } from '../testing/live.svelte'

/**
 * What a SearchPage does around its query, in the Svelte shell
 * (`design/archetypes/search-page.md`, Behaviour and A11y), as
 * `@polymorph/conformance/search-page` states it for every web shell.
 */
searchPageLaw({
  shell: 'Svelte',
  async mount({ onSubmit }) {
    const props = live({ empty: false, pending: false, onSubmit })
    await render(SearchPageHarness, props)
    return {
      set(next) {
        Object.assign(props, next)
        return tick()
      },
    }
  },
})
