import { detailPageAsideLaw } from '@polymorph/conformance/detail-page-aside'

import { angularAdapter } from '../conformance/angular'

/**
 * DetailPage in the Angular shell: the aside that stays in view
 * (`design/archetypes/detail-page.md`, The aside that stays in view), as
 * `@polymorph/conformance/detail-page-aside` states it for every web shell.
 */
detailPageAsideLaw({ shell: 'Angular', adapter: angularAdapter })
