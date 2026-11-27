import { commandLaw } from '@polymorph/conformance/command'

import { angularAdapter } from '../conformance/angular'

/**
 * What a Command's status region says in the Angular shell
 * (`design/components/command.md`, A11y), by default and in a host's words
 * from `spoken`, as `@polymorph/conformance/command` states it for every web
 * shell.
 */
commandLaw({ shell: 'Angular', adapter: angularAdapter })
