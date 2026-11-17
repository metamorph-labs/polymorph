import { appShellTopLaw } from '@polymorph/conformance/app-shell-top'

import { angularAdapter } from '../conformance/angular'

/**
 * AppShell in the Angular shell: the navigation on top
 * (`design/archetypes/app-shell.md`, Navigation on top), as
 * `@polymorph/conformance/app-shell-top` states it for every web shell.
 */
appShellTopLaw({ shell: 'Angular', adapter: angularAdapter })
