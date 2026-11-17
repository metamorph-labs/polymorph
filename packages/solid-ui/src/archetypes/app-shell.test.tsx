import { appShellTopLaw } from '@polymorph/conformance/app-shell-top'

import { solidAdapter } from '../conformance/solid'

/**
 * AppShell in the Solid shell: the navigation on top
 * (`design/archetypes/app-shell.md`, Navigation on top), as
 * `@polymorph/conformance/app-shell-top` states it for every web shell.
 */
appShellTopLaw({ shell: 'Solid', adapter: solidAdapter })
