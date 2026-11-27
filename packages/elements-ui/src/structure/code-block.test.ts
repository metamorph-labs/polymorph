import { codeBlockLaw } from '@polymorph/conformance/code-block'

import { elementsAdapter } from '../conformance/elements'

/**
 * What a CodeBlock's copy says in the elements shell
 * (`design/components/code-block.md`, A11y), by default and in a host's words
 * from `copiedLabel`, as `@polymorph/conformance/code-block` states it for
 * every web shell.
 */
codeBlockLaw({ shell: 'elements', adapter: elementsAdapter })
