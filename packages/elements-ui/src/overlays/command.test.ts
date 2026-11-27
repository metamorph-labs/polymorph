import { commandLaw } from '@polymorph/conformance/command'

import { elementsAdapter } from '../conformance/elements'

/**
 * What a Command's status region says in the elements shell
 * (`design/components/command.md`, A11y), by default and in a host's words
 * from `spoken`, as `@polymorph/conformance/command` states it for every web
 * shell.
 */
commandLaw({ shell: 'elements', adapter: elementsAdapter })
