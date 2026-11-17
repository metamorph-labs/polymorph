import { tabsOverflowLaw } from '@polymorph/conformance/tabs-overflow'

import { angularAdapter } from '../conformance/angular'

/**
 * Tabs in the Angular shell: a strip wider than its container
 * (`design/components/tabs.md`, Overflow), as
 * `@polymorph/conformance/tabs-overflow` states it for every generated shell.
 */
tabsOverflowLaw({ shell: 'Angular', adapter: angularAdapter })
