import { appShellTopLaw } from '@polymorph/conformance/app-shell-top'

import { elementsAdapter } from '../conformance/elements'

/**
 * Where AppShell draws its navigation on top and its drawer below the
 * breakpoint, as `@polymorph/conformance/app-shell-top` states it for every
 * shell, through the elements' adapter.
 */
appShellTopLaw({ shell: 'Elements', adapter: elementsAdapter })
