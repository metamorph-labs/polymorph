import { appShellTopLaw } from '@polymorph/conformance/app-shell-top'

import { svelteAdapter } from '../conformance/svelte'

/**
 * AppShell in the Svelte shell: the navigation on top
 * (`design/archetypes/app-shell.md`, Navigation on top), as
 * `@polymorph/conformance/app-shell-top` states it for every web shell.
 */
appShellTopLaw({ shell: 'Svelte', adapter: svelteAdapter })
