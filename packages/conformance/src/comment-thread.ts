import { getAllByRole, getByRole } from '@testing-library/dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import type { Mounted, MountAdapter } from './run'

/**
 * The law for what a CommentThread's structure says and where its comments
 * are drawn (`design/components/comment-thread.md`), which every web shell's
 * CommentThread test calls with its own adapter. A contract statement reads
 * one part's role, name or attribute (`docs/conformance.md`). This law reads
 * what the contract grammar cannot state: how many comments each list holds,
 * which list a reply is in, the name of each comment's article, the inline
 * position of a reply against its parent in both writing directions, the
 * level a reply to a reply is drawn at, a container the thread must not
 * widen, and that no part of the thread is a live region.
 *
 * It renders the states fixture entries by the names every shell gives them.
 */

export interface CommentThreadLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** The shell's mount adapter. */
  readonly adapter: MountAdapter
}

const THREAD = 'a thread with replies'
const DEEPER = 'a reply to a reply — drawn at the second level'
const PHONE = 'long unbroken text at phone width'
const EDITED = 'an edited comment'
const ATTACHMENTS = 'attachments and a mention'

const box = (element: Element) => element.getBoundingClientRect()

/** The thread's list: the element that carries the member's name. */
function threadIn(root: HTMLElement): HTMLElement {
  const thread = root.querySelector<HTMLElement>('[data-member="comment-thread"]')
  if (thread === null) throw new Error('the entry rendered no CommentThread')
  return thread
}

/** A list's own items, without the items of a list nested in them. */
const itemsOf = (list: HTMLElement) => [...list.children].filter((child) => child.tagName === 'LI')

/** The text of an element's first `<time>`, or of nothing. */
const timeText = (element: Element) => element.querySelector('time')?.textContent ?? ''

/** The first comment of the thread with replies: Ada Okafor's, whose time is a RelativeTime. */
const firstOf = (root: HTMLElement) =>
  getByRole(root, 'article', { name: `Ada Okafor ${timeText(threadIn(root))}` })

/** The paragraph that holds a body's words, by its text. */
function words(root: HTMLElement, text: string): HTMLElement {
  const found = [...root.querySelectorAll<HTMLElement>('p')].find((element) =>
    element.textContent?.includes(text),
  )
  if (found === undefined) throw new Error(`no paragraph says "${text}"`)
  return found
}

export function commentThreadLaw({ shell, adapter }: CommentThreadLaw): void {
  describe(`${shell} CommentThread — its structure and its levels`, () => {
    beforeAll(installTestTheme)

    let mounted: Mounted | undefined

    afterEach(() => {
      mounted?.unmount()
      mounted = undefined
      document.documentElement.removeAttribute('dir')
    })

    async function mount(state: string): Promise<HTMLElement> {
      mounted = await adapter.mount('CommentThread', { state })
      const { root } = mounted
      // A shell may fill its slots a moment after the mount resolves.
      await vi.waitFor(() => expect(root.querySelectorAll('article').length).toBeGreaterThan(0))
      return root
    }

    it('is a list named by its label, whose items are the comments at its top level', async () => {
      const root = await mount(THREAD)
      const thread = threadIn(root)

      expect(getByRole(root, 'list', { name: 'Comments' })).toBe(thread)
      expect(itemsOf(thread)).toHaveLength(2)
      // Each item holds one comment's article, and its replies in a list of their own.
      for (const item of itemsOf(thread)) {
        expect(item.querySelectorAll(':scope > article')).toHaveLength(1)
      }
    })

    it('names each comment’s article by its author and its time', async () => {
      const root = await mount(THREAD)
      const first = timeText(threadIn(root))
      expect(first).not.toBe('')

      expect(getAllByRole(root, 'article')).toHaveLength(4)
      for (const name of [
        `Ada Okafor ${first}`,
        'Bao Tran 09:52',
        'Ada Okafor 10:05',
        'Carmen Ruiz 11:20',
      ]) {
        expect(getByRole(root, 'article', { name })).toBeTruthy()
      }
    })

    it('puts a reply in a list named "Replies" inside its parent’s item', async () => {
      const root = await mount(THREAD)
      const thread = threadIn(root)
      const replies = getByRole(root, 'list', { name: 'Replies' })
      const [parent, other] = itemsOf(thread) as [HTMLElement, HTMLElement]

      expect(replies.closest('li')).toBe(parent)
      expect(itemsOf(replies)).toHaveLength(2)
      expect(replies.contains(getByRole(root, 'article', { name: 'Bao Tran 09:52' }))).toBe(true)
      expect(other.querySelector('ol')).toBeNull()
    })

    it('starts a reply where its parent’s body starts', async () => {
      const root = await mount(THREAD)
      const parent = firstOf(root)
      const reply = getByRole(root, 'article', { name: 'Bao Tran 09:52' })
      const body = words(parent, 'The webhook retried twice')

      expect(box(reply).left).toBeGreaterThan(box(parent).left)
      expect(Math.abs(box(reply).left - box(body).left)).toBeLessThanOrEqual(1)
    })

    it('starts a reply from the right edge in a right-to-left document', async () => {
      document.documentElement.setAttribute('dir', 'rtl')
      const root = await mount(THREAD)
      const parent = firstOf(root)
      const reply = getByRole(root, 'article', { name: 'Bao Tran 09:52' })
      const body = words(parent, 'The webhook retried twice')

      expect(box(reply).right).toBeLessThan(box(parent).right)
      expect(Math.abs(box(reply).right - box(body).right)).toBeLessThanOrEqual(1)
    })

    it('draws a reply to a reply at the second level, and keeps it inside the reply it answers', async () => {
      const root = await mount(DEEPER)
      const first = getByRole(root, 'article', { name: 'Ada Okafor 09:40' })
      const second = getByRole(root, 'article', { name: 'Bao Tran 09:52' })
      const third = getByRole(root, 'article', { name: 'Carmen Ruiz 10:01' })

      expect(box(second).left).toBeGreaterThan(box(first).left)
      expect(Math.abs(box(third).left - box(second).left)).toBeLessThanOrEqual(1)
      expect(Math.abs(box(third).right - box(second).right)).toBeLessThanOrEqual(1)
      // The markup still nests: the third comment's item is inside the second's.
      const item = third.closest('li') as HTMLElement
      expect(item.parentElement?.closest('li')).toBe(second.closest('li'))
    })

    it('wraps an unbroken name and address inside a box narrower than a phone', async () => {
      const root = await mount(PHONE)
      const thread = threadIn(root)
      const container = thread.closest('div') as HTMLElement
      const limit = box(container)

      expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth)
      for (const element of thread.querySelectorAll('*')) {
        expect(box(element).right).toBeLessThanOrEqual(limit.right + 1)
        expect(box(element).left).toBeGreaterThanOrEqual(limit.left - 1)
      }
    })

    it('says that a comment was edited, after its time', async () => {
      const root = await mount(EDITED)
      const article = getByRole(root, 'article', { name: 'Carmen Ruiz 2 Nov' })
      const text = article.textContent ?? ''

      expect(text).toContain('Edited')
      expect(text.indexOf('2 Nov')).toBeLessThan(text.indexOf('Edited'))
    })

    it('has no live region, so it announces nothing', async () => {
      for (const state of [THREAD, ATTACHMENTS]) {
        const root = await mount(state)
        const thread = threadIn(root)
        const live = thread.querySelectorAll(
          '[aria-live], [role="log"], [role="status"], [role="alert"], [aria-busy]',
        )
        expect(live).toHaveLength(0)
        mounted?.unmount()
        mounted = undefined
      }
    })
  })
}
