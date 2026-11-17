import { detailPageAsideLaw } from '@polymorph/conformance/detail-page-aside'

import { solidAdapter } from '../conformance/solid'

/**
 * DetailPage in the Solid shell: the aside that stays in view
 * (`design/archetypes/detail-page.md`, The aside that stays in view), as
 * `@polymorph/conformance/detail-page-aside` states it for every web shell.
 */
detailPageAsideLaw({ shell: 'Solid', adapter: solidAdapter })
