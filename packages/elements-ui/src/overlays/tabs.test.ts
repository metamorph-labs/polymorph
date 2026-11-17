import { tabsOverflowLaw } from '@polymorph/conformance/tabs-overflow'

import { elementsAdapter } from '../conformance/elements'

/**
 * A Tabs strip wider than its container (`design/components/tabs.md`,
 * Overflow), as `@polymorph/conformance/tabs-overflow` states it for every
 * generated shell, through the elements' adapter.
 */
tabsOverflowLaw({ shell: 'Elements', adapter: elementsAdapter })
