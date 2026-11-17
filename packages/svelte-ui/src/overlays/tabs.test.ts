import { tabsOverflowLaw } from '@polymorph/conformance/tabs-overflow'

import { svelteAdapter } from '../conformance/svelte'

/**
 * Tabs in the Svelte shell: a strip wider than its container
 * (`design/components/tabs.md`, Overflow), as
 * `@polymorph/conformance/tabs-overflow` states it for every generated shell.
 */
tabsOverflowLaw({ shell: 'Svelte', adapter: svelteAdapter })
