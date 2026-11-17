import { detailPageAsideLaw } from '@polymorph/conformance/detail-page-aside'

import { elementsAdapter } from '../conformance/elements'

/**
 * DetailPage as an element: the aside that stays in view
 * (`design/archetypes/detail-page.md`, The aside that stays in view), as
 * `@polymorph/conformance/detail-page-aside` states it for every web shell.
 * Each entry is mounted as the page's markup, through the elements' adapter.
 */
detailPageAsideLaw({ shell: 'Elements', adapter: elementsAdapter })
