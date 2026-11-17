import { commentThreadLaw } from '@polymorph/conformance/comment-thread'

import { angularAdapter } from '../conformance/angular'

/**
 * CommentThread in the Angular shell: how many comments each list holds, which
 * list a reply is in, each article's name, where a reply and a reply to a
 * reply are drawn in both writing directions, a container it must not widen,
 * and no live region (`design/components/comment-thread.md`), as
 * `@polymorph/conformance/comment-thread` states them for every web shell.
 */
commentThreadLaw({ shell: 'Angular', adapter: angularAdapter })
