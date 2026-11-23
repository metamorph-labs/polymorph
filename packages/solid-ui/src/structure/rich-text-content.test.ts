import { richTextContentLaw } from '@polymorph/conformance/rich-text-content'

import { solidAdapter } from '../conformance/solid'

/**
 * What RichTextContent draws for a document, in the Solid shell: the member
 * each node is drawn as, the app's entity and the token, highlights nested as
 * the editor nests them, and the selection bar at selected words, as
 * `@polymorph/conformance/rich-text-content` states them for every web shell.
 */
richTextContentLaw({ shell: 'Solid', adapter: solidAdapter })
