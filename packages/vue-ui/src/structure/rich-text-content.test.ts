import { richTextContentLaw } from '@polymorph/conformance/rich-text-content'

import { vueAdapter } from '../conformance/vue'

/**
 * What RichTextContent draws for a document, in the Vue shell: the member
 * each node is drawn as, the app's entity and the token, highlights nested as
 * the editor nests them, and the selection bar at selected words, as
 * `@polymorph/conformance/rich-text-content` states them for every web shell.
 */
richTextContentLaw({ shell: 'Vue', adapter: vueAdapter })
