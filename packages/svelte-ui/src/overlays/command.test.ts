import { commandLaw } from '@polymorph/conformance/command'

import { svelteAdapter } from '../conformance/svelte'

/**
 * What a Command's status region says in the Svelte shell
 * (`design/components/command.md`, A11y), by default and in a host's words
 * from `spoken`, as `@polymorph/conformance/command` states it for every web
 * shell.
 */
commandLaw({ shell: 'Svelte', adapter: svelteAdapter })
