import { searchPageLaw } from '@polymorph/conformance/search-page'
import { create } from '@polymorph/elements'

import { mountElement } from '../mount'
import '../controls/Input'
import './SearchPage'

/**
 * What a SearchPage does around its query, as an element
 * (`design/archetypes/search-page.md`, Behaviour and A11y), as
 * `@polymorph/conformance/search-page` states it for every web shell. The
 * element is made as a page's script makes one: the Input is a child in the
 * `search` slot and the results paragraph a child. A listener for
 * `poly-submit` is added only when the law passes `onSubmit`, so the page is a
 * form only then. The law sets `empty` and `pending` through their properties.
 */
searchPageLaw({
  shell: 'Elements',
  async mount({ onSubmit }) {
    const { set } = await mountElement(
      'poly-search-page',
      {
        title: 'Search',
        searchLabel: 'Workspace',
        emptyState: { title: 'No results' },
        empty: false,
        pending: false,
        onSubmit,
      },
      {
        children: [
          create('poly-input', { slot: 'search', 'aria-label': 'Query' }),
          create('p', {}, ['Results']),
        ],
      },
    )
    return { set }
  },
})
