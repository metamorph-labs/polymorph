import { richTextContentLaw } from '@polymorph/conformance/rich-text-content'

import { svelteAdapter } from '../conformance/svelte'

/**
 * What RichTextContent draws for a document, in the Svelte shell: the member
 * each node is drawn as, the app's entity and the token, highlights nested as
 * the editor nests them, and the selection bar at selected words, as
 * `@polymorph/conformance/rich-text-content` states them for every web shell.
 */
richTextContentLaw({ shell: 'Svelte', adapter: svelteAdapter })
