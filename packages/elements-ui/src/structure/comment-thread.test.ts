import { commentThreadLaw } from '@polymorph/conformance/comment-thread'

import { elementsAdapter } from '../conformance/elements'

/**
 * A CommentThread's lists, names and levels, written as `<poly-comment-thread>`
 * with `<poly-comment-thread-comment>` parts, as
 * `@polymorph/conformance/comment-thread` states them for every web shell.
 */
commentThreadLaw({ shell: 'Elements', adapter: elementsAdapter })
