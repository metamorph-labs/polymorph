import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { commentThreadLaw } from '@polymorph/conformance/comment-thread'
import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { reactAdapter } from '../conformance/react'
import {
  CommentThread,
  type CommentThreadCommentProps,
  type CommentThreadProps,
} from './CommentThread'

/**
 * CommentThread, in a real browser.
 *
 * `@polymorph/conformance/comment-thread` holds the structure, the levels and
 * the narrow container for every web shell, this one included. The tests
 * here hold what only the React member's props reach: the thread's words
 * reaching a comment at any level, and an article named by its author alone
 * when there is no time.
 */

beforeAll(installTestTheme)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<CommentThreadProps>(true)
    assertGoverned<CommentThreadCommentProps>(true)
  })
})

describe('the thread’s words', () => {
  it('reach every comment, a reply’s included', () => {
    render(
      <CommentThread label="Comentarios" messages={{ edited: 'Editado', replies: 'Respuestas' }}>
        <CommentThread.Comment
          author="Ada Okafor"
          time="09:40"
          replies={
            <CommentThread.Comment author="Bao Tran" time="09:52" edited>
              Sí.
            </CommentThread.Comment>
          }
        >
          ¿Es idempotente?
        </CommentThread.Comment>
      </CommentThread>,
    )
    expect(screen.getByRole('list', { name: 'Respuestas' })).toBeTruthy()
    expect(screen.getByRole('article', { name: 'Bao Tran 09:52' }).textContent).toContain('Editado')
    expect(screen.queryByText('Edited')).toBeNull()
  })
})

describe('a comment', () => {
  it('is named by its author alone when it has no time', () => {
    render(
      <CommentThread label="Comments">
        <CommentThread.Comment author="Ada Okafor">A note.</CommentThread.Comment>
      </CommentThread>,
    )
    expect(screen.getByRole('article', { name: 'Ada Okafor' })).toBeTruthy()
  })

  it('draws no mark column and no replies list when it is given none', () => {
    render(
      <CommentThread label="Comments">
        <CommentThread.Comment author="Ada Okafor">A note.</CommentThread.Comment>
      </CommentThread>,
    )
    const article = screen.getByRole('article', { name: 'Ada Okafor' })
    const text = screen.getByText('A note.')
    // Without a mark, the body starts at the article's own edge.
    expect(
      Math.abs(text.getBoundingClientRect().left - article.getBoundingClientRect().left),
    ).toBeLessThanOrEqual(1)
    expect(screen.getAllByRole('list')).toHaveLength(1)
  })
})

commentThreadLaw({ shell: 'React', adapter: reactAdapter })
