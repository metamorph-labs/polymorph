import { codeBlockLaw } from '@polymorph/conformance/code-block'

import { angularAdapter } from '../conformance/angular'

/**
 * What a CodeBlock's copy says in the Angular shell
 * (`design/components/code-block.md`, A11y), by default and in a host's words
 * from `copiedLabel`, as `@polymorph/conformance/code-block` states it for
 * every web shell.
 */
codeBlockLaw({ shell: 'Angular', adapter: angularAdapter })
