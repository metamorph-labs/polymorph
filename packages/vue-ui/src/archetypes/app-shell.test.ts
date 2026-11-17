import { appShellTopLaw } from '@polymorph/conformance/app-shell-top'

import { vueAdapter } from '../conformance/vue'

/**
 * AppShell in the Vue shell: the navigation on top
 * (`design/archetypes/app-shell.md`, Navigation on top), as
 * `@polymorph/conformance/app-shell-top` states it for every web shell.
 */
appShellTopLaw({ shell: 'Vue', adapter: vueAdapter })
